<script setup lang="ts">
import { ref } from 'vue'
import type { IntermediateResult } from '../types/intermediate'
import type { FinalConclusion } from '../types/conclusion'
import { useIndicatorLink } from '../composables/useIndicatorLink'
import type { IndicatorKey } from '../composables/useIndicatorLink'
import TreePanel from './TreePanel/TreePanel.vue'
import ConclusionPanel from './ConclusionPanel/ConclusionPanel.vue'

const props = defineProps<{
  intermediate: IntermediateResult
  conclusion: FinalConclusion
}>()

const intermediateData = ref<IntermediateResult | null>(props.intermediate)
const conclusionData = ref<FinalConclusion | null>(props.conclusion)

const {
  hoverOnConclusion,
  hoverOffConclusion,
  hoverOnTree,
  hoverOffTree,
  findIndicatorInIntermediate,
  isAnnotationHighlighted,
  isTreeIndicatorHovered,
} = useIndicatorLink(intermediateData, conclusionData)

const indicatorToExpand = ref<IndicatorKey | null>(null)

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
    <aside class="tree-aside">
      <TreePanel
        :data="intermediateData"
        :indicator-to-expand="indicatorToExpand"
        :is-indicator-hovered="isTreeIndicatorHovered"
        @indicator-hover="handleTreeIndicatorHover"
        @indicator-unhover="handleTreeIndicatorUnhover"
      />
    </aside>
    <main class="conclusion-main">
      <ConclusionPanel
        :data="conclusionData"
        :is-annotation-highlighted="isAnnotationHighlighted"
        @annotation-hover="handleAnnotationHover"
        @annotation-unhover="handleAnnotationUnhover"
        @annotation-click="handleAnnotationClick"
      />
    </main>
  </div>
</template>

<style scoped>
.result-view {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100%;
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
</style>
