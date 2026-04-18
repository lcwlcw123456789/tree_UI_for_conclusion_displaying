<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PillarResult } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import type { OperatorPillarResult } from '../../types/operator'
import IndicatorNode from './IndicatorNode.vue'
import TableIndicatorNode from './TableIndicatorNode.vue'

const props = defineProps<{
  pillar: PillarResult
  pillarIndex: number
  operatorItem?: OperatorPillarResult | null
  indicatorToExpand: IndicatorKey | null
  isIndicatorHovered: (key: IndicatorKey) => boolean
}>()

const emit = defineEmits<{
  indicatorHover: [key: IndicatorKey]
  indicatorUnhover: []
}>()

const expanded = ref(false)

watch(
  () => props.indicatorToExpand,
  (key) => {
    if (key && key.pillarIndex === props.pillarIndex) {
      expanded.value = true
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="tree-node pillar">
    <div class="pillar-header" @click="expanded = !expanded">
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="pillar-name">{{ pillar.pillar }}</span>
    </div>
    <div v-if="expanded" class="pillar-children expanded">
      <IndicatorNode
        v-for="(task, i) in pillar.narrative_tasks"
        :key="'n-' + i"
        :task="task"
        :pillar-index="pillarIndex"
        :indicator-index="i"
        :pillar-name="pillar.pillar"
        :operator-item="operatorItem"
        :indicator-to-expand="indicatorToExpand"
        :is-hovered="isIndicatorHovered({
          pillarIndex,
          pillarName: pillar.pillar,
          indicatorName: task.indicator_name,
          indicatorType: 'narrative',
          indicatorIndex: i,
        })"
        @hover="(k) => emit('indicatorHover', k)"
        @unhover="emit('indicatorUnhover')"
      />
      <TableIndicatorNode
        v-for="(task, i) in pillar.table_structured_tasks"
        :key="'t-' + i"
        :task="task"
        :pillar-index="pillarIndex"
        :indicator-index="i"
        :pillar-name="pillar.pillar"
        :operator-item="operatorItem"
        :indicator-to-expand="indicatorToExpand"
        :is-hovered="isIndicatorHovered({
          pillarIndex,
          pillarName: pillar.pillar,
          indicatorName: task.indicator_name,
          indicatorType: 'table',
          indicatorIndex: i,
        })"
        @hover="(k) => emit('indicatorHover', k)"
        @unhover="emit('indicatorUnhover')"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node.pillar {
  margin: 0.5rem 0;
}

.pillar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.pillar-header:hover {
  background: var(--color-bg-hover);
  transform: translateX(2px);
}

.expand-icon {
  font-size: 0.7rem;
}

.pillar-name {
  font-size: 0.95rem;
}

.pillar-children {
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 2px solid var(--color-border);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
