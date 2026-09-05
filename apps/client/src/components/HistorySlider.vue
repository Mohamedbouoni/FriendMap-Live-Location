<template>
  <div
    v-if="show"
    class="card card-hover anim-fade-in"
    style="position: absolute; bottom: 24px; left: 24px; right: 80px; z-index: 900; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; background: var(--color-card);"
  >
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style="font-size: 12px; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.5px;">Location History (Last 24 Hours)</span>
      </div>
      <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">
        {{ historyEntries.length }} points recorded
      </div>
    </div>

    <div v-if="historyEntries.length === 0" style="font-size: 12px; color: var(--color-text-muted); padding: 4px 0;">
      No location history recorded in the last 24 hours yet.
    </div>

    <div v-else style="display: flex; align-items: center; gap: 16px; margin-top: 4px;">
      <input
        type="range"
        min="0"
        :max="Math.max(0, historyEntries.length - 1)"
        v-model.number="selectedIndex"
        style="width: 100%; height: 6px; border-radius: 3px; cursor: pointer; accent-color: var(--color-accent);"
      />
      <span style="font-size: 12px; font-weight: 700; color: var(--color-accent); white-space: nowrap;">
        {{ selectedTimestamp }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  show: boolean;
  historyEntries: Array<{ latitude: number; longitude: number; clientTimestamp: string }>;
}>();

const selectedIndex = ref(0);

const selectedTimestamp = computed(() => {
  if (props.historyEntries.length === 0) return '';
  const item = props.historyEntries[selectedIndex.value];
  if (!item) return '';
  return new Date(item.clientTimestamp).toLocaleTimeString();
});
</script>
