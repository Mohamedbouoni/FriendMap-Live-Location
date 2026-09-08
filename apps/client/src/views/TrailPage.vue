<template>
  <div class="page anim-fade-in">
    <div class="page-header">
      <h1 class="page-title">Your Trail</h1>
      <p class="page-subtitle">View your location history from the last 24 hours</p>
    </div>

    <!-- Stats Bar -->
    <div class="card" style="padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
      <div>
        <div style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Points</div>
        <div style="font-size: 20px; font-weight: 800; color: var(--color-text);">{{ historyEntries.length }}</div>
      </div>
      <div style="width: 1px; height: 32px; background: var(--color-border-light);"></div>
      <div>
        <div style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Time Range</div>
        <div style="font-size: 14px; font-weight: 600; color: var(--color-text);">{{ timeRange }}</div>
      </div>
      <div style="margin-left: auto;">
        <button @click="loadHistory" class="btn btn-sm btn-secondary" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Map Area -->
    <div class="card trail-map-card" style="overflow: hidden; margin-bottom: 20px; position: relative;">
      <div ref="trailMapContainer" style="width: 100%; height: 100%;"></div>

      <!-- Empty state overlay -->
      <div v-if="historyEntries.length === 0 && !loading" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--color-card-muted);">
        <div class="empty-state" style="padding: 24px;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="empty-state-title">No trail data yet</div>
          <div class="empty-state-desc">Your location history will appear here once tracking starts.</div>
        </div>
      </div>
    </div>

    <!-- Timeline Slider -->
    <div v-if="historyEntries.length > 0" class="card" style="padding: 16px 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span style="font-size: 12px; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.5px;">Timeline</span>
        </div>
        <span style="font-size: 12px; font-weight: 600; color: var(--color-accent); font-family: var(--font-body);">
          {{ selectedTimestamp }}
        </span>
      </div>
      <input
        type="range"
        min="0"
        :max="Math.max(0, historyEntries.length - 1)"
        v-model.number="selectedIndex"
        style="width: 100%; height: 6px; border-radius: 3px; cursor: pointer; accent-color: var(--color-accent);"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiRequest } from '../services/api';

const trailMapContainer = ref<HTMLElement | null>(null);
let map: maplibregl.Map | null = null;
let highlightMarker: maplibregl.Marker | null = null;

const historyEntries = ref<Array<{ latitude: number; longitude: number; clientTimestamp: string }>>([]);
const loading = ref(false);
const selectedIndex = ref(0);

const selectedTimestamp = computed(() => {
  if (historyEntries.value.length === 0) return '';
  const item = historyEntries.value[selectedIndex.value];
  if (!item) return '';
  return new Date(item.clientTimestamp).toLocaleTimeString();
});

const timeRange = computed(() => {
  if (historyEntries.value.length < 2) return 'N/A';
  const first = new Date(historyEntries.value[0].clientTimestamp);
  const last = new Date(historyEntries.value[historyEntries.value.length - 1].clientTimestamp);
  return `${first.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
});

async function loadHistory() {
  loading.value = true;
  try {
    const data = await apiRequest<Array<{ latitude: number; longitude: number; clientTimestamp: string }>>('/locations/history');
    historyEntries.value = data;
    selectedIndex.value = Math.max(0, data.length - 1);
    renderPolyline();
    updateHighlight();
  } catch (e) {
    // Failed to load
  } finally {
    loading.value = false;
  }
}

function renderPolyline() {
  if (!map || !map.isStyleLoaded()) return;

  const lineCoords: [number, number][] = historyEntries.value.map((h) => [h.longitude, h.latitude]); // [lng, lat]

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: lineCoords,
    },
  };

  const existingSource = map.getSource('trail-source') as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(geojson);
  } else {
    map.addSource('trail-source', {
      type: 'geojson',
      data: geojson,
    });

    map.addLayer({
      id: 'trail-layer',
      type: 'line',
      source: 'trail-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#E8623D',
        'line-width': 4,
        'line-opacity': 0.85,
        'line-dasharray': [2, 2],
      },
    });
  }

  if (lineCoords.length > 0) {
    const bounds = new maplibregl.LngLatBounds(lineCoords[0], lineCoords[0]);
    for (const coord of lineCoords) {
      bounds.extend(coord);
    }
    map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
  }
}

function updateHighlight() {
  if (!map || historyEntries.value.length === 0) return;
  const entry = historyEntries.value[selectedIndex.value];
  if (!entry) return;

  const lngLat: [number, number] = [entry.longitude, entry.latitude]; // [lng, lat]

  if (!highlightMarker) {
    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.borderRadius = '50%';
    el.style.background = '#E8623D';
    el.style.border = '3px solid #FFFFFF';
    el.style.boxShadow = '0 2px 8px rgba(232, 98, 61, 0.5)';

    highlightMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    highlightMarker.setLngLat(lngLat);
  }
}

watch(selectedIndex, () => {
  updateHighlight();
});

onMounted(async () => {
  if (trailMapContainer.value) {
    maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs');
    map = new maplibregl.Map({
      container: trailMapContainer.value,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-122.4194, 37.7749], // [lng, lat]
      zoom: 13,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      renderPolyline();
      updateHighlight();
    });
  }

  await loadHistory();
});

onUnmounted(() => {
  if (highlightMarker) {
    highlightMarker.remove();
    highlightMarker = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
});
</script>
