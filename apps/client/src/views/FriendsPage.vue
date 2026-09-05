<template>
  <div class="page anim-fade-in">
    <div class="page-header">
      <h1 class="page-title">Friends</h1>
      <p class="page-subtitle">Manage your connections and friend requests</p>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab-item"
        :class="{ active: activeTab === 'friends' }"
        @click="activeTab = 'friends'"
      >
        My Friends ({{ friendsStore.acceptedFriends.length }})
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'requests' }"
        @click="activeTab = 'requests'"
      >
        Requests
        <span v-if="friendsStore.pendingRequests.length > 0" class="tab-badge">
          {{ friendsStore.pendingRequests.length }}
        </span>
      </button>
      <button
        class="tab-item"
        :class="{ active: activeTab === 'add' }"
        @click="activeTab = 'add'"
      >
        + Add Friend
      </button>
    </div>

    <!-- Error -->
    <div v-if="friendsStore.error" class="alert alert-error mb-4">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ friendsStore.error }}</span>
    </div>

    <!-- Tab: My Friends -->
    <div v-if="activeTab === 'friends'">
      <div v-if="friendsStore.acceptedFriends.length === 0" class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div class="empty-state-title">No friends yet</div>
        <div class="empty-state-desc">Use the "Add Friend" tab to search for people and connect!</div>
      </div>

      <div class="stagger" style="display: flex; flex-direction: column; gap: 8px;">
        <div
          v-for="item in friendsStore.acceptedFriends"
          :key="item.id"
          class="friend-card anim-fade-in"
        >
          <div class="friend-info">
            <div class="avatar avatar-md avatar-accent">
              {{ item.friend.username.charAt(0) }}
            </div>
            <div>
              <div class="friend-name">@{{ item.friend.username }}</div>
              <div class="friend-email">{{ item.friend.email }}</div>
            </div>
          </div>

          <div class="friend-actions">
            <button
              v-if="friendsStore.isFriendHidden(item.friend.id)"
              @click="friendsStore.unhideFriendForSession(item.friend.id)"
              class="btn btn-sm btn-secondary"
              title="Resume viewing on map"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Unhide
            </button>
            <button
              @click="handleRemove(item.id)"
              class="btn btn-icon btn-danger"
              title="Remove Friend"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: Requests -->
    <div v-if="activeTab === 'requests'">
      <div v-if="friendsStore.pendingRequests.length === 0" class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="empty-state-title">No pending requests</div>
        <div class="empty-state-desc">All caught up! New friend requests will appear here.</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div
          v-for="item in friendsStore.pendingRequests"
          :key="item.id"
          class="friend-card anim-fade-in"
        >
          <div class="friend-info">
            <div class="avatar avatar-md avatar-navy">
              {{ item.friend.username.charAt(0) }}
            </div>
            <div>
              <div class="friend-name">@{{ item.friend.username }}</div>
              <div class="friend-email" style="font-size: 11px;">
                {{ item.requesterId === authStore.user?.id ? 'You sent this request' : 'Wants to connect with you' }}
              </div>
            </div>
          </div>

          <!-- Incoming: Accept/Reject -->
          <div v-if="item.addresseeId === authStore.user?.id" class="friend-actions">
            <button @click="handleRespond(item.id, true)" class="btn btn-sm btn-success">
              Accept
            </button>
            <button @click="handleRespond(item.id, false)" class="btn btn-sm btn-danger">
              Reject
            </button>
          </div>

          <!-- Outgoing: Pending badge -->
          <div v-else>
            <span class="badge badge-pending">Pending</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: Add Friend -->
    <div v-if="activeTab === 'add'">
      <div style="position: relative; margin-bottom: 16px;">
        <input
          id="search-friends"
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="Search by username or email…"
          class="form-input"
          style="padding-right: 44px;"
        />
        <div style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-light);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
      </div>

      <!-- Direct send -->
      <div v-if="searchQuery.trim().length > 0" style="margin-bottom: 16px;">
        <button @click="handleSendDirect" class="btn btn-primary btn-block btn-sm">
          Send Friend Request to "{{ searchQuery }}"
        </button>
      </div>

      <!-- Search Results -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div
          v-for="user in friendsStore.searchResults"
          :key="user.id"
          class="friend-card anim-fade-in"
        >
          <div class="friend-info">
            <div class="avatar avatar-md avatar-muted">
              {{ user.username.charAt(0) }}
            </div>
            <div>
              <div class="friend-name">@{{ user.username }}</div>
              <div class="friend-email">{{ user.email }}</div>
            </div>
          </div>
          <button @click="handleSendRequest(user.username)" class="btn btn-sm btn-primary">
            Connect
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFriendsStore } from '../stores/friends';
import { useAuthStore } from '../stores/auth';

const friendsStore = useFriendsStore();
const authStore = useAuthStore();

const activeTab = ref<'friends' | 'requests' | 'add'>('friends');
const searchQuery = ref('');

function onSearchInput() {
  friendsStore.searchUsers(searchQuery.value);
}

async function handleSendRequest(identifier: string) {
  try {
    await friendsStore.sendRequest(identifier);
    searchQuery.value = '';
    activeTab.value = 'requests';
  } catch (e) {
    // Error in store
  }
}

async function handleSendDirect() {
  if (!searchQuery.value.trim()) return;
  await handleSendRequest(searchQuery.value.trim());
}

async function handleRespond(id: string, accept: boolean) {
  await friendsStore.respondToRequest(id, accept);
}

async function handleRemove(id: string) {
  if (confirm('Are you sure you want to remove this friend?')) {
    await friendsStore.removeFriendship(id);
  }
}
</script>
