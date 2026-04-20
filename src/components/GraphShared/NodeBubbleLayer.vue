<script setup lang="ts">
type NodeBubble = {
  id: string
  label: string
  score?: number | null
  x: number
  y: number
  r: number
  active?: boolean
  hovered?: boolean
  path?: boolean
  final?: boolean
  candidate?: boolean
}

const props = defineProps<{ nodes: NodeBubble[] }>()
const emit = defineEmits<{
  nodeClick: [id: string]
  nodeEnter: [id: string]
  nodeLeave: [id: string]
}>()

function scoreText(v: number | null | undefined) {
  if (typeof v !== 'number') return ''
  return v.toFixed(1)
}
</script>

<template>
  <div class="node-layer">
    <button
      v-for="node in props.nodes"
      :key="node.id"
      class="graph-node indicator-card"
      :class="{ active: node.active, hovered: node.hovered, path: node.path, final: node.final, candidate: node.candidate }"
      type="button"
      :title="node.label"
      :style="{ left: `${node.x}px`, top: `${node.y}px`, width: `${Math.round(node.r * 2)}px`, height: `${Math.round(node.r * 2)}px` }"
      @click.stop="emit('nodeClick', node.id)"
      @mouseenter="emit('nodeEnter', node.id)"
      @mouseleave="emit('nodeLeave', node.id)"
    >
      <span class="node-kicker">{{ node.id }}</span>
      <span v-if="node.score != null" class="score">{{ scoreText(node.score) }}</span>
    </button>
  </div>
</template>

<style scoped>
.node-layer {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
}
.graph-node {
  border: 1px solid #74a9cf;
  background: #fff7fb;
  color: #034e7b;
  box-shadow: 0 8px 20px rgba(3,78,123,.12);
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.indicator-card {
  position: absolute;
  border-radius: 999px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.06rem;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  padding: 0.16rem;
}
.node-kicker {
  font-size: 0.5rem;
  line-height: 1;
  font-weight: 700;
  white-space: nowrap;
}
.score {
  font-size: 0.5rem;
  line-height: 1;
  font-weight: 700;
}
.graph-node.active {
  border-color: #0570b0;
  box-shadow: 0 0 0 1px rgba(5,112,176,.2), 0 12px 24px rgba(5,112,176,.22);
}
.graph-node.hovered {
  transform: translate(-50%, -50%) scale(1.05);
}
.graph-node.path.final {
  border-color: #034e7b;
}
.graph-node.path.candidate {
  border-color: #3690c0;
}
</style>
