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

  const locationsList = computed(() => Object.values(friendLocations.value));

  function connect() {
    const authStore = useAuthStore();
    if (!authStore.token || socket.value?.connected) return;

    const wsUrl = window.location.origin;

    socket.value = io(wsUrl, {
      auth: {
        token: authStore.token,
      },
      transports: ['websocket', 'polling'],
    });

    socket.value.on('connect', () => {
      connected.value = true;
      lastError.value = null;
      // Subscribe to map updates upon connection
      socket.value?.emit(WS_EVENTS.MAP_SUBSCRIBE);
    });

    socket.value.on('disconnect', () => {
      connected.value = false;
    });

    socket.value.on(WS_EVENTS.MAP_SNAPSHOT, (payload: MapSnapshotPayload) => {
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
    if (!socket.value || !connected.value) return;
    socket.value.emit(WS_EVENTS.LOCATION_UPDATE, {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
    });
  }

  return {
    socket,
    connected,
    friendLocations,
    locationsList,
    lastError,
    connect,
    disconnect,
    publishLocation,
  };
});
