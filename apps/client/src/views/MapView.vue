<template>
  <div class="map-page">
    <!-- MapLibre Map Container -->
    <div ref="mapContainerRef" class="map-container"></div>

    <!-- Floating Status Bar (Top Left) -->
    <div class="map-status-bar">
      <div class="map-status-pill">
        <span class="status-dot" :class="socketStore.connected ? 'live' : 'offline'"></span>
        <span>{{ onlineFriendsCount }} friend{{ onlineFriendsCount !== 1 ? 's' : '' }} online</span>
      </div>
    </div>

    <!-- Floating Recenter Button (Bottom Right) -->
    <div class="map-floating-controls">
      <button
        @click="recenterOnSelf"
        title="Recenter on My Location"
        class="map-float-btn"
        :class="{ active: hasLocation }"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useGeolocation } from '../composables/useGeolocation';
import { useSocketStore } from '../stores/socket';
import { useFriendsStore } from '../stores/friends';
import { useSharingStore } from '../stores/sharing';
import { useAuthStore } from '../stores/auth';
import { useStaleDetection } from '../composables/useStaleDetection';
import { WS_EVENTS } from '@friendmap/contracts';
import type { FriendLocation, MapSnapshotPayload, LocationRemovedPayload } from '@friendmap/contracts';

interface FriendPosition {
  userId: string;
  username: string;
  lat: number;
  lng: number;
  accuracy: number;
  lastUpdated: number;
  initial: string;
}

const mapContainerRef = ref<HTMLElement | null>(null);
let map: maplibregl.Map | null = null;
let selfMarker: maplibregl.Marker | null = null;
const friendMarkers = new Map<string, maplibregl.Marker>();
let activePopup: maplibregl.Popup | null = null;
let activePopupUserId: string | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;

const socketStore = useSocketStore();
const friendsStore = useFriendsStore();
const sharingStore = useSharingStore();
const authStore = useAuthStore();
const { isStale, formatRelativeTime } = useStaleDetection();

// Geolocation composable — publishes position every 10 seconds
const { currentCoords, startTracking } = useGeolocation(10000);

const hasLocation = computed(() => !!currentCoords.value);
const onlineFriendsCount = computed(() => Object.keys(socketStore.friendLocations).length);

// ─── Friend Marker DOM Creation ──────────────────────────────
function createMarkerEl(friend: FriendPosition): HTMLElement {
  const el = document.createElement('div');
  el.className = 'friend-marker';
  el.innerHTML = `<div class="friend-marker__avatar">${friend.initial}</div>`;
  el.classList.toggle('friend-marker--stale', isStale(friend.lastUpdated)); // >60s silence
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openFriendPopup(friend);
  });
  return el;
}

// ─── Friend Popup ────────────────────────────────────────────
function openFriendPopup(friend: FriendPosition) {
  if (!map) return;

  if (activePopup) {
    activePopup.remove();
    activePopup = null;
    activePopupUserId = null;
  }

  const stale = isStale(friend.lastUpdated);
  const relativeTime = formatRelativeTime(friend.lastUpdated);
  const statusLabel = stale ? 'STALE' : 'LIVE';
  const statusBg = stale ? 'rgba(245, 166, 35, 0.15)' : 'rgba(52, 199, 89, 0.15)';
  const statusColor = stale ? '#F5A623' : '#34C759';

  const popupContainer = document.createElement('div');
  popupContainer.style.fontFamily = 'var(--font-body)';
  popupContainer.style.minWidth = '180px';
  popupContainer.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--color-border-light); padding-bottom: 8px; margin-bottom: 8px;">
      <span style="font-weight: 700; color: var(--color-text); font-size: 14px;">@${friend.username}</span>
      <span style="font-size: 10px; padding: 2px 7px; border-radius: 9999px; font-weight: 700; background: ${statusBg}; color: ${statusColor};">
        ${statusLabel}
      </span>
    </div>
    <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px;">
      Updated: <strong style="color: var(--color-text); font-weight: 600;">${relativeTime}</strong>
    </div>
    <div style="font-size: 11px; color: var(--color-text-light); margin-bottom: 10px;">
      Accuracy: ±${friend.accuracy.toFixed(0)}m
    </div>
    <div style="border-top: 1px solid var(--color-border-light); padding-top: 8px;">
      <button
        id="stop-viewing-btn"
        style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--color-danger-bg); color: var(--color-danger); border: 1px solid rgba(232, 70, 70, 0.2); font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        Stop viewing
      </button>
    </div>
  `;

  const btn = popupContainer.querySelector('#stop-viewing-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      friendsStore.hideFriendForSession(friend.userId);
      removeMarker(friend.userId);
      activePopup?.remove();
      activePopup = null;
      activePopupUserId = null;
    });
  }

  activePopupUserId = friend.userId;
  activePopup = new maplibregl.Popup({
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'friend-popup',
  })
    .setLngLat([friend.lng, friend.lat]) // [lng, lat]
    .setDOMContent(popupContainer)
    .addTo(map);

  activePopup.on('close', () => {
    activePopup = null;
    activePopupUserId = null;
  });
}

// ─── Marker Management ───────────────────────────────────────
function upsertMarker(friend: FriendPosition) {
  if (!map) return;

  // Don't render session-hidden friends
  if (friendsStore.isFriendHidden(friend.userId)) {
    removeMarker(friend.userId);
    return;
  }

  const existing = friendMarkers.get(friend.userId);
  if (existing) {
    existing.setLngLat([friend.lng, friend.lat]); // [lng, lat]
    const el = existing.getElement();
    el.classList.toggle('friend-marker--stale', isStale(friend.lastUpdated));
    if (activePopupUserId === friend.userId && activePopup) {
      activePopup.setLngLat([friend.lng, friend.lat]);
    }
    return;
  }

  const marker = new maplibregl.Marker({
    element: createMarkerEl(friend),
    anchor: 'center',
  })
    .setLngLat([friend.lng, friend.lat]) // [lng, lat]
    .addTo(map);

  friendMarkers.set(friend.userId, marker);
}

function removeMarker(userId: string) {
  friendMarkers.get(userId)?.remove();
  friendMarkers.delete(userId);
  if (activePopupUserId === userId) {
    activePopup?.remove();
    activePopup = null;
    activePopupUserId = null;
  }
}

function clearAllFriendMarkers() {
  for (const marker of friendMarkers.values()) {
    marker.remove();
  }
  friendMarkers.clear();
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
    activePopupUserId = null;
  }
}

// Convert FriendLocation to FriendPosition
function toFriendPosition(loc: FriendLocation): FriendPosition {
  return {
    userId: loc.userId,
    username: loc.username,
    lat: loc.latitude,
    lng: loc.longitude,
    accuracy: loc.accuracy,
    lastUpdated: loc.timestamp,
    initial: loc.username.charAt(0).toUpperCase(),
  };
}

// ─── Self Marker ─────────────────────────────────────────────
function updateSelfMarker() {
  if (!map || !currentCoords.value) return;

  const { latitude, longitude, accuracy } = currentCoords.value;
  const lngLat: [number, number] = [longitude, latitude]; // [lng, lat]

  if (!selfMarker) {
    const el = document.createElement('div');
    el.className = 'self-marker';
    el.innerHTML = `
      <div class="self-marker__pulse"></div>
      <div class="self-marker__avatar">${authStore.user?.username.charAt(0).toUpperCase() || 'ME'}</div>
    `;

    const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
      <div style="padding: 4px 6px; text-align: center; font-family: var(--font-body);">
        <div style="font-weight: 700; color: var(--color-accent); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">You (Current Location)</div>
        <div style="font-size: 13px; font-weight: 600; color: var(--color-text); margin-top: 2px;">@${authStore.user?.username || 'You'}</div>
        <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 2px;">Accuracy: ±${accuracy.toFixed(0)}m</div>
      </div>
    `);

    selfMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .setPopup(popup)
      .addTo(map);
  } else {
    selfMarker.setLngLat(lngLat);
  }
}

function recenterOnSelf() {
  if (map && currentCoords.value) {
    map.flyTo({
      center: [currentCoords.value.longitude, currentCoords.value.latitude],
      zoom: 15,
      essential: true,
    });
  }
}

// ─── Lifecycle & Watchers ────────────────────────────────────
onMounted(async () => {
  // Connect WebSocket & fetch initial stores
  socketStore.connect();
  friendsStore.fetchFriendships();
  sharingStore.fetchSettings();

  // Start live GPS tracking
  startTracking();

  if (!mapContainerRef.value) return;

  // Initial center: user location or default San Francisco [lng, lat]
  const initialLng = currentCoords.value?.longitude ?? -122.4194;
  const initialLat = currentCoords.value?.latitude ?? 37.7749;

  // Point to local worker asset
  maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs');

  // Initialize MapLibre GL JS with OpenFreeMap liberty vector style
  map = new maplibregl.Map({
    container: mapContainerRef.value,
    style: 'https://tiles.openfreemap.org/styles/liberty', // free, no API key, no rate limit
    center: [initialLng, initialLat], // [lng, lat]
    zoom: 13,
    attributionControl: false,
  });

  // Controls: Navigation (zoom + rotation) and Geolocate
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
    'top-right'
  );

  map.on('load', () => {
    updateSelfMarker();
    // Render existing friends in store
    for (const loc of Object.values(socketStore.friendLocations)) {
      upsertMarker(toFriendPosition(loc));
    }
  });

  // Attach direct Socket.IO event handlers for instant reaction (Ghost-mode fast-path)
  if (socketStore.socket) {
    socketStore.socket.on(WS_EVENTS.MAP_SNAPSHOT, (payload: MapSnapshotPayload) => {
      clearAllFriendMarkers();
      for (const loc of payload.locations) {
        upsertMarker(toFriendPosition(loc));
      }
    });

    socketStore.socket.on(WS_EVENTS.LOCATION_UPDATED, (payload: FriendLocation) => {
      upsertMarker(toFriendPosition(payload));
    });

    socketStore.socket.on(WS_EVENTS.LOCATION_REMOVED, (payload: LocationRemovedPayload) => {
      // Instant removal (<2s)
      removeMarker(payload.userId);
    });
  }

  // Periodic stale-check every 5 seconds
  staleCheckInterval = setInterval(() => {
    for (const [userId, loc] of Object.entries(socketStore.friendLocations)) {
      const marker = friendMarkers.get(userId);
      if (marker) {
        marker.getElement().classList.toggle('friend-marker--stale', isStale(loc.timestamp));
      }
    }
  }, 5000);
});

onUnmounted(() => {
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
  clearAllFriendMarkers();
  if (selfMarker) {
    selfMarker.remove();
    selfMarker = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
});

// Watch current user GPS coords
watch(
  () => currentCoords.value,
  () => {
    updateSelfMarker();
  },
  { deep: true },
);

// Watch socket store friend locations
watch(
  () => socketStore.friendLocations,
  (newLocs) => {
    const activeIds = new Set(Object.keys(newLocs));
    // Remove markers that disappeared
    for (const userId of friendMarkers.keys()) {
      if (!activeIds.has(userId) || friendsStore.isFriendHidden(userId)) {
        removeMarker(userId);
      }
    }
    // Upsert remaining
    for (const loc of Object.values(newLocs)) {
      upsertMarker(toFriendPosition(loc));
    }
  },
  { deep: true },
);

// Watch session-hidden friends
watch(
  () => friendsStore.sessionHiddenFriendIds,
  (hiddenSet) => {
    for (const userId of hiddenSet) {
      removeMarker(userId);
    }
  },
  { deep: true },
);
</script>
