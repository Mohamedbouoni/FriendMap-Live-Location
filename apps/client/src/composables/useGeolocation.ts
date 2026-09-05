import { ref, onMounted, onUnmounted } from 'vue';
import { useSocketStore } from '../stores/socket';

export function useGeolocation(intervalMs = 10000) {
  const currentCoords = ref<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const isTracking = ref(false);
  const geoError = ref<string | null>(null);
  let watchId: number | null = null;
  let timerId: any = null;

  const socketStore = useSocketStore();

  function startTracking() {
    if (!('geolocation' in navigator)) {
      geoError.value = 'Geolocation is not supported by your browser';
      return;
    }

    isTracking.value = true;
    geoError.value = null;

    const publishCurrent = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          currentCoords.value = { latitude, longitude, accuracy };
          geoError.value = null;

          // Emit location to server via Socket.IO
          socketStore.publishLocation(latitude, longitude, accuracy);
        },
        (err) => {
          geoError.value = err.message;
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    };

    // Immediate first publish
    publishCurrent();

    // Recurring interval every 5-15s (default 10s)
    timerId = setInterval(publishCurrent, intervalMs);
  }

  function stopTracking() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    isTracking.value = false;
  }

  onUnmounted(() => {
    stopTracking();
  });

  return {
    currentCoords,
    isTracking,
    geoError,
    startTracking,
    stopTracking,
  };
}
