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
