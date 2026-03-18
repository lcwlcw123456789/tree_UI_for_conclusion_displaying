<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NarrativeTask } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import EvidenceList from './EvidenceList.vue'

const props = defineProps<{
  task: NarrativeTask
  pillarIndex: number
  indicatorIndex: number
  pillarName: string
  indicatorToExpand: IndicatorKey | null
  isHovered: boolean
}>()

const emit = defineEmits<{
  hover: [key: IndicatorKey]
  unhover: []
}>()

/** 默认折叠，可手动展开；折叠时显示文本缩略图 */
const collapsed = ref(true)

const key = computed<IndicatorKey>(() => ({
  pillarIndex: props.pillarIndex,
  pillarName: props.pillarName,
  indicatorName: props.task.indicator_name,
  indicatorType: 'narrative',
  indicatorIndex: props.indicatorIndex,
}))

watch(
  () => props.indicatorToExpand,
  (toExpand) => {
    if (toExpand && toExpand.pillarIndex === props.pillarIndex &&
        toExpand.indicatorType === 'narrative' &&
        toExpand.indicatorIndex === props.indicatorIndex) {
      collapsed.value = false
    }
  },
  { immediate: true }
)

function onMouseEnter() {
  emit('hover', key.value)
}

function onMouseLeave() {
  emit('unhover')
}
</script>

<template>
  <div
    class="indicator-node narrative"
    :class="{ hovered: isHovered, collapsed }"
    :data-indicator-key="JSON.stringify(key)"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="indicator-header" @click="collapsed = !collapsed">
      <span class="collapse-icon">{{ collapsed ? '▶' : '▼' }}</span>
      <span class="indicator-name">{{ task.indicator_name }}</span>
      <span v-if="task.is_quantitative" class="badge quantitative">定量</span>
      <span class="type-thumb" title="文本">文</span>
    </div>
    <div v-if="!collapsed" class="indicator-body">
      <div v-if="task.factoid_question" class="factoid">
        <span class="label">问题：</span>{{ task.factoid_question }}
      </div>
      <EvidenceList :evidence="task.retrieved_evidence" />
    </div>
    <!-- 折叠时显示缩略图 -->
    <div v-else class="collapsed-thumb">
      <span class="thumb-icon">Aa</span>
      <span class="thumb-label">文本</span>
    </div>
  </div>
</template>

<style scoped>
.indicator-node {
  margin: 0.25rem 0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.indicator-node:hover {
  background: var(--color-bg-hover);
  transform: translateX(2px);
}

.indicator-node.hovered {
  background: var(--color-accent-light);
  border-left: 3px solid var(--color-accent);
  transform: scale(1.02);
}

.indicator-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
}

.collapse-icon {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.indicator-name {
  flex: 1;
  font-size: 0.9rem;
}

.badge.quantitative {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  background: var(--color-accent-light);
  color: var(--color-accent);
  border-radius: 3px;
}

.type-thumb {
  font-size: 0.65rem;
  padding: 0.1rem 0.3rem;
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  border-radius: 3px;
}

.indicator-body {
  padding: 0 0.5rem 0.5rem 1.5rem;
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

.factoid {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
}

.label {
  font-weight: 500;
}

.collapsed-thumb {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem 0.35rem 1.8rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.thumb-icon {
  font-family: Georgia, serif;
  font-size: 0.85rem;
}

.thumb-label {
  font-size: 0.7rem;
}
</style>
