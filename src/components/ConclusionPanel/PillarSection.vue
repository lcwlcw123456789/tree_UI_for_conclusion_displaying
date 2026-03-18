<script setup lang="ts">
import type { PillarAnalysis } from '../../types/conclusion'
import AnnotatedParagraph from './AnnotatedParagraph.vue'

defineProps<{
  analysis: PillarAnalysis
  pillarIndex: number
  isAnnotationHighlighted: (pillarIndex: number, id: string) => boolean
}>()

const emit = defineEmits<{
  annotationHover: [indicatorIds: string[]]
  annotationUnhover: []
  annotationClick: [indicatorIds: string[]]
}>()
</script>

<template>
  <section class="pillar-section">
    <h3 class="pillar-title">{{ analysis.pillar }}</h3>
    <AnnotatedParagraph
      :paragraph="analysis.paragraph"
      :analysis="analysis"
      :pillar-index="pillarIndex"
      :is-annotation-highlighted="isAnnotationHighlighted"
      @annotation-hover="(ids) => emit('annotationHover', ids)"
      @annotation-unhover="emit('annotationUnhover')"
      @annotation-click="(ids) => emit('annotationClick', ids)"
    />
  </section>
</template>

<style scoped>
.pillar-section {
  margin-bottom: 1.5rem;
  animation: fadeInUp 0.5s ease-out;
}

.pillar-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-primary);
  transition: color 0.2s ease;
}

.pillar-title:hover {
  color: var(--color-accent);
}

.pillar-section:last-child {
  margin-bottom: 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
