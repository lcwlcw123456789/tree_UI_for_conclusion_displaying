<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Stage3GlobalSynthesis, Stage3Path, Stage3TreeEdge, Stage3TreeNode } from '../../types/conclusion'
import PillarBoardLayer from '../GraphShared/PillarBoardLayer.vue'
import NodeBubbleLayer from '../GraphShared/NodeBubbleLayer.vue'
import { buildPillarRegions } from '../GraphShared/layout'

type FocusMode = 'path' | 'node' | 'edge'
type DetailValue = { kind: 'text'; text: string } | { kind: 'list'; items: string[] } | { kind: 'json'; text: string } | { kind: 'empty' }
interface Row { key: string; value: DetailValue }
interface Point { x: number; y: number; r: number }

const props = defineProps<{ visible: boolean; stage3?: Stage3GlobalSynthesis; originalQuestion?: string; finalAnswer?: string }>()
const emit = defineEmits<{ close: [] }>()

const surfaceRef = ref<HTMLElement | null>(null)
const size = reactive({ width: 1280, height: 760 })

const mode = ref<FocusMode>('path')
const activePathId = ref('')
const activeNodeId = ref('')
const activeEdgeId = ref('')
const hoveredPathId = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)
const hoveredEdgeId = ref<string | null>(null)

const graph = computed(() => props.stage3?.tree_graph || null)
const paths = computed<Stage3Path[]>(() => props.stage3?.candidate_paths || [])
const selectedPathId = computed(() => props.stage3?.selected_path_id || props.stage3?.selected_path?.path_id || '')

const allNodes = computed<Stage3TreeNode[]>(() => graph.value?.nodes || [])
const indicatorNodes = computed<Stage3TreeNode[]>(() => allNodes.value.filter((n) => n.node_type !== 'root' && n.node_type !== 'pillar'))
const pillarNodes = computed<Stage3TreeNode[]>(() => allNodes.value.filter((n) => n.node_type === 'pillar'))
const visibleEdges = computed<Stage3TreeEdge[]>(() => (graph.value?.edges || []).filter((e) => !e.edge_id.startsWith('E_ROOT_')))

const nodeById = computed<Record<string, Stage3TreeNode>>(() => {
  const map: Record<string, Stage3TreeNode> = {}
  for (const n of allNodes.value) map[n.node_id] = n
  return map
})

const canvasWidth = computed(() => Math.max(size.width, 1))
const canvasHeight = computed(() => Math.max(size.height, 1))

const regionLayouts = computed(() => {
  const pillars = pillarNodes.value.map((p) => ({ key: p.pillar || p.label || p.node_id, title: p.label || p.pillar || p.node_id }))
  return buildPillarRegions(pillars, canvasWidth.value, canvasHeight.value, {
    top: 70,
    pad: 12,
    gap: 12,
    bottom: 12,
    headerSpace: 52,
    innerPadX: 16,
    innerPadBottom: 14,
  })
})

const nodePositions = computed<Record<string, Point>>(() => {
  const map: Record<string, Point> = {}
  const grouped: Record<string, Stage3TreeNode[]> = {}

  for (const node of indicatorNodes.value) {
    const key = node.pillar || node.label || ''
    if (!key) continue
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(node)
  }

  regionLayouts.value.forEach((r) => {
    const list = grouped[r.key] || []
    const cols = Math.max(Math.min(Math.ceil(Math.sqrt(list.length || 1)), 3), 1)
    const rows = Math.max(Math.ceil(list.length / cols), 1)
    const innerWidth = Math.max(r.innerRight - r.innerLeft, 280)
    const innerHeight = Math.max(r.innerBottom - r.innerTop, 240)
    list.forEach((node, idx) => {
      const row = Math.floor(idx / cols)
      const col = idx % cols
      const score = typeof node.selection_score === 'number' ? node.selection_score : 3
      map[node.node_id] = {
        x: r.innerLeft + (innerWidth / cols) * (col + 0.5),
        y: r.innerTop + (innerHeight / rows) * (row + 0.5),
        r: 16 + Math.max(Math.min(score, 6), 0) * 1.2,
      }
    })
  })

  indicatorNodes.value.forEach((node, i) => {
    if (map[node.node_id]) return
    map[node.node_id] = {
      x: canvasWidth.value / 2 + (i % 5) * 60 - 120,
      y: canvasHeight.value / 2 + Math.floor(i / 5) * 58,
      r: 20,
    }
  })

  return map
})

const activePath = computed(() => paths.value.find((p) => p.path_id === activePathId.value) || paths.value[0] || null)
const currentPath = computed(() => activePath.value)
const activeNode = computed(() => (activeNodeId.value ? nodeById.value[activeNodeId.value] || null : null))
const activeEdge = computed(() => (activeEdgeId.value ? visibleEdges.value.find((e) => e.edge_id === activeEdgeId.value) || null : null))
const activePathSelected = computed(() => activePath.value?.path_id === selectedPathId.value)

const pathNodeSet = computed(() => new Set(activePath.value?.node_path || []))

const pathSegments = computed(() => {
  const list = activePath.value?.node_path || []
  const segments: Array<{ from: string; to: string; d: string }> = []
  for (let i = 0; i < list.length - 1; i++) {
    const a = nodePositions.value[list[i] as string]
    const b = nodePositions.value[list[i + 1] as string]
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / dist
    const uy = dy / dist
    const sx = a.x + ux * (a.r + 1)
    const sy = a.y + uy * (a.r + 1)
    const ex = b.x - ux * (b.r + 2)
    const ey = b.y - uy * (b.r + 2)
    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2 - (activePathSelected.value ? 74 : 58)
    segments.push({ from: list[i] as string, to: list[i + 1] as string, d: `M ${sx} ${sy} C ${mx} ${my}, ${mx} ${my}, ${ex} ${ey}` })
  }
  return segments
})

function edgePath(edge: Stage3TreeEdge) {
  const s = nodePositions.value[edge.from]
  const t = nodePositions.value[edge.to]
  if (!s || !t) return ''
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const startX = s.x + ux * (s.r + 1)
  const startY = s.y + uy * (s.r + 1)
  const endX = t.x - ux * (t.r + 2)
  const endY = t.y - uy * (t.r + 2)
  const mx = (startX + endX) / 2
  const my = (startY + endY) / 2 - 44
  return `M ${startX} ${startY} C ${mx} ${my}, ${mx} ${my}, ${endX} ${endY}`
}

function isFinalSelectedPath(path: Stage3Path) { return path.path_id === selectedPathId.value }
function isActivePath(path: Stage3Path) { return path.path_id === activePath.value?.path_id }
function isHoveredPath(path: Stage3Path) { return hoveredPathId.value === path.path_id }
function isPathNode(nodeId: string) { return pathNodeSet.value.has(nodeId) }
function isPathEdge(edge: Stage3TreeEdge) {
  const list = activePath.value?.node_path || []
  return list.some((id, i) => i < list.length - 1 && ((edge.from === id && edge.to === list[i + 1]) || (edge.to === id && edge.from === list[i + 1])))
}

function focusPath(path: Stage3Path) {
  if (!path.path_id) return
  activePathId.value = path.path_id
  activeNodeId.value = ''
  activeEdgeId.value = ''
  mode.value = 'path'
}

function focusNode(node: Stage3TreeNode) {
  activeNodeId.value = node.node_id
  activeEdgeId.value = ''
  mode.value = 'node'
}

function focusEdge(edge: Stage3TreeEdge) {
  activeEdgeId.value = edge.edge_id
  activeNodeId.value = ''
  mode.value = 'edge'
}

function backToPath() {
  activeNodeId.value = ''
  activeEdgeId.value = ''
  mode.value = 'path'
}

function closeView() {
  backToPath()
  emit('close')
}

function nodeClass(node: Stage3TreeNode) {
  return {
    active: activeNodeId.value === node.node_id,
    hovered: hoveredNodeId.value === node.node_id,
    path: isPathNode(node.node_id),
    final: activePathSelected.value && isPathNode(node.node_id),
    candidate: !activePathSelected.value && isPathNode(node.node_id),
  }
}

function regionClass(region: (typeof regionLayouts.value)[number]) {
  const active = activePath.value?.node_path?.some((id) => nodeById.value[id]?.pillar === region.key || nodeById.value[id]?.label === region.key)
  return { active, final: active && activePathSelected.value, candidate: active && !activePathSelected.value, muted: !!activePath.value && !active }
}

function edgeClass(edge: Stage3TreeEdge) {
  return {
    active: activeEdgeId.value === edge.edge_id,
    hovered: hoveredEdgeId.value === edge.edge_id,
    path: isPathEdge(edge),
    final: activePathSelected.value && isPathEdge(edge),
    candidate: !activePathSelected.value && isPathEdge(edge),
    conflict: edge.relation_type === 'conflict',
    hierarchy: edge.relation_type === 'hierarchy',
    sequence: edge.relation_type === 'intra_pillar_sequence',
  }
}

function indicatorBadge(node: Stage3TreeNode) { return node.indicator_id || node.node_id }

function scoreText(v: unknown) {
  if (typeof v !== 'number') return '—'
  return v.toFixed(2)
}

function avgScore(path: Stage3Path) {
  const nums = [path.coverage_score, path.coherence_score, path.faithfulness_score].filter((n): n is number => typeof n === 'number')
  if (!nums.length) return '—'
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
}

function formatValue(v: unknown): DetailValue {
  if (v == null) return { kind: 'empty' }
  if (Array.isArray(v)) return { kind: 'list', items: v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))) }
  if (typeof v === 'object') return { kind: 'json', text: JSON.stringify(v, null, 2) }
  const s = String(v).trim()
  return s ? { kind: 'text', text: s } : { kind: 'empty' }
}

function formatStructured(v: unknown): DetailValue {
  if (v == null) return { kind: 'empty' }
  if (Array.isArray(v)) {
    const lines: string[] = []
    v.forEach((item, i) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>
        if (typeof obj.cause_clause === 'string' || typeof obj.source_hint === 'string') {
          lines.push(`${i + 1}. cause: ${String(obj.cause_clause || '—')}`)
          lines.push(`   source_hint: ${String(obj.source_hint || '—')}`)
          return
        }
      }
      lines.push(`${i + 1}. ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`)
    })
    return lines.length ? { kind: 'list', items: lines } : { kind: 'empty' }
  }
  if (typeof v === 'object') {
    const lines = Object.entries(v as Record<string, unknown>).map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
    return lines.length ? { kind: 'list', items: lines } : { kind: 'empty' }
  }
  return { kind: 'text', text: String(v) }
}

const detailTitle = computed(() => (mode.value === 'node' ? '节点详情' : mode.value === 'edge' ? '边详情' : '路径详情'))
const detailSubtitle = computed(() => (mode.value === 'node' ? activeNode.value?.node_id : mode.value === 'edge' ? activeEdge.value?.edge_id : activePath.value?.path_id) || '—')

const detailRows = computed<Row[]>(() => {
  if (mode.value === 'path') {
    const p = activePath.value
    if (!p) return []
    return [
      { key: 'path_id', value: formatValue(p.path_id) },
      { key: 'title', value: formatValue(p.title) },
      { key: 'core_thesis', value: formatValue(p.core_thesis) },
      { key: 'node_path', value: formatValue(p.node_path) },
      { key: 'cross_pillar_links', value: formatValue(p.cross_pillar_links) },
      { key: 'tensions_or_gaps', value: formatValue(p.tensions_or_gaps) },
      { key: 'resolution_logic', value: formatValue(p.resolution_logic) },
      { key: 'coverage_score', value: formatValue(p.coverage_score) },
      { key: 'coherence_score', value: formatValue(p.coherence_score) },
      { key: 'faithfulness_score', value: formatValue(p.faithfulness_score) },
      { key: 'why_it_wins', value: formatValue(p.why_it_wins) },
    ]
  }

  if (mode.value === 'node') {
    const n = activeNode.value as any
    if (!n) return []
    return [
      { key: 'node_id', value: formatValue(n.node_id) },
      { key: 'node_type', value: formatValue(n.node_type) },
      { key: 'label', value: formatValue(n.label) },
      { key: 'pillar', value: formatValue(n.pillar) },
      { key: 'indicator_id', value: formatValue(n.indicator_id) },
      { key: 'indicator_name', value: formatValue(n.indicator_name) },
      { key: 'indicator_ref', value: formatValue(n.indicator_ref) },
      { key: 'selection_score', value: formatValue(n.selection_score) },
      { key: 'selected', value: formatValue(n.selected) },
      { key: 'raw_source', value: formatStructured(n.raw_source) },
      { key: 'operator_source', value: formatStructured(n.operator_source) },
    ]
  }

  const e = activeEdge.value
  if (!e) return []
  return [
    { key: 'edge_id', value: formatValue(e.edge_id) },
    { key: 'from', value: formatValue(e.from) },
    { key: 'to', value: formatValue(e.to) },
    { key: 'relation_type', value: formatValue(e.relation_type) },
    { key: 'weight', value: formatValue(e.weight) },
    { key: 'evidence', value: formatStructured(e.evidence) },
  ]
})

const renderRegions = computed(() => regionLayouts.value.map((r) => {
  const cls = regionClass(r)
  return {
    ...r,
    muted: cls.muted,
    final: cls.final,
    candidate: cls.candidate,
  }
}))

const renderNodes = computed(() => indicatorNodes.value.map((node) => {
  const pos = nodePositions.value[node.node_id] || { x: 0, y: 0, r: 20 }
  const cls = nodeClass(node)
  return {
    id: node.node_id,
    label: indicatorBadge(node),
    score: node.selection_score,
    x: pos.x,
    y: pos.y,
    r: pos.r,
    active: cls.active,
    hovered: cls.hovered,
    path: cls.path,
    final: cls.final,
    candidate: cls.candidate,
  }
}))

function onSharedNodeClick(id: string) {
  const target = indicatorNodes.value.find((n) => n.node_id === id)
  if (target) focusNode(target)
}

function onSharedNodeEnter(id: string) {
  const target = indicatorNodes.value.find((n) => n.node_id === id)
  hoveredNodeId.value = target?.node_id || null
}

function onSharedNodeLeave() {
  hoveredNodeId.value = null
}

function measure() {
  const el = surfaceRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  size.width = Math.max(Math.floor(rect.width), 0)
  size.height = Math.max(Math.floor(rect.height), 0)
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && surfaceRef.value) {
    const observer = new ResizeObserver(() => measure())
    observer.observe(surfaceRef.value)
    onBeforeUnmount(() => observer.disconnect())
  }
})

watch(
  () => props.visible,
  (v) => {
    if (!v) {
      activePathId.value = ''
      activeNodeId.value = ''
      activeEdgeId.value = ''
      hoveredPathId.value = null
      hoveredNodeId.value = null
      hoveredEdgeId.value = null
      mode.value = 'path'
      return
    }
    activePathId.value = selectedPathId.value || paths.value[0]?.path_id || ''
    mode.value = 'path'
  },
  { immediate: true },
)

watch(
  () => [graph.value, paths.value.length, selectedPathId.value],
  () => {
    if (!props.visible) return
    if (!activePathId.value) activePathId.value = selectedPathId.value || paths.value[0]?.path_id || ''
  },
)
</script>

<template>
  <div v-if="visible" class="page-shell">
    <header class="page-header">
      <div class="header-left">
        <button class="back-btn top-back" type="button" @click="closeView">← 返回</button>
        <div>
          <div class="kicker">Stage 3 · 显式图结构</div>
          <h3>ToT 图式推理界面</h3>
          <p>节点、边、路径三层联动；点击路径高亮其节点与边，点击节点或边查看完整信息。</p>
        </div>
      </div>
      <button class="close-btn" type="button" @click="closeView">✕</button>
    </header>

    <div class="page-body">
      <section class="graph-panel">
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="kicker small">所有路径</span>
            <div class="path-tabs">
              <button
                v-for="(path, index) in paths"
                :key="path.path_id || index"
                class="path-tab"
                :class="{ selected: isFinalSelectedPath(path), active: isActivePath(path), hovered: isHoveredPath(path) }"
                type="button"
                @click="focusPath(path)"
                @mouseenter="hoveredPathId = path.path_id || null"
                @mouseleave="hoveredPathId = null"
              >
                <strong>{{ path.path_id || `path_${index + 1}` }}</strong>
                <span>
                  <b>{{ isFinalSelectedPath(path) ? 'selected' : 'candidate' }}</b>
                  <i>avg {{ avgScore(path) }}</i>
                </span>
              </button>
            </div>
          </div>
          <div class="legend">
            <span><i class="dot selected"></i>最终路径</span>
            <span><i class="dot candidate"></i>候选路径</span>
            <span><i class="dot neutral"></i>普通节点/边</span>
          </div>
        </div>

        <div ref="surfaceRef" class="surface">
          <div v-if="!graph" class="empty">
            <strong>没有检测到 stage3_global_synthesis.tree_graph 数据。</strong>
            <span>当前只存在路径信息时，无法绘制显式图结构。</span>
          </div>

          <template v-else>
            <svg class="edge-svg" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`" preserveAspectRatio="none">
              <defs>
                <marker id="arrow-neutral" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgba(148,163,184,.9)" />
                </marker>
                <marker id="arrow-conflict" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgba(239,68,68,.95)" />
                </marker>
                <marker id="arrow-final" markerWidth="8" markerHeight="8" refX="6.6" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(250,204,21,.98)" />
                </marker>
                <marker id="arrow-candidate" markerWidth="8" markerHeight="8" refX="6.6" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(168,85,247,.95)" />
                </marker>
              </defs>

              <g
                v-for="edge in visibleEdges"
                :key="edge.edge_id"
                class="edge-hit"
                @click.stop="focusEdge(edge)"
                @mouseenter="hoveredEdgeId = edge.edge_id"
                @mouseleave="hoveredEdgeId = null"
              >
                <path class="edge-hit-area" :d="edgePath(edge)" fill="none" />
                <path
                  class="edge-base"
                  :class="edgeClass(edge)"
                  :d="edgePath(edge)"
                  fill="none"
                  :marker-end="edge.relation_type === 'conflict' ? 'url(#arrow-conflict)' : 'url(#arrow-neutral)'"
                />
              </g>

              <g v-if="currentPath" class="path-overlay">
                <template v-for="seg in pathSegments" :key="`${seg.from}-${seg.to}`">
                  <path class="path-glow" :class="{ final: activePathSelected, candidate: !activePathSelected }" :d="seg.d" fill="none" />
                  <path
                    class="path-main"
                    :class="{ final: activePathSelected, candidate: !activePathSelected }"
                    :d="seg.d"
                    fill="none"
                    :marker-end="activePathSelected ? 'url(#arrow-final)' : 'url(#arrow-candidate)'"
                  />
                </template>
              </g>
            </svg>

            <PillarBoardLayer :regions="renderRegions" />

            <NodeBubbleLayer
              :nodes="renderNodes"
              @node-click="onSharedNodeClick"
              @node-enter="onSharedNodeEnter"
              @node-leave="onSharedNodeLeave"
            />
          </template>
        </div>
      </section>

      <aside class="detail-panel">
        <div class="detail-head">
          <div>
            <span class="kicker small">detail view</span>
            <h4>{{ detailTitle }}</h4>
            <p>{{ detailSubtitle }}</p>
          </div>
          <button v-if="mode !== 'path' && activePath" class="back-btn" type="button" @click="backToPath">返回路径</button>
        </div>

        <div class="detail-scroll">
          <div v-if="mode === 'path' && activePath" class="summary" :class="{ selected: activePathSelected }">
            <div class="summary-top">
              <div>
                <span class="pill">{{ activePathSelected ? 'final selected' : 'candidate path' }}</span>
                <h5>{{ activePath.title || activePath.path_id }}</h5>
              </div>
              <div class="avg-box">
                <span>avg</span>
                <strong>{{ avgScore(activePath) }}</strong>
              </div>
            </div>
            <p>{{ activePath.core_thesis || '—' }}</p>
            <div class="score-grid">
              <div><span>coverage</span><strong>{{ scoreText(activePath.coverage_score) }}</strong></div>
              <div><span>coherence</span><strong>{{ scoreText(activePath.coherence_score) }}</strong></div>
              <div><span>faithfulness</span><strong>{{ scoreText(activePath.faithfulness_score) }}</strong></div>
            </div>
          </div>

          <div class="rows">
            <div v-for="row in detailRows" :key="row.key" class="row">
              <span class="row-key">{{ row.key }}</span>
              <template v-if="row.value.kind === 'empty'"><span class="value empty">—</span></template>
              <template v-else-if="row.value.kind === 'text'"><span class="value text">{{ row.value.text }}</span></template>
              <template v-else-if="row.value.kind === 'json'"><pre class="value json">{{ row.value.text }}</pre></template>
              <template v-else>
                <ul class="value list">
                  <li v-for="(item, index) in row.value.items" :key="index">{{ item }}</li>
                </ul>
              </template>
            </div>
          </div>

          <div v-if="mode === 'path'" class="score-table-card">
            <div class="score-table-title">路径对照表</div>
            <table class="score-table">
              <thead>
                <tr><th>path</th><th>coverage</th><th>coherence</th><th>faithfulness</th></tr>
              </thead>
              <tbody>
                <tr v-for="path in paths" :key="path.path_id" :class="{ selected: isFinalSelectedPath(path), active: isActivePath(path) }" @click="focusPath(path)">
                  <td><div class="name"><b>{{ path.title || path.path_id }}</b><small>{{ path.path_id }}</small></div></td>
                  <td>{{ scoreText(path.coverage_score) }}</td>
                  <td>{{ scoreText(path.coherence_score) }}</td>
                  <td>{{ scoreText(path.faithfulness_score) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page-shell { position: relative; width: 100%; height: 100%; min-height: 640px; display: flex; flex-direction: column; background: linear-gradient(180deg, #fff7fb, #ece7f2); }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 1.2rem .85rem; border-bottom: 1px solid #d0d1e6; background: #ece7f2; }
.header-left { display: flex; align-items: flex-start; gap: .8rem; }
.page-header h3 { margin: .18rem 0 0; font-size: 1.08rem; }
.page-header p { margin: .24rem 0 0; color: #64748b; font-size: .8rem; line-height: 1.45; }
.kicker { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .18rem .56rem; background: #d0d1e6; color: #034e7b; font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.kicker.small { margin-bottom: .5rem; }
.kicker.tiny { margin-bottom: .3rem; }
.close-btn, .back-btn { border: none; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.close-btn { width: 40px; height: 40px; border-radius: 12px; background: #d0d1e6; color: #034e7b; font-size: 1rem; }
.back-btn { padding: .52rem .78rem; border-radius: 12px; background: #a6bddb; color: #034e7b; font-size: .78rem; white-space: nowrap; }
.top-back { align-self: center; }
.close-btn:hover, .back-btn:hover, .path-tab:hover, .graph-node:hover, .score-table tbody tr:hover { transform: translateY(-1px); }
.page-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2.25fr) minmax(320px, .75fr); gap: .75rem; padding: .8rem; }
.graph-panel, .detail-panel { min-height: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .8rem; }
.toolbar-left { min-width: 0; display: flex; flex-direction: column; gap: .55rem; }
.path-tabs { display: flex; gap: .6rem; flex-wrap: wrap; }
.path-tab { min-width: 118px; border-radius: 12px; padding: .42rem .5rem; border: 1px solid #a6bddb; background: #fff7fb; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: .2rem; box-shadow: 0 6px 18px rgba(3,78,123,.08); }
.path-tab.selected { border-color: #0570b0; background: #d0d1e6; box-shadow: 0 0 0 1px rgba(5,112,176,.2), 0 12px 28px rgba(5,112,176,.16); }
.path-tab.active { box-shadow: 0 0 0 1px rgba(3,78,123,.22), 0 14px 30px rgba(3,78,123,.16); }
.path-tab.hovered { box-shadow: 0 0 0 1px rgba(59,130,246,.18), 0 0 0 4px rgba(59,130,246,.08); }
.path-tab strong { font-size: .74rem; line-height: 1.25; color: #0f172a; }
.path-tab span { display: flex; justify-content: space-between; gap: .35rem; color: #64748b; font-size: .66rem; }
.legend { display: flex; align-items: center; gap: .85rem; flex-wrap: wrap; color: #475569; font-size: .72rem; }
.legend span { display: inline-flex; align-items: center; gap: .4rem; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.selected { background: #0570b0; box-shadow: 0 0 0 4px rgba(5,112,176,.2); }
.dot.candidate { background: #3690c0; box-shadow: 0 0 0 4px rgba(54,144,192,.16); }
.dot.neutral { background: #74a9cf; }
.surface { position: relative; flex: 1; min-height: 0; overflow: hidden; border-radius: 18px; border: 1px solid #a6bddb; background: linear-gradient(90deg, rgba(166,189,219,.3) 1px, transparent 1px), linear-gradient(180deg, rgba(166,189,219,.3) 1px, transparent 1px), linear-gradient(180deg, #fff7fb, #ece7f2); background-size: 56px 56px, 56px 56px, auto; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; gap: .4rem; text-align: center; color: #64748b; }
.empty strong { color: #0f172a; }
.edge-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: auto; }
.edge-hit { cursor: pointer; pointer-events: auto; }
.edge-hit-area { stroke: transparent; stroke-width: 14; pointer-events: stroke; }
.edge-base { stroke-width: 2.2; opacity: .82; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.edge-base.hierarchy { stroke: rgba(148,163,184,.85); }
.edge-base.sequence { stroke: rgba(100,116,139,.82); }
.edge-base.conflict { stroke: rgba(239,68,68,.88); stroke-dasharray: 10 7; }
.edge-base.active, .edge-base.hovered, .edge-hit:hover .edge-base { stroke-width: 3.2; opacity: 1; }
.edge-base.path.final { stroke: rgba(245,158,11,.28); }
.edge-base.path.candidate { stroke: rgba(139,92,246,.26); }
.path-overlay { pointer-events: none; }
.path-glow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-glow.final { stroke: rgba(250,204,21,.2); stroke-width: 13; filter: blur(9px); }
.path-glow.candidate { stroke: rgba(168,85,247,.16); stroke-width: 8; }
.path-main { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-main.final { stroke: #facc15; stroke-width: 3.8; stroke-dasharray: 14 10; animation: flow 2.4s linear infinite; filter: drop-shadow(0 0 14px rgba(250,204,21,.32)); }
.path-main.candidate { stroke: #a855f7; stroke-width: 2.6; stroke-dasharray: 10 8; animation: flow-candidate 3s linear infinite; filter: drop-shadow(0 0 10px rgba(168,85,247,.25)); }
@keyframes flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -128; } }
@keyframes flow-candidate { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -116; } }
.region { position: absolute; border-radius: 20px; border: 1px solid #a6bddb; overflow: hidden; transition: border-color .18s ease, box-shadow .18s ease, opacity .18s ease; z-index: 1; pointer-events: none; }
.region::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.35), transparent 34%); pointer-events: none; }
.region.final { border-color: rgba(245,158,11,.36); box-shadow: 0 0 0 1px rgba(245,158,11,.14), 0 18px 40px rgba(245,158,11,.08); }
.region.candidate { border-color: rgba(139,92,246,.32); box-shadow: 0 0 0 1px rgba(139,92,246,.12), 0 18px 40px rgba(139,92,246,.08); }
.region.muted { opacity: .58; filter: saturate(.84); }
.region-head { position: absolute; left: 10px; top: 8px; right: 10px; display: flex; flex-direction: column; gap: .2rem; z-index: 2; pointer-events: none; }
.region-head strong { color: #0f172a; font-size: .73rem; line-height: 1.2; }
.node-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
.graph-node { border: 1px solid #74a9cf; background: #fff7fb; color: #034e7b; box-shadow: 0 10px 28px rgba(3,78,123,.12); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease; }
.graph-node:hover { box-shadow: 0 16px 32px rgba(15,23,42,.12); }
.indicator-card { position: absolute; border-radius: 999px; padding: .2rem; display: flex; flex-direction: column; gap: .08rem; align-items: center; justify-content: center; z-index: 6; transform: translate(-50%, -50%); pointer-events: auto; }
.node-kicker { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .12rem .42rem; background: rgba(241,245,249,.95); color: #475569; font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.indicator-card .node-kicker { font-size: .52rem; padding: 0; background: transparent; color: #1e293b; letter-spacing: 0; text-transform: none; line-height: 1; }
.indicator-card .score { font-size: .52rem; font-weight: 700; color: #334155; line-height: 1; align-self: center; }
.graph-node.active { border-color: #0570b0; box-shadow: 0 0 0 1px rgba(5,112,176,.2), 0 18px 38px rgba(5,112,176,.18); }
.graph-node.hovered { border-color: rgba(14,165,233,.45); box-shadow: 0 0 0 2px rgba(56,189,248,.2), 0 10px 22px rgba(14,116,144,.15); transform: translate(-50%, -50%) scale(1.05); }
.graph-node.path.final { border-color: rgba(245,158,11,.56); box-shadow: 0 0 0 1px rgba(245,158,11,.22), 0 10px 20px rgba(245,158,11,.12); }
.graph-node.path.candidate { border-color: rgba(168,85,247,.48); box-shadow: 0 0 0 1px rgba(168,85,247,.2), 0 10px 20px rgba(168,85,247,.12); }
.detail-panel { border-left: 1px solid #d0d1e6; padding-left: .1rem; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .05rem 0 .25rem .25rem; }
.detail-head h4 { margin: .16rem 0 0; font-size: .98rem; }
.detail-head p { margin: .18rem 0 0; color: #64748b; font-size: .76rem; }
.detail-scroll { min-height: 0; overflow: auto; padding-right: .2rem; display: flex; flex-direction: column; gap: .85rem; scrollbar-gutter: stable both-edges; }
.summary, .score-table-card, .row { border: 1px solid #a6bddb; border-radius: 16px; background: #fff7fb; box-shadow: 0 10px 26px rgba(3,78,123,.08); }
.summary { padding: .92rem; }
.summary.selected { border-color: rgba(245,158,11,.28); background: linear-gradient(180deg, rgba(255,247,237,.84), rgba(255,255,255,.95)); }
.summary-top { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; }
.summary-top h5 { margin: .28rem 0 0; font-size: .92rem; line-height: 1.45; }
.pill { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .18rem .45rem; font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #92400e; background: rgba(253,230,138,.82); }
.avg-box { min-width: 74px; border-radius: 16px; padding: .62rem .75rem; background: rgba(15,23,42,.04); display: flex; flex-direction: column; align-items: flex-end; gap: .14rem; }
.avg-box span { color: #64748b; font-size: .72rem; }
.avg-box strong { color: #0f172a; font-size: 1.08rem; }
.summary p { margin: .72rem 0 0; color: #0f172a; font-size: .84rem; line-height: 1.65; }
.score-grid { margin-top: .78rem; display: flex; gap: .6rem; }
.score-grid div { flex: 1; padding: .68rem .72rem; background: rgba(248,250,252,.96); border-radius: 14px; border: 1px solid rgba(148,163,184,.12); display: flex; flex-direction: column; gap: .1rem; }
.score-grid span { font-size: .72rem; color: #64748b; }
.score-grid strong { color: #0f172a; font-size: .92rem; }
.rows { display: flex; flex-direction: column; gap: .7rem; }
.row { padding: .76rem .78rem; display: flex; flex-direction: column; gap: .42rem; }
.row-key { color: #475569; font-size: .72rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.value { color: #0f172a; font-size: .82rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.value.empty { color: #94a3b8; }
.value.text, .value.json { background: rgba(248,250,252,.96); border-radius: 12px; padding: .68rem .76rem; border: 1px solid rgba(226,232,240,.9); }
.value.json { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: .72rem; line-height: 1.55; overflow: auto; }
.value.list { margin: 0; padding-left: 1rem; }
.value.list li + li { margin-top: .18rem; }
.score-table-card { padding: .86rem .92rem .95rem; }
.score-table-title { font-size: .84rem; font-weight: 700; margin-bottom: .66rem; color: #0f172a; }
.score-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.score-table th, .score-table td { padding: .72rem .42rem; border-bottom: 1px solid rgba(226,232,240,.96); text-align: left; }
.score-table th { color: #64748b; font-size: .7rem; letter-spacing: .03em; text-transform: uppercase; }
.score-table tbody tr { cursor: pointer; transition: background .18s ease, transform .18s ease; }
.score-table tbody tr.selected { background: rgba(255,247,237,.9); }
.score-table tbody tr.active { background: rgba(239,246,255,.92); }
.name { display: flex; flex-direction: column; gap: .12rem; }
.name small { color: #64748b; }
@media (max-width: 1400px) { .page-body { grid-template-columns: 1fr; } .detail-panel { border-left: none; border-top: 1px solid #d0d1e6; padding-top: 1rem; } .surface { min-height: 720px; } }
</style>
<!--
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type {
  Stage3GlobalSynthesis,
  Stage3Path,
  Stage3TreeEdge,
  Stage3TreeGraph,
  Stage3TreeNode,
} from '../../types/conclusion'

type FocusMode = 'path' | 'node' | 'edge'
  const edge = activeEdge.value
  if (!edge) return []
  return [
    ...rowsFromObject(edge, ['edge_id', 'from', 'to', 'relation_type', 'weight']),
    { key: 'evidence', value: formatStructuredValue(edge.evidence) },
  ]
})

const detailRows = computed<Row[]>(() => {
  if (mode.value === 'node') return nodeRows.value
  if (mode.value === 'edge') return edgeRows.value
  return pathRows.value
})

const activePathSelected = computed(() => activePath.value?.path_id === selectedPathId.value)
const pathSegments = computed(() => {
  const list = activePath.value?.node_path || []
  const segments: Array<{ from: string; to: string; d: string }> = []
  for (let i = 0; i < list.length - 1; i += 1) {
    const fromId = list[i] as string
    const toId = list[i + 1] as string
    const from = stateMap[fromId]
    const to = stateMap[toId]
    if (!from || !to) continue
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / dist
    const uy = dy / dist
    const startX = from.x + ux * (from.r + 1)
    const startY = from.y + uy * (from.r + 1)
    const endX = to.x - ux * (to.r + 2)
    const endY = to.y - uy * (to.r + 2)
    const mx = (startX + endX) / 2
    const bend = activePathSelected.value ? 78 : 58
    const my = (startY + endY) / 2 - bend
    segments.push({ from: fromId, to: toId, d: `M ${startX} ${startY} C ${mx} ${my}, ${mx} ${my}, ${endX} ${endY}` })
  }
  return segments
})

function isFinalSelectedPath(path: Stage3Path) {
  return !!path.path_id && path.path_id === selectedPathId.value
}
function isActivePath(path: Stage3Path) {
  return !!path.path_id && path.path_id === activePath.value?.path_id
}
function isHoveredPath(path: Stage3Path) {
  return hoveredPathId.value === path.path_id
}
function isPathNode(nodeId: string) {
  return activePathNodeSet.value.has(nodeId)
}
function isPathEdge(edge: Stage3TreeEdge) {
  const list = activePath.value?.node_path || []
  return list.some((id, index) => index < list.length - 1 && ((edge.from === id && edge.to === list[index + 1]) || (edge.to === id && edge.from === list[index + 1])))
}

function indicatorRadius(node: Stage3TreeNode) {
  const score = node.selection_score
  if (typeof score !== 'number') return 20
  const { min, max } = indicatorScoreRange.value
  if (max <= min) return 20
  const t = (score - min) / (max - min)
  return 16 + t * 7
}

function regionStyle(region: RegionLayout) {
  const token =
    regionColorTokens[region.index % regionColorTokens.length] ||
    regionColorTokens[0] || {
      border: 'rgba(148, 163, 184, 0.35)',
      bgTop: 'rgba(241, 245, 249, 0.62)',
      bgBottom: 'rgba(248, 250, 252, 0.5)',
    }
  return {
    borderColor: token.border,
    background: `linear-gradient(180deg, ${token.bgTop}, ${token.bgBottom})`,
  }
}

async function focusPath(path: Stage3Path) {
  if (!path.path_id) return
  if (activePathId.value === path.path_id) return
  stop()
  await nextTick()
  hoveredNodeId.value = ''
  hoveredEdgeId.value = ''
  activePathId.value = path.path_id
  activeNodeId.value = ''
  activeEdgeId.value = ''
  mode.value = 'path'
}
function focusNode(node: Stage3TreeNode) {
  activeNodeId.value = node.node_id
  activeEdgeId.value = ''
  mode.value = 'node'
}
function focusEdge(edge: Stage3TreeEdge) {
  activeEdgeId.value = edge.edge_id
  activeNodeId.value = ''
  mode.value = 'edge'
}

function getRegion(node: Stage3TreeNode) {
  const key = node.pillar || node.label || ''
  return key ? regionByKey.value[key] || null : null
}

function stateForNode(nodeId: string) {
  const hit = stateMap[nodeId]
  if (hit) return hit
  const node = nodeById.value[nodeId]
  const region = node ? getRegion(node) : null
  return {
    x: region?.centerX || canvasWidth.value / 2,
    y: region?.y || canvasHeight.value / 2,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    r: 20,
    kind: 'indicator' as const,
    regionKey: region?.key || null,
  }
}

function nodeBounds(node: Stage3TreeNode) {
  const region = getRegion(node)
  if (!region) return { minX: 0, maxX: canvasWidth.value, minY: 0, maxY: canvasHeight.value }
  if (node.node_type === 'pillar') return { minX: region.innerLeft, maxX: region.innerRight, minY: region.y + 26, maxY: region.y + 74 }
  return { minX: region.innerLeft, maxX: region.innerRight, minY: region.innerTop, maxY: region.innerBottom }
}

function initStates() {
  const width = canvasWidth.value
  const height = canvasHeight.value
  for (const key of Object.keys(stateMap)) delete stateMap[key]
  const rootNode = root.value
  if (rootNode) {
    stateMap[rootNode.node_id] = { x: width / 2, y: 56, vx: 0, vy: 0, ax: width / 2, ay: 56, r: 34, kind: 'root', regionKey: null }
  }
  const groups = nodesByRegion.value
  pillarNodes.value.forEach((pillar, index) => {
    const region = regionLayouts.value[index]
    const key = pillar.pillar || pillar.label || pillar.node_id
    const px = region?.centerX || width / Math.max(pillarNodes.value.length, 1)
    const py = region ? region.y + 52 : 120
    stateMap[pillar.node_id] = { x: px, y: py, vx: 0, vy: 0, ax: px, ay: py, r: 28, kind: 'pillar', regionKey: key }
    const nodes = groups[key] || []
    const cols = Math.max(Math.min(Math.ceil(Math.sqrt(nodes.length || 1)), 3), 1)
    const rows = Math.max(Math.ceil(nodes.length / cols), 1)
    const innerWidth = Math.max((region?.innerRight || px + 120) - (region?.innerLeft || px - 120), 280)
    const innerHeight = Math.max((region?.innerBottom || py + 260) - (region?.innerTop || py + 100), 260)
    nodes.forEach((node, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      const ax = (region?.innerLeft || px - 140) + (innerWidth / cols) * (col + 0.5)
      const ay = (region?.innerTop || py + 90) + (innerHeight / rows) * (row + 0.5)
      stateMap[node.node_id] = {
        x: ax,
        y: ay,
        vx: 0,
        vy: 0,
        ax,
        ay,
        r: indicatorRadius(node),
        kind: 'indicator',
        regionKey: key,
      }
    })
  })
  indicatorNodes.value.forEach((node, index) => {
    if (stateMap[node.node_id]) return
    const x = width / 2 + (index % 3) * 60 - 60
    const y = height / 2 + Math.floor(index / 3) * 60
    stateMap[node.node_id] = { x, y, vx: 0, vy: 0, ax: x, ay: y, r: 22, kind: 'indicator', regionKey: null }
  })
}

function adjacencyMap() {
  const map = new Map<string, string[]>()
  for (const edge of visibleEdges.value) {
    if (!map.has(edge.from)) map.set(edge.from, [])
    if (!map.has(edge.to)) map.set(edge.to, [])
    map.get(edge.from)!.push(edge.to)
    map.get(edge.to)!.push(edge.from)
  }
  return map
}

function stepPhysics() {
  const ids = Object.keys(stateMap)
  if (!ids.length) return
  const links = adjacencyMap()
  for (let i = 0; i < ids.length; i += 1) {
    const a = stateMap[ids[i] as string]
    for (let j = i + 1; j < ids.length; j += 1) {
      const b = stateMap[ids[j] as string]
      if (!a || !b) continue
      const sameRegion = a.regionKey && b.regionKey && a.regionKey === b.regionKey
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const minDist = a.r + b.r + (sameRegion ? 12 : 28)
      const force = ((sameRegion ? 0.17 : 0.07) * Math.max(minDist - dist + 20, 0)) / dist
      if (a.kind !== 'root') {
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
      }
      if (b.kind !== 'root') {
        b.vx -= (dx / dist) * force
        b.vy -= (dy / dist) * force
      }
    }
  }
  for (const node of nodes.value) {
    const state = stateMap[node.node_id]
    if (!state || state.kind === 'root') continue
    state.vx += (state.ax - state.x) * (node.node_type === 'pillar' ? 0.08 : 0.045)
    state.vy += (state.ay - state.y) * (node.node_type === 'pillar' ? 0.08 : 0.045)
    for (const neighborId of links.get(node.node_id) || []) {
      const n = stateMap[neighborId]
      if (!n) continue
      const dx = n.x - state.x
      const dy = n.y - state.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const target = node.node_type === 'pillar' || n.kind === 'pillar' ? 132 : 168
      const spring = node.node_type === 'pillar' || n.kind === 'pillar' ? 0.012 : 0.008
      const force = (dist - target) * spring
      state.vx += (dx / dist) * force
      state.vy += (dy / dist) * force
    }
    state.vx *= 0.88
    state.vy *= 0.88
    state.x += state.vx
    state.y += state.vy
    const b = nodeBounds(node)
    const pad = state.r + 2
    if (state.x < b.minX + pad) {
      state.x = b.minX + pad
      state.vx *= -0.45
    }
    if (state.x > b.maxX - pad) {
      state.x = b.maxX - pad
      state.vx *= -0.45
    }
    if (state.y < b.minY + pad) {
      state.y = b.minY + pad
      state.vy *= -0.45
    }
    if (state.y > b.maxY - pad) {
      state.y = b.maxY - pad
      state.vy *= -0.45
    }
  }
}

function loop() {
  if (!running) return
  if (frameBudget <= 0) {
    stop()
    return
  }
  frameBudget -= 1
  stepPhysics()
  raf = window.requestAnimationFrame(loop)
}
function start() {
  if (running || !graph.value) return
  running = true
  frameBudget = MAX_SIM_FRAMES
  raf = window.requestAnimationFrame(loop)
}
function stop() {
  running = false
  if (raf) window.cancelAnimationFrame(raf)
  raf = 0
}

function sync() {
  if (!props.visible || !graph.value || !pillarNodes.value.length) return
  initStates()
  stop()
  start()
}

function measure() {
  const el = surfaceRef.value
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const nextWidth = Math.max(Math.floor(rect.width), 0)
  const nextHeight = Math.max(Math.floor(rect.height), 0)
  const changed = Math.abs(nextWidth - lastMeasuredWidth) > 1 || Math.abs(nextHeight - lastMeasuredHeight) > 1
  if (changed) {
    size.width = nextWidth
    size.height = nextHeight
    lastMeasuredWidth = nextWidth
    lastMeasuredHeight = nextHeight
  }
  return changed
}

function nodeClass(node: Stage3TreeNode) {
  return {
    root: node.node_type === 'root',
    pillar: node.node_type === 'pillar',
    indicator: node.node_type !== 'root' && node.node_type !== 'pillar',
    active: activeNodeId.value === node.node_id,
    hovered: hoveredNodeId.value === node.node_id,
    path: isPathNode(node.node_id),
    final: activePathSelected.value && isPathNode(node.node_id),
    candidate: !activePathSelected.value && isPathNode(node.node_id),
  }
}
function regionClass(region: RegionLayout) {
  const active = activeRegionKeys.value.has(region.key)
  return {
    active,
    final: active && activePathSelected.value,
    candidate: active && !activePathSelected.value,
    muted: !!activePath.value && !active,
  }
}
function edgeClass(edge: Stage3TreeEdge) {
  return {
    active: activeEdgeId.value === edge.edge_id,
    hovered: hoveredEdgeId.value === edge.edge_id,
    path: isPathEdge(edge),
    final: activePathSelected.value && isPathEdge(edge),
    candidate: !activePathSelected.value && isPathEdge(edge),
    conflict: edge.relation_type === 'conflict',
    hierarchy: edge.relation_type === 'hierarchy',
    sequence: edge.relation_type === 'intra_pillar_sequence',
  }
}
function nodeLabel(node: Stage3TreeNode) {
  return node.label || node.indicator_name || node.indicator_id || node.node_id
}

function indicatorBadge(node: Stage3TreeNode) {
  return node.indicator_id || node.node_id
}
function edgePath(edge: Stage3TreeEdge) {
  const s = stateForNode(edge.from)
  const t = stateForNode(edge.to)
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const startX = s.x + ux * (s.r + 1)
  const startY = s.y + uy * (s.r + 1)
  const endX = t.x - ux * (t.r + 2)
  const endY = t.y - uy * (t.r + 2)
  const mx = (startX + endX) / 2
  const bend = Math.max(Math.min(Math.abs(endX - startX) * 0.25, 120), 40)
  const my = (startY + endY) / 2 - (edge.relation_type === 'conflict' ? bend + 20 : bend)
  return `M ${startX} ${startY} C ${mx} ${my}, ${mx} ${my}, ${endX} ${endY}`
}
function closeModal() {
  stop()
  activeNodeId.value = ''
  activeEdgeId.value = ''
  mode.value = 'path'
  emit('close')
}

function backToPath() {
  activeNodeId.value = ''
  activeEdgeId.value = ''
  mode.value = 'path'
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      stop()
      return
    }
    await nextTick()
    measure()
    if (!activePathId.value) activePathId.value = selectedPathId.value || paths.value[0]?.path_id || ''
    sync()
    mode.value = 'path'
  },
  { immediate: true },
)

watch(
  () => [graph.value, paths.value.length, selectedPathId.value],
  async () => {
    if (!props.visible) return
    await nextTick()
    measure()
    if (!activePathId.value) activePathId.value = selectedPathId.value || paths.value[0]?.path_id || ''
    sync()
  },
  { deep: true },
)

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && surfaceRef.value) {
    resizeObserver = new ResizeObserver(() => {
      const changed = measure()
      if (props.visible && changed) sync()
    })
    resizeObserver.observe(surfaceRef.value)
  }
})

onBeforeUnmount(() => {
  stop()
  if (resizeObserver && surfaceRef.value) {
    resizeObserver.unobserve(surfaceRef.value)
    resizeObserver.disconnect()
  }
  resizeObserver = null
})

// Make template-only usage visible to TS in strict mode.
void detailTitle
void detailSubtitle
void detailRows
void activePathSelected
void pathSegments
void isFinalSelectedPath
void isActivePath
void isHoveredPath
void focusPath
void focusNode
void focusEdge
void nodeClass
void regionClass
void edgeClass
void edgePath
void nodeLabel
void regionStyle
void indicatorBadge
void backToPath
</script>

<template>
  <div v-if="visible" class="page-shell">
    <header class="modal-header">
      <div class="header-left">
        <button class="back-btn top-back" type="button" @click="closeModal">← 返回</button>
        <div>
          <div class="kicker">Stage 3 · 显式图结构</div>
          <h3>ToT 图式推理界面</h3>
          <p>节点、边、路径三层联动；点击路径高亮其节点与边，点击节点或边查看完整信息。</p>
        </div>
      </div>
      <button class="close-btn" type="button" @click="closeModal">✕</button>
    </header>

    <div class="modal-body">
        <section class="graph-panel">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="kicker small">所有路径</span>
              <div class="path-tabs">
                <button
                  v-for="(path, index) in paths"
                  :key="path.path_id || index"
                  class="path-tab"
                  :class="{
                    selected: isFinalSelectedPath(path),
                    active: isActivePath(path),
                    hovered: isHoveredPath(path),
                  }"
                  type="button"
                  @click="focusPath(path)"
                  @mouseenter="hoveredPathId = path.path_id || null"
                  @mouseleave="hoveredPathId = null"
                >
                  <strong>{{ path.path_id || `path_${index + 1}` }}</strong>
                  <span>
                    <b>{{ isFinalSelectedPath(path) ? 'selected' : 'candidate' }}</b>
                    <i>avg {{ avgScore(path) }}</i>
                  </span>
                </button>
              </div>
            </div>
            <div class="legend">
              <span><i class="dot selected"></i>最终路径</span>
              <span><i class="dot candidate"></i>候选路径</span>
              <span><i class="dot neutral"></i>普通节点/边</span>
            </div>
          </div>

          <div ref="surfaceRef" class="surface">
            <div v-if="!graph" class="empty">
              <strong>没有检测到 stage3_global_synthesis.tree_graph 数据。</strong>
              <span>当前只存在路径信息时，无法绘制显式图结构。</span>
            </div>

            <template v-else>
              <svg class="edge-svg" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`" preserveAspectRatio="none">
                <defs>
                  <marker id="arrow-neutral" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgba(148,163,184,.9)" />
                  </marker>
                  <marker id="arrow-conflict" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 7 3.5 L 0 7 z" fill="rgba(239,68,68,.95)" />
                  </marker>
                  <marker id="arrow-final" markerWidth="8" markerHeight="8" refX="6.6" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(250,204,21,.98)" />
                  </marker>
                  <marker id="arrow-candidate" markerWidth="8" markerHeight="8" refX="6.6" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(168,85,247,.95)" />
                  </marker>
                </defs>

                <g
                  v-for="edge in visibleEdges"
                  :key="edge.edge_id"
                  </aside>
              </div>
                  @mouseleave="hoveredEdgeId = null"
                >
                  <path class="edge-hit-area" :d="edgePath(edge)" fill="none" />
                  <path class="edge-base" :class="edgeClass(edge)" :d="edgePath(edge)" fill="none" :marker-end="edge.relation_type === 'conflict' ? 'url(#arrow-conflict)' : 'url(#arrow-neutral)'" />
          .page-shell {

                <g v-if="currentPath" class="path-overlay">
            z-index: 1200;
            display: flex;
            flex-direction: column;
            background: linear-gradient(180deg, #f8fafc, #ffffff);
              </svg>

              <div
            width: 100%;
            height: 100%;
                class="region"
                :class="regionClass(region)"
                :style="{ left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`, height: `${region.height}px`, ...regionStyle(region) }"
                </div>
              </div>

              <div class="node-layer">
                <button
                  v-for="node in indicatorNodes"
                  :key="node.node_id"
                  class="graph-node indicator-card"
                  :class="nodeClass(node)"
            background: rgba(255,255,255,.96);
                  type="button"

          .header-left {
            display: flex;
            align-items: flex-start;
            gap: .8rem;
          }
                  :style="{
                    left: `${stateForNode(node.node_id).x}px`,
                    top: `${stateForNode(node.node_id).y}px`,
                    width: `${Math.round(stateForNode(node.node_id).r * 2)}px`,
                    height: `${Math.round(stateForNode(node.node_id).r * 2)}px`,
                  }"
                  @click.stop="focusNode(node)"
                  @mouseenter="hoveredNodeId = node.node_id"
                  @mouseleave="hoveredNodeId = null"
                >
                  <span class="node-kicker">{{ indicatorBadge(node) }}</span>
                  <span v-if="node.selection_score != null" class="score">{{ node.selection_score.toFixed(2) }}</span>
                </button>
              </div>
            </template>
          </div>
        </section>

        <aside class="detail-panel">
          <div class="detail-head">
            <div>
              <span class="kicker small">detail view</span>
              <h4>{{ detailTitle }}</h4>
              <p>{{ detailSubtitle }}</p>
            </div>
            <button
              v-if="mode !== 'path' && activePath"
              class="back-btn"
              type="button"
              @click="backToPath"
            >
              返回路径
            </button>
          </div>

          <div class="detail-scroll">
            <div v-if="mode === 'path' && activePath" class="summary" :class="{ selected: activePathSelected }">
              <div class="summary-top">
                <div>
                  <span class="pill">{{ activePathSelected ? 'final selected' : 'candidate path' }}</span>
                  <h5>{{ activePath.title || activePath.path_id }}</h5>
                </div>
                <div class="avg-box">
                  <span>avg</span>
                  <strong>{{ avgScore(activePath) }}</strong>
                </div>
              </div>
              <p>{{ activePath.core_thesis || '—' }}</p>
              <div class="score-grid">
                <div><span>coverage</span><strong>{{ scoreText(activePath.coverage_score) }}</strong></div>
                <div><span>coherence</span><strong>{{ scoreText(activePath.coherence_score) }}</strong></div>
                <div><span>faithfulness</span><strong>{{ scoreText(activePath.faithfulness_score) }}</strong></div>
              </div>
            </div>

            <div class="rows">
              <div v-for="row in detailRows" :key="row.key" class="row">
                <span class="row-key">{{ row.key }}</span>
                <template v-if="row.value.kind === 'empty'"><span class="value empty">—</span></template>
                <template v-else-if="row.value.kind === 'text'"><span class="value text">{{ row.value.text }}</span></template>
                <template v-else-if="row.value.kind === 'json'"><pre class="value json">{{ row.value.text }}</pre></template>
                <template v-else>
                  <ul class="value list">
                    <li v-for="(item, index) in row.value.items" :key="index">{{ item }}</li>
                  </ul>
                </template>
              </div>
            </div>

            <div v-if="mode === 'path'" class="score-table-card">
              <div class="score-table-title">路径对照表</div>
              <table class="score-table">
                <thead>
                  <tr><th>path</th><th>coverage</th><th>coherence</th><th>faithfulness</th></tr>
                </thead>
                <tbody>
                  <tr v-for="path in paths" :key="path.path_id" :class="{ selected: isFinalSelectedPath(path), active: isActivePath(path) }" @click="focusPath(path)">
                    <td><div class="name"><b>{{ path.title || path.path_id }}</b><small>{{ path.path_id }}</small></div></td>
                    <td>{{ scoreText(path.coverage_score) }}</td>
                    <td>{{ scoreText(path.coherence_score) }}</td>
                    <td>{{ scoreText(path.faithfulness_score) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; background: radial-gradient(circle at top left, rgba(34,197,94,.12), transparent 34%), radial-gradient(circle at top right, rgba(59,130,246,.16), transparent 32%), rgba(2,6,23,.72); backdrop-filter: blur(8px); }
.modal-card { width: min(1800px, 98vw); height: min(94vh, 1080px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(148,163,184,.26); border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.98)); box-shadow: 0 36px 90px rgba(15,23,42,.32); }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 1.2rem .85rem; border-bottom: 1px solid rgba(148,163,184,.2); }
.modal-header h3 { margin: .18rem 0 0; font-size: 1.08rem; }
.modal-header p { margin: .24rem 0 0; color: #64748b; font-size: .8rem; line-height: 1.45; }
.kicker { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .18rem .56rem; background: rgba(226,232,240,.95); color: #475569; font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.kicker.small { margin-bottom: .5rem; }
.kicker.tiny { margin-bottom: .3rem; }
.close-btn, .back-btn { border: none; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.close-btn { width: 40px; height: 40px; border-radius: 12px; background: rgba(241,245,249,.92); color: #334155; font-size: 1rem; }
.top-back { align-self: center; white-space: nowrap; }
.close-btn:hover, .back-btn:hover, .path-tab:hover, .graph-node:hover, .score-table tbody tr:hover { transform: translateY(-1px); }
.modal-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2.25fr) minmax(320px, .75fr); gap: .75rem; padding: .8rem; }
.graph-panel, .detail-panel { min-height: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .8rem; }
.toolbar-left { min-width: 0; display: flex; flex-direction: column; gap: .55rem; }
.path-tabs { display: flex; gap: .6rem; flex-wrap: wrap; }
.path-tab { min-width: 118px; border-radius: 12px; padding: .42rem .5rem; border: 1px solid rgba(148,163,184,.22); background: rgba(255,255,255,.96); cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: .2rem; box-shadow: 0 6px 18px rgba(15,23,42,.05); }
.path-tab.selected { border-color: rgba(245,158,11,.42); background: linear-gradient(180deg, rgba(255,247,237,.98), rgba(255,251,235,.98)); box-shadow: 0 0 0 1px rgba(245,158,11,.18), 0 12px 28px rgba(245,158,11,.12); }
.path-tab.active { box-shadow: 0 0 0 1px rgba(59,130,246,.18), 0 14px 30px rgba(59,130,246,.12); }
.path-tab.hovered { box-shadow: 0 0 0 1px rgba(59,130,246,.18), 0 0 0 4px rgba(59,130,246,.08); }
.path-tab strong { font-size: .74rem; line-height: 1.25; color: #0f172a; }
.path-tab span { display: flex; justify-content: space-between; gap: .35rem; color: #64748b; font-size: .66rem; }
.legend { display: flex; align-items: center; gap: .85rem; flex-wrap: wrap; color: #475569; font-size: .72rem; }
.legend span { display: inline-flex; align-items: center; gap: .4rem; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.selected { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.14); }
.dot.candidate { background: #8b5cf6; box-shadow: 0 0 0 4px rgba(139,92,246,.12); }
.dot.neutral { background: #94a3b8; }
.surface { position: relative; flex: 1; min-height: 0; overflow: hidden; border-radius: 18px; border: 1px solid rgba(148,163,184,.18); background: linear-gradient(90deg, rgba(241,245,249,.55) 1px, transparent 1px), linear-gradient(180deg, rgba(241,245,249,.55) 1px, transparent 1px), linear-gradient(180deg, rgba(248,250,252,.98), rgba(255,255,255,.98)); background-size: 56px 56px, 56px 56px, auto; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; gap: .4rem; text-align: center; color: #64748b; }
.empty strong { color: #0f172a; }
.edge-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: auto; }
.root-edge { stroke: rgba(148,163,184,.7); stroke-width: 2.2; stroke-dasharray: 5 5; }
.edge-hit { cursor: pointer; pointer-events: auto; }
.edge-hit-area { stroke: transparent; stroke-width: 14; pointer-events: stroke; }
.edge-base { stroke-width: 2.2; opacity: .82; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.edge-base.hierarchy { stroke: rgba(148,163,184,.85); }
.edge-base.sequence { stroke: rgba(100,116,139,.82); }
.edge-base.conflict { stroke: rgba(239,68,68,.88); stroke-dasharray: 10 7; }
.edge-base.active, .edge-base.hovered, .edge-hit:hover .edge-base { stroke-width: 3.2; opacity: 1; }
.edge-base.path.final { stroke: rgba(245,158,11,.28); }
.edge-base.path.candidate { stroke: rgba(139,92,246,.26); }
.path-overlay { pointer-events: none; }
.path-glow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-glow.final { stroke: rgba(250,204,21,.2); stroke-width: 13; filter: blur(9px); }
.path-glow.candidate { stroke: rgba(168,85,247,.16); stroke-width: 8; }
.path-main { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-main.final { stroke: #facc15; stroke-width: 3.8; stroke-dasharray: 14 10; animation: flow 2.4s linear infinite; filter: drop-shadow(0 0 14px rgba(250,204,21,.32)); }
.path-main.candidate { stroke: #a855f7; stroke-width: 2.6; stroke-dasharray: 10 8; animation: flow-candidate 3s linear infinite; filter: drop-shadow(0 0 10px rgba(168,85,247,.25)); }
@keyframes flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -128; } }
@keyframes flow-candidate { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -116; } }
.root-node { position: absolute; left: 50%; top: 28px; transform: translateX(-50%); z-index: 5; }
.region { position: absolute; border-radius: 20px; border: 1px solid rgba(148,163,184,.2); background: linear-gradient(180deg, rgba(248,250,252,.78), rgba(255,255,255,.7)); overflow: hidden; transition: border-color .18s ease, box-shadow .18s ease, opacity .18s ease; z-index: 1; pointer-events: none; }
.region::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.35), transparent 34%); pointer-events: none; }
.region.final { border-color: rgba(245,158,11,.36); box-shadow: 0 0 0 1px rgba(245,158,11,.14), 0 18px 40px rgba(245,158,11,.08); }
.region.candidate { border-color: rgba(139,92,246,.32); box-shadow: 0 0 0 1px rgba(139,92,246,.12), 0 18px 40px rgba(139,92,246,.08); }
.region.muted { opacity: .58; filter: saturate(.84); }
.region-head { position: absolute; left: 10px; top: 8px; right: 10px; display: flex; flex-direction: column; gap: .2rem; z-index: 2; pointer-events: none; }
.region-head strong { color: #0f172a; font-size: .73rem; line-height: 1.2; }
.node-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
.graph-node { border: 1px solid rgba(148,163,184,.24); background: rgba(255,255,255,.96); color: #0f172a; box-shadow: 0 10px 28px rgba(15,23,42,.08); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease; }
.graph-node:hover { box-shadow: 0 16px 32px rgba(15,23,42,.12); }
.root-card { width: 240px; min-height: 70px; border-radius: 20px; padding: .85rem 1rem; display: flex; flex-direction: column; gap: .35rem; align-items: flex-start; }
.node-kicker { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .12rem .42rem; background: rgba(241,245,249,.95); color: #475569; font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.root-card .node-kicker { background: rgba(219,234,254,.95); color: #1d4ed8; }
.root-card strong, .pillar-card strong, .indicator-card strong { font-size: .8rem; line-height: 1.35; text-align: left; }
.pillar-card { position: absolute; left: 50%; top: 54px; transform: translateX(-50%); width: 210px; min-height: 56px; border-radius: 18px; padding: .7rem .85rem; display: flex; flex-direction: column; gap: .28rem; align-items: flex-start; z-index: 2; }
.pillar-card .node-kicker { background: rgba(226,232,240,.92); color: #334155; }
.indicator-card { position: absolute; border-radius: 999px; padding: .2rem; display: flex; flex-direction: column; gap: .08rem; align-items: center; justify-content: center; z-index: 6; transform: translate(-50%, -50%); pointer-events: auto; }
.indicator-card .node-kicker { font-size: .52rem; padding: 0; background: transparent; color: #1e293b; letter-spacing: 0; text-transform: none; line-height: 1; }
.indicator-card .score { font-size: .52rem; font-weight: 700; color: #334155; line-height: 1; align-self: center; }
.graph-node.active { border-color: rgba(59,130,246,.46); box-shadow: 0 0 0 1px rgba(59,130,246,.18), 0 18px 38px rgba(59,130,246,.16); }
.graph-node.hovered { border-color: rgba(14,165,233,.45); box-shadow: 0 0 0 2px rgba(56,189,248,.2), 0 10px 22px rgba(14,116,144,.15); transform: translate(-50%, -50%) scale(1.05); }
.graph-node.path.final { border-color: rgba(245,158,11,.56); box-shadow: 0 0 0 1px rgba(245,158,11,.22), 0 10px 20px rgba(245,158,11,.12); }
.graph-node.path.candidate { border-color: rgba(168,85,247,.48); box-shadow: 0 0 0 1px rgba(168,85,247,.2), 0 10px 20px rgba(168,85,247,.12); }
.detail-panel { border-left: 1px solid rgba(148,163,184,.18); padding-left: .1rem; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .05rem 0 .25rem .25rem; }
.detail-head h4 { margin: .16rem 0 0; font-size: .98rem; }
.detail-head p { margin: .18rem 0 0; color: #64748b; font-size: .76rem; }
.back-btn { padding: .52rem .78rem; border-radius: 12px; background: rgba(219,234,254,.82); color: #1d4ed8; font-size: .78rem; white-space: nowrap; }
.detail-scroll { min-height: 0; overflow: auto; padding-right: .2rem; display: flex; flex-direction: column; gap: .85rem; scrollbar-gutter: stable both-edges; }
.summary, .score-table-card, .row { border: 1px solid rgba(148,163,184,.18); border-radius: 16px; background: rgba(255,255,255,.95); box-shadow: 0 10px 26px rgba(15,23,42,.05); }
.summary { padding: .92rem; }
.summary.selected { border-color: rgba(245,158,11,.28); background: linear-gradient(180deg, rgba(255,247,237,.84), rgba(255,255,255,.95)); }
.summary-top { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; }
.summary-top h5 { margin: .28rem 0 0; font-size: .92rem; line-height: 1.45; }
.pill { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .18rem .45rem; font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #92400e; background: rgba(253,230,138,.82); }
.avg-box { min-width: 74px; border-radius: 16px; padding: .62rem .75rem; background: rgba(15,23,42,.04); display: flex; flex-direction: column; align-items: flex-end; gap: .14rem; }
.avg-box span { color: #64748b; font-size: .72rem; }
.avg-box strong { color: #0f172a; font-size: 1.08rem; }
.summary p { margin: .72rem 0 0; color: #0f172a; font-size: .84rem; line-height: 1.65; }
.score-grid { margin-top: .78rem; display: flex; gap: .6rem; }
.score-grid div { flex: 1; padding: .68rem .72rem; background: rgba(248,250,252,.96); border-radius: 14px; border: 1px solid rgba(148,163,184,.12); display: flex; flex-direction: column; gap: .1rem; }
.score-grid span { font-size: .72rem; color: #64748b; }
.score-grid strong { color: #0f172a; font-size: .92rem; }
.rows { display: flex; flex-direction: column; gap: .7rem; }
.row { padding: .76rem .78rem; display: flex; flex-direction: column; gap: .42rem; }
.row-key { color: #475569; font-size: .72rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.value { color: #0f172a; font-size: .82rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.value.empty { color: #94a3b8; }
.value.text, .value.json { background: rgba(248,250,252,.96); border-radius: 12px; padding: .68rem .76rem; border: 1px solid rgba(226,232,240,.9); }
.value.json { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: .72rem; line-height: 1.55; overflow: auto; }
.value.list { margin: 0; padding-left: 1rem; }
.value.list li + li { margin-top: .18rem; }
.score-table-card { padding: .86rem .92rem .95rem; }
.score-table-title { font-size: .84rem; font-weight: 700; margin-bottom: .66rem; color: #0f172a; }
.score-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.score-table th, .score-table td { padding: .72rem .42rem; border-bottom: 1px solid rgba(226,232,240,.96); text-align: left; }
.score-table th { color: #64748b; font-size: .7rem; letter-spacing: .03em; text-transform: uppercase; }
.score-table tbody tr { cursor: pointer; transition: background .18s ease, transform .18s ease; }
.score-table tbody tr.selected { background: rgba(255,247,237,.9); }
.score-table tbody tr.active { background: rgba(239,246,255,.92); }
.name { display: flex; flex-direction: column; gap: .12rem; }
.name small { color: #64748b; }
@media (max-width: 1400px) { .modal-body { grid-template-columns: 1fr; } .detail-panel { border-left: none; border-top: 1px solid rgba(148,163,184,.18); padding-top: 1rem; } .surface { min-height: 720px; } }
</style>
-->
-->
