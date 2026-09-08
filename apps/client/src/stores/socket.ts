import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { WS_EVENTS } from '@friendmap/contracts';
import type { FriendLocation, MapSnapshotPayload, LocationRemovedPayload } from '@friendmap/contracts';

export const useSocketStore = defineStore('socket', () => {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);
  const friendLocations = ref<Record<string, FriendLocation>>({});
  const lastError = ref<string | null>(null);

  /** Pending location to publish once socket connects */
  let pendingLocation: { latitude: number; longitude: number; accuracy: number } | null = null;

  const locationsList = computed(() => Object.values(friendLocations.value));

  function subscribeMap() {
    if (socket.value && connected.value) {
      socket.value.emit(WS_EVENTS.MAP_SUBSCRIBE);
    }
  }

  function unsubscribeMap() {
    if (socket.value && connected.value) {
      socket.value.emit(WS_EVENTS.MAP_UNSUBSCRIBE);
    }
  }

  /** Force a fresh snapshot from the server (re-emits MAP_SUBSCRIBE) */
  function requestSnapshot() {
    subscribeMap();
  }

  function connect() {
    const authStore = useAuthStore();
    if (!authStore.token) return;

    if (socket.value?.connected) {
      subscribeMap();
      return;
    }

    const wsUrl = window.location.origin;

    socket.value = io(wsUrl, {
      auth: {
        token: authStore.token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.value.on('connect', () => {
      connected.value = true;
      lastError.value = null;
      // Subscribe to map updates upon connection
      subscribeMap();
      // Flush any pending location that was queued before connection
      flushPendingLocation();
    });

    socket.value.on('disconnect', () => {
      connected.value = false;
    });

    // Auto-resubscribe on reconnect (socket.io fires 'connect' again on reconnect)
    // The 'connect' handler above already handles this.

    socket.value.on(WS_EVENTS.MAP_SNAPSHOT, (payload: MapSnapshotPayload) => {
      // Merge snapshot with existing locations to avoid flicker;
      // snapshot is authoritative, so replace entirely
      const locMap: Record<string, FriendLocation> = {};
      for (const loc of payload.locations) {
        locMap[loc.userId] = loc;
      }
      friendLocations.value = locMap;
    });

    socket.value.on(WS_EVENTS.LOCATION_UPDATED, (payload: FriendLocation) => {
      friendLocations.value = {
        ...friendLocations.value,
        [payload.userId]: payload,
      };
    });

    socket.value.on(WS_EVENTS.LOCATION_REMOVED, (payload: LocationRemovedPayload) => {
      const updated = { ...friendLocations.value };
      delete updated[payload.userId];
      friendLocations.value = updated;
    });

    // When a friendship changes (accepted, removed, etc.), request a fresh snapshot
    // so the new friend's location immediately appears on the map
    socket.value.on(WS_EVENTS.FRIENDSHIP_CHANGED, () => {
      // Small delay to let server-side visibility cache invalidate
      setTimeout(() => {
        requestSnapshot();
      }, 500);
    });

    socket.value.on(WS_EVENTS.ERROR, (err: { code: string; message: string }) => {
      lastError.value = err.message;
    });
  }

  function disconnect() {
    if (socket.value) {
      socket.value.emit(WS_EVENTS.MAP_UNSUBSCRIBE);
      socket.value.disconnect();
      socket.value = null;
      connected.value = false;
      friendLocations.value = {};
    }
  }

  function publishLocation(latitude: number, longitude: number, accuracy: number) {
    if (!socket.value || !connected.value) {
      // Queue the location for when the socket connects
      pendingLocation = { latitude, longitude, accuracy };
      return;
    }
    socket.value.emit(WS_EVENTS.LOCATION_UPDATE, {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
    });
  }

  /** Flush any pending location that was queued before socket connected */
  function flushPendingLocation() {
    if (pendingLocation && socket.value && connected.value) {
      const { latitude, longitude, accuracy } = pendingLocation;
      pendingLocation = null;
      socket.value.emit(WS_EVENTS.LOCATION_UPDATE, {
        latitude,
        longitude,
        accuracy,
        timestamp: Date.now(),
      });
    }
  }

  return {
    socket,
    connected,
    friendLocations,
    locationsList,
    lastError,
    connect,
    disconnect,
    subscribeMap,
    unsubscribeMap,
    requestSnapshot,
    publishLocation,
  };
});

