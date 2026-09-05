import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiRequest } from '../services/api';
import type { FriendshipDto, UserProfile } from '@friendmap/contracts';

export const useFriendsStore = defineStore('friends', () => {
  const friendships = ref<FriendshipDto[]>([]);
  const searchResults = ref<UserProfile[]>([]);
  const loading = ref(false);
  const searchLoading = ref(false);
  const error = ref<string | null>(null);

  const acceptedFriends = computed(() =>
    friendships.value.filter((f) => f.status === 'ACCEPTED'),
  );

  const pendingRequests = computed(() =>
    friendships.value.filter((f) => f.status === 'PENDING'),
  );

  async function fetchFriendships() {
    loading.value = true;
    error.value = null;
    try {
      const data = await apiRequest<FriendshipDto[]>('/friendships');
      friendships.value = data;
    } catch (err: any) {
      error.value = err.message || 'Failed to load friendships';
    } finally {
      loading.value = false;
    }
  }

  async function searchUsers(query: string) {
    if (!query || query.trim().length === 0) {
      searchResults.value = [];
      return;
    }
    searchLoading.value = true;
    try {
      const data = await apiRequest<UserProfile[]>(`/users/search?q=${encodeURIComponent(query)}`);
      searchResults.value = data;
    } catch (err: any) {
      searchResults.value = [];
    } finally {
      searchLoading.value = false;
    }
  }

  async function sendRequest(identifier: string) {
    loading.value = true;
    error.value = null;
    try {
      const newFriendship = await apiRequest<FriendshipDto>('/friendships/request', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      await fetchFriendships();
      return newFriendship;
    } catch (err: any) {
      error.value = err.message || 'Failed to send request';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function respondToRequest(id: string, accept: boolean) {
    loading.value = true;
    try {
      await apiRequest(`/friendships/${id}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ accept }),
      });
      await fetchFriendships();
    } catch (err: any) {
      error.value = err.message || 'Failed to respond to request';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function removeFriendship(id: string) {
    loading.value = true;
    try {
      await apiRequest(`/friendships/${id}`, {
        method: 'DELETE',
      });
      await fetchFriendships();
    } catch (err: any) {
      error.value = err.message || 'Failed to remove friend';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Session-level hidden friend IDs ("Stop viewing" action for this session)
  const sessionHiddenFriendIds = ref<Set<string>>(new Set());

  function hideFriendForSession(userId: string) {
    sessionHiddenFriendIds.value = new Set(sessionHiddenFriendIds.value).add(userId);
  }

  function unhideFriendForSession(userId: string) {
    const updated = new Set(sessionHiddenFriendIds.value);
    updated.delete(userId);
    sessionHiddenFriendIds.value = updated;
  }

  function isFriendHidden(userId: string): boolean {
    return sessionHiddenFriendIds.value.has(userId);
  }

  return {
    friendships,
    searchResults,
    loading,
    searchLoading,
    error,
    acceptedFriends,
    pendingRequests,
    sessionHiddenFriendIds,
    hideFriendForSession,
    unhideFriendForSession,
    isFriendHidden,
    fetchFriendships,
    searchUsers,
    sendRequest,
    respondToRequest,
    removeFriendship,
  };
});
