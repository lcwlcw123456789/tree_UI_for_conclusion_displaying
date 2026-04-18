<script setup lang="ts">
import { computed, watch, nextTick } from 'vue'
import { ref } from 'vue'
import type { IntermediateResult } from '../../types/intermediate'
import type { IndicatorKey } from '../../composables/useIndicatorLink'
import type { OperatorView, OperatorPillarResult } from '../../types/operator'
import TreeNode from './TreeNode.vue'
import OperatorGraphModal from './OperatorGraphModal.vue'

const props = defineProps<{
  data: IntermediateResult | null
  operatorView?: OperatorView | null
  indicatorToExpand: IndicatorKey | null
  isIndicatorHovered: (key: IndicatorKey) => boolean
}>()

const emit = defineEmits<{
  indicatorHover: [key: IndicatorKey]
  indicatorUnhover: []
}>()

const showOperatorGraph = ref(false)

function openOperatorGraph() {
  if (props.operatorView?.operator_results?.length) {
    showOperatorGraph.value = true
  }
}

function closeOperatorGraph() {
  showOperatorGraph.value = false
}

watch(
  () => props.indicatorToExpand,
  async (newKey) => {
    if (newKey) {
      await nextTick()
      const selector = `[data-indicator-key='${JSON.stringify(newKey)}']`
      const element = document.querySelector(selector) as HTMLElement
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }
)

const operatorByPillar = computed(() => {
  const map = new Map<string, OperatorPillarResult>()
  for (const item of props.operatorView?.operator_results || []) {
    if (item?.pillar) {
      map.set(item.pillar, item)
    }
  }
  return map
})
</script>

<template>
  <div class="tree-panel">
    <div class="tree-header">
      <button
        type="button"
        class="tree-title-btn"
        :disabled="!operatorView?.operator_results?.length"
        @click="openOperatorGraph"
        :title="operatorView?.operator_results?.length ? '点击查看算子关系图' : '暂无算子文件数据'"
      >
        推理结构
      </button>
      <p v-if="data" class="tree-query">{{ data.query }}</p>
      <p v-if="operatorView?.operator_results?.length" class="operator-hint">
        已加载算子视图：{{ operatorView.operator_results.length }} 个 pillar
      </p>
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
            :operator-item="operatorByPillar.get(pillar.pillar) || null"
            :indicator-to-expand="indicatorToExpand"
            :is-indicator-hovered="isIndicatorHovered"
            @indicator-hover="(k) => emit('indicatorHover', k)"
            @indicator-unhover="emit('indicatorUnhover')"
          />
        </div>
      </div>
    </div>

    <OperatorGraphModal
      :visible="showOperatorGraph"
      :intermediate="data"
      :operator-view="operatorView || null"
      @close="closeOperatorGraph"
    />
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

.tree-title-btn {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-primary);
  cursor: pointer;
}

.tree-title-btn:hover:not(:disabled) {
  color: var(--color-accent);
  text-decoration: underline;
}

.tree-title-btn:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.tree-query {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.operator-hint {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  color: var(--color-primary);
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
