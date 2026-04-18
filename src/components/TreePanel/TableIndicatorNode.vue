<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TableStructuredTask, SubIndicator } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import type { OperatorPillarResult } from '../../types/operator'
import EvidenceList from './EvidenceList.vue'

const props = defineProps<{
  task: TableStructuredTask
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

/** 默认折叠，可手动展开；折叠时显示表格缩略图 */
const collapsed = ref(true)

const key = computed<IndicatorKey>(() => ({
  pillarIndex: props.pillarIndex,
  pillarName: props.pillarName,
  indicatorName: props.task.indicator_name,
  indicatorType: 'table',
  indicatorIndex: props.indicatorIndex,
}))

const tableRefPrefix = computed(() => `table:${props.task.indicator_name}`)

const operatorCausalItems = computed(() => {
  const items = props.operatorItem?.operators?.causal_anchoring || []
  return items.filter((x) => x.indicator_ref?.startsWith(tableRefPrefix.value))
})

const operatorAlignmentItems = computed(() => {
  const items = props.operatorItem?.operators?.entity_alignment || []
  return items.filter((x) => x.indicator_ref?.startsWith(tableRefPrefix.value))
})

const operatorConflictItems = computed(() => {
  const items = props.operatorItem?.operators?.conflict_audit?.conflicts || []
  return items.filter((c) =>
    (c.involved_indicator_refs || []).some((ref) => ref?.startsWith(tableRefPrefix.value))
  )
})

const hasOperatorData = computed(() => {
  return !!(
    operatorCausalItems.value.length ||
    operatorAlignmentItems.value.length ||
    operatorConflictItems.value.length
  )
})

watch(
  () => props.indicatorToExpand,
  (toExpand) => {
    if (toExpand && toExpand.pillarIndex === props.pillarIndex &&
        toExpand.indicatorType === 'table' &&
        toExpand.indicatorIndex === props.indicatorIndex) {
      collapsed.value = false
    }
  },
  { immediate: true }
)

const tableColumns = computed(() => {
  if (!props.task.sub_indicators.length) return []

  const firstSub = props.task.sub_indicators[0]
  if (!firstSub || !firstSub.values) return []

  const cols = Object.keys(firstSub.values)

  return cols.sort((a, b) => {
    // Item 永远第一
    if (a === 'Item') return -1
    if (b === 'Item') return 1

    const aNum = /^\d+$/.test(a)
    const bNum = /^\d+$/.test(b)

    // 文字在数字前
    if (!aNum && bNum) return -1
    if (aNum && !bNum) return 1

    // 数字列按降序
    if (aNum && bNum) {
      return Number(b) - Number(a)
    }

    // 其他文字列保持原顺序（稳定排序）
    return 0
  })
})

function onMouseEnter() {
  emit('hover', key.value)
}

function onMouseLeave() {
  emit('unhover')
}

function getCellValue(sub: SubIndicator, col: string): string {
  return sub.values[col] ?? '-'
}
</script>

<template>
  <div
    class="indicator-node table"
    :class="{ hovered: isHovered, collapsed }"
    :data-indicator-key="JSON.stringify(key)"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="indicator-header" @click="collapsed = !collapsed">
      <span class="collapse-icon">{{ collapsed ? '▶' : '▼' }}</span>
      <span class="indicator-name">{{ task.indicator_name }}</span>
      <span class="badge table-badge">表格</span>
    </div>
    <div v-if="!collapsed" class="indicator-body">
      <div v-if="hasOperatorData" class="operator-box">
        <div class="operator-title">算子关系</div>
        <div v-if="operatorAlignmentItems.length" class="operator-row">
          <span class="op-tag">实体对齐</span>
          <span>
            {{ operatorAlignmentItems.slice(0, 2).map((a) => `${a.query_domain || '-'}(${a.alignment_relation || '-'})`).join(' ; ') }}
          </span>
        </div>
        <div v-if="operatorCausalItems.length" class="operator-row">
          <span class="op-tag">因果锚定</span>
          <span>关联行数：{{ operatorCausalItems.length }}</span>
        </div>
        <div v-if="operatorConflictItems.length" class="operator-row conflict">
          <span class="op-tag">冲突审计</span>
          <span>{{ operatorConflictItems[0].description || '存在冲突' }}</span>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th v-for="col in tableColumns" :key="col" class="table-header">
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(sub, i) in task.sub_indicators"
              :key="i"
              class="table-row"
            >
              <td
                v-for="col in tableColumns"
                :key="col"
                class="table-cell"
              >
                {{ getCellValue(sub, col) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details
        v-for="(sub, i) in task.sub_indicators"
        :key="i"
        class="sub-evidence"
      >
        <summary>{{ sub.sub_indicator_name }} - 证据</summary>
        <EvidenceList :evidence="sub.retrieved_evidence" />
      </details>
    </div>
    <!-- 折叠时显示缩略图 -->
    <div v-else class="collapsed-thumb">
      <span class="thumb-icon">▦</span>
      <span class="thumb-label">表格</span>
    </div>
  </div>
</template>

<style scoped>
.indicator-node {
  margin: 0.25rem 0;
  border-radius: 4px;
  cursor: pointer;
}

.indicator-node:hover {
  background: var(--color-bg-hover);
}

.indicator-node.hovered {
  background: var(--color-accent-light);
  border-left: 3px solid var(--color-accent);
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

.badge.table-badge {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  background: var(--color-info-light, #e3f2fd);
  color: var(--color-info, #1976d2);
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

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 0.75rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.table-header {
  text-align: left;
  padding: 0.4rem 0.6rem;
  background: var(--color-bg-muted);
  border-bottom: 2px solid var(--color-border);
}

.table-row {
  border-bottom: 1px solid var(--color-border);
}

.table-cell {
  padding: 0.35rem 0.6rem;
}

.sub-evidence {
  margin-top: 0.5rem;
  font-size: 0.85rem;
}

.sub-evidence summary {
  cursor: pointer;
  color: var(--color-text-muted);
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

.collapsed-thumb {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem 0.35rem 1.8rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.thumb-icon {
  font-size: 1rem;
}

.thumb-label {
  font-size: 0.7rem;
}
</style>
