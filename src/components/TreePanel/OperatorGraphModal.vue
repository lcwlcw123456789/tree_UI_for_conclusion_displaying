<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { IntermediateResult, NarrativeTask, TableStructuredTask } from '../../types/intermediate'
import type { ConflictItem, OperatorPillarResult, OperatorView } from '../../types/operator'

type GraphNode = {
  id: string
  pillar: string
  indicatorName: string
  indicatorType: 'narrative' | 'table'
  indicatorRef: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

type GraphEdge = {
  id: string
  source: string
  target: string
  type: 'causal_anchoring' | 'conflict_audit' | 'narrative_relations'
  details: any[]
}

const props = defineProps<{
  visible: boolean
  intermediate: IntermediateResult | null
  operatorView: OperatorView | null
}>()

const emit = defineEmits<{
  close: []
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const width = 980
const height = 640

const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])

const hoveredNodeId = ref<string | null>(null)
const hoveredEdgeId = ref<string | null>(null)
const pinnedNodeId = ref<string | null>(null)
const pinnedEdgeId = ref<string | null>(null)

let rafId: number | null = null
let dragNodeId: string | null = null

const nodeMap = computed(() => {
  const m = new Map<string, GraphNode>()
  for (const n of nodes.value) m.set(n.id, n)
  return m
})

const activeNode = computed(() => {
  const id = pinnedNodeId.value || hoveredNodeId.value
  return id ? nodeMap.value.get(id) || null : null
})

const hoveredEdge = computed(() => {
  if (!hoveredEdgeId.value) return null
  return edges.value.find((e) => e.id === hoveredEdgeId.value) || null
})

const activeEdge = computed(() => {
  if (pinnedEdgeId.value) return edges.value.find((e) => e.id === pinnedEdgeId.value) || null
  if (pinnedNodeId.value) return null
  return hoveredEdge.value
})

type NarrativeContent = {
  kind: 'narrative'
  task: NarrativeTask
}

type TableContent = {
  kind: 'table'
  task: TableStructuredTask
  columns: string[]
}

const activeNodeContent = computed<NarrativeContent | TableContent | null>(() => {
  const n = activeNode.value
  const inter = props.intermediate
  if (!n || !inter) return null

  const pillar = inter.results.find((p) => p.pillar === n.pillar)
  if (!pillar) return null

  if (n.indicatorType === 'narrative') {
    const task = pillar.narrative_tasks.find((t) => t.indicator_name === n.indicatorName)
    return task ? { kind: 'narrative', task } : null
  }

  const task = pillar.table_structured_tasks.find((t) => t.indicator_name === n.indicatorName)
  if (!task) return null

  const colSet = new Set<string>()
  for (const sub of task.sub_indicators || []) {
    Object.keys(sub.values || {}).forEach((k) => colSet.add(k))
  }
  const columns = Array.from(colSet).sort((a, b) => {
    if (a === 'Item') return -1
    if (b === 'Item') return 1
    return a.localeCompare(b)
  })

  return { kind: 'table', task, columns }
})

const infoTitle = computed(() => {
  if (activeNode.value) return `节点：${activeNode.value.indicatorName}`
  if (activeEdge.value) return `边：${activeEdge.value.type}`
  return '提示'
})

const edgeColor = {
  causal_anchoring: '#0ea5e9',
  conflict_audit: '#ef4444',
  narrative_relations: '#a855f7',
}

function relTypeLabel(t: GraphEdge['type']) {
  if (t === 'causal_anchoring') return '因果锚定'
  if (t === 'conflict_audit') return '矛盾审计'
  return '叙述关系'
}

function hasObjectFields(v: any) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function formatScalar(v: unknown) {
  if (v === null || v === undefined || v === '') return '-'
  return String(v)
}

function objectEntries(v: unknown): Array<[string, unknown]> {
  if (!hasObjectFields(v)) return []
  return Object.entries(v as Record<string, unknown>)
}

function stopSimulation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function normalizeRef(indicatorRef?: string) {
  if (!indicatorRef) return ''
  if (indicatorRef.includes('|sub:')) return indicatorRef.split('|sub:')[0]
  return indicatorRef
}

function closeModal() {
  stopSimulation()
  pinnedNodeId.value = null
  pinnedEdgeId.value = null
  hoveredNodeId.value = null
  hoveredEdgeId.value = null
  emit('close')
}

function pinNode(nodeId: string) {
  pinnedNodeId.value = pinnedNodeId.value === nodeId ? null : nodeId
  pinnedEdgeId.value = null
  hoveredEdgeId.value = null
}

function pinEdge(edgeId: string) {
  pinnedEdgeId.value = pinnedEdgeId.value === edgeId ? null : edgeId
  pinnedNodeId.value = null
}

function clearPinned() {
  pinnedNodeId.value = null
  pinnedEdgeId.value = null
}

function buildEvidenceNodeLookup(pillar: any, nodeIdByRef: Map<string, string>) {
  const evidenceToNodeIds = new Map<string, Set<string>>()

  const add = (evidenceId: string, nodeId: string) => {
    if (!evidenceId) return
    if (!evidenceToNodeIds.has(evidenceId)) evidenceToNodeIds.set(evidenceId, new Set())
    evidenceToNodeIds.get(evidenceId)!.add(nodeId)
  }

  ;(pillar?.narrative_tasks || []).forEach((t: any) => {
    const ref = `narrative:${t.indicator_name}`
    const nodeId = nodeIdByRef.get(ref)
    if (!nodeId) return
    add(t.source_text_id, nodeId)
    ;(t.retrieved_evidence || []).forEach((ev: any) => add(ev?.id, nodeId))
  })

  ;(pillar?.table_structured_tasks || []).forEach((tb: any) => {
    const ref = `table:${tb.indicator_name}`
    const nodeId = nodeIdByRef.get(ref)
    if (!nodeId) return
    ;(tb.sub_indicators || []).forEach((sub: any) => {
      const linked = String(sub.linked_text_evidence_id || '')
      const m = linked.match(/ID:\s*([^\]\s]+)/)
      if (m?.[1]) add(m[1], nodeId)
      ;(sub.retrieved_evidence || []).forEach((ev: any) => add(ev?.id, nodeId))
    })
  })

  return evidenceToNodeIds
}

function buildGraph() {
  const inter = props.intermediate
  const op = props.operatorView
  if (!inter || !op) {
    nodes.value = []
    edges.value = []
    return
  }

  const nextNodes: GraphNode[] = []
  const nodeIdByRef = new Map<string, string>()

  inter.results.forEach((pillar, pi) => {
    pillar.narrative_tasks.forEach((t, ni) => {
      const ref = `narrative:${t.indicator_name}`
      const id = `P${pi}_N${ni}`
      nodeIdByRef.set(ref, id)
      nextNodes.push({
        id,
        pillar: pillar.pillar,
        indicatorName: t.indicator_name,
        indicatorType: 'narrative',
        indicatorRef: ref,
        x: 120 + (pi * 280) + Math.random() * 80,
        y: 80 + ni * 50 + Math.random() * 30,
        vx: 0,
        vy: 0,
        radius: 16,
      })
    })

    pillar.table_structured_tasks.forEach((t, ti) => {
      const ref = `table:${t.indicator_name}`
      const id = `P${pi}_T${ti}`
      nodeIdByRef.set(ref, id)
      nextNodes.push({
        id,
        pillar: pillar.pillar,
        indicatorName: t.indicator_name,
        indicatorType: 'table',
        indicatorRef: ref,
        x: 180 + (pi * 280) + Math.random() * 80,
        y: 140 + ti * 70 + Math.random() * 30,
        vx: 0,
        vy: 0,
        radius: 18,
      })
    })
  })

  const edgeMap = new Map<string, GraphEdge>()

  function addEdge(
    a: string | undefined,
    b: string | undefined,
    type: GraphEdge['type'],
    detail: any,
  ) {
    if (!a || !b) return
    const [s, t] = a <= b ? [a, b] : [b, a]
    const key = `${type}:${s}:${t}`
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        id: key,
        source: s,
        target: t,
        type,
        details: [],
      })
    }
    edgeMap.get(key)!.details.push(detail)
  }

  op.operator_results.forEach((opPillar: OperatorPillarResult) => {
    const ops = opPillar.operators || {}
    const pillarIndex = inter.results.findIndex((r) => r.pillar === opPillar.pillar)
    const pillarInter = pillarIndex >= 0 ? inter.results[pillarIndex] : null
    const evidenceLookup = buildEvidenceNodeLookup(pillarInter, nodeIdByRef)

    for (const item of ops.causal_anchoring || []) {
      const sourceRef = normalizeRef(item.indicator_ref)
      if (!sourceRef) continue
      const srcId = nodeIdByRef.get(sourceRef)
      if (!srcId) continue

      const matchedTargets = new Set<string>()
      for (const c of item.candidate_causes || []) {
        const hint = String(c.source_hint || '').trim()
        if (!hint) continue
        const candidateNodeIds = evidenceLookup.get(hint)
        if (!candidateNodeIds) continue
        for (const nid of candidateNodeIds) matchedTargets.add(nid)
      }

      if (matchedTargets.size) {
        for (const tid of matchedTargets) {
          addEdge(srcId, tid, 'causal_anchoring', {
            indicator_ref: item.indicator_ref,
            trend_or_claim_sentence: item.trend_or_claim_sentence,
            candidate_causes: item.candidate_causes || [],
            row_or_ref: item.indicator_ref,
          })
        }
      } else {
        addEdge(srcId, srcId, 'causal_anchoring', {
          indicator_ref: item.indicator_ref,
          trend_or_claim_sentence: item.trend_or_claim_sentence,
          candidate_causes: item.candidate_causes || [],
          note: '未映射到明确文本节点，保留为指标内因果锚定。',
        })
      }
    }

    for (const c of ops.conflict_audit?.conflicts || []) {
      const refs = (c.involved_indicator_refs || [])
        .map((r) => {
          const ref = normalizeRef(r)
          return ref ? nodeIdByRef.get(ref) : undefined
        })
        .filter((x): x is string => !!x)
      if (refs.length >= 2) {
        for (let i = 0; i < refs.length; i++) {
          for (let j = i + 1; j < refs.length; j++) {
            addEdge(refs[i], refs[j], 'conflict_audit', c as ConflictItem)
          }
        }
      } else if (refs.length === 1) {
        addEdge(refs[0], refs[0], 'conflict_audit', c as ConflictItem)
      }
    }

    const relIds = (ops.narrative_relations || [])
      .map((r) => {
        const ref = normalizeRef(r.indicator_ref)
        return ref ? nodeIdByRef.get(ref) : undefined
      })
      .filter((x): x is string => !!x)

    if (relIds.length >= 2) {
      for (let i = 0; i < relIds.length - 1; i++) {
        const rel = ops.narrative_relations?.[i]
        addEdge(relIds[i], relIds[i + 1], 'narrative_relations', rel || {})
      }
    } else if (relIds.length === 1) {
      addEdge(relIds[0], relIds[0], 'narrative_relations', ops.narrative_relations?.[0] || {})
    }
  })

  const builtEdges = Array.from(edgeMap.values())
  const connectedNodeIds = new Set<string>()
  for (const e of builtEdges) {
    connectedNodeIds.add(e.source)
    connectedNodeIds.add(e.target)
  }

  nodes.value = nextNodes.filter((n) => connectedNodeIds.has(n.id))
  edges.value = builtEdges.filter(
    (e) => connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target),
  )

  if (pinnedNodeId.value && !connectedNodeIds.has(pinnedNodeId.value)) pinnedNodeId.value = null
  if (hoveredNodeId.value && !connectedNodeIds.has(hoveredNodeId.value)) hoveredNodeId.value = null
  if (pinnedEdgeId.value && !edges.value.some((e) => e.id === pinnedEdgeId.value)) {
    pinnedEdgeId.value = null
  }
  if (hoveredEdgeId.value && !edges.value.some((e) => e.id === hoveredEdgeId.value)) {
    hoveredEdgeId.value = null
  }
}

function tick() {
  const ns = nodes.value
  const es = edges.value
  if (!ns.length) {
    rafId = requestAnimationFrame(tick)
    return
  }

  const centerX = width / 2
  const centerY = height / 2

  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i]
      const b = ns[j]
      if (!a || !b) continue
      let dx = b.x - a.x
      let dy = b.y - a.y
      let d2 = dx * dx + dy * dy
      if (d2 < 1) d2 = 1
      const d = Math.sqrt(d2)
      const f = 2400 / d2
      dx /= d
      dy /= d
      a.vx -= dx * f
      a.vy -= dy * f
      b.vx += dx * f
      b.vy += dy * f
    }
  }

  for (const e of es) {
    const a = ns.find((n) => n.id === e.source)
    const b = ns.find((n) => n.id === e.target)
    if (!a || !b) continue
    let dx = b.x - a.x
    let dy = b.y - a.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d < 1) d = 1
    const desired = e.source === e.target ? 28 : 140
    const k = 0.006
    const force = (d - desired) * k
    dx /= d
    dy /= d
    a.vx += force * dx
    a.vy += force * dy
    b.vx -= force * dx
    b.vy -= force * dy
  }

  for (const n of ns) {
    if (dragNodeId === n.id) continue
    n.vx += (centerX - n.x) * 0.0009
    n.vy += (centerY - n.y) * 0.0009
    n.vx *= 0.92
    n.vy *= 0.92
    n.x += n.vx
    n.y += n.vy
    n.x = Math.max(30, Math.min(width - 30, n.x))
    n.y = Math.max(30, Math.min(height - 30, n.y))
  }

  rafId = requestAnimationFrame(tick)
}

function startSimulation() {
  stopSimulation()
  rafId = requestAnimationFrame(tick)
}

function findNode(id: string) {
  return nodes.value.find((n) => n.id === id)
}

function onNodeMouseDown(nodeId: string, ev: MouseEvent) {
  ev.stopPropagation()
  dragNodeId = nodeId
  const onUp = () => {
    dragNodeId = null
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mouseup', onUp)
}

function svgPoint(ev: MouseEvent) {
  const svg = svgRef.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = ev.clientX
  pt.y = ev.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  return pt.matrixTransform(ctm.inverse())
}

function onSvgMouseMove(ev: MouseEvent) {
  if (!dragNodeId) return
  const p = svgPoint(ev)
  if (!p) return
  const n = findNode(dragNodeId)
  if (!n) return
  n.x = p.x
  n.y = p.y
  n.vx = 0
  n.vy = 0
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      buildGraph()
      startSimulation()
    } else {
      stopSimulation()
      dragNodeId = null
      pinnedNodeId.value = null
      pinnedEdgeId.value = null
      hoveredNodeId.value = null
      hoveredEdgeId.value = null
    }
  },
  { immediate: true },
)

watch(
  () => [props.intermediate, props.operatorView],
  () => {
    if (props.visible) buildGraph()
  },
)

onBeforeUnmount(() => {
  stopSimulation()
})
</script>

<template>
  <div v-if="visible" class="modal-mask">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-left">
          <button class="back-btn" type="button" @click="closeModal">← 返回</button>
          <h3>算子关系图（无向图）</h3>
        </div>
        <button class="close-btn" type="button" @click="closeModal">✕</button>
      </header>

      <div class="legend">
        <span class="legend-item"><i class="dot narrative"></i>文本 indicator</span>
        <span class="legend-item"><i class="dot table"></i>表格 indicator</span>
        <span class="legend-item"><i class="line causal"></i>因果锚定</span>
        <span class="legend-item"><i class="line conflict"></i>矛盾审计</span>
        <span class="legend-item"><i class="line relation"></i>叙述关系</span>
      </div>

      <div class="modal-body">
        <section class="graph-pane">
          <svg
            ref="svgRef"
            :viewBox="`0 0 ${width} ${height}`"
            class="graph-svg"
            @mousemove="onSvgMouseMove"
          >
            <g>
              <line
                v-for="e in edges"
                :key="e.id"
                :x1="findNode(e.source)?.x || 0"
                :y1="findNode(e.source)?.y || 0"
                :x2="findNode(e.target)?.x || 0"
                :y2="findNode(e.target)?.y || 0"
                :stroke="edgeColor[e.type]"
                :stroke-width="activeEdge?.id === e.id ? 3.4 : 2.1"
                :stroke-dasharray="e.source === e.target ? '2 2' : undefined"
                class="edge"
                :class="{ pinned: pinnedEdgeId === e.id }"
                @click.stop="pinEdge(e.id)"
                @mouseenter="hoveredEdgeId = e.id"
                @mouseleave="hoveredEdgeId = null"
              />
            </g>

            <g v-for="n in nodes" :key="n.id" class="node-group">
              <circle
                v-if="n.indicatorType === 'narrative'"
                :cx="n.x"
                :cy="n.y"
                :r="n.radius"
                class="node narrative"
                :class="{ active: activeNode?.id === n.id, pinned: pinnedNodeId === n.id }"
                @mousedown="onNodeMouseDown(n.id, $event)"
                @click.stop="pinNode(n.id)"
                @mouseenter="hoveredNodeId = n.id"
                @mouseleave="hoveredNodeId = null"
              />
              <rect
                v-else
                :x="n.x - n.radius"
                :y="n.y - n.radius"
                :width="n.radius * 2"
                :height="n.radius * 2"
                rx="5"
                class="node table"
                :class="{ active: activeNode?.id === n.id, pinned: pinnedNodeId === n.id }"
                @mousedown="onNodeMouseDown(n.id, $event)"
                @click.stop="pinNode(n.id)"
                @mouseenter="hoveredNodeId = n.id"
                @mouseleave="hoveredNodeId = null"
              />

              <text :x="n.x" :y="n.y + n.radius + 12" class="node-label">{{ n.indicatorName }}</text>
            </g>
          </svg>
        </section>

        <aside class="info-pane">
          <div class="info-head-row">
            <h4>{{ infoTitle }}</h4>
            <button v-if="pinnedNodeId || pinnedEdgeId" type="button" class="pin-btn" @click="clearPinned">
              取消固定
            </button>
          </div>

          <template v-if="activeNode">
            <div class="info-section">
              <div class="kv-row"><span>节点ID</span><b>{{ activeNode.id }}</b></div>
              <div class="kv-row"><span>Pillar</span><b>{{ activeNode.pillar }}</b></div>
              <div class="kv-row">
                <span>类型</span><b>{{ activeNode.indicatorType === 'table' ? '表格' : '文本' }}</b>
              </div>
              <div class="kv-row"><span>引用</span><b>{{ activeNode.indicatorRef }}</b></div>
              <div class="kv-row" v-if="pinnedNodeId"><span>状态</span><b>已固定（点击节点可切换）</b></div>
            </div>

            <details class="info-section" open>
              <summary>节点本体内容</summary>

              <template v-if="activeNodeContent?.kind === 'narrative'">
                <div class="card">
                  <div class="kv-row"><span>factoid_question</span><b>{{ activeNodeContent.task.factoid_question || '-' }}</b></div>
                  <div class="kv-row"><span>source_text_id</span><b>{{ activeNodeContent.task.source_text_id || '-' }}</b></div>
                  <div class="kv-row"><span>source_page</span><b>{{ activeNodeContent.task.source_page ?? '-' }}</b></div>
                  <div class="desc"><b>rationale:</b> {{ activeNodeContent.task.rationale_from_extraction || '-' }}</div>
                </div>

                <details class="card" open>
                  <summary>retrieved_evidence（{{ activeNodeContent.task.retrieved_evidence?.length || 0 }}）</summary>
                  <ul v-if="activeNodeContent.task.retrieved_evidence?.length">
                    <li v-for="(ev, i) in activeNodeContent.task.retrieved_evidence" :key="i">
                      <b>{{ ev.id }}</b> / p.{{ ev.page }} / score={{ ev.score }}
                      <div class="desc">{{ ev.text }}</div>
                    </li>
                  </ul>
                  <div v-else class="empty-text">无检索证据</div>
                </details>
              </template>

              <template v-else-if="activeNodeContent?.kind === 'table'">
                <div class="card">
                  <div class="kv-row"><span>source_page</span><b>{{ activeNodeContent.task.source_page ?? '-' }}</b></div>
                </div>

                <details
                  v-for="(sub, i) in activeNodeContent.task.sub_indicators"
                  :key="i"
                  class="card"
                  :open="i === 0"
                >
                  <summary>{{ sub.sub_indicator_name }}</summary>
                  <div class="kv-row"><span>factoid_question</span><b>{{ sub.factoid_question || '-' }}</b></div>
                  <div class="desc"><b>relevance:</b> {{ sub.relevance_rationale || '-' }}</div>
                  <div class="kv-row"><span>source_text_id</span><b>{{ sub.source_text_id || '-' }}</b></div>

                  <div class="table-wrap" v-if="activeNodeContent.columns.length">
                    <table class="mini-table">
                      <thead>
                        <tr>
                          <th v-for="col in activeNodeContent.columns" :key="col">{{ col }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td v-for="col in activeNodeContent.columns" :key="col">{{ sub.values?.[col] ?? '-' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </template>

              <div v-else class="empty-text">未找到该节点的中间结果内容。</div>
            </details>

          </template>

          <template v-else-if="activeEdge">
            <div class="info-section">
              <div class="kv-row"><span>边类型</span><b>{{ relTypeLabel(activeEdge.type) }}</b></div>
              <div class="kv-row"><span>连接</span><b>{{ activeEdge.source }} ↔ {{ activeEdge.target }}</b></div>
              <div class="kv-row"><span>条目数</span><b>{{ activeEdge.details.length }}</b></div>
            </div>

            <details
              v-for="(d, i) in activeEdge.details"
              :key="i"
              class="info-section"
              :open="i === 0"
            >
              <summary>关系明细 #{{ i + 1 }}</summary>
              <div v-for="(val, k) in d" :key="k" class="card">
                <template v-if="!hasObjectFields(val) && !Array.isArray(val)">
                  <div class="kv-row"><span>{{ k }}</span><b>{{ formatScalar(val) }}</b></div>
                </template>
                <template v-else-if="k === 'candidate_causes' && Array.isArray(val)">
                  <div class="kv-row"><span>{{ k }}</span><b>候选原因（{{ val.length }}）</b></div>
                  <ul class="cause-list" v-if="val.length">
                    <li v-for="(item, j) in val" :key="j" class="cause-item">
                      <template v-if="hasObjectFields(item)">
                        <div class="kv-row compact"><span>cause_clause</span><b>{{ formatScalar((item as any).cause_clause) }}</b></div>
                        <div class="kv-row compact"><span>source_hint</span><b>{{ formatScalar((item as any).source_hint) }}</b></div>
                      </template>
                      <template v-else>
                        <div class="desc">{{ formatScalar(item) }}</div>
                      </template>
                    </li>
                  </ul>
                </template>
                <template v-else-if="Array.isArray(val)">
                  <div class="kv-row"><span>{{ k }}</span><b>数组({{ val.length }})</b></div>
                  <ul>
                    <li v-for="(item, j) in val" :key="j">
                      <template v-if="hasObjectFields(item)">
                        <div
                          v-for="([ik, iv], ii) in objectEntries(item)"
                          :key="`${j}-${ii}`"
                          class="kv-row compact"
                        >
                          <span>{{ ik }}</span><b>{{ hasObjectFields(iv) || Array.isArray(iv) ? JSON.stringify(iv) : formatScalar(iv) }}</b>
                        </div>
                      </template>
                      <template v-else>
                        {{ formatScalar(item) }}
                      </template>
                    </li>
                  </ul>
                </template>
                <template v-else>
                  <div class="kv-row"><span>{{ k }}</span><b>对象</b></div>
                  <div
                    v-for="([ok, ov], oi) in objectEntries(val)"
                    :key="`${k}-${oi}`"
                    class="kv-row compact"
                  >
                    <span>{{ ok }}</span><b>{{ hasObjectFields(ov) || Array.isArray(ov) ? JSON.stringify(ov) : formatScalar(ov) }}</b>
                  </div>
                </template>
              </div>
            </details>
          </template>

          <template v-else>
            <div class="info-section">
              <p class="empty-text">悬停节点可查看节点自身内容（文本、检索证据、表格内容）。</p>
              <p class="empty-text">点击节点可固定节点详情；点击边可固定算子详情。</p>
              <p class="empty-text">算子文件信息仅在边详情中展示。</p>
            </div>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 640px;
  background: transparent;
  display: flex;
}

.modal-card {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: #fff;
  border: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.back-btn {
  border: none;
  border-radius: 10px;
  padding: 0.42rem 0.68rem;
  background: rgba(219, 234, 254, 0.85);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 0.78rem;
}

.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
}

.legend {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot.narrative {
  background: #0ea5e9;
}

.dot.table {
  border-radius: 2px;
  background: #0f766e;
}

.line {
  width: 14px;
  height: 0;
  border-top: 2px solid #94a3b8;
  display: inline-block;
}

.line.causal {
  border-color: #0ea5e9;
}

.line.conflict {
  border-color: #ef4444;
}

.line.relation {
  border-color: #a855f7;
}

.modal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.graph-pane {
  border-right: 1px solid var(--color-border);
  background: #f8fafc;
}

.graph-svg {
  width: 100%;
  height: 100%;
  user-select: none;
}

.edge {
  cursor: pointer;
  opacity: 0.9;
}

.edge.pinned {
  opacity: 1;
  stroke-width: 3.6;
}

.node {
  cursor: grab;
  stroke: #0f172a;
  stroke-width: 0.8;
}

.node:active {
  cursor: grabbing;
}

.node.narrative {
  fill: #e0f2fe;
}

.node.table {
  fill: #ccfbf1;
  stroke-dasharray: 3 2;
}

.node.active {
  stroke-width: 2;
}

.node.pinned {
  stroke: #f59e0b;
  stroke-width: 2.4;
}

.node-label {
  text-anchor: middle;
  font-size: 10px;
  fill: #0f172a;
  pointer-events: none;
}

.info-pane {
  padding: 0.75rem 1rem;
  overflow: auto;
  scrollbar-gutter: stable;
  min-width: 0;
}

.info-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.45rem;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--color-border);
}

.info-head-row h4 {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.3;
  word-break: break-word;
}

.pin-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}

.info-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #f8fafc;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.55rem;
}

.info-section summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--color-primary);
}

.kv-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.45rem;
  font-size: 0.78rem;
  margin-bottom: 0.25rem;
  align-items: start;
}

.kv-row span {
  color: var(--color-text-muted);
  word-break: break-word;
}

.kv-row b {
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.kv-row.compact {
  grid-template-columns: 96px 1fr;
  font-size: 0.74rem;
}

.card {
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  padding: 0.4rem 0.45rem;
  margin-top: 0.35rem;
}

.card.conflict {
  border-color: #fca5a5;
  background: #fff7f7;
}

.desc {
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--color-text);
  margin-top: 0.2rem;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cause-list {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
}

.cause-item {
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 0.35rem 0.45rem;
  margin-bottom: 0.35rem;
  background: #fff;
}

.table-wrap {
  margin-top: 0.4rem;
  overflow-x: auto;
}

.mini-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 360px;
  font-size: 0.74rem;
}

.mini-table th,
.mini-table td {
  border: 1px solid var(--color-border);
  padding: 0.25rem 0.35rem;
  text-align: left;
  white-space: nowrap;
}

.mini-table th {
  background: #eef2ff;
}

.empty-text {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin: 0.25rem 0;
}
</style>
