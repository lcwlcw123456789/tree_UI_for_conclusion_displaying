<script setup lang="ts">
defineProps<{
  text: string
  canOpenTree?: boolean
}>()

const emit = defineEmits<{
  openTree: []
}>()
</script>

<template>
  <div class="final-answer">
    <h3 class="section-title">综合结论</h3>
    <p
      class="answer-text"
      :class="{ clickable: canOpenTree }"
      @click="canOpenTree ? emit('openTree') : undefined"
      :title="canOpenTree ? '点击查看显式结论树' : ''"
    >
      {{ text }}
    </p>
    <div v-if="canOpenTree" class="hint">点击总结论可查看显式树形结构与路径高亮</div>
  </div>
</template>

<style scoped>
.final-answer {
  margin-bottom: 1.5rem;
  animation: slideInFromTop 0.6s ease-out;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
  animation: fadeIn 0.8s ease-out 0.2s both;
}

.answer-text {
  margin: 0;
  line-height: 1.8;
  font-size: 0.95rem;
  color: var(--color-text);
  animation: fadeIn 0.8s ease-out 0.4s both;
}

.answer-text.clickable {
  cursor: pointer;
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  transition: all 0.2s ease;
}

.answer-text.clickable:hover {
  background: var(--color-accent-light);
  transform: translateY(-1px);
}

.hint {
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

@keyframes slideInFromTop {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
