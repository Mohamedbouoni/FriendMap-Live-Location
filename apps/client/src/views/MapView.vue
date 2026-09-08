<template>
  <div class="map-page">
    <!-- MapLibre Map Container -->
    <div ref="mapContainerRef" class="map-container"></div>

    <!-- Floating Top Bar (Live Status & Privacy Mode) -->
    <div class="map-floating-top">
      <!-- Status Pill (Tap to toggle online friends drawer) -->
      <button
        class="map-status-pill clickable"
        @click="toggleSheet"
        :title="isSheetExpanded ? 'Close friends list' : 'View friends list and live status'"
      >
        <span class="status-dot" :class="socketStore.connected ? 'live' : 'offline'"></span>
        <span class="status-pill-text">{{ liveFriendsCount }} / {{ totalFriendsCount }} live</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon" :class="{ 'is-open': isSheetExpanded }">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <!-- Mobile Privacy Mode Chip -->
      <router-link to="/settings" class="map-privacy-pill" title="Tap to change privacy mode">
        <span class="mode-dot" :class="modeClass"></span>
        <span class="privacy-pill-text">{{ modeLabelMap[sharingStore.mode] || 'Everyone' }}</span>
      </router-link>
    </div>

    <!-- Geolocation / GPS Alert Banner -->
    <transition name="slide-up">
      <div v-if="geoError" class="map-geo-banner">
        <div class="map-geo-banner-content">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="geo-alert-icon">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span class="geo-alert-text">{{ geoError }}</span>
        </div>
        <button class="btn-geo-retry" @click="retryTracking">
          Retry
        </button>
      </div>
    </transition>

    <!-- Floating Recenter Button (Bottom Right) -->
    <div class="map-floating-controls">
      <button
        @click="recenterOnSelf"
        title="Recenter on My Location"
        class="map-float-btn"
        :class="{ active: hasLocation }"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
        </svg>
      </button>
    </div>

    <!-- Selected Friend Quick Bottom Card (Mobile & Desktop) -->
    <transition name="slide-up">
      <div v-if="selectedFriend" class="friend-quick-card">
        <div class="quick-card-header">
          <div class="quick-card-user">
            <div class="quick-card-avatar">{{ selectedFriend.initial }}</div>
            <div>
              <div class="quick-card-name">@{{ selectedFriend.username }}</div>
              <div class="quick-card-sub">
                <span class="status-badge" :class="isStale(selectedFriend.lastUpdated) ? 'stale' : 'live'">
                  {{ isStale(selectedFriend.lastUpdated) ? 'STALE' : 'LIVE' }}
                </span>
                <span>{{ formatRelativeTime(selectedFriend.lastUpdated) }}</span>
                <span class="accuracy-tag">±{{ selectedFriend.accuracy.toFixed(0) }}m</span>
              </div>
            </div>
          </div>
          <button class="quick-card-close" @click="selectedFriend = null" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="quick-card-actions">
          <button class="btn btn-sm btn-primary" @click="flyToFriend(selectedFriend)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            Zoom to Friend
          </button>
          <button class="btn btn-sm btn-danger-outline" @click="hideSelectedFriend">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            Stop Viewing
          </button>
        </div>
      </div>
    </transition>

    <!-- Mobile Bottom Sheet for Friends & Presence -->
    <transition name="sheet-slide">
      <div v-if="isSheetExpanded" class="mobile-friends-sheet">
        <div class="sheet-backdrop" @click="isSheetExpanded = false"></div>
        <div class="sheet-panel">
          <div class="sheet-drag-handle" @click="isSheetExpanded = false">
            <div class="sheet-bar"></div>
          </div>
          <div class="sheet-header">
            <div class="sheet-title-wrap">
              <span class="sheet-title">Friends on Map</span>
              <span class="sheet-badge">{{ liveFriendsCount }} active</span>
            </div>
            <button class="sheet-close-btn" @click="isSheetExpanded = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div class="sheet-list">
            <!-- If user has no friends yet -->
            <div v-if="totalFriendsCount === 0" class="sheet-empty">
              <div class="sheet-empty-icon">👥</div>
              <div class="sheet-empty-title">No friends yet</div>
              <div class="sheet-empty-sub">Add friends from the Friends tab to see each other's live location!</div>
              <router-link to="/friends" class="btn btn-sm btn-primary mt-3" @click="isSheetExpanded = false" style="margin-top: 12px; display: inline-flex;">
                + Add Friends
              </router-link>
            </div>

            <!-- If user has friends, but none are currently sharing -->
            <div v-else-if="liveFriendsList.length === 0 && offlineFriendsList.length > 0" class="sheet-empty" style="padding: 16px 12px;">
              <div class="sheet-empty-icon">📡</div>
              <div class="sheet-empty-title">Waiting for friends' location</div>
              <div class="sheet-empty-sub">Friends will appear live with coordinates as soon as their devices broadcast GPS.</div>
            </div>

            <!-- Live friends section -->
            <div v-if="liveFriendsList.length > 0" class="sheet-section">
              <div class="sheet-section-title">Sharing Live Location ({{ liveFriendsList.length }})</div>
              <div
                v-for="friend in liveFriendsList"
                :key="friend.userId"
                class="sheet-friend-item"
                @click="flyToFriend(friend)"
              >
                <div class="sheet-friend-avatar">{{ friend.initial }}</div>
                <div class="sheet-friend-info">
                  <div class="sheet-friend-name">@{{ friend.username }}</div>
                  <div class="sheet-friend-meta">
                    <span class="status-badge" :class="isStale(friend.lastUpdated) ? 'stale' : 'live'">
                      {{ isStale(friend.lastUpdated) ? 'STALE' : 'LIVE' }}
                    </span>
                    <span>{{ formatRelativeTime(friend.lastUpdated) }}</span>
                    <span>• ±{{ friend.accuracy.toFixed(0) }}m</span>
                  </div>
                </div>
                <button class="sheet-zoom-btn" title="Zoom to friend">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                </button>
              </div>
            </div>

            <!-- Not currently sharing section -->
            <div v-if="offlineFriendsList.length > 0" class="sheet-section">
              <div class="sheet-section-title">Not Sharing Currently ({{ offlineFriendsList.length }})</div>
              <div
                v-for="item in offlineFriendsList"
                :key="item.friend.id"
                class="sheet-friend-item is-offline"
              >
                <div class="sheet-friend-avatar avatar-offline">{{ item.friend.username.charAt(0).toUpperCase() }}</div>
                <div class="sheet-friend-info">
                  <div class="sheet-friend-name">@{{ item.friend.username }}</div>
                  <div class="sheet-friend-meta">
                    <span class="status-badge offline">NO GPS FIX</span>
                    <span>Not broadcasting right now</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
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

// Geolocation composable — publishes position every 5 seconds
const { currentCoords, geoError, permissionDenied, startTracking, stopTracking, retryTracking } = useGeolocation(5000);

const hasLocation = computed(() => !!currentCoords.value);

// Flag to fly the map to user's GPS location exactly once on first fix
const hasInitiallyCentered = ref(false);

const isSheetExpanded = ref(false);
const selectedFriend = ref<FriendPosition | null>(null);

const modeLabelMap: Record<string, string> = {
  GHOST: 'Ghost',
  EVERYONE: 'Everyone',
  SELECTED: 'Selected',
  EXCEPT: 'Except',
};

const modeClass = computed(() => {
  switch (sharingStore.mode) {
    case 'EVERYONE': return 'everyone';
    case 'SELECTED': return 'selected';
    case 'EXCEPT': return 'except';
    case 'GHOST':
    default: return 'ghost';
  }
});

// Friends currently sharing live coordinates
const liveFriendsList = computed<FriendPosition[]>(() => {
  return Object.values(socketStore.friendLocations)
    .filter((loc) => !friendsStore.isFriendHidden(loc.userId))
    .map(toFriendPosition);
});

const liveFriendsCount = computed(() => liveFriendsList.value.length);
const totalFriendsCount = computed(() => friendsStore.acceptedFriends.length);

// Friends accepted but not currently broadcasting live coordinates
const offlineFriendsList = computed(() => {
  const liveUserIds = new Set(liveFriendsList.value.map((f) => f.userId));
  return friendsStore.acceptedFriends.filter((item) => !liveUserIds.has(item.friend.id));
});

function toggleSheet() {
  isSheetExpanded.value = !isSheetExpanded.value;
  if (isSheetExpanded.value) {
    selectedFriend.value = null;
  }
}

function flyToFriend(friend: FriendPosition) {
  selectedFriend.value = friend;
  isSheetExpanded.value = false;
  if (map) {
    map.flyTo({
      center: [friend.lng, friend.lat],
      zoom: 15,
      essential: true,
    });
  }
}

function hideSelectedFriend() {
  if (selectedFriend.value) {
    friendsStore.hideFriendForSession(selectedFriend.value.userId);
    removeMarker(selectedFriend.value.userId);
    selectedFriend.value = null;
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
      activePopupUserId = null;
    }
  }
}

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
  selectedFriend.value = friend;
  isSheetExpanded.value = false;

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
  // Connect WebSocket, subscribe to map snapshot, & fetch initial stores
  socketStore.connect();
  socketStore.subscribeMap();
  friendsStore.fetchFriendships();
  sharingStore.fetchSettings();

  // Start live GPS tracking
  startTracking();

  if (!mapContainerRef.value) return;

  // Initial center: try user location, then localStorage cache, then world view
  let initialLng = 0;
  let initialLat = 20;
  let initialZoom = 2;

  if (currentCoords.value) {
    initialLng = currentCoords.value.longitude;
    initialLat = currentCoords.value.latitude;
    initialZoom = 13;
    hasInitiallyCentered.value = true;
  } else {
    // Try loading last-known position from localStorage
    try {
      const cached = localStorage.getItem('friendmap:lastPosition');
      if (cached) {
        const { lng, lat } = JSON.parse(cached);
        initialLng = lng;
        initialLat = lat;
        initialZoom = 13;
      }
    } catch { /* ignore parse errors */ }
  }

  // Point to local worker asset
  maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs');

  // Initialize MapLibre GL JS with OpenFreeMap liberty vector style
  map = new maplibregl.Map({
    container: mapContainerRef.value,
    style: 'https://tiles.openfreemap.org/styles/liberty', // free, no API key, no rate limit
    center: [initialLng, initialLat], // [lng, lat]
    zoom: initialZoom,
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
  stopTracking();
  socketStore.unsubscribeMap();

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

// Watch current user GPS coords — auto-center on first fix
watch(
  () => currentCoords.value,
  (coords) => {
    updateSelfMarker();
    if (coords && !hasInitiallyCentered.value) {
      hasInitiallyCentered.value = true;
      // Save to localStorage for next session
      try {
        localStorage.setItem('friendmap:lastPosition', JSON.stringify({ lng: coords.longitude, lat: coords.latitude }));
      } catch { /* ignore */ }
      // Fly to user's actual location
      if (map) {
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 14,
          essential: true,
        });
      }
    } else if (coords) {
      // Save position for next session even after first center
      try {
        localStorage.setItem('friendmap:lastPosition', JSON.stringify({ lng: coords.longitude, lat: coords.latitude }));
      } catch { /* ignore */ }
    }
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
