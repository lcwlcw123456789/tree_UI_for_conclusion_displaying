<script setup lang="ts">
import type { IntermediateResult } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import TreeNode from './TreeNode.vue'

defineProps<{
  data: IntermediateResult | null
  indicatorToExpand: IndicatorKey | null
  isIndicatorHovered: (key: IndicatorKey) => boolean
}>()

const emit = defineEmits<{
  indicatorHover: [key: IndicatorKey]
  indicatorUnhover: []
}>()
</script>

<template>
  <div class="tree-panel">
    <div class="tree-header">
      <h2 class="tree-title">推理结构</h2>
      <p v-if="data" class="tree-query">{{ data.query }}</p>
    </div>
    <div v-if="data" class="tree-content">
      <div class="query-root">
        <div class="query-node">
          <span class="query-label">原始问题</span>
          <span class="query-text">{{ data.query }}</span>
        </div>
        <div class="pillars-list">
          <TreeNode
            v-for="(pillar, i) in data.results"
            :key="i"
            :pillar="pillar"
            :pillar-index="i"
            :indicator-to-expand="indicatorToExpand"
            :is-indicator-hovered="isIndicatorHovered"
            @indicator-hover="(k) => emit('indicatorHover', k)"
            @indicator-unhover="emit('indicatorUnhover')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tree-header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tree-title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.tree-query {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.query-root {
  margin: 0;
}

.query-node {
  padding: 0.6rem 0.75rem;
  background: var(--color-bg-muted);
  border-radius: 6px;
  margin-bottom: 1rem;
}

.query-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 0.25rem;
}

.query-text {
  font-size: 0.95rem;
  font-weight: 500;
}

.pillars-list {
  margin: 0;
}
</style>
