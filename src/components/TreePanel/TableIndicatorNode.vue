<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TableStructuredTask, SubIndicator } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import EvidenceList from './EvidenceList.vue'

const props = defineProps<{
  task: TableStructuredTask
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

/** 默认折叠，可手动展开；折叠时显示表格缩略图 */
const collapsed = ref(true)

const key = computed<IndicatorKey>(() => ({
  pillarIndex: props.pillarIndex,
  pillarName: props.pillarName,
  indicatorName: props.task.indicator_name,
  indicatorType: 'table',
  indicatorIndex: props.indicatorIndex,
}))

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
  const cols = new Set<string>()
  for (const sub of props.task.sub_indicators) {
    Object.keys(sub.values).forEach((k) => cols.add(k))
  }
  return Array.from(cols)
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
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="indicator-header" @click="collapsed = !collapsed">
      <span class="collapse-icon">{{ collapsed ? '▶' : '▼' }}</span>
      <span class="indicator-name">{{ task.indicator_name }}</span>
      <span class="badge table-badge">表格</span>
    </div>
    <div v-if="!collapsed" class="indicator-body">
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
