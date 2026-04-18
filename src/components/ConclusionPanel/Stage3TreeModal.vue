<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Stage3GlobalSynthesis, Stage3TreeEdge, Stage3TreeNode } from '../../types/conclusion'

type GraphNode = Stage3TreeNode & {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pillarKey: string
}

type PillarRegion = {
  pillar: string
  x: number
  y: number
  w: number
  h: number
  color: string
}

const props = defineProps<{
  visible: boolean
  stage3?: Stage3GlobalSynthesis
}>()

const emit = defineEmits<{
  close: []
}>()

const width = 1320
const height = 860

const nodes = ref<GraphNode[]>([])
const edges = ref<Stage3TreeEdge[]>([])
const pillarRegions = ref<PillarRegion[]>([])

const hoveredNodeId = ref<string | null>(null)
const hoveredEdgeId = ref<string | null>(null)
const pinnedNodeId = ref<string | null>(null)
const pinnedEdgeId = ref<string | null>(null)
const expandedNodeId = ref<string | null>(null)

let rafId: number | null = null
let dragNodeId: string | null = null

const tree = computed(() => props.stage3?.tree_graph)
const selectedPath = computed(() => {
  const s = props.stage3
  if (!s) return undefined
  if (s.selected_path?.node_path?.length) return s.selected_path
  if (s.selected_path_id && s.candidate_paths?.length) {
    return s.candidate_paths.find((p) => p.path_id === s.selected_path_id) || s.candidate_paths[0]
  }
  return s.candidate_paths?.[0]
})

const nodeMap = computed(() => {
  const m = new Map<string, GraphNode>()
  for (const n of nodes.value) m.set(n.node_id, n)
  return m
})

const pillarRegionMap = computed(() => {
  const m = new Map<string, PillarRegion>()
  for (const r of pillarRegions.value) m.set(r.pillar, r)
  return m
})

const selectedPathNodes = computed(() => new Set(selectedPath.value?.node_path || []))

const selectedPathLines = computed(() => {
  const list = selectedPath.value?.node_path || []
  const lines: Array<{ from: string; to: string; idx: number }> = []
  for (let i = 0; i < list.length - 1; i++) {
    const from = list[i]
    const to = list[i + 1]
    if (!from || !to) continue
    lines.push({ from, to, idx: i })
  }
  return lines
})

const hoveredNode = computed(() => {
  if (!hoveredNodeId.value) return null
  return nodeMap.value.get(hoveredNodeId.value) || null
})

const hoveredEdge = computed(() => {
  if (!hoveredEdgeId.value) return null
  return edges.value.find((e) => e.edge_id === hoveredEdgeId.value) || null
})

const panelNode = computed(() => {
  if (pinnedNodeId.value) return nodeMap.value.get(pinnedNodeId.value) || null
  return hoveredNode.value
})

const panelEdge = computed(() => {
  if (panelNode.value) return null
  if (pinnedEdgeId.value) return edges.value.find((e) => e.edge_id === pinnedEdgeId.value) || null
  return hoveredEdge.value
})

function buildGraph() {
  if (!tree.value) {
    nodes.value = []
    edges.value = []
    pillarRegions.value = []
    return
  }

  const t = tree.value
  const nodeById = new Map<string, Stage3TreeNode>()
  for (const n of t.nodes) nodeById.set(n.node_id, n)

  const childrenMap = new Map<string, string[]>()
  const parentMap = new Map<string, string>()
  for (const e of t.edges) {
    if (e.relation_type !== 'hierarchy') continue
    if (!childrenMap.has(e.from)) childrenMap.set(e.from, [])
    childrenMap.get(e.from)!.push(e.to)
    parentMap.set(e.to, e.from)
  }

  function resolvePillarLabel(node: Stage3TreeNode): string {
    if (node.pillar) return node.pillar
    let cur = node.node_id
    for (let i = 0; i < 12; i++) {
      const pid = parentMap.get(cur)
      if (!pid) break
      const pNode = nodeById.get(pid)
      if (!pNode) break
      if (pNode.node_type === 'pillar') return pNode.label || pNode.pillar || pNode.node_id
      cur = pid
    }
    return 'UNKNOWN_PILLAR'
  }

  let leafNodes = t.nodes.filter((n) => {
    if (n.node_type === 'root' || n.node_type === 'pillar') return false
    const children = childrenMap.get(n.node_id) || []
    return children.length === 0
  })

  if (!leafNodes.length) {
    leafNodes = t.nodes.filter((n) => n.node_type !== 'root' && n.node_type !== 'pillar')
  }

  const pillarKeys = Array.from(new Set(leafNodes.map((n) => resolvePillarLabel(n))))
  const safeCount = Math.max(1, pillarKeys.length)
  const palette = ['#e0f2fe', '#ecfccb', '#ede9fe', '#fef3c7', '#fae8ff', '#cffafe', '#fee2e2']

  const padX = 30
  const padY = 72
  const gap = 20
  const regionW = (width - padX * 2 - (safeCount - 1) * gap) / safeCount
  const regionH = height - padY * 2

  const regions: PillarRegion[] = pillarKeys.map((p, i) => ({
    pillar: p,
    x: padX + i * (regionW + gap),
    y: padY,
    w: regionW,
    h: regionH,
    color: palette[i % palette.length] || '#e2e8f0',
  }))
  pillarRegions.value = regions

  const regionMap = new Map<string, PillarRegion>()
  for (const r of regions) regionMap.set(r.pillar, r)

  const nextNodes: GraphNode[] = leafNodes.map((n) => {
    const pillarKey = resolvePillarLabel(n)
    const rg = regionMap.get(pillarKey)
    const x = rg
      ? rg.x + rg.w * (0.2 + Math.random() * 0.6)
      : width / 2 + (Math.random() - 0.5) * 180
    const y = rg
      ? rg.y + rg.h * (0.2 + Math.random() * 0.6)
      : height / 2 + (Math.random() - 0.5) * 180

    return {
      ...n,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 22,
      pillarKey,
    }
  })

  const visibleNodeIds = new Set(nextNodes.map((n) => n.node_id))
  nodes.value = nextNodes
  edges.value = t.edges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))

  if (pinnedNodeId.value && !visibleNodeIds.has(pinnedNodeId.value)) pinnedNodeId.value = null
  if (hoveredNodeId.value && !visibleNodeIds.has(hoveredNodeId.value)) hoveredNodeId.value = null
}

function edgeColor(e: Stage3TreeEdge) {
  if (e.relation_type === 'hierarchy') return '#94a3b8'
  if (e.relation_type === 'conflict') return '#ef4444'
  if (e.relation_type === 'intra_pillar_sequence') return '#a855f7'
  return '#64748b'
}

function nodeFill(n: GraphNode) {
  if (pinnedNodeId.value === n.node_id) return '#dbeafe'
  return '#ffffff'
}

function nodeRadius(n: GraphNode) {
  return expandedNodeId.value === n.node_id ? n.r + 26 : n.r
}

function isPathNode(id: string) {
  return selectedPathNodes.value.has(id)
}

function pathLinePos(fromId: string, toId: string) {
  const a = nodeMap.value.get(fromId)
  const b = nodeMap.value.get(toId)
  if (!a || !b) return null
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

function stopSim() {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function tick() {
  const ns = nodes.value
  if (!ns.length) {
    rafId = requestAnimationFrame(tick)
    return
  }

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
      const f = 2300 / d2
      dx /= d
      dy /= d
      a.vx -= dx * f
      a.vy -= dy * f
      b.vx += dx * f
      b.vy += dy * f
    }
  }

  for (const e of edges.value) {
    const a = ns.find((n) => n.node_id === e.from)
    const b = ns.find((n) => n.node_id === e.to)
    if (!a || !b) continue
    let dx = b.x - a.x
    let dy = b.y - a.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d < 1) d = 1
    const desired = e.relation_type === 'hierarchy' ? 190 : 150
    const k = 0.005
    const force = (d - desired) * k
    dx /= d
    dy /= d
    a.vx += force * dx
    a.vy += force * dy
    b.vx -= force * dx
    b.vy -= force * dy
  }

  const cx = width / 2
  const cy = height / 2
  for (const n of ns) {
    if (dragNodeId === n.node_id) continue

    const rg = pillarRegionMap.value.get(n.pillarKey)
    if (rg) {
      const tx = rg.x + rg.w / 2
      const ty = rg.y + rg.h / 2
      n.vx += (tx - n.x) * 0.0012
      n.vy += (ty - n.y) * 0.0012
    } else {
      n.vx += (cx - n.x) * 0.0005
      n.vy += (cy - n.y) * 0.0005
    }

    n.vx *= 0.92
    n.vy *= 0.92
    n.x += n.vx
    n.y += n.vy

    if (rg) {
      n.x = Math.max(rg.x + 28, Math.min(rg.x + rg.w - 28, n.x))
      n.y = Math.max(rg.y + 28, Math.min(rg.y + rg.h - 28, n.y))
    } else {
      n.x = Math.max(36, Math.min(width - 36, n.x))
      n.y = Math.max(36, Math.min(height - 36, n.y))
    }
  }

  rafId = requestAnimationFrame(tick)
}

function startSim() {
  stopSim()
  rafId = requestAnimationFrame(tick)
}

function onNodeMouseDown(id: string, ev: MouseEvent) {
  ev.stopPropagation()
  dragNodeId = id
  const onUp = () => {
    dragNodeId = null
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mouseup', onUp)
}

function svgPoint(ev: MouseEvent) {
  const svg = ev.currentTarget as SVGSVGElement | null
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
  const n = nodeMap.value.get(dragNodeId)
  if (!n) return
  n.x = p.x
  n.y = p.y
  n.vx = 0
  n.vy = 0
}

function onNodeClick(id: string) {
  expandedNodeId.value = expandedNodeId.value === id ? null : id
  pinnedNodeId.value = pinnedNodeId.value === id ? null : id
  pinnedEdgeId.value = null
}

function onEdgeClick(id: string) {
  pinnedEdgeId.value = pinnedEdgeId.value === id ? null : id
  pinnedNodeId.value = null
}

function clearPinnedInfo() {
  pinnedNodeId.value = null
  pinnedEdgeId.value = null
}

function closeModal() {
  stopSim()
  expandedNodeId.value = null
  clearPinnedInfo()
  emit('close')
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      buildGraph()
      startSim()
    } else {
      stopSim()
      dragNodeId = null
      hoveredNodeId.value = null
      hoveredEdgeId.value = null
      clearPinnedInfo()
    }
  },
  { immediate: true },
)

watch(
  () => props.stage3,
  () => {
    if (props.visible) buildGraph()
  },
)

onBeforeUnmount(() => stopSim())
</script>

<template>
  <div v-if="visible" class="modal-mask" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <h3>叶子节点图（Stage 3）</h3>
        <button class="close-btn" type="button" @click="closeModal">✕</button>
      </header>

      <div class="tip-bar">
        <span class="tip">仅展示叶子节点；Root / Pillar 不展示，Pillar 以背景分区呈现。</span>
      </div>

      <div class="modal-body">
        <section class="graph-pane">
          <svg class="graph-svg" :viewBox="`0 0 ${width} ${height}`" @mousemove="onSvgMouseMove">
            <defs>
              <marker id="path-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" />
              </marker>
            </defs>

            <g>
              <g v-for="r in pillarRegions" :key="r.pillar" class="pillar-region">
                <rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="r.color" />
                <text :x="r.x + 10" :y="r.y + 18" class="pillar-title">{{ r.pillar }}</text>
              </g>
            </g>

            <g>
              <line
                v-for="e in edges"
                :key="e.edge_id"
                :x1="nodeMap.get(e.from)?.x || 0"
                :y1="nodeMap.get(e.from)?.y || 0"
                :x2="nodeMap.get(e.to)?.x || 0"
                :y2="nodeMap.get(e.to)?.y || 0"
                class="edge"
                :stroke="edgeColor(e)"
                :stroke-width="hoveredEdgeId === e.edge_id ? 2.8 : 1.8"
                :stroke-dasharray="e.relation_type === 'intra_pillar_sequence' ? '4 4' : undefined"
                @mouseenter="hoveredEdgeId = e.edge_id"
                @mouseleave="hoveredEdgeId = null"
                @click.stop="onEdgeClick(e.edge_id)"
              />
            </g>

            <g>
              <line
                v-for="p in selectedPathLines"
                :key="`PATH_${p.idx}_${p.from}_${p.to}`"
                v-show="pathLinePos(p.from, p.to)"
                :x1="pathLinePos(p.from, p.to)?.x1 || 0"
                :y1="pathLinePos(p.from, p.to)?.y1 || 0"
                :x2="pathLinePos(p.from, p.to)?.x2 || 0"
                :y2="pathLinePos(p.from, p.to)?.y2 || 0"
                class="path-edge"
                marker-end="url(#path-arrow)"
              />
            </g>

            <g v-for="n in nodes" :key="n.node_id" class="node-group">
              <circle
                :cx="n.x"
                :cy="n.y"
                :r="nodeRadius(n)"
                class="node"
                :class="{
                  path: isPathNode(n.node_id),
                  expanded: expandedNodeId === n.node_id,
                  pinned: pinnedNodeId === n.node_id,
                }"
                :fill="nodeFill(n)"
                @mousedown="onNodeMouseDown(n.node_id, $event)"
                @click.stop="onNodeClick(n.node_id)"
                @mouseenter="hoveredNodeId = n.node_id"
                @mouseleave="hoveredNodeId = null"
              />
              <text :x="n.x" :y="n.y + 4" class="node-label">{{ n.node_id }}</text>
            </g>
          </svg>
        </section>

        <aside class="info-pane">
          <template v-if="panelNode">
            <h4>
              节点：{{ panelNode.node_id }}
              <span v-if="pinnedNodeId" class="pin-flag">（已固定）</span>
            </h4>
            <div class="kv"><span>type</span><b>{{ panelNode.node_type }}</b></div>
            <div class="kv"><span>label</span><b>{{ panelNode.indicator_name || panelNode.label || panelNode.pillar || '-' }}</b></div>
            <div class="kv"><span>pillar</span><b>{{ panelNode.pillar || panelNode.pillarKey || '-' }}</b></div>
            <div class="kv"><span>ref</span><b>{{ panelNode.indicator_ref || '-' }}</b></div>
            <div class="kv"><span>score</span><b>{{ panelNode.selection_score ?? '-' }}</b></div>
            <div class="kv"><span>path</span><b>{{ isPathNode(panelNode.node_id) ? 'YES' : 'NO' }}</b></div>
          </template>

          <template v-else-if="panelEdge">
            <h4>
              边：{{ panelEdge.edge_id }}
              <span v-if="pinnedEdgeId" class="pin-flag">（已固定）</span>
            </h4>
            <div class="kv"><span>type</span><b>{{ panelEdge.relation_type }}</b></div>
            <div class="kv"><span>from</span><b>{{ panelEdge.from }}</b></div>
            <div class="kv"><span>to</span><b>{{ panelEdge.to }}</b></div>
            <div class="kv"><span>weight</span><b>{{ panelEdge.weight ?? '-' }}</b></div>
          </template>

          <template v-else>
            <h4>提示</h4>
            <p class="empty">仅显示叶子节点，Pillar 以背景区域区分。</p>
            <p class="empty">点击节点后，右侧信息会固定；再次点击可取消固定。</p>
          </template>

          <button v-if="pinnedNodeId || pinnedEdgeId" class="clear-pin-btn" type="button" @click="clearPinnedInfo">
            取消固定
          </button>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask { position: fixed; inset: 0; background: rgba(2,6,23,.52); z-index: 1100; display: grid; place-items: center; }
.modal-card { width: min(1500px, 97vw); height: min(90vh, 980px); background: #fff; border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--color-border); }
.close-btn { border: none; background: transparent; cursor: pointer; font-size: 1rem; }
.tip-bar { padding: .45rem 1rem; border-bottom: 1px solid var(--color-border); }
.tip { font-size: .78rem; color: var(--color-text-muted); }
.modal-body { flex: 1; display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(0, 1fr); min-height: 0; }
.graph-pane { background: #f8fafc; border-right: 1px solid var(--color-border); }
.graph-svg { width: 100%; height: 100%; }
.pillar-region rect { stroke: #cbd5e1; stroke-dasharray: 5 4; opacity: .62; }
.pillar-title { font-size: 11px; font-weight: 700; fill: #334155; pointer-events: none; }
.edge { opacity: .86; }
.path-edge { stroke: #f59e0b; stroke-width: 4.2; stroke-dasharray: 10 7; animation: pathFlow 1.1s linear infinite; filter: drop-shadow(0 0 4px rgba(245,158,11,.35)); }
@keyframes pathFlow { to { stroke-dashoffset: -17; } }
.node { stroke: #0f172a; stroke-width: .9; cursor: grab; transition: .18s; }
.node:active { cursor: grabbing; }
.node.path { stroke: #f59e0b; stroke-width: 3; filter: drop-shadow(0 0 6px rgba(245,158,11,.4)); }
.node.pinned { stroke: #2563eb; stroke-width: 3.1; }
.node.expanded { stroke-width: 2.4; }
.node-label { text-anchor: middle; font-size: 10px; fill: #0f172a; pointer-events: none; }
.info-pane { padding: .8rem 1rem; overflow: auto; }
.kv { display: grid; grid-template-columns: 92px 1fr; gap: .45rem; margin-bottom: .28rem; font-size: .8rem; }
.kv span { color: var(--color-text-muted); }
.empty { font-size: .8rem; color: var(--color-text-muted); }
.pin-flag { color: #2563eb; font-size: .78rem; font-weight: 600; }
.clear-pin-btn { margin-top: .45rem; border: 1px solid var(--color-border); background: #fff; border-radius: 8px; padding: .28rem .55rem; cursor: pointer; font-size: .78rem; }
</style>
<!-- DUPLICATE_BLOCK_REMOVED
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Stage3GlobalSynthesis, Stage3TreeEdge, Stage3TreeNode } from '../../types/conclusion'

const props = defineProps<{
  visible: boolean
  stage3?: Stage3GlobalSynthesis
}>()

const emit = defineEmits<{
  close: []
}>()

function normId(v?: string | null) {
  return String(v || '').trim()
}

type PositionedNode = {
  node: Stage3TreeNode
  cx: number
  cy: number
}

type TooltipState = {
  show: boolean
  x: number
  y: number
  title: string
  lines: Array<{ k: string; v: string }>
}

const tree = computed(() => props.stage3?.tree_graph)
const selectedPath = computed(() => {
  const s = props.stage3
  if (!s) return undefined
  if (s.selected_path?.node_path?.length) return s.selected_path
  if (s.selected_path_id && s.candidate_paths?.length) {
    return s.candidate_paths.find((p) => p.path_id === s.selected_path_id) || s.candidate_paths[0]
  }
  return s.candidate_paths?.[0]
})
const expandedNodeId = ref<string | null>(null)
const zoom = ref(1)

const nodeMap = computed(() => {
  const map = new Map<string, Stage3TreeNode>()
  for (const n of tree.value?.nodes || []) map.set(n.node_id, n)
  return map
})

const hierarchyEdges = computed(() =>
  (tree.value?.edges || []).filter((e) => e.relation_type === 'hierarchy'),
)

const nonHierarchyEdges = computed(() =>
  (tree.value?.edges || []).filter((e) => e.relation_type !== 'hierarchy'),
)

const childrenMap = computed(() => {
  const map = new Map<string, string[]>()
  for (const edge of hierarchyEdges.value) {
    if (!map.has(edge.from)) map.set(edge.from, [])
    map.get(edge.from)!.push(edge.to)
  }
  return map
})

const selectedPathNodes = computed(() => {
  const set = new Set((selectedPath.value?.node_path || []).map((n) => normId(n)).filter(Boolean))
  if (tree.value?.root_id && (selectedPath.value?.node_path || []).length) {
    set.add(normId(tree.value.root_id))
  }
  return set
})

const selectedPathPairs = computed(() => {
  const pairs = new Set<string>()
  const path = (selectedPath.value?.node_path || []).map((n) => normId(n)).filter(Boolean)
  for (let i = 0; i < path.length - 1; i++) {
    pairs.add(`${path[i]}->${path[i + 1]}`)
    pairs.add(`${path[i + 1]}->${path[i]}`)
  }
  return pairs
})

const selectedPathEdgeIds = computed(() => {
  const ids = new Set<string>()
  const edgeIds = new Set((tree.value?.edges || []).map((e) => e.edge_id))
  for (const raw of selectedPath.value?.cross_pillar_links || []) {
    const t = normId(raw)
    if (edgeIds.has(t)) ids.add(t)
  }
  return ids
})

function fullLabel(node: Stage3TreeNode): string {
  if (node.node_type === 'root') return node.label || 'ROOT'
  if (node.node_type === 'pillar') return node.label || node.pillar || node.node_id
  return node.indicator_name || node.indicator_id || node.indicator_ref || node.node_id
}

function shortLabel(node: Stage3TreeNode, max = 8): string {
  const raw = fullLabel(node)
  return raw.length > max ? `${raw.slice(0, max)}…` : raw
}

const layout = computed(() => {
  const t = tree.value
  if (!t) {
    return {
      nodes: [] as PositionedNode[],
      hierarchy: [] as Stage3TreeEdge[],
      nonHierarchy: [] as Stage3TreeEdge[],
      width: 1200,
      height: 780,
      nodeR: 32,
    }
  }

  const levels: string[][] = []
  const visited = new Set<string>()
  let current: string[] = [t.root_id]

  while (current.length) {
    levels.push(current)
    const next: string[] = []
    for (const id of current) {
      if (visited.has(id)) continue
      visited.add(id)
      for (const child of childrenMap.value.get(id) || []) {
        if (!visited.has(child)) next.push(child)
      }
    }
    current = next
  }

  const remaining = (t.nodes || []).map((n) => n.node_id).filter((id) => !visited.has(id))
  if (remaining.length) levels.push(remaining)

  const maxInLevel = Math.max(1, ...levels.map((l) => l.length))

  const nodeR =
    maxInLevel > 28 ? 18 :
    maxInLevel > 22 ? 20 :
    maxInLevel > 16 ? 24 :
    maxInLevel > 12 ? 28 : 32
  const diameter = nodeR * 2
  const hGap =
    maxInLevel > 28 ? 14 :
    maxInLevel > 22 ? 18 :
    maxInLevel > 16 ? 24 :
    maxInLevel > 12 ? 38 : 84
  const vGap = maxInLevel > 16 ? 74 : 98
  const padX = 70
  const padY = 64

  const width = Math.max(1080, padX * 2 + maxInLevel * diameter + (maxInLevel - 1) * hGap)
  const height = Math.max(700, padY * 2 + levels.length * diameter + (levels.length - 1) * vGap)

  const positioned: PositionedNode[] = []

  levels.forEach((level, li) => {
    const rowWidth = level.length * diameter + Math.max(0, level.length - 1) * hGap
    const startX = (width - rowWidth) / 2
    const cy = padY + li * (diameter + vGap) + nodeR

    level.forEach((id, idx) => {
      const node = nodeMap.value.get(id)
      if (!node) return
      positioned.push({
        node,
        cx: startX + idx * (diameter + hGap) + nodeR,
        cy,
      })
    })
  })

  return {
    nodes: positioned,
    hierarchy: hierarchyEdges.value,
    nonHierarchy: nonHierarchyEdges.value,
    width,
    height,
    nodeR,
  }
})

const posMap = computed(() => {
  const map = new Map<string, PositionedNode>()
  for (const p of layout.value.nodes) map.set(p.node.node_id, p)
  return map
})

function nodeRadius(nodeId: string) {
  return expandedNodeId.value === nodeId ? Math.max(layout.value.nodeR * 2.7, 72) : layout.value.nodeR
}

function toggleNodeExpand(nodeId: string) {
  expandedNodeId.value = expandedNodeId.value === nodeId ? null : nodeId
}

function nodeSummaryLines(node: Stage3TreeNode): string[] {
  if (expandedNodeId.value !== node.node_id) return [shortLabel(node)]
  const lines: string[] = []
  lines.push(shortLabel(node, 18))
  if (node.node_type !== 'root') lines.push(`type:${node.node_type}`)
  if (node.indicator_ref) lines.push(shortLabel({ ...node, indicator_name: node.indicator_ref }, 18))
  if (node.selection_score != null) lines.push(`score:${node.selection_score}`)
  return lines.slice(0, 4)
}

function isPathNode(nodeId: string): boolean {
  return selectedPathNodes.value.has(nodeId)
}

function isPathEdge(edge: Stage3TreeEdge): boolean {
  const from = normId(edge.from)
  const to = normId(edge.to)
  if (selectedPathPairs.value.has(`${from}->${to}`)) return true
  if (selectedPathEdgeIds.value.has(edge.edge_id)) return true
  if (selectedPathNodes.value.has(from) && selectedPathNodes.value.has(to)) return true
  return false
}

function zoomIn() {
  zoom.value = Math.min(2.2, Number((zoom.value + 0.15).toFixed(2)))
}

function zoomOut() {
  zoom.value = Math.max(0.55, Number((zoom.value - 0.15).toFixed(2)))
}

function resetZoom() {
  zoom.value = 1
}

function edgeDetailText(edge: Stage3TreeEdge): string {
  if (edge.evidence == null) return '-'
  if (typeof edge.evidence === 'string') return edge.evidence
  if (Array.isArray(edge.evidence)) return `数组(${edge.evidence.length})`
  return '对象'
}

function edgeEndpoints(edge: Stage3TreeEdge) {
  const from = posMap.value.get(edge.from)
  const to = posMap.value.get(edge.to)
  if (!from || !to) return null

  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const rs = nodeRadius(edge.from)
  const rt = nodeRadius(edge.to)

  return {
    x1: from.cx + ux * rs,
    y1: from.cy + uy * rs,
    x2: to.cx - ux * rt,
    y2: to.cy - uy * rt,
  }
}

function hierarchyLine(edge: Stage3TreeEdge) {
  return edgeEndpoints(edge) || { x1: 0, y1: 0, x2: 0, y2: 0 }
}

function nonHierarchyPath(edge: Stage3TreeEdge) {
  const p = edgeEndpoints(edge)
  if (!p) return ''
  const cx = (p.x1 + p.x2) / 2
  const cy = Math.min(p.y1, p.y2) - 70
  return `M ${p.x1} ${p.y1} Q ${cx} ${cy} ${p.x2} ${p.y2}`
}

const tooltip = ref<TooltipState>({
  show: false,
  x: 0,
  y: 0,
  title: '',
  lines: [],
})

function moveTooltip(ev: MouseEvent) {
  tooltip.value.x = ev.clientX + 14
  tooltip.value.y = ev.clientY + 14
}

function hideTooltip() {
  tooltip.value.show = false
}

function showNodeTooltip(ev: MouseEvent, node: Stage3TreeNode) {
  moveTooltip(ev)
  tooltip.value = {
    show: true,
    x: tooltip.value.x,
    y: tooltip.value.y,
    title: `节点 · ${node.node_id}`,
    lines: [
      { k: '类型', v: node.node_type || '-' },
      { k: '名称', v: fullLabel(node) },
      { k: 'Pillar', v: node.pillar || '-' },
      { k: 'indicator_ref', v: node.indicator_ref || '-' },
      { k: 'score', v: node.selection_score == null ? '-' : String(node.selection_score) },
      { k: '路径高亮', v: isPathNode(node.node_id) ? 'true' : 'false' },
    ],
  }
}

function showEdgeTooltip(ev: MouseEvent, edge: Stage3TreeEdge) {
  moveTooltip(ev)
  tooltip.value = {
    show: true,
    x: tooltip.value.x,
    y: tooltip.value.y,
    title: `边 · ${edge.edge_id}`,
    lines: [
      { k: '类型', v: edge.relation_type || '-' },
      { k: '连接', v: `${edge.from} → ${edge.to}` },
      { k: 'weight', v: edge.weight == null ? '-' : String(edge.weight) },
      { k: 'evidence', v: edgeDetailText(edge) },
      { k: '路径高亮', v: isPathEdge(edge) ? 'true' : 'false' },
    ],
  }
}

function closeModal() {
  hideTooltip()
  expandedNodeId.value = null
  zoom.value = 1
  emit('close')
}
</script>

<template>
  <div v-if="visible" class="modal-mask" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <h3>显式树（Stage 3）</h3>
        <div class="header-actions">
          <button type="button" class="zoom-btn" @click="zoomOut">－</button>
          <button type="button" class="zoom-btn" @click="zoomIn">＋</button>
          <button type="button" class="zoom-btn" @click="resetZoom">100%</button>
          <button type="button" class="close-btn" @click="closeModal">✕</button>
        </div>
      </header>

      <div v-if="tree" class="canvas-wrap" @mousemove="moveTooltip">
        <svg
          class="tree-canvas"
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          :style="{
            width: `${layout.width * zoom}px`,
            height: `${layout.height * zoom}px`,
            minWidth: `${layout.width * zoom}px`,
            minHeight: `${layout.height * zoom}px`,
          }"
        >
          <g class="edge-layer hierarchy">
            <line
              v-for="e in layout.hierarchy"
              :key="e.edge_id"
              :x1="hierarchyLine(e).x1"
              :y1="hierarchyLine(e).y1"
              :x2="hierarchyLine(e).x2"
              :y2="hierarchyLine(e).y2"
              class="edge hierarchy"
              :class="{ path: isPathEdge(e) }"
              @mouseenter="showEdgeTooltip($event, e)"
              @mouseleave="hideTooltip"
            />
          </g>

          <g class="edge-layer non-hierarchy">
            <path
              v-for="e in layout.nonHierarchy"
              :key="e.edge_id"
              :d="nonHierarchyPath(e)"
              class="edge non-hierarchy"
              :class="{ path: isPathEdge(e) }"
              @mouseenter="showEdgeTooltip($event, e)"
              @mouseleave="hideTooltip"
            />
          </g>

          <g class="node-layer">
            <g
              v-for="p in layout.nodes"
              :key="p.node.node_id"
              class="node"
              @mouseenter="showNodeTooltip($event, p.node)"
              @mouseleave="hideTooltip"
              @click.stop="toggleNodeExpand(p.node.node_id)"
            >
              <circle
                :cx="p.cx"
                :cy="p.cy"
                :r="nodeRadius(p.node.node_id)"
                class="node-circle"
                :class="[
                  `type-${p.node.node_type}`,
                  { path: isPathNode(p.node.node_id), selected: p.node.selected, expanded: expandedNodeId === p.node.node_id },
                ]"
              />

              <text
                v-for="(line, i) in nodeSummaryLines(p.node)"
                :key="`${p.node.node_id}-${i}`"
                :x="p.cx"
                :y="p.cy + (expandedNodeId === p.node.node_id ? -24 : -2) + i * 16"
                class="node-text"
                text-anchor="middle"
              >
                {{ line }}
              </text>
            </g>
          </g>
        </svg>

        <div
          v-if="tooltip.show"
          class="hover-card"
          :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
        >
          <div class="hover-title">{{ tooltip.title }}</div>
          <div v-for="(line, i) in tooltip.lines" :key="i" class="hover-row">
            <span>{{ line.k }}</span>
            <b>{{ line.v }}</b>
          </div>
        </div>
      </div>

      <div class="empty" v-else>
        没有检测到 stage3_global_synthesis.tree_graph 数据。
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  z-index: 1000;
  display: grid;
  place-items: center;
}

.modal-card {
  width: min(1480px, 97vw);
  height: min(90vh, 980px);
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.zoom-btn {
  border: 1px solid var(--color-border);
  background: #fff;
  color: var(--color-text-muted);
  border-radius: 8px;
  font-size: 0.78rem;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}

.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  overflow: auto;
  background: radial-gradient(circle at 50% 0%, #f8fbff 0%, #f7fafc 65%, #f1f5f9 100%);
}

.tree-canvas {
  display: block;
}

.edge {
  fill: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.edge.hierarchy {
  stroke: #64748b;
  stroke-width: 1.7;
}

.edge.non-hierarchy {
  stroke: #8b5cf6;
  stroke-width: 1.6;
  stroke-dasharray: 6 4;
  opacity: 0.9;
}

.edge.path {
  stroke: #f59e0b !important;
  stroke-width: 3.2;
  stroke-dasharray: 9 7;
  animation: pathFlow 1.2s linear infinite;
  opacity: 1;
}

@keyframes pathFlow {
  to {
    stroke-dashoffset: -16;
  }
}

.node {
  cursor: pointer;
}

.node-circle {
  stroke: #cbd5e1;
  stroke-width: 1.3;
  fill: #fff;
  transition: all 0.2s ease;
}

.node-circle.type-root {
  fill: #eff6ff;
  stroke: #93c5fd;
}

.node-circle.type-pillar {
  fill: #ecfeff;
  stroke: #67e8f9;
}

.node-circle.type-indicator_candidate {
  fill: #ffffff;
  stroke: #cbd5e1;
}

.node-circle.selected {
  stroke: #3b82f6;
  stroke-width: 1.8;
}

.node-circle.path {
  stroke: #f59e0b;
  stroke-width: 2.6;
  filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.3));
}

.node-circle.expanded {
  stroke-width: 2.8;
}

.node-text {
  fill: #0f172a;
  font-size: 11px;
  pointer-events: none;
}

.hover-card {
  position: fixed;
  z-index: 30;
  min-width: 300px;
  max-width: 460px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
  padding: 0.55rem 0.65rem;
  pointer-events: none;
}

.hover-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.35rem;
}

.hover-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 0.45rem;
  font-size: 0.76rem;
  margin-bottom: 0.2rem;
}

.hover-row span {
  color: var(--color-text-muted);
}

.hover-row b {
  color: var(--color-text);
  word-break: break-word;
}

.empty {
  padding: 1rem;
  color: var(--color-text-muted);
}
</style>
-->
