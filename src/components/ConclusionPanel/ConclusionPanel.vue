<script setup lang="ts">
import { ref } from 'vue'
import type { FinalConclusion } from '../../types/conclusion'
import FinalAnswer from './FinalAnswer.vue'
import PillarSection from './PillarSection.vue'
import Stage3GraphModal from './Stage3GraphModal.vue'

defineProps<{
  data: FinalConclusion | null
  isAnnotationHighlighted: (pillarIndex: number, id: string) => boolean
}>()

const emit = defineEmits<{
  annotationHover: [pillarIndex: number, indicatorIds: string[]]
  annotationUnhover: []
  annotationClick: [pillarIndex: number, indicatorIds: string[]]
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

const stage3ModalVisible = ref(false)

function openStage3Modal() {
  stage3ModalVisible.value = true
}

function closeStage3Modal() {
  stage3ModalVisible.value = false
}
</script>

<template>
  <div class="conclusion-panel">
    <template v-if="stage3ModalVisible">
      <Stage3GraphModal
        :visible="true"
        :stage3="data?.stage3_global_synthesis"
        :original-question="data?.original_question"
        :final-answer="data?.final_answer"
        @close="closeStage3Modal"
      />
    </template>
    <template v-else>
      <div class="conclusion-header">
        <h2 class="conclusion-title">结论展示</h2>
      </div>
      <div v-if="data" class="conclusion-content">
        <FinalAnswer
          :text="data.final_answer"
          :can-open-tree="!!data.stage3_global_synthesis?.tree_graph"
          @open-tree="openStage3Modal"
        />
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
</style>
