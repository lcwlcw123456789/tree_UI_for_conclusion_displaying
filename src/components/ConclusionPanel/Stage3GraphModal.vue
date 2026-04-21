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

type WorkflowPhase = 'operator_select' | 'path_select' | 'final'

const props = defineProps<{ 
  visible: boolean
  stage3?: Stage3GlobalSynthesis
  originalQuestion?: string
  finalAnswer?: string
  workflowPhase?: WorkflowPhase
  submittingPath?: boolean
}>()
const emit = defineEmits<{ 
  close: []
  submitPath: [pathId: string]
}>()

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
const fallbackPathKey = (idx: number) => `__path_${idx}`
const pathEntries = computed(() => paths.value.map((path, index) => ({ path, index, key: path.path_id || fallbackPathKey(index) })))
const selectedPathKey = computed(() => {
  if (selectedPathId.value) return selectedPathId.value
  const idx = paths.value.findIndex((p) => !p.path_id)
  return idx >= 0 ? fallbackPathKey(idx) : ''
})

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

const activePath = computed(() => {
  const byKey = pathEntries.value.find((entry) => entry.key === activePathId.value)
  return byKey?.path || pathEntries.value[0]?.path || null
})
const currentPath = computed(() => activePath.value)
const activeNode = computed(() => (activeNodeId.value ? nodeById.value[activeNodeId.value] || null : null))
const edgeById = computed<Record<string, Stage3TreeEdge>>(() => {
  const map: Record<string, Stage3TreeEdge> = {}
  for (const edge of visibleEdges.value) map[edge.edge_id] = edge
  return map
})
const activeEdge = computed(() => (activeEdgeId.value ? edgeById.value[activeEdgeId.value] || null : null))
const activePathSelected = computed(() => activePathId.value === selectedPathKey.value)

const pathNodeSet = computed(() => new Set(activePath.value?.node_path || []))
const pathEdgeSet = computed(() => {
  const set = new Set<string>()
  const list = activePath.value?.node_path || []
  for (let i = 0; i < list.length - 1; i++) {
    const a = String(list[i] || '')
    const b = String(list[i + 1] || '')
    if (!a || !b) continue
    set.add(`${a}->${b}`)
    set.add(`${b}->${a}`)
  }
  return set
})
const pathPillarSet = computed(() => {
  const set = new Set<string>()
  for (const id of activePath.value?.node_path || []) {
    const node = nodeById.value[id]
    const key = node?.pillar || node?.label || ''
    if (key) set.add(key)
  }
  return set
})

const pathSegments = computed(() => {
  const list = activePath.value?.node_path || []
  const segments: Array<{ from: string; to: string; d: string }> = []
  const maxSegments = 220
  const count = Math.min(Math.max(list.length - 1, 0), maxSegments)
  for (let i = 0; i < count; i++) {
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

function pathKey(path: Stage3Path, index: number) {
  return path.path_id || fallbackPathKey(index)
}
function isFinalSelectedPath(path: Stage3Path, index: number) { return pathKey(path, index) === selectedPathKey.value }
function isActivePath(path: Stage3Path, index: number) { return pathKey(path, index) === activePathId.value }
function isHoveredPath(path: Stage3Path, index: number) { return hoveredPathId.value === pathKey(path, index) }
function isPathNode(nodeId: string) { return pathNodeSet.value.has(nodeId) }
function isPathEdge(edge: Stage3TreeEdge) {
  return pathEdgeSet.value.has(`${edge.from}->${edge.to}`)
}

function focusPath(path: Stage3Path, index: number) {
  activePathId.value = pathKey(path, index)
  activeNodeId.value = ''
  activeEdgeId.value = ''
  hoveredNodeId.value = null
  hoveredEdgeId.value = null
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
  const active = pathPillarSet.value.has(region.key)
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

function safeStringify(value: unknown, maxLen = 2400) {
  try {
    const text = JSON.stringify(value, null, 2)
    if (!text) return ''
    if (text.length <= maxLen) return text
    return `${text.slice(0, maxLen)}\n... (已截断，原始内容过长)`
  } catch {
    return String(value)
  }
}

function truncateText(text: string, maxLen = 1400) {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n... (已截断，原始文本过长)`
}

function formatValue(v: unknown): DetailValue {
  if (v == null) return { kind: 'empty' }
  if (Array.isArray(v)) {
    const capped = v.slice(0, 12).map((x) => (typeof x === 'object' ? safeStringify(x, 220) : truncateText(String(x), 220)))
    if (v.length > 12) capped.push(`... 共 ${v.length} 项，仅显示前 12 项`)
    return { kind: 'list', items: capped }
  }
  if (typeof v === 'object') {
    return { kind: 'json', text: safeStringify(v, 1200) }
  }
  const s = truncateText(String(v).trim())
  return s ? { kind: 'text', text: s } : { kind: 'empty' }
}

function formatStructured(v: unknown): DetailValue {
  if (v == null) return { kind: 'empty' }
  if (Array.isArray(v) || typeof v === 'object') {
    const compact = safeStringify(v, 1200)
    if (!compact) return { kind: 'empty' }
    return { kind: 'json', text: compact }
  }
  return { kind: 'text', text: truncateText(String(v), 1000) }
}

function buildPathRows(path: Stage3Path): Row[] {
  return [
    { key: 'path_id', value: formatValue(path.path_id) },
    { key: 'title', value: formatValue(path.title) },
    { key: 'core_thesis', value: formatValue(path.core_thesis) },
    { key: 'node_path', value: formatValue(path.node_path) },
    { key: 'cross_pillar_links', value: formatValue(path.cross_pillar_links) },
    { key: 'tensions_or_gaps', value: formatValue(path.tensions_or_gaps) },
    { key: 'resolution_logic', value: formatValue(path.resolution_logic) },
    { key: 'coverage_score', value: formatValue(path.coverage_score) },
    { key: 'coherence_score', value: formatValue(path.coherence_score) },
    { key: 'faithfulness_score', value: formatValue(path.faithfulness_score) },
    { key: 'why_it_wins', value: formatValue(path.why_it_wins) },
  ]
}

function buildNodeRows(node: Stage3TreeNode): Row[] {
  const n = node as any
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

function buildEdgeRows(edge: Stage3TreeEdge): Row[] {
  return [
    { key: 'edge_id', value: formatValue(edge.edge_id) },
    { key: 'from', value: formatValue(edge.from) },
    { key: 'to', value: formatValue(edge.to) },
    { key: 'relation_type', value: formatValue(edge.relation_type) },
    { key: 'weight', value: formatValue(edge.weight) },
    { key: 'evidence', value: formatStructured(edge.evidence) },
  ]
}

const detailRows = computed<Row[]>(() => {
  if (mode.value === 'path') {
    const p = activePath.value
    return p ? buildPathRows(p) : []
  }
  if (mode.value === 'node') {
    const n = activeNode.value
    return n ? buildNodeRows(n) : []
  }
  const e = activeEdge.value
  return e ? buildEdgeRows(e) : []
})
const detailTitle = computed(() => (mode.value === 'node' ? '节点详情' : mode.value === 'edge' ? '边详情' : '路径详情'))
const detailSubtitle = computed(() => (mode.value === 'node' ? activeNode.value?.node_id : mode.value === 'edge' ? activeEdge.value?.edge_id : activePath.value?.path_id) || '—')

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
  const next = target?.node_id || null
  if (hoveredNodeId.value !== next) hoveredNodeId.value = next
}

function onSharedNodeLeave() {
  if (hoveredNodeId.value !== null) hoveredNodeId.value = null
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
    activePathId.value = selectedPathKey.value || pathEntries.value[0]?.key || ''
    mode.value = 'path'
  },
  { immediate: true },
)

watch(
  () => [graph.value, paths.value.length, selectedPathId.value],
  () => {
    if (!props.visible) return
    if (!activePathId.value || !pathEntries.value.some((entry) => entry.key === activePathId.value)) {
      activePathId.value = selectedPathKey.value || pathEntries.value[0]?.key || ''
    }
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
      <div class="header-actions">
        <button
          v-if="props.workflowPhase === 'path_select'"
          class="submit-btn submit-btn-header"
          type="button"
          :disabled="!activePath?.path_id || props.submittingPath"
          @click="() => { if (activePath?.path_id) emit('submitPath', activePath.path_id) }"
        >
          {{ props.submittingPath ? '提交中...' : '确认当前路径' }}
        </button>
        <button class="close-btn" type="button" @click="closeView">✕</button>
      </div>
    </header>

    <div class="page-body">
      <section class="graph-panel">
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="kicker small">所有路径</span>
            <div class="path-tabs">
              <button
                v-for="entry in pathEntries"
                :key="entry.key"
                class="path-tab"
                :class="{ selected: isFinalSelectedPath(entry.path, entry.index), active: isActivePath(entry.path, entry.index), hovered: isHoveredPath(entry.path, entry.index) }"
                type="button"
                @click="focusPath(entry.path, entry.index)"
                @mouseenter="hoveredPathId = entry.key"
                @mouseleave="hoveredPathId = null"
              >
                <strong>{{ entry.path.path_id || `path_${entry.index + 1}` }}</strong>
                <span>
                  <b>{{ isFinalSelectedPath(entry.path, entry.index) ? 'selected' : 'candidate' }}</b>
                  <i>avg {{ avgScore(entry.path) }}</i>
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
                <tr v-for="entry in pathEntries" :key="entry.key" :class="{ selected: isFinalSelectedPath(entry.path, entry.index), active: isActivePath(entry.path, entry.index) }" @click="focusPath(entry.path, entry.index)">
                  <td><div class="name"><b>{{ entry.path.title || entry.path.path_id }}</b><small>{{ entry.path.path_id || entry.key }}</small></div></td>
                  <td>{{ scoreText(entry.path.coverage_score) }}</td>
                  <td>{{ scoreText(entry.path.coherence_score) }}</td>
                  <td>{{ scoreText(entry.path.faithfulness_score) }}</td>
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
.page-shell { position: relative; width: 100%; height: 100%; min-height: 640px; display: flex; flex-direction: column; background: #f7f9fc; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .7rem 1rem; border-bottom: 1px solid #b3bfce; background: #e2e8f0; }
.header-left { display: flex; align-items: flex-start; gap: .8rem; }
.header-actions { display: flex; align-items: center; gap: .6rem; }
.page-header h3 { margin: .18rem 0 0; font-size: 1.08rem; }
.page-header p { margin: .24rem 0 0; color: #334155; font-size: .8rem; line-height: 1.45; }
.kicker { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .18rem .56rem; background: #cbd5e1; color: #0f172a; font-size: .7rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.kicker.small { margin-bottom: .5rem; }
.kicker.tiny { margin-bottom: .3rem; }
.close-btn, .back-btn { border: none; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.close-btn { width: 40px; height: 40px; border-radius: 12px; background: #cbd5e1; color: #0f172a; font-size: 1rem; }
.back-btn { padding: .52rem .78rem; border-radius: 12px; background: #dbe2ea; color: #0f172a; font-size: .78rem; white-space: nowrap; }
.top-back { align-self: center; }
.close-btn:hover, .back-btn:hover, .path-tab:hover, .graph-node:hover, .score-table tbody tr:hover { transform: translateY(-1px); }
.page-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0; }
.graph-panel, .detail-panel { min-height: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .55rem; padding: .55rem 1rem; border-bottom: 1px solid #b3bfce; background: #e2e8f0; }
.toolbar-left { min-width: 0; display: flex; flex-direction: column; gap: .55rem; }
.path-tabs { display: flex; gap: .6rem; flex-wrap: wrap; }
.path-tab { min-width: 118px; border-radius: 12px; padding: .42rem .5rem; border: 1px solid #b3bfce; background: #f7f9fc; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: .2rem; box-shadow: 0 6px 18px rgba(15,23,42,.08); }
.path-tab.selected { border-color: #005fcc; background: #dbeafe; box-shadow: 0 0 0 1px rgba(0,95,204,.24), 0 12px 28px rgba(0,95,204,.16); }
.path-tab.active { box-shadow: 0 0 0 1px rgba(15,23,42,.22), 0 14px 30px rgba(15,23,42,.16); }
.path-tab.hovered { box-shadow: 0 0 0 1px rgba(138,63,252,.32), 0 0 0 4px rgba(138,63,252,.12); }
.path-tab strong { font-size: .74rem; line-height: 1.25; color: #0f172a; }
.path-tab span { display: flex; justify-content: space-between; gap: .35rem; color: #64748b; font-size: .66rem; }
.legend { display: flex; align-items: center; gap: .85rem; flex-wrap: wrap; color: #475569; font-size: .72rem; }
.legend span { display: inline-flex; align-items: center; gap: .4rem; }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot.selected { background: #005fcc; box-shadow: 0 0 0 4px rgba(0,95,204,.2); }
.dot.candidate { background: #8a3ffc; box-shadow: 0 0 0 4px rgba(138,63,252,.2); }
.dot.neutral { background: #5b6b7f; }
.surface { position: relative; flex: 1; min-height: 0; overflow: hidden; border-radius: 0; border: none; border-right: 1px solid #b3bfce; background: #f7f9fc; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; gap: .4rem; text-align: center; color: #64748b; }
.empty strong { color: #0f172a; }
.edge-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: auto; }
.edge-hit { cursor: pointer; pointer-events: auto; }
.edge-hit-area { stroke: transparent; stroke-width: 14; pointer-events: stroke; }
.edge-base { stroke-width: 2.2; opacity: .82; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.edge-base.hierarchy { stroke: rgba(148,163,184,.85); }
.edge-base.sequence { stroke: rgba(100,116,139,.82); }
.edge-base.conflict { stroke: rgba(239,68,68,.88); stroke-dasharray: 10 7; }
.edge-base.active, .edge-base.hovered, .edge-hit:hover .edge-base { stroke-width: 3.2; opacity: 1; filter: drop-shadow(0 0 5px rgba(15,23,42,.35)); animation: edge-hover-pulse 1s ease-in-out infinite; }
.edge-base.path.final { stroke: rgba(245,158,11,.28); }
.edge-base.path.candidate { stroke: rgba(139,92,246,.26); }
.path-overlay { pointer-events: none; }
.path-glow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-glow.final { stroke: rgba(250,204,21,.14); stroke-width: 9; }
.path-glow.candidate { stroke: rgba(168,85,247,.12); stroke-width: 6; }
.path-main { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.path-main.final { stroke: #005fcc; stroke-width: 3.2; stroke-dasharray: 14 10; }
.path-main.candidate { stroke: #8a3ffc; stroke-width: 2.3; stroke-dasharray: 10 8; }
@keyframes edge-hover-pulse { 0% { stroke-width: 2.2; } 50% { stroke-width: 3.6; } 100% { stroke-width: 2.2; } }
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
.detail-panel { border-left: none; padding: .75rem 1rem; background: #f7f9fc; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .05rem 0 .25rem .25rem; }
.detail-head h4 { margin: .16rem 0 0; font-size: .98rem; }
.detail-head p { margin: .18rem 0 0; color: #64748b; font-size: .76rem; }
.detail-scroll { min-height: 0; overflow: auto; padding-right: .2rem; display: flex; flex-direction: column; gap: .85rem; scrollbar-gutter: stable both-edges; }
.summary, .score-table-card, .row { border: 1px solid #b3bfce; border-radius: 16px; background: #ffffff; box-shadow: 0 10px 26px rgba(15,23,42,.08); }
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
.submit-btn {
  border: 1px solid #005fcc;
  background: linear-gradient(180deg, #1f7ae0 0%, #005fcc 100%);
  color: #fff;
  padding: 0.58rem 1.12rem;
  border-radius: 12px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
  transition: all 0.18s ease;
}
.submit-btn-header {
  min-width: 182px;
  box-shadow: 0 8px 20px rgba(0, 95, 204, 0.35);
}
.submit-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #3b82f6 0%, #005fcc 100%);
  border-color: #003f88;
  box-shadow: 0 10px 24px rgba(0, 95, 204, 0.42);
}
.submit-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
  box-shadow: none;
}
@media (max-width: 1400px) { .page-body { grid-template-columns: 1fr; } .detail-panel { border-left: none; border-top: 1px solid #d0d1e6; padding-top: 1rem; } .surface { min-height: 720px; } }
</style>

