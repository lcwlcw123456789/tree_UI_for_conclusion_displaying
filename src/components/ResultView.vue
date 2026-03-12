<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDataLoader } from '../composables/useDataLoader'
import { useIndicatorLink } from '../composables/useIndicatorLink'
import type { IndicatorKey } from '../composables/useIndicatorLink'
import TreePanel from './TreePanel/TreePanel.vue'
import ConclusionPanel from './ConclusionPanel/ConclusionPanel.vue'

const {
  intermediateData,
  conclusionData,
  loading,
  error,
  loadData,
  isReady,
} = useDataLoader()

const {
  hoverOnConclusion,
  hoverOffConclusion,
  hoverOnTree,
  hoverOffTree,
  findIndicatorInIntermediate,
  isAnnotationHighlighted,
  isTreeIndicatorHovered,
} = useIndicatorLink(intermediateData, conclusionData)

/** 点击文本时展开的 indicator，树形结构会响应 */
const indicatorToExpand = ref<IndicatorKey | null>(null)

onMounted(() => {
  loadData()
})

function handleAnnotationHover(pillarIndex: number, indicatorIds: string[]) {
  hoverOnConclusion(pillarIndex, indicatorIds)
}

function handleAnnotationUnhover() {
  hoverOffConclusion()
}

function handleAnnotationClick(pillarIndex: number, indicatorIds: string[]) {
  const concl = conclusionData.value
  if (!concl || pillarIndex >= concl.pillar_analysis.length) return

  const analysis = concl.pillar_analysis[pillarIndex]
  if (!analysis) return

  for (const id of indicatorIds) {
    const name = analysis.indicator_lookup[id]
    if (!name) continue

    const key = findIndicatorInIntermediate(analysis.pillar, name)
    if (key) {
      indicatorToExpand.value = key
      return
    }
  }
}

function handleTreeIndicatorHover(key: IndicatorKey) {
  hoverOnTree(key)
}

function handleTreeIndicatorUnhover() {
  hoverOffTree()
}
</script>

<template>
  <div class="result-view">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载数据中...</p>
    </div>
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>
    <template v-else-if="isReady">
      <aside class="tree-aside">
        <TreePanel
          :data="intermediateData!"
          :indicator-to-expand="indicatorToExpand"
          :is-indicator-hovered="isTreeIndicatorHovered"
          @indicator-hover="handleTreeIndicatorHover"
          @indicator-unhover="handleTreeIndicatorUnhover"
        />
      </aside>
      <main class="conclusion-main">
        <ConclusionPanel
          :data="conclusionData!"
          :is-annotation-highlighted="isAnnotationHighlighted"
          @annotation-hover="handleAnnotationHover"
          @annotation-unhover="handleAnnotationUnhover"
          @annotation-click="handleAnnotationClick"
        />
      </main>
    </template>
  </div>
</template>

<style scoped>
.result-view {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  background: var(--color-bg);
}

.tree-aside {
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  min-width: 0;
  overflow: hidden;
}

.conclusion-main {
  min-width: 0;
  overflow: hidden;
}

.loading-state,
.error-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: 1rem;
  color: var(--color-text-muted);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
