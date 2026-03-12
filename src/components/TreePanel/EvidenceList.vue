<script setup lang="ts">
import type { RetrievedEvidence } from '../../types/intermediate'

defineProps<{
  evidence: RetrievedEvidence[]
  expanded?: boolean
}>()
</script>

<template>
  <div v-if="evidence.length" class="evidence-list">
    <div
      v-for="(item, idx) in evidence"
      :key="item.id + '-' + idx"
      class="evidence-item"
    >
      <span class="evidence-meta">P{{ item.page }} · {{ item.id }}</span>
      <span
        v-if="item.evidence_source === 'linked'"
        class="evidence-badge linked"
      >
        linked
      </span>
      <p class="evidence-text">{{ item.text }}</p>
    </div>
  </div>
</template>

<style scoped>
.evidence-list {
  margin-left: 1.5rem;
  border-left: 2px solid var(--color-border);
  padding-left: 0.75rem;
  font-size: 0.875rem;
}

.evidence-item {
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--color-bg-muted);
  border-radius: 4px;
}

.evidence-item:last-child {
  margin-bottom: 0;
}

.evidence-meta {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.evidence-badge {
  margin-left: 0.5rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.65rem;
  border-radius: 3px;
}

.evidence-badge.linked {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.evidence-text {
  margin: 0.4rem 0 0;
  line-height: 1.5;
  color: var(--color-text);
}
</style>
