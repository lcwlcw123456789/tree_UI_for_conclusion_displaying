<script setup lang="ts">
import { computed } from 'vue'
import { parseParagraph } from '../../utils/parseAnnotations'
import type { PillarAnalysis } from '../../types/conclusion'

const props = defineProps<{
  paragraph: string
  analysis: PillarAnalysis
  pillarIndex: number
  isAnnotationHighlighted: (pillarIndex: number, id: string) => boolean
}>()

const emit = defineEmits<{
  annotationHover: [indicatorIds: string[]]
  annotationUnhover: []
  annotationClick: [indicatorIds: string[]]
}>()

const segments = computed(() => parseParagraph(props.paragraph))

function onCitedMouseEnter(ids: string[]) {
  emit('annotationHover', ids)
}

function onCitedMouseLeave() {
  emit('annotationUnhover')
}

function onCitedClick(ids: string[]) {
  emit('annotationClick', ids)
}
</script>

<template>
  <div class="annotated-paragraph">
    <template v-for="(seg, i) in segments" :key="i">
      <!-- 被引用的文本：高亮和 hover 作用在文本本身 -->
      <span
        v-if="seg.type === 'cited'"
        class="cited-text"
        :class="{
          highlighted: seg.indicatorIds.some((id) =>
            isAnnotationHighlighted(pillarIndex, id)
          ),
        }"
        :title="seg.indicatorIds
          .map((id) => analysis.indicator_lookup[id])
          .filter(Boolean)
          .join('; ')"
        @mouseenter="onCitedMouseEnter(seg.indicatorIds)"
        @mouseleave="onCitedMouseLeave"
        @click="onCitedClick(seg.indicatorIds)"
      >
        {{ seg.content }}
      </span>
      <span v-else class="plain-text">{{ seg.content }}</span>
    </template>
  </div>
</template>

<style scoped>
.annotated-paragraph {
  line-height: 1.8;
  font-size: 0.95rem;
}

.cited-text {
  cursor: pointer;
  border-radius: 2px;
  padding: 0 0.05rem;
  transition: all 0.2s ease;
  position: relative;
}

.cited-text:hover {
  background: var(--color-accent-light);
  transform: scale(1.05);
}

.cited-text:active {
  transform: scale(0.95);
}

.cited-text.highlighted {
  background: var(--color-accent-light);
  color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-light);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 2px var(--color-accent-light);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.3);
  }
}

.plain-text {
  /* 普通文本无特殊样式 */
}
</style>
