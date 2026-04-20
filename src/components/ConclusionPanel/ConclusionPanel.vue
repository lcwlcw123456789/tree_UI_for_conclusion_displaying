<script setup lang="ts">
import { computed } from 'vue'
import type { FinalConclusion } from '../../types/conclusion'
import type { IntermediateResult } from '../../types/intermediate'
import type { OperatorView } from '../../types/operator'
import FinalAnswer from './FinalAnswer.vue'
import PillarSection from './PillarSection.vue'
import Stage3GraphModal from './Stage3GraphModal.vue'
import OperatorGraphModal from '../TreePanel/OperatorGraphModal.vue'

type GraphTab = 'operator' | 'stage3'

const props = defineProps<{
  data: FinalConclusion | null
  intermediate: IntermediateResult | null
  operatorView: OperatorView | null
  graphWorkspaceVisible: boolean
  activeGraphTab: GraphTab
  isAnnotationHighlighted: (pillarIndex: number, id: string) => boolean
}>()

const emit = defineEmits<{
  annotationHover: [pillarIndex: number, indicatorIds: string[]]
  annotationUnhover: []
  annotationClick: [pillarIndex: number, indicatorIds: string[]]
  openGraphWorkspace: [tab: GraphTab]
  closeGraphWorkspace: []
  switchGraphTab: [tab: GraphTab]
}>()

function onAnnotationHover(pillarIndex: number, indicatorIds: string[]) {
  emit('annotationHover', pillarIndex, indicatorIds)
}

function onAnnotationUnhover() {
  emit('annotationUnhover')
}

function onAnnotationClick(pillarIndex: number, indicatorIds: string[]) {
  emit('annotationClick', pillarIndex, indicatorIds)
}

function openStage3Modal() {
  // 仅保留点击推理结构（TreePanel）进入的入口
}

function closeWorkspace() {
  emit('closeGraphWorkspace')
}

const canOpenGraph = computed(() => !!props.operatorView?.operator_results?.length || !!props.data?.stage3_global_synthesis?.tree_graph)
</script>

<template>
  <div class="conclusion-panel">
    <template v-if="graphWorkspaceVisible">
      <div class="workspace-shell">
        <div class="workspace-tabs">
          <button type="button" class="tab-btn" :class="{ active: activeGraphTab === 'operator' }" @click="emit('switchGraphTab', 'operator')">Operator 视图</button>
          <button type="button" class="tab-btn" :class="{ active: activeGraphTab === 'stage3' }" @click="emit('switchGraphTab', 'stage3')">Stage3 视图</button>
        </div>

        <OperatorGraphModal
          v-if="activeGraphTab === 'operator'"
          :visible="true"
          :intermediate="intermediate"
          :operator-view="operatorView"
          @close="closeWorkspace"
        />

        <Stage3GraphModal
          v-else
          :visible="true"
          :stage3="data?.stage3_global_synthesis"
          :original-question="data?.original_question"
          :final-answer="data?.final_answer"
          @close="closeWorkspace"
        />
      </div>
    </template>
    <template v-else>
      <div class="conclusion-header">
        <h2 class="conclusion-title">结论展示</h2>
      </div>
      <div v-if="data" class="conclusion-content">
        <FinalAnswer :text="data.final_answer" />
        <PillarSection
          v-for="(analysis, i) in data.pillar_analysis"
          :key="i"
          :analysis="analysis"
          :pillar-index="i"
          :is-annotation-highlighted="isAnnotationHighlighted"
          @annotation-hover="(ids) => onAnnotationHover(i, ids)"
          @annotation-unhover="onAnnotationUnhover"
          @annotation-click="(ids) => onAnnotationClick(i, ids)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.conclusion-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.conclusion-header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.conclusion-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.conclusion-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.workspace-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff7fb;
}

.workspace-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border-bottom: 1px solid #d0d1e6;
  background: #ece7f2;
}

.tab-btn {
  border: 1px solid #a6bddb;
  background: #fff7fb;
  color: #034e7b;
  padding: 0.38rem 0.72rem;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}

.tab-btn.active {
  background: #0570b0;
  border-color: #0570b0;
  color: #fff;
}
</style>
