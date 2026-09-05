import { ref, onMounted, onUnmounted } from 'vue';

const STALE_THRESHOLD_MS = 60_000; // 60 seconds

export function useStaleDetection() {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  function isStale(timestamp: number): boolean {
    return now.value - timestamp > STALE_THRESHOLD_MS;
  }

  function getSecondsAgo(timestamp: number): number {
    return Math.max(0, Math.floor((now.value - timestamp) / 1000));
  }

  function formatRelativeTime(timestamp: number): string {
    const diffSec = getSecondsAgo(timestamp);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 120) return '1 min ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 7200) return '1 hour ago';
    return `${Math.floor(diffSec / 3600)} hours ago`;
  }

  return {
    now,
    isStale,
    getSecondsAgo,
    formatRelativeTime,
  };
}
