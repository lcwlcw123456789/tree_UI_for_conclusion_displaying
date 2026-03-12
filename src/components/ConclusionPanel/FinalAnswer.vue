<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div class="final-answer">
    <h3 class="section-title">综合结论</h3>
    <p class="answer-text">{{ text }}</p>
  </div>
</template>

<style scoped>
.final-answer {
  margin-bottom: 1.5rem;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
}

.answer-text {
  margin: 0;
  line-height: 1.8;
  font-size: 0.95rem;
  color: var(--color-text);
}
</style>
