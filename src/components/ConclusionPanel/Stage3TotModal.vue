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

type DetailValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'json'; text: string }
  | { kind: 'empty' }

interface NodeState {
  x: number
  y: number
  vx: number
  vy: number
  anchorX: number
  anchorY: number
  radius: number
  kind: 'root' | 'pillar' | 'indicator'
  regionKey: string | null
}

interface RegionLayout {
  key: string
  title: string
  index: number
  x: number
  y: number
  width: number
  height: number
  innerTop: number
  innerBottom: number
  innerLeft: number
  innerRight: number
  centerX: number
  centerY: number
}

interface DetailRow {
  key: string
  value: DetailValue
}

const props = defineProps<{
  visible: boolean
  stage3?: Stage3GlobalSynthesis
  originalQuestion?: string
  finalAnswer?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const graphSurfaceRef = ref<HTMLElement | null>(null)
const viewportSize = reactive({ width: 0, height: 0 })
const hoveredPathId = ref<string | null>(null)
const activePathId = ref<string>('')
const activeNodeId = ref<string>('')
const activeEdgeId = ref<string>('')
const detailMode = ref<FocusMode>('path')
const simulationRunning = ref(false)

let rafId = 0
let resizeObserver: ResizeObserver | null = null

const graph = computed<Stage3TreeGraph | null>(() => props.stage3?.tree_graph || null)
const paths = computed<Stage3Path[]>(() => [...(props.stage3?.candidate_paths || [])])

const selectedPathId = computed(() => {
  return props.stage3?.selected_path_id || props.stage3?.selected_path?.path_id || ''
})

const selectedPath = computed<Stage3Path | null>(() => {
  const list = paths.value
  if (!list.length) return props.stage3?.selected_path || null
  if (selectedPathId.value) {
    const hit = list.find((path) => path.path_id === selectedPathId.value)
    if (hit) return hit
  }
  return props.stage3?.selected_path || list[0] || null
})

const activePath = computed<Stage3Path | null>(() => {
  const list = paths.value
  const candidate = list.find((path) => path.path_id === activePathId.value)
  if (candidate) return candidate
  return selectedPath.value || list[0] || null
})

const nodeList = computed<Stage3TreeNode[]>(() => graph.value?.nodes || [])
const edgeList = computed<Stage3TreeEdge[]>(() => graph.value?.edges || [])

const rootNode = computed(() => {
  return (
    nodeList.value.find((node) => node.node_type === 'root') ||
    nodeList.value.find((node) => node.node_id === graph.value?.root_id) ||
    null
  )
})

const pillarNodes = computed(() => nodeList.value.filter((node) => node.node_type === 'pillar'))
const indicatorNodes = computed(() => nodeList.value.filter((node) => node.node_type !== 'pillar' && node.node_type !== 'root'))

const regionLayouts = computed<RegionLayout[]>(() => {
  const width = Math.max(viewportSize.width || 0, 1200)
  const height = Math.max(viewportSize.height || 0, 720)
  const pillars = pillarNodes.value
  if (!pillars.length) return []

  const gap = 16
  const outerPad = 18
  const availableWidth = Math.max(width - outerPad * 2 - gap * Math.max(pillars.length - 1, 0), 320)
  const regionWidth = availableWidth / pillars.length
  const y = 108
  const heightAvailable = Math.max(height - y - 18, 420)

  return pillars.map((pillarNode, index) => {
    const title = pillarNode.label || pillarNode.pillar || pillarNode.node_id
    const x = outerPad + index * (regionWidth + gap)
    const innerLeft = x + 16
    const innerRight = x + regionWidth - 16
    const innerTop = y + 98
    const innerBottom = y + heightAvailable - 16
    return {
      key: pillarNode.pillar || pillarNode.label || pillarNode.node_id,
      title,
      index,
      x,
      y,
      width: regionWidth,
      height: heightAvailable,
      innerTop,
      innerBottom,
      innerLeft,
      innerRight,
      centerX: x + regionWidth / 2,
      centerY: y + heightAvailable / 2,
    }
  })
})

const regionByKey = computed<Record<string, RegionLayout>>(() => {
  return regionLayouts.value.reduce<Record<string, RegionLayout>>((acc, region) => {
    acc[region.key] = region
    return acc
  }, {})
})

const nodeStateMap = reactive<Record<string, NodeState>>({})

const nodeById = computed<Record<string, Stage3TreeNode>>(() => {
  return nodeList.value.reduce<Record<string, Stage3TreeNode>>((acc, node) => {
    acc[node.node_id] = node
    return acc
  }, {})
})

const edgeById = computed<Record<string, Stage3TreeEdge>>(() => {
  return edgeList.value.reduce<Record<string, Stage3TreeEdge>>((acc, edge) => {
    acc[edge.edge_id] = edge
    return acc
  }, {})
})

const activePathNodeSet = computed(() => new Set(activePath.value?.node_path || []))

const activePathRegionKeys = computed(() => {
  const keys = new Set<string>()
  for (const nodeId of activePath.value?.node_path || []) {
    const node = nodeById.value[nodeId]
    if (!node) continue
    const regionKey = node.pillar || node.label || null
    if (regionKey) keys.add(regionKey)
  }
  return keys
})

const activePathType = computed<'selected' | 'candidate'>(() => {
  return activePath.value?.path_id && activePath.value.path_id === selectedPathId.value ? 'selected' : 'candidate'
})

const activeNode = computed(() => (activeNodeId.value ? nodeById.value[activeNodeId.value] || null : null))
const activeEdge = computed(() => (activeEdgeId.value ? edgeById.value[activeEdgeId.value] || null : null))

const hasGraph = computed(() => !!graph.value && !!pillarNodes.value.length)

const detailTitle = computed(() => {
  if (detailMode.value === 'node') return '节点详情'
  if (detailMode.value === 'edge') return '边详情'
  return '路径详情'
})

const detailSubtitle = computed(() => {
  if (detailMode.value === 'node' && activeNode.value) return activeNode.value.node_id
  if (detailMode.value === 'edge' && activeEdge.value) return activeEdge.value.edge_id
  return activePath.value?.path_id || '—'
})

function scorePercent(value?: number) {
  if (typeof value !== 'number') return '—'
  return `${Math.round(value * 100)}%`
}

function avgScore(path: Stage3Path) {
  const scores = [path.coverage_score, path.coherence_score, path.faithfulness_score].filter(
    (value): value is number => typeof value === 'number',
  )
  if (!scores.length) return '—'
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length
  return avg.toFixed(2)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toDetailValue(value: unknown): DetailValue {
  if (value == null) return { kind: 'empty' }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'string') return item
        if (typeof item === 'number' || typeof item === 'boolean') return String(item)
        return JSON.stringify(item, null, 2)
      })
      .filter(Boolean)
    if (!items.length) return { kind: 'empty' }
    return { kind: 'list', items }
  }
  if (typeof value === 'object') {
    return { kind: 'json', text: JSON.stringify(value, null, 2) }
  }
  const text = String(value).trim()
  return text ? { kind: 'text', text } : { kind: 'empty' }
}

function createRow(key: string, value: unknown): DetailRow {
  return { key, value: toDetailValue(value) }
}

function buildObjectRows(value: object | undefined, includeKeys?: string[]): DetailRow[] {
  if (!value) return []
  const record = value as Record<string, unknown>
  const keys = includeKeys?.length ? includeKeys : Object.keys(record)
  return keys.filter((key) => key in record).map((key) => createRow(key, record[key]))
}

const pathDetailRows = computed<DetailRow[]>(() => {
  const path = activePath.value
  if (!path) return []
  return [
    createRow('path_id', path.path_id),
    createRow('title', path.title),
    createRow('core_thesis', path.core_thesis),
    createRow('node_path', path.node_path),
    createRow('cross_pillar_links', path.cross_pillar_links),
    createRow('tensions_or_gaps', path.tensions_or_gaps),
    createRow('resolution_logic', path.resolution_logic),
    createRow('coverage_score', scorePercent(path.coverage_score)),
    createRow('coherence_score', scorePercent(path.coherence_score)),
    createRow('faithfulness_score', scorePercent(path.faithfulness_score)),
    createRow('why_it_wins', path.why_it_wins),
  ]
})

const nodeDetailRows = computed<DetailRow[]>(() => {
  const node = activeNode.value
  if (!node) return []
  return [
    ...buildObjectRows(node as Record<string, unknown>, [
      'node_id',
      'node_type',
      'label',
      'pillar',
      'indicator_id',
      'indicator_name',
      'indicator_ref',
      'selection_score',
      'selected',
    ]),
    createRow('raw_source', node.raw_source),
    createRow('operator_source', node.operator_source),
  ]
})

const edgeDetailRows = computed<DetailRow[]>(() => {
  const edge = activeEdge.value
  if (!edge) return []
  return [
    ...buildObjectRows(edge as Record<string, unknown>, ['edge_id', 'from', 'to', 'relation_type', 'weight']),
    createRow('evidence', edge.evidence),
  ]
})

const activeDetailRows = computed(() => {
  if (detailMode.value === 'node') return nodeDetailRows.value
  if (detailMode.value === 'edge') return edgeDetailRows.value
  return pathDetailRows.value
})

const activeDetailIsSelectedPath = computed(() => {
  return detailMode.value === 'path' && activePath.value?.path_id === selectedPathId.value
})

const pathSegments = computed(() => {
  const path = activePath.value?.node_path || []
  const segments: Array<{
    from: string
    to: string
    d: string
  }> = []

  for (let i = 0; i < path.length - 1; i += 1) {
    const fromId = path[i] as string
    const toId = path[i + 1] as string
    const fromState = nodeStateMap[fromId]
    const toState = nodeStateMap[toId]
    if (!fromState || !toState) continue
    const midX = (fromState.x + toState.x) / 2
    const bend = activePathType.value === 'selected' ? 80 : 62
    const midY = (fromState.y + toState.y) / 2 - bend
    segments.push({
      from: fromId,
      to: toId,
      d: `M ${fromState.x} ${fromState.y} C ${midX} ${midY}, ${midX} ${midY}, ${toState.x} ${toState.y}`,
    })
  }
  return segments
})

function ensureActivePathFallback() {
  if (!paths.value.length) {
    activePathId.value = ''
    return
  }
  if (!activePathId.value || !paths.value.some((path) => path.path_id === activePathId.value)) {
    const firstPath = paths.value[0]
    activePathId.value = selectedPathId.value || firstPath?.path_id || ''
  }
}

function isFinalSelectedPath(path: Stage3Path) {
  return !!path.path_id && path.path_id === selectedPathId.value
}

function isActivePath(path: Stage3Path) {
  return !!path.path_id && path.path_id === activePathId.value
}

function isPathNode(nodeId: string) {
  return activePathNodeSet.value.has(nodeId)
}

function isPathEdge(edge: Stage3TreeEdge) {
  const path = activePath.value?.node_path || []
  if (path.length < 2) return false
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) return true
  }
  return false
}

function focusPath(path: Stage3Path) {
  if (!path.path_id) return
  activePathId.value = path.path_id
  detailMode.value = 'path'
  activeNodeId.value = ''
  activeEdgeId.value = ''
}

function focusNode(node: Stage3TreeNode) {
  activeNodeId.value = node.node_id
  activeEdgeId.value = ''
  detailMode.value = 'node'
}

function focusEdge(edge: Stage3TreeEdge) {
  activeEdgeId.value = edge.edge_id
  activeNodeId.value = ''
  detailMode.value = 'edge'
}

function backToPathDetail() {
  detailMode.value = 'path'
  activeNodeId.value = ''
  activeEdgeId.value = ''
}

function getRegionForNode(node: Stage3TreeNode): RegionLayout | null {
  const key = node.pillar || node.label || ''
  if (!key) return null
  return regionByKey.value[key] || null
}

function nodePos(nodeId: string) {
  const state = nodeStateMap[nodeId]
  if (state) return state
  const node = nodeById.value[nodeId]
  const region = node ? getRegionForNode(node) : null
  return {
    x: region?.centerX || viewportSize.width / 2,
    y: region?.centerY || viewportSize.height / 2,
    vx: 0,
    vy: 0,
    anchorX: 0,
    anchorY: 0,
    radius: 20,
    kind: 'indicator' as const,
    regionKey: region?.key || null,
  }
}

function regionBoundsForNode(node: Stage3TreeNode) {
  const region = getRegionForNode(node)
  if (!region) {
    return {
      minX: 0,
      maxX: Math.max(viewportSize.width, 1200),
      minY: 0,
      maxY: Math.max(viewportSize.height, 720),
    }
  }
  if (node.node_type === 'pillar') {
    return {
      minX: region.innerLeft,
      maxX: region.innerRight,
      minY: region.y + 26,
      maxY: region.y + 74,
    }
  }
  return {
    minX: region.innerLeft,
    maxX: region.innerRight,
    minY: region.innerTop,
    maxY: region.innerBottom,
  }
}

function initializeNodeStates() {
  const width = Math.max(viewportSize.width || 0, 1200)
  const height = Math.max(viewportSize.height || 0, 720)
  const root = rootNode.value

  for (const key of Object.keys(nodeStateMap)) {
    delete nodeStateMap[key]
  }

  if (root) {
    nodeStateMap[root.node_id] = {
      x: width / 2,
      y: 56,
      vx: 0,
      vy: 0,
      anchorX: width / 2,
      anchorY: 56,
      radius: 34,
      kind: 'root',
      regionKey: null,
    }
  }

  const pillarOrder = pillarNodes.value
  const indicatorGroups = indicatorNodes.value.reduce<Record<string, Stage3TreeNode[]>>((acc, node) => {
    const key = node.pillar || node.label || ''
    if (!acc[key]) acc[key] = []
    acc[key].push(node)
    return acc
  }, {})

  pillarOrder.forEach((pillarNode, pillarIndex) => {
    const region = regionLayouts.value[pillarIndex]
    const pillarKey = pillarNode.pillar || pillarNode.label || pillarNode.node_id
    const pillarX = region?.centerX || width / Math.max(pillarOrder.length, 1)
    const pillarY = region ? region.y + 52 : 120

    nodeStateMap[pillarNode.node_id] = {
      x: pillarX,
      y: pillarY,
      vx: 0,
      vy: 0,
      anchorX: pillarX,
      anchorY: pillarY,
      radius: 28,
      kind: 'pillar',
      regionKey: pillarKey,
    }

    const indicators = indicatorGroups[pillarKey] || []
    if (!region) return

    const cols = Math.max(Math.min(Math.ceil(Math.sqrt(indicators.length || 1)), 3), 1)
    const rows = Math.max(Math.ceil(indicators.length / cols), 1)
    const contentWidth = Math.max(region.innerRight - region.innerLeft, 280)
    const contentHeight = Math.max(region.innerBottom - region.innerTop, 260)
    const cellWidth = contentWidth / cols
    const cellHeight = contentHeight / rows

    indicators.forEach((node, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols
      const jitterX = ((index * 37) % 13) - 6
      const jitterY = ((index * 23) % 11) - 5
      const anchorX = region.innerLeft + cellWidth * (col + 0.5)
      const anchorY = region.innerTop + cellHeight * (row + 0.5)
      nodeStateMap[node.node_id] = {
        x: clamp(anchorX + jitterX, region.innerLeft + 20, region.innerRight - 20),
        y: clamp(anchorY + jitterY, region.innerTop + 18, region.innerBottom - 18),
        vx: 0,
        vy: 0,
        anchorX,
        anchorY,
        radius: 22,
        kind: 'indicator',
        regionKey: pillarKey,
      }
    })
  })

  indicatorNodes.value.forEach((node, index) => {
    if (nodeStateMap[node.node_id]) return
    const x = width / 2 + (index % 3) * 60 - 60
    const y = height / 2 + Math.floor(index / 3) * 60
    nodeStateMap[node.node_id] = {
      x,
      y,
      vx: 0,
      vy: 0,
      anchorX: x,
      anchorY: y,
      radius: 22,
      kind: 'indicator',
      regionKey: null,
    }
  })
}

function buildAdjacency() {
  const adjacency = new Map<string, string[]>()
  for (const edge of edgeList.value) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
    adjacency.get(edge.from)!.push(edge.to)
    adjacency.get(edge.to)!.push(edge.from)
  }
  return adjacency
}

function stepPhysics() {
  const keys = Object.keys(nodeStateMap)
  if (!keys.length) return

  const adjacency = buildAdjacency()

  for (let i = 0; i < keys.length; i += 1) {
    const aKey = keys[i] as string
    const a = nodeStateMap[aKey]
    if (!a) continue
    for (let j = i + 1; j < keys.length; j += 1) {
      const bKey = keys[j] as string
      const b = nodeStateMap[bKey]
      if (!b) continue

      const sameRegion = a.regionKey && b.regionKey && a.regionKey === b.regionKey
      const dx = a.x - b.x
      const dy = a.y - b.y
      const distSq = dx * dx + dy * dy + 0.01
      const dist = Math.sqrt(distSq)
      const minDist = a.radius + b.radius + (sameRegion ? 14 : 30)
      const overlap = Math.max(minDist - dist, 0)
      const repulseBase = sameRegion ? 0.18 : 0.07

      if (dist > 0) {
        const force = (repulseBase * (overlap + 22)) / Math.max(dist, 18)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (a.kind !== 'root') {
          a.vx += fx
          a.vy += fy
        }
        if (b.kind !== 'root') {
          b.vx -= fx
          b.vy -= fy
        }
      }
    }
  }

  for (const node of nodeList.value) {
    const state = nodeStateMap[node.node_id]
    if (!state || state.kind === 'root') continue

    const anchorForce = node.node_type === 'pillar' ? 0.08 : 0.045
    state.vx += (state.anchorX - state.x) * anchorForce
    state.vy += (state.anchorY - state.y) * anchorForce

    const neighbors = adjacency.get(node.node_id) || []
    for (const neighborId of neighbors) {
      const neighbor = nodeStateMap[neighborId]
      if (!neighbor) continue
      const dx = neighbor.x - state.x
      const dy = neighbor.y - state.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const target = node.node_type === 'pillar' || neighbor.kind === 'pillar' ? 132 : 168
      const spring = node.node_type === 'pillar' || neighbor.kind === 'pillar' ? 0.012 : 0.008
      const force = (dist - target) * spring
      state.vx += (dx / dist) * force
      state.vy += (dy / dist) * force
    }

    const bounds = regionBoundsForNode(node)
    state.vx *= 0.88
    state.vy *= 0.88
    state.x += state.vx
    state.y += state.vy

    const padX = state.radius + 2
    const padY = state.radius + 2
    if (state.x < bounds.minX + padX) {
      state.x = bounds.minX + padX
      state.vx *= -0.45
    }
    if (state.x > bounds.maxX - padX) {
      state.x = bounds.maxX - padX
      state.vx *= -0.45
    }
    if (state.y < bounds.minY + padY) {
      state.y = bounds.minY + padY
      state.vy *= -0.45
    }
    if (state.y > bounds.maxY - padY) {
      state.y = bounds.maxY - padY
      state.vy *= -0.45
    }
  }
}

function tick() {
  if (!simulationRunning.value) return
  stepPhysics()
  rafId = window.requestAnimationFrame(tick)
}

function startSimulation() {
  if (simulationRunning.value) return
  if (!hasGraph.value) return
  simulationRunning.value = true
  rafId = window.requestAnimationFrame(tick)
}

function stopSimulation() {
  simulationRunning.value = false
  if (rafId) window.cancelAnimationFrame(rafId)
  rafId = 0
}

function syncLayout() {
  if (!props.visible) return
  if (!graph.value || !pillarNodes.value.length) return
  initializeNodeStates()
  stopSimulation()
  startSimulation()
}

function measureViewport() {
  const el = graphSurfaceRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  viewportSize.width = Math.max(Math.floor(rect.width), 0)
  viewportSize.height = Math.max(Math.floor(rect.height), 0)
}

function onNodeClick(node: Stage3TreeNode) {
  focusNode(node)
}

function onEdgeClick(edge: Stage3TreeEdge) {
  focusEdge(edge)
}

function nodeClass(node: Stage3TreeNode) {
  return {
    root: node.node_type === 'root',
    pillar: node.node_type === 'pillar',
    indicator: node.node_type !== 'root' && node.node_type !== 'pillar',
    'active-node': activeNodeId.value === node.node_id,
    'path-node': isPathNode(node.node_id),
    'final-path-node': activePathType.value === 'selected' && isPathNode(node.node_id),
    'candidate-path-node': activePathType.value === 'candidate' && isPathNode(node.node_id),
  }
}

function regionClass(region: RegionLayout) {
  const active = activePathRegionKeys.value.has(region.key)
  return {
    active,
    selected: active && activePathType.value === 'selected',
    candidate: active && activePathType.value === 'candidate',
    muted: !!activePath.value && !active,
  }
}

function edgeClass(edge: Stage3TreeEdge) {
  return {
    selected: activeEdgeId.value === edge.edge_id,
    'path-edge': isPathEdge(edge),
    'final-path-edge': activePathType.value === 'selected' && isPathEdge(edge),
    'candidate-path-edge': activePathType.value === 'candidate' && isPathEdge(edge),
    conflict: edge.relation_type === 'conflict',
    hierarchy: edge.relation_type === 'hierarchy',
    sequence: edge.relation_type === 'intra_pillar_sequence',
  }
}

function edgePath(edge: Stage3TreeEdge) {
  const source = nodePos(edge.from)
  const target = nodePos(edge.to)
  const dx = target.x - source.x
  const dy = target.y - source.y
  const bend = Math.max(Math.min(Math.abs(dx) * 0.25, 120), 40)
  const curve = edge.relation_type === 'conflict' ? bend + 26 : bend
  const midX = source.x + dx / 2
  const midY = source.y + dy / 2
  const control1Y = midY - curve
  const control2Y = midY + curve * 0.18
  return `M ${source.x} ${source.y} C ${midX} ${control1Y}, ${midX} ${control2Y}, ${target.x} ${target.y}`
}

function rootConnectorPath(region: RegionLayout) {
  const root = rootNode.value
  if (!root) return ''
  const rootState = nodePos(root.node_id)
  const targetX = region.centerX
  const targetY = region.y + 40
  const midY = (rootState.y + targetY) / 2 - 28
  return `M ${rootState.x} ${rootState.y} C ${rootState.x} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`
}

function closeModal() {
  stopSimulation()
  hoveredPathId.value = null
  activeNodeId.value = ''
  activeEdgeId.value = ''
  detailMode.value = 'path'
  emit('close')
}

function formatNodeLabel(node: Stage3TreeNode) {
  return node.label || node.indicator_name || node.indicator_id || node.node_id
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      stopSimulation()
      return
    }
    await nextTick()
    measureViewport()
    ensureActivePathFallback()
    syncLayout()
    detailMode.value = 'path'
  },
  { immediate: true },
)

watch(
  () => [graph.value, paths.value.length, selectedPathId.value, viewportSize.width, viewportSize.height],
  async () => {
    if (!props.visible) return
    await nextTick()
    ensureActivePathFallback()
    syncLayout()
  },
  { deep: true },
)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && graphSurfaceRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureViewport()
      if (props.visible) {
        syncLayout()
      }
    })
    resizeObserver.observe(graphSurfaceRef.value)
  }
  measureViewport()
})

onBeforeUnmount(() => {
  stopSimulation()
  if (resizeObserver && graphSurfaceRef.value) {
    resizeObserver.unobserve(graphSurfaceRef.value)
    resizeObserver.disconnect()
  }
  resizeObserver = null
})
</script>

<template>
  <div v-if="visible" class="modal-mask" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-title-block">
          <div class="header-kicker">Stage 3 · 显式图结构</div>
          <h3>ToT 图式推理弹窗</h3>
          <p>节点、边、路径三层联动；点击路径高亮其节点与边，点击节点或边查看完整信息。</p>
        </div>

        <button class="close-btn" type="button" @click="closeModal">✕</button>
      </header>

      <div class="modal-body">
        <section class="graph-panel">
          <div class="panel-head">
            <div class="panel-head-left">
              <span class="panel-tag">path buttons</span>
              <div class="path-tabs">
                <button
                  v-for="(path, index) in paths"
                  :key="path.path_id || index"
                  class="path-tab"
                  :class="{
                    selected: isFinalSelectedPath(path),
                    active: isActivePath(path),
                    candidate: !isFinalSelectedPath(path),
                  }"
                  type="button"
                  @click="focusPath(path)"
                  @mouseenter="hoveredPathId = path.path_id || null"
                  @mouseleave="hoveredPathId = null"
                >
                  <span class="path-tab-top">
                    <strong>{{ path.title || path.path_id || `path ${index + 1}` }}</strong>
                    <span v-if="isFinalSelectedPath(path)" class="status-chip selected-chip">最终选中</span>
                    <span v-else class="status-chip candidate-chip">未选中</span>
                  </span>
                  <span class="path-tab-bottom">
                    <span>{{ path.path_id || `path_${index + 1}` }}</span>
                    <span class="avg-score">avg {{ avgScore(path) }}</span>
                  </span>
                </button>
              </div>
            </div>

            <!-- <div class="legend">
              <span><i class="legend-node final"></i>最终选中路径</span>
              <span><i class="legend-node candidate"></i>未选中路径</span>
              <span><i class="legend-node neutral"></i>普通节点/边</span>
            </div> -->
          </div>

          <div ref="graphSurfaceRef" class="graph-surface">
            <div v-if="!hasGraph" class="empty-state">
              <strong>没有检测到 stage3_global_synthesis.tree_graph 数据。</strong>
              <span>当前只存在路径信息时，无法绘制显式图结构。</span>
            </div>

            <template v-else>
              <svg class="edge-layer" :viewBox="`0 0 ${Math.max(viewportSize.width, 1200)} ${Math.max(viewportSize.height, 720)}`" preserveAspectRatio="none">
                <defs>
                  <marker id="arrow-neutral" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148, 163, 184, 0.85)" />
                  </marker>
                  <marker id="arrow-conflict" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(239, 68, 68, 0.9)" />
                  </marker>
                  <marker id="arrow-selected" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(250, 204, 21, 0.98)" />
                  </marker>
                  <marker id="arrow-candidate" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(168, 85, 247, 0.92)" />
                  </marker>
                </defs>

                <path
                  v-if="rootNode"
                  v-for="region in regionLayouts"
                  :key="`root-edge-${region.key}`"
                  class="root-edge"
                  :d="rootConnectorPath(region)"
                  fill="none"
                />

                <g
                  v-for="edge in edgeList"
                  :key="edge.edge_id"
                  class="base-edge-group"
                  @click.stop="onEdgeClick(edge)"
                  @mouseenter="activeEdgeId = edge.edge_id"
                  @mouseleave="activeEdgeId = ''"
                >
                  <path
                    class="base-edge"
                    :class="edgeClass(edge)"
                    :d="edgePath(edge)"
                    fill="none"
                    :marker-end="edge.relation_type === 'conflict'
                      ? 'url(#arrow-conflict)'
                      : 'url(#arrow-neutral)'"
                  />
                  <path
                    v-if="activeEdgeId === edge.edge_id"
                    class="active-edge-hit"
                    :d="edgePath(edge)"
                    fill="none"
                  />
                </g>

                <g v-if="activePath" class="path-overlay-group">
                  <template v-for="segment in pathSegments" :key="`${segment.from}-${segment.to}`">
                    <path
                      class="path-overlay-shadow"
                      :class="{ selected: activePathType === 'selected', candidate: activePathType === 'candidate' }"
                      :d="segment.d"
                      fill="none"
                    />
                    <path
                      class="path-overlay-main"
                      :class="{ selected: activePathType === 'selected', candidate: activePathType === 'candidate' }"
                      :d="segment.d"
                      fill="none"
                      :marker-end="activePathType === 'selected' ? 'url(#arrow-selected)' : 'url(#arrow-candidate)'"
                    />
                  </template>
                </g>
              </svg>

              <div class="root-node-wrap" :class="{ selected: activePathType === 'selected' }">
                <button class="graph-node root-node" type="button" @click="rootNode && onNodeClick(rootNode)">
                  <span class="node-kicker">ROOT</span>
                  <strong>{{ originalQuestion || 'original_question' }}</strong>
                </button>
              </div>

              <div
                v-for="region in regionLayouts"
                :key="region.key"
                class="pillar-region"
                :class="regionClass(region)"
                :style="{
                  left: `${region.x}px`,
                  top: `${region.y}px`,
                  width: `${region.width}px`,
                  height: `${region.height}px`,
                }"
              >
                <div class="region-header">
                  <span class="region-tag">pillar</span>
                  <strong>{{ region.title }}</strong>
                </div>

                <div class="pillar-anchor">
                  <button
                    v-if="pillarNodes[region.index]"
                    class="graph-node pillar-node"
                    type="button"
                    @click="onNodeClick(pillarNodes[region.index])"
                  >
                    <span class="node-kicker">pillar node</span>
                    <strong>{{ formatNodeLabel(pillarNodes[region.index]) }}</strong>
                  </button>
                </div>

                <template v-for="node in indicatorNodes.filter((n) => (n.pillar || n.label || '') === region.key)" :key="node.node_id">
                  <button
                    class="graph-node indicator-node"
                    :class="nodeClass(node)"
                    type="button"
                    :style="{
                      left: `${nodePos(node.node_id).x - region.x}px`,
                      top: `${nodePos(node.node_id).y - region.y}px`,
                    }"
                    @click="onNodeClick(node)"
                    @mouseenter="activeNodeId = node.node_id"
                    @mouseleave="activeNodeId = ''"
                  >
                    <span class="node-kicker">{{ node.indicator_id || node.node_type }}</span>
                    <strong>{{ formatNodeLabel(node) }}</strong>
                    <span v-if="node.selection_score != null" class="node-score">{{ node.selection_score.toFixed(2) }}</span>
                  </button>
                </template>
              </div>
            </template>
          </div>
        </section>

        <aside class="detail-panel">
          <div class="panel-head detail-head">
            <div>
              <span class="panel-tag">detail view</span>
              <h4>{{ detailTitle }}</h4>
              <p>{{ detailSubtitle }}</p>
            </div>
            <button v-if="detailMode !== 'path'" class="back-btn" type="button" @click="backToPathDetail">
              返回路径
            </button>
          </div>

          <div class="detail-scroll">
            <div v-if="detailMode === 'path' && activePath" class="path-summary-card" :class="{ selected: activeDetailIsSelectedPath }">
              <div class="path-summary-top">
                <div>
                  <span class="summary-chip">{{ activeDetailIsSelectedPath ? 'final selected' : 'candidate path' }}</span>
                  <h5>{{ activePath.title || activePath.path_id }}</h5>
                </div>
                <div class="summary-score-badge">
                  <span>avg</span>
                  <strong>{{ avgScore(activePath) }}</strong>
                </div>
              </div>

              <p class="summary-thesis">{{ activePath.core_thesis || '—' }}</p>

              <div class="summary-score-grid">
                <div>
                  <span>coverage</span>
                  <strong>{{ scorePercent(activePath.coverage_score) }}</strong>
                </div>
                <div>
                  <span>coherence</span>
                  <strong>{{ scorePercent(activePath.coherence_score) }}</strong>
                </div>
                <div>
                  <span>faithfulness</span>
                  <strong>{{ scorePercent(activePath.faithfulness_score) }}</strong>
                </div>
              </div>
            </div>

            <div class="detail-stack">
              <div v-for="row in activeDetailRows" :key="row.key" class="detail-row">
                <span class="detail-key">{{ row.key }}</span>

                <template v-if="row.value.kind === 'empty'">
                  <span class="detail-value empty">—</span>
                </template>

                <template v-else-if="row.value.kind === 'text'">
                  <span class="detail-value text-block">{{ row.value.text }}</span>
                </template>

                <template v-else-if="row.value.kind === 'json'">
                  <pre class="detail-value json-block">{{ row.value.text }}</pre>
                </template>

                <template v-else>
                  <ul class="detail-list">
                    <li v-for="(item, index) in row.value.items" :key="`${row.key}-${index}`">{{ item }}</li>
                  </ul>
                </template>
              </div>
            </div>

            <div v-if="detailMode === 'path'" class="score-table-card">
              <div class="score-table-title">路径对照表</div>
              <table class="score-table">
                <thead>
                  <tr>
                    <th>path</th>
                    <th>coverage</th>
                    <th>coherence</th>
                    <th>faithfulness</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="path in paths"
                    :key="`score-${path.path_id}`"
                    :class="{
                      selected: isFinalSelectedPath(path),
                      active: isActivePath(path),
                    }"
                    @click="focusPath(path)"
                  >
                    <td>
                      <div class="path-name">
                        <b>{{ path.title || path.path_id }}</b>
                        <small>{{ path.path_id }}</small>
                      </div>
                    </td>
                    <td>{{ scorePercent(path.coverage_score) }}</td>
                    <td>{{ scorePercent(path.coherence_score) }}</td>
                    <td>{{ scorePercent(path.faithfulness_score) }}</td>
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
.modal-mask {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(34, 197, 94, 0.12), transparent 34%),
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 32%),
    rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(8px);
  z-index: 1200;
  display: grid;
  place-items: center;
}

.modal-card {
  width: min(1800px, 98vw);
  height: min(94vh, 1080px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 20px;
  box-shadow: 0 36px 90px rgba(15, 23, 42, 0.32);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem 1.2rem 0.85rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.header-title-block h3 {
  margin: 0.18rem 0 0;
  font-size: 1.08rem;
}

.header-title-block p {
  margin: 0.24rem 0 0;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.45;
}

.header-kicker,
.panel-tag,
.region-tag,
.node-kicker,
.summary-chip,
.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.header-kicker,
.panel-tag,
.region-tag {
  padding: 0.18rem 0.56rem;
  background: rgba(226, 232, 240, 0.95);
  color: #475569;
}

.close-btn,
.back-btn {
  border: none;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.close-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.92);
  color: #334155;
  font-size: 1rem;
}

.close-btn:hover,
.back-btn:hover,
.path-tab:hover,
.graph-node:hover,
.score-table tbody tr:hover {
  transform: translateY(-1px);
}

.modal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(380px, 0.92fr);
  gap: 1rem;
  padding: 1rem;
}

.graph-panel,
.detail-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.8rem;
}

.panel-head-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.path-tabs {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.path-tab {
  min-width: 220px;
  border-radius: 16px;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.96);
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}

.path-tab.selected {
  border-color: rgba(245, 158, 11, 0.42);
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.98), rgba(255, 251, 235, 0.98));
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.18), 0 12px 28px rgba(245, 158, 11, 0.12);
}

.path-tab.candidate {
  border-style: dashed;
}

.path-tab.active {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.18), 0 14px 30px rgba(59, 130, 246, 0.12);
}

.path-tab.selected.active {
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25), 0 14px 34px rgba(245, 158, 11, 0.16);
}

.path-tab-top,
.path-tab-bottom,
.summary-score-grid,
.summary-score-grid div {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
}

.path-tab-top strong {
  font-size: 0.84rem;
  line-height: 1.35;
  color: #0f172a;
}

.path-tab-bottom {
  color: #64748b;
  font-size: 0.74rem;
}

.avg-score {
  color: #0f172a;
  font-weight: 700;
}

.status-chip {
  padding: 0.18rem 0.45rem;
}

.selected-chip {
  color: #92400e;
  background: rgba(253, 230, 138, 0.82);
}

.candidate-chip {
  color: #334155;
  background: rgba(226, 232, 240, 0.84);
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
  color: #475569;
  font-size: 0.72rem;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-node {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.legend-node.final {
  background: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
}

.legend-node.candidate {
  background: #8b5cf6;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12);
}

.legend-node.neutral {
  background: #94a3b8;
}

.graph-surface {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(90deg, rgba(241, 245, 249, 0.55) 1px, transparent 1px),
    linear-gradient(180deg, rgba(241, 245, 249, 0.55) 1px, transparent 1px),
    linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98));
  background-size: 56px 56px, 56px 56px, auto;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 0.4rem;
  text-align: center;
  color: #64748b;
}

.empty-state strong {
  color: #0f172a;
}

.edge-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.root-edge {
  stroke: rgba(148, 163, 184, 0.7);
  stroke-width: 2.2;
  stroke-dasharray: 5 5;
  filter: drop-shadow(0 0 12px rgba(148, 163, 184, 0.14));
}

.base-edge-group {
  cursor: pointer;
  pointer-events: auto;
}

.base-edge {
  stroke-width: 2.2;
  opacity: 0.82;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  transition: stroke 0.18s ease, opacity 0.18s ease, stroke-width 0.18s ease;
}

.base-edge.hierarchy {
  stroke: rgba(148, 163, 184, 0.85);
}

.base-edge.sequence {
  stroke: rgba(100, 116, 139, 0.82);
}

.base-edge.conflict {
  stroke: rgba(239, 68, 68, 0.88);
  stroke-dasharray: 10 7;
}

.base-edge.selected,
.base-edge-group:hover .base-edge {
  stroke-width: 3.2;
  opacity: 1;
}

.base-edge.path-edge.final-path-edge {
  stroke: rgba(245, 158, 11, 0.25);
}

.base-edge.path-edge.candidate-path-edge {
  stroke: rgba(139, 92, 246, 0.24);
}

.active-edge-hit {
  pointer-events: stroke;
  stroke: transparent;
  stroke-width: 18;
}

.path-overlay-group {
  pointer-events: none;
}

.path-overlay-shadow,
.path-overlay-main {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.path-overlay-shadow.selected {
  stroke: rgba(250, 204, 21, 0.2);
  stroke-width: 13;
  filter: blur(9px);
}

.path-overlay-shadow.candidate {
  stroke: rgba(168, 85, 247, 0.18);
  stroke-width: 11;
  filter: blur(8px);
}

.path-overlay-main.selected {
  stroke: #facc15;
  stroke-width: 3.8;
  stroke-dasharray: 14 10;
  animation: dashFlow 2.4s linear infinite;
  filter: drop-shadow(0 0 14px rgba(250, 204, 21, 0.32));
}

.path-overlay-main.candidate {
  stroke: #a855f7;
  stroke-width: 3.2;
  stroke-dasharray: 8 8;
  animation: dashFlow 3.2s linear infinite reverse;
  filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.22));
}

@keyframes dashFlow {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -128;
  }
}

.root-node-wrap {
  position: absolute;
  left: 50%;
  top: 28px;
  transform: translateX(-50%);
  z-index: 5;
}

.graph-node {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    opacity 0.18s ease;
}

.graph-node:hover {
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}

.root-node {
  width: 240px;
  min-height: 70px;
  border-radius: 20px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
}

.root-node .node-kicker {
  background: rgba(219, 234, 254, 0.95);
  color: #1d4ed8;
  padding: 0.16rem 0.5rem;
}

.root-node strong {
  font-size: 0.83rem;
  line-height: 1.45;
}

.pillar-region {
  position: absolute;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.78), rgba(255, 255, 255, 0.7));
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease,
    transform 0.18s ease;
}

.pillar-region::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.35), transparent 34%);
  pointer-events: none;
}

.pillar-region.selected {
  border-color: rgba(245, 158, 11, 0.36);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.14), 0 18px 40px rgba(245, 158, 11, 0.08);
}

.pillar-region.candidate {
  border-color: rgba(139, 92, 246, 0.32);
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.12), 0 18px 40px rgba(139, 92, 246, 0.08);
}

.pillar-region.muted {
  opacity: 0.58;
  filter: saturate(0.84);
}

.region-header {
  position: absolute;
  left: 14px;
  top: 12px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  z-index: 2;
}

.region-header strong {
  color: #0f172a;
  font-size: 0.84rem;
  line-height: 1.35;
}

.pillar-anchor {
  position: absolute;
  left: 50%;
  top: 54px;
  transform: translateX(-50%);
  z-index: 2;
}

.pillar-node {
  width: 210px;
  min-height: 56px;
  border-radius: 18px;
  padding: 0.7rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  align-items: flex-start;
  position: relative;
}

.pillar-node .node-kicker {
  background: rgba(226, 232, 240, 0.92);
  color: #334155;
  padding: 0.14rem 0.46rem;
}

.pillar-node strong,
.indicator-node strong {
  font-size: 0.8rem;
  line-height: 1.35;
  text-align: left;
}

.indicator-node {
  position: absolute;
  width: 156px;
  min-height: 54px;
  border-radius: 18px;
  padding: 0.58rem 0.68rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  align-items: flex-start;
  z-index: 3;
}

.indicator-node .node-kicker {
  background: rgba(241, 245, 249, 0.95);
  color: #475569;
  padding: 0.12rem 0.42rem;
}

.indicator-node .node-score {
  align-self: flex-end;
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  margin-top: -0.05rem;
}

.graph-node.root,
.graph-node.pillar,
.graph-node.indicator {
  position: absolute;
  pointer-events: auto;
}

.graph-node.active-node {
  border-color: rgba(59, 130, 246, 0.46);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.18), 0 18px 38px rgba(59, 130, 246, 0.16);
}

.graph-node.path-node.final-path-node {
  border-color: rgba(245, 158, 11, 0.46);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.2), 0 18px 38px rgba(245, 158, 11, 0.16);
}

.graph-node.path-node.candidate-path-node {
  border-color: rgba(168, 85, 247, 0.42);
  box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.18), 0 18px 38px rgba(168, 85, 247, 0.16);
}

.graph-node.root {
  z-index: 4;
}

.graph-node.pillar {
  z-index: 4;
}

.graph-node.indicator:hover,
.graph-node.pillar:hover,
.graph-node.root:hover {
  opacity: 1;
}

.detail-panel {
  border-left: 1px solid rgba(148, 163, 184, 0.18);
  padding-left: 0.1rem;
}

.detail-head {
  padding: 0.05rem 0 0.25rem 0.25rem;
}

.detail-head h4 {
  margin: 0.16rem 0 0;
  font-size: 0.98rem;
}

.detail-head p {
  margin: 0.18rem 0 0;
  color: #64748b;
  font-size: 0.76rem;
}

.back-btn {
  padding: 0.52rem 0.78rem;
  border-radius: 12px;
  background: rgba(219, 234, 254, 0.82);
  color: #1d4ed8;
  font-size: 0.78rem;
  white-space: nowrap;
}

.detail-scroll {
  min-height: 0;
  overflow: auto;
  padding-right: 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.path-summary-card,
.score-table-card,
.detail-row {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
}

.path-summary-card {
  padding: 0.92rem;
}

.path-summary-card.selected {
  border-color: rgba(245, 158, 11, 0.28);
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.84), rgba(255, 255, 255, 0.95));
}

.path-summary-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.path-summary-top h5 {
  margin: 0.28rem 0 0;
  font-size: 0.92rem;
  line-height: 1.45;
}

.summary-score-badge {
  min-width: 74px;
  border-radius: 16px;
  padding: 0.62rem 0.75rem;
  background: rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.14rem;
}

.summary-score-badge span {
  color: #64748b;
  font-size: 0.72rem;
}

.summary-score-badge strong {
  color: #0f172a;
  font-size: 1.08rem;
}

.summary-thesis {
  margin: 0.72rem 0 0;
  color: #0f172a;
  font-size: 0.84rem;
  line-height: 1.65;
}

.summary-score-grid {
  margin-top: 0.78rem;
}

.summary-score-grid div {
  flex: 1;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.68rem 0.72rem;
  background: rgba(248, 250, 252, 0.96);
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.summary-score-grid span {
  font-size: 0.72rem;
  color: #64748b;
}

.summary-score-grid strong {
  color: #0f172a;
  font-size: 0.92rem;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.detail-row {
  padding: 0.76rem 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.detail-key {
  color: #475569;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.detail-value {
  color: #0f172a;
  font-size: 0.82rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-value.empty {
  color: #94a3b8;
}

.text-block,
.json-block {
  background: rgba(248, 250, 252, 0.96);
  border-radius: 12px;
  padding: 0.68rem 0.76rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.json-block {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.72rem;
  line-height: 1.55;
  overflow: auto;
}

.detail-list {
  margin: 0;
  padding-left: 1rem;
  color: #0f172a;
}

.detail-list li + li {
  margin-top: 0.18rem;
}

.score-table-card {
  padding: 0.86rem 0.92rem 0.95rem;
}

.score-table-title {
  font-size: 0.84rem;
  font-weight: 700;
  margin-bottom: 0.66rem;
  color: #0f172a;
}

.score-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.score-table th,
.score-table td {
  padding: 0.72rem 0.42rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.96);
  text-align: left;
}

.score-table th {
  color: #64748b;
  font-size: 0.7rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.score-table tbody tr {
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.score-table tbody tr.selected {
  background: rgba(255, 247, 237, 0.9);
}

.score-table tbody tr.active {
  background: rgba(239, 246, 255, 0.92);
}

.path-name {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.path-name small {
  color: #64748b;
}

.root-node-wrap.selected .root-node {
  border-color: rgba(245, 158, 11, 0.35);
}

@media (max-width: 1400px) {
  .modal-body {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
    padding-top: 1rem;
  }

  .graph-surface {
    min-height: 720px;
  }
}
</style><script setup lang="ts">
import { computed, ref } from 'vue'
import type { Stage3GlobalSynthesis, Stage3Path } from '../../types/conclusion'

type DetailValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'empty' }

const props = defineProps<{
  visible: boolean
  stage3?: Stage3GlobalSynthesis
  originalQuestion?: string
  finalAnswer?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const hoveredPathId = ref<string | null>(null)

const paths = computed<Stage3Path[]>(() => {
  const list = props.stage3?.candidate_paths || []
  return [...list]
})

const selectedPathId = computed(() => {
  return props.stage3?.selected_path_id || props.stage3?.selected_path?.path_id || ''
})

const selectedPath = computed(() => {
  const list = paths.value
  if (!list.length) return null
  if (selectedPathId.value) {
    const hit = list.find((p) => p.path_id === selectedPathId.value)
    if (hit) return hit
  }
  if (props.stage3?.selected_path) return props.stage3.selected_path
  return list[0] || null
})

const activePath = computed(() => {
  const hover = hoveredPathId.value
  if (hover) {
    const hit = paths.value.find((p) => p.path_id === hover)
    if (hit) return hit
  }
  return selectedPath.value
})

function isSelectedPath(p: Stage3Path) {
  if (selectedPathId.value) return p.path_id === selectedPathId.value
  return p === selectedPath.value
}

function isHoveredPath(p: Stage3Path) {
  return hoveredPathId.value != null && p.path_id === hoveredPathId.value
}

function avgScore(p: Stage3Path) {
  const nums = [p.coverage_score, p.coherence_score, p.faithfulness_score].filter(
    (v): v is number => typeof v === 'number',
  )
  if (!nums.length) return '—'
  const value = nums.reduce((a, b) => a + b, 0) / nums.length
  return value.toFixed(2)
}

function scorePercent(v?: number) {
  if (typeof v !== 'number') return '—'
  return `${Math.round(v * 100)}%`
}

function formatDetailValue(value: unknown): DetailValue {
  if (value == null) return { kind: 'empty' }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'string') return item
        if (typeof item === 'number' || typeof item === 'boolean') return String(item)
        return JSON.stringify(item, null, 2)
      })
      .filter(Boolean)
    if (!items.length) return { kind: 'empty' }
    return { kind: 'list', items }
  }
  if (typeof value === 'object') {
    return { kind: 'text', text: JSON.stringify(value, null, 2) }
  }
  const text = String(value).trim()
  return text ? { kind: 'text', text } : { kind: 'empty' }
}

const activeDetailRows = computed(() => {
  const p = activePath.value
  if (!p) return [] as Array<{ key: string; value: DetailValue }>

  return [
    { key: 'path_id', value: formatDetailValue(p.path_id) },
    { key: 'title', value: formatDetailValue(p.title) },
    { key: 'core_thesis', value: formatDetailValue(p.core_thesis) },
    { key: 'node_path', value: formatDetailValue(p.node_path) },
    { key: 'cross_pillar_links', value: formatDetailValue(p.cross_pillar_links) },
    { key: 'tensions_or_gaps', value: formatDetailValue(p.tensions_or_gaps) },
    { key: 'resolution_logic', value: formatDetailValue(p.resolution_logic) },
    { key: 'coverage_score', value: formatDetailValue(scorePercent(p.coverage_score)) },
    { key: 'coherence_score', value: formatDetailValue(scorePercent(p.coherence_score)) },
    { key: 'faithfulness_score', value: formatDetailValue(scorePercent(p.faithfulness_score)) },
    { key: 'why_it_wins', value: formatDetailValue(p.why_it_wins) },
  ]
})

function closeModal() {
  hoveredPathId.value = null
  emit('close')
}
</script>

<template>
  <div v-if="visible" class="modal-mask" @click.self="closeModal">
    <div class="modal-card">
      <header class="modal-header">
        <div>
          <h3>ToT 显式树式推理界面</h3>
          <p class="subtitle">探索 → 评估 → 决策</p>
        </div>
        <button class="close-btn" type="button" @click="closeModal">✕</button>
      </header>

      <div class="modal-body">
        <section class="left-col">
          <div class="stage-tag">根节点 · original_question</div>
          <div class="root-card">
            <div class="root-badge">ROOT</div>
            <p>{{ originalQuestion || '-' }}</p>
          </div>
        </section>

        <section class="middle-col">
          <div class="stage-tag">三条 reasoning_paths 横向展开</div>
          <div class="tree-track">
            <div class="track-spine" />
            <article
              v-for="(p, index) in paths"
              :key="p.path_id || index"
              class="path-lane"
              :class="{
                selected: isSelectedPath(p),
                muted: !isSelectedPath(p),
                hovered: isHoveredPath(p),
              }"
              @mouseenter="hoveredPathId = p.path_id || null"
              @mouseleave="hoveredPathId = null"
            >
              <div class="lane-top">
                <div class="lane-headline">
                  <span class="lane-order">path {{ index + 1 }}</span>
                  <strong>{{ p.title || p.path_id || 'untitled path' }}</strong>
                </div>
                <div class="lane-score">{{ avgScore(p) }}</div>
              </div>

              <div class="branch-line" :class="{ selected: isSelectedPath(p) }">
                <span v-for="(node, nodeIndex) in p.node_path || []" :key="`${p.path_id}-${node}-${nodeIndex}`" class="node-chip">
                  {{ node }}
                </span>
              </div>

              <p class="thesis">{{ p.core_thesis || '-' }}</p>

              <div v-if="isSelectedPath(p) && p.why_it_wins" class="wins-box">
                <span class="wins-label">why_it_wins</span>
                <p>{{ p.why_it_wins }}</p>
              </div>

              <div class="lane-foot">
                <span v-if="p.coverage_score != null">coverage {{ scorePercent(p.coverage_score) }}</span>
                <span v-if="p.coherence_score != null">coherence {{ scorePercent(p.coherence_score) }}</span>
                <span v-if="p.faithfulness_score != null">faithfulness {{ scorePercent(p.faithfulness_score) }}</span>
              </div>
            </article>
          </div>
        </section>

        <section class="right-col">
          <div class="stage-tag">hover 详情 + 分数表</div>

          <div class="detail-card">
            <div class="detail-title">
              <span>当前路径详情</span>
              <span class="detail-pill">{{ activePath?.path_id || '—' }}</span>
            </div>

            <div v-if="activePath" class="detail-body">
              <div v-for="row in activeDetailRows" :key="row.key" class="detail-row">
                <span class="detail-key">{{ row.key }}</span>
                <template v-if="row.value.kind === 'empty'">
                  <span class="detail-value empty">—</span>
                </template>
                <template v-else-if="row.value.kind === 'text'">
                  <span class="detail-value text-block">{{ row.value.text }}</span>
                </template>
                <template v-else>
                  <ul class="detail-list">
                    <li v-for="(item, i) in row.value.items" :key="i">{{ item }}</li>
                  </ul>
                </template>
              </div>
            </div>
          </div>

          <div class="score-card">
            <div class="score-card-title">三条路径分数对照</div>
            <table class="score-table">
              <thead>
                <tr>
                  <th>path</th>
                  <th>coverage</th>
                  <th>coherence</th>
                  <th>faithfulness</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in paths"
                  :key="`score-${p.path_id}`"
                  :class="{ selected: isSelectedPath(p), hovered: isHoveredPath(p) }"
                >
                  <td>
                    <div class="path-name">
                      <b>{{ p.title || p.path_id }}</b>
                      <small>{{ p.path_id }}</small>
                    </div>
                  </td>
                  <td>{{ scorePercent(p.coverage_score) }}</td>
                  <td>{{ scorePercent(p.coherence_score) }}</td>
                  <td>{{ scorePercent(p.faithfulness_score) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top, rgba(15, 23, 42, 0.42), rgba(2, 6, 23, 0.68));
  z-index: 1200;
  display: grid;
  place-items: center;
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(1700px, 98vw);
  height: min(92vh, 1000px);
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.25);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.02rem;
  letter-spacing: 0.01em;
}

.subtitle {
  margin: 0.15rem 0 0;
  color: #64748b;
  font-size: 0.74rem;
}

.close-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  color: #334155;
}

.modal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(780px, 3fr) minmax(360px, 1.45fr);
  gap: 0.9rem;
  padding: 1rem;
}

.left-col,
.middle-col,
.right-col {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.stage-tag {
  display: inline-flex;
  align-self: flex-start;
  margin-bottom: 0.7rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
  background: rgba(226, 232, 240, 0.82);
  border-radius: 999px;
  padding: 0.22rem 0.6rem;
}

.root-card,
.detail-card,
.score-card {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}

.root-card {
  padding: 1rem;
  position: relative;
  overflow: hidden;
}

.root-card::after {
  content: '';
  position: absolute;
  inset: auto -30% -50% auto;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.16), transparent 70%);
  pointer-events: none;
}

.root-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 0.18rem 0.5rem;
  margin-bottom: 0.45rem;
}

.root-card p {
  margin: 0;
  color: #0f172a;
  font-size: 0.85rem;
  line-height: 1.55;
}

.middle-col {
  overflow: hidden;
}

.tree-track {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.2rem 0.1rem 0.2rem 1.1rem;
}

.track-spine {
  position: absolute;
  left: 0.44rem;
  top: 1rem;
  bottom: 1.1rem;
  width: 2px;
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.62), rgba(148, 163, 184, 0.08));
  border-radius: 999px;
}

.path-lane {
  position: relative;
  margin: 0 0 0.84rem;
  padding: 0.85rem 0.9rem 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.92));
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease, opacity 0.22s ease;
  overflow: hidden;
}

.path-lane::before {
  content: '';
  position: absolute;
  left: -1rem;
  top: 1.15rem;
  width: 1rem;
  height: 2px;
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.45), rgba(148, 163, 184, 0.85));
}

.path-lane::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 85% 0%, rgba(59, 130, 246, 0.08), transparent 40%);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.path-lane:hover {
  transform: translateX(4px);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
  border-color: rgba(96, 165, 250, 0.35);
}

.path-lane.hovered::after,
.path-lane.selected::after {
  opacity: 1;
}

.path-lane.muted {
  opacity: 0.58;
}

.path-lane.selected {
  border-color: rgba(245, 158, 11, 0.7);
  box-shadow: 0 18px 36px rgba(245, 158, 11, 0.18), 0 0 0 1px rgba(245, 158, 11, 0.15) inset;
}

.lane-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.9rem;
  margin-bottom: 0.55rem;
}

.lane-headline {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.lane-order {
  width: fit-content;
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.lane-headline strong {
  color: #0f172a;
  font-size: 0.84rem;
  line-height: 1.25;
}

.lane-score {
  flex-shrink: 0;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 800;
  color: #0f172a;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
}

.branch-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.36rem;
  margin-bottom: 0.55rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.34);
}

.branch-line.selected {
  border-bottom-style: solid;
  border-bottom-color: rgba(245, 158, 11, 0.45);
}

.node-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.16rem 0.48rem;
  font-size: 0.72rem;
  color: #334155;
  border: 1px solid rgba(203, 213, 225, 0.95);
  background: rgba(255, 255, 255, 0.92);
}

.path-lane.selected .node-chip {
  border-color: rgba(245, 158, 11, 0.55);
}

.path-lane.selected .node-chip {
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(253, 230, 138, 0.18), rgba(245, 158, 11, 0.12));
  background-size: 200% 100%;
  animation: chipFlow 1.2s linear infinite;
}

.path-lane:not(.selected) .node-chip {
  color: #64748b;
  background: rgba(248, 250, 252, 0.88);
  border-style: dashed;
}

.thesis {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.52;
  color: #334155;
}

.wins-box {
  margin-top: 0.65rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(255, 247, 237, 1), rgba(255, 251, 235, 1));
  border: 1px solid rgba(245, 158, 11, 0.28);
  box-shadow: 0 8px 16px rgba(245, 158, 11, 0.08);
}

.wins-label {
  display: inline-flex;
  margin-bottom: 0.28rem;
  font-size: 0.7rem;
  font-weight: 800;
  color: #9a3412;
}

.wins-box p {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.48;
  color: #7c2d12;
}

.lane-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;
  font-size: 0.71rem;
  color: #64748b;
}

.lane-foot span {
  padding: 0.16rem 0.42rem;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.95);
}

.path-lane.selected .lane-foot span {
  background: rgba(245, 158, 11, 0.1);
  color: #92400e;
}

.path-lane.selected .branch-line::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, #f59e0b, #fde68a, #f59e0b);
  background-size: 220% 100%;
  animation: flow 1.15s linear infinite;
}

.right-col {
  gap: 0.75rem;
}

.detail-card,
.score-card {
  padding: 0.82rem 0.86rem;
}

.detail-title,
.score-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.65rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: #0f172a;
}

.detail-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.68rem;
}

.detail-body {
  max-height: 46vh;
  overflow: auto;
  padding-right: 0.15rem;
}

.detail-row {
  display: grid;
  grid-template-columns: 94px 1fr;
  gap: 0.55rem;
  padding: 0.35rem 0;
  border-bottom: 1px dashed rgba(203, 213, 225, 0.58);
}

.detail-key {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.detail-value {
  font-size: 0.76rem;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-value.empty {
  color: #94a3b8;
}

.text-block {
  line-height: 1.5;
}

.detail-list {
  margin: 0;
  padding-left: 1.05rem;
  color: #0f172a;
}

.detail-list li {
  margin-bottom: 0.2rem;
}

.score-table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 12px;
}

.score-table thead th {
  font-size: 0.72rem;
  text-align: left;
  color: #475569;
  padding: 0.55rem 0.45rem;
  background: #f8fafc;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.score-table tbody td {
  padding: 0.6rem 0.45rem;
  font-size: 0.74rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  color: #0f172a;
  vertical-align: top;
}

.score-table tbody tr {
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.score-table tbody tr:hover {
  background: rgba(248, 250, 252, 0.95);
}

.score-table tbody tr.selected {
  background: rgba(245, 158, 11, 0.08);
}

.score-table tbody tr.hovered {
  background: rgba(37, 99, 235, 0.06);
}

.path-name {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.path-name b {
  font-size: 0.74rem;
}

.path-name small {
  color: #64748b;
  font-size: 0.67rem;
}

.empty {
  color: #64748b;
  font-size: 0.8rem;
}

@keyframes flow {
  to { background-position: -220% 0; }
}

@keyframes chipFlow {
  to { background-position: -200% 0; }
}
</style>
