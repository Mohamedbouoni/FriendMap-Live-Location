import { ref, onUnmounted } from 'vue';
import { useSocketStore } from '../stores/socket';

export function useGeolocation(minIntervalMs = 5000) {
  const currentCoords = ref<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const isTracking = ref(false);
  const geoError = ref<string | null>(null);
  const permissionDenied = ref(false);
  let watchId: number | null = null;
  let lastBroadcastTime = 0;

  const socketStore = useSocketStore();

  function handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, accuracy } = pos.coords;
    currentCoords.value = { latitude, longitude, accuracy };
    geoError.value = null;
    permissionDenied.value = false;

    const now = Date.now();
    // Throttle socket broadcasts to at most once per minIntervalMs (default 5s)
    if (now - lastBroadcastTime >= minIntervalMs) {
      lastBroadcastTime = now;
      socketStore.publishLocation(latitude, longitude, accuracy);
    }
  }

  function handleError(err: GeolocationPositionError) {
    if (err.code === err.PERMISSION_DENIED) {
      permissionDenied.value = true;
      geoError.value = 'Location permission was denied. Please allow location access in your browser or phone settings to share and view live locations.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      geoError.value = 'GPS / Location information is unavailable on your device. Please ensure device location is enabled.';
    } else if (err.code === err.TIMEOUT) {
      // If a position was already acquired, a timeout on a subsequent sample is non-critical
      if (!currentCoords.value) {
        geoError.value = 'Location request timed out. Searching for GPS signal…';
        // Fallback to cellular / Wi-Fi triangulation for instant indoor fix on mobile
        navigator.geolocation.getCurrentPosition(
          (pos) => handlePosition(pos),
          () => {},
          { enableHighAccuracy: false, timeout: 10000 },
        );
      }
    } else {
      geoError.value = err.message || 'An unknown error occurred while retrieving location.';
    }
  }

  function startTracking() {
    if (!('geolocation' in navigator)) {
      geoError.value = 'Geolocation is not supported by your browser';
      return;
    }

    isTracking.value = true;
    geoError.value = null;
    permissionDenied.value = false;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 10000, // allow 10s cached fix for instant feedback on mobile
    };

    // Fast initial position attempt (allows cached cellular/wifi fix while satellite locks)
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(pos),
      (err) => handleError(err),
      { ...options, maximumAge: 30000, timeout: 15000 },
    );

    // Continuous watchPosition for live tracking on mobile
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos),
      (err) => handleError(err),
      options,
    );
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    isTracking.value = false;
  }

  function retryTracking() {
    stopTracking();
    startTracking();
  }

  onUnmounted(() => {
    stopTracking();
  });

  return {
    currentCoords,
    isTracking,
    geoError,
    permissionDenied,
    startTracking,
    stopTracking,
    retryTracking,
  };
}
