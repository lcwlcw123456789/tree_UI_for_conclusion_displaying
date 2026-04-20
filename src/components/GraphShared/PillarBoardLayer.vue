<script setup lang="ts">
import type { PillarRegion } from './layout'

const pillarColors = ['#e8e3f2', '#f0ddf9', '#f5d9f5', '#fce0d0', '#f9e4d0', '#fef0d8']

defineProps<{
  regions: Array<PillarRegion & { muted?: boolean; final?: boolean; candidate?: boolean }>
}>()

function getPillarColor(index: number) {
  return pillarColors[index % pillarColors.length]
}
</script>

<template>
  <div
    v-for="(region, idx) in regions"
    :key="region.key"
    class="region"
    :class="{ muted: region.muted, final: region.final, candidate: region.candidate }"
    :style="{ 
      left: `${region.x}px`, 
      top: `${region.y}px`, 
      width: `${region.width}px`, 
      height: `${region.height}px`,
      backgroundColor: getPillarColor(idx)
    }"
  >
    <div class="region-head">
      <span class="kicker">pillar</span>
      <strong :title="region.title">{{ region.title }}</strong>
    </div>
  </div>
</template>

<style scoped>
.region {
  position: absolute;
  border-radius: 18px;
  border: 2px solid #a6bddb;
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}
.region::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,.45), transparent 36%);
  z-index: 1;
}
.region.final {
  border-color: #0570b0;
  box-shadow: 0 0 0 1px rgba(5,112,176,.16);
}
.region.candidate {
  border-color: #3690c0;
}
.region.muted {
  opacity: 0.58;
}
.region-head {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  z-index: 2;
}
.kicker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  border-radius: 999px;
  padding: .08rem .4rem;
  background: #d0d1e6;
  color: #034e7b;
  font-size: .62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.region-head strong {
  color: #034e7b;
  font-size: .72rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
