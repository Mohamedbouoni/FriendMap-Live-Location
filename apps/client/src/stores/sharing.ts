import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequest } from '../services/api';
import type { SharingSettingsDto, SharingMode, SharingExceptionType } from '@friendmap/contracts';

export const useSharingStore = defineStore('sharing', () => {
  const mode = ref<SharingMode>('EVERYONE' as SharingMode);
  const exceptions = ref<Array<{ friendId: string; friendUsername: string; type: SharingExceptionType }>>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSettings() {
    loading.value = true;
    error.value = null;
    try {
      const data = await apiRequest<SharingSettingsDto>('/sharing/settings');
      mode.value = data.mode;
      exceptions.value = data.exceptions;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch sharing settings';
    } finally {
      loading.value = false;
    }
  }

  async function setMode(newMode: SharingMode) {
    loading.value = true;
    error.value = null;
    try {
      const data = await apiRequest<SharingSettingsDto>('/sharing/mode', {
        method: 'PATCH',
        body: JSON.stringify({ mode: newMode }),
      });
      mode.value = data.mode;
      exceptions.value = data.exceptions;
    } catch (err: any) {
      error.value = err.message || 'Failed to update sharing mode';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function setExceptions(newExceptions: Array<{ friendId: string; type: SharingExceptionType }>) {
    loading.value = true;
    error.value = null;
    try {
      const data = await apiRequest<SharingSettingsDto>('/sharing/exceptions', {
        method: 'PATCH',
        body: JSON.stringify({ exceptions: newExceptions }),
      });
      mode.value = data.mode;
      exceptions.value = data.exceptions;
    } catch (err: any) {
      error.value = err.message || 'Failed to update exceptions';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    mode,
    exceptions,
    loading,
    error,
    fetchSettings,
    setMode,
    setExceptions,
  };
});
