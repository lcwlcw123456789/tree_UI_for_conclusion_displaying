<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NarrativeTask } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import type { OperatorPillarResult } from '../../types/operator'
import EvidenceList from './EvidenceList.vue'

const props = defineProps<{
  task: NarrativeTask
  pillarIndex: number
  indicatorIndex: number
  pillarName: string
  operatorItem?: OperatorPillarResult | null
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

const indicatorRef = computed(() => `narrative:${props.task.indicator_name}`)

const operatorCausal = computed(() => {
  const items = props.operatorItem?.operators?.causal_anchoring || []
  return items.find((x) => x.indicator_ref === indicatorRef.value)
})

const operatorAlignment = computed(() => {
  const items = props.operatorItem?.operators?.entity_alignment || []
  return items.find((x) => x.indicator_ref === indicatorRef.value)
})

const operatorRelations = computed(() => {
  const items = props.operatorItem?.operators?.narrative_relations || []
  return items.filter((x) => x.indicator_ref === indicatorRef.value)
})

const operatorConflicts = computed(() => {
  const items = props.operatorItem?.operators?.conflict_audit?.conflicts || []
  return items.filter((c) => (c.involved_indicator_refs || []).includes(indicatorRef.value))
})

const hasOperatorData = computed(() => {
  return !!(
    operatorCausal.value ||
    operatorAlignment.value ||
    operatorRelations.value.length ||
    operatorConflicts.value.length
  )
})

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

      <div v-if="hasOperatorData" class="operator-box">
        <div class="operator-title">算子关系</div>
        <div v-if="operatorAlignment" class="operator-row">
          <span class="op-tag">实体对齐</span>
          <span>
            域：{{ operatorAlignment.query_domain || '-' }} / {{ operatorAlignment.alignment_relation || '-' }}
            <span v-if="operatorAlignment.confidence !== undefined">
              / conf={{ operatorAlignment.confidence }}
            </span>
          </span>
        </div>
        <div v-if="operatorCausal" class="operator-row">
          <span class="op-tag">因果锚定</span>
          <span>{{ operatorCausal.trend_or_claim_sentence || '—' }}</span>
        </div>
        <div v-if="operatorRelations.length" class="operator-row">
          <span class="op-tag">叙述关系</span>
          <span>{{ operatorRelations[0].relation_type || '-' }} · {{ operatorRelations[0].connective || '-' }}</span>
        </div>
        <div v-if="operatorConflicts.length" class="operator-row conflict">
          <span class="op-tag">冲突审计</span>
          <span>{{ operatorConflicts[0].description || '存在冲突' }}</span>
        </div>
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

.operator-box {
  margin-bottom: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #f8fafc;
  padding: 0.4rem 0.5rem;
}

.operator-title {
  font-size: 0.75rem;
  color: var(--color-primary);
  margin-bottom: 0.3rem;
  font-weight: 600;
}

.operator-row {
  display: flex;
  gap: 0.35rem;
  align-items: flex-start;
  font-size: 0.74rem;
  color: var(--color-text-muted);
  margin-bottom: 0.2rem;
}

.operator-row:last-child {
  margin-bottom: 0;
}

.operator-row.conflict {
  color: #b45309;
}

.op-tag {
  font-size: 0.68rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.02rem 0.35rem;
  white-space: nowrap;
  background: #fff;
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
