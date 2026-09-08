<template>
  <div class="app-shell">
    <!-- Desktop Sidebar (Hidden on Mobile) -->
    <aside class="app-sidebar">
      <!-- Brand -->
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
        </div>
        <div class="sidebar-brand-text">
          <h1>FriendMap</h1>
          <span>Live Privacy Map</span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="sidebar-nav-item"
          :class="{ active: isActive(item.to) }"
        >
          <span class="sidebar-nav-icon" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
          <span
            v-if="item.badge && item.badge > 0"
            class="sidebar-nav-badge"
          >{{ item.badge }}</span>
        </router-link>
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        <!-- Privacy Mode Indicator -->
        <router-link to="/settings" class="sidebar-mode-indicator" style="text-decoration: none;">
          <span class="mode-dot" :class="modeClass"></span>
          <span class="sidebar-mode-text">
            Mode: <strong>{{ modeLabelMap[sharingStore.mode] || 'Ghost' }}</strong>
          </span>
        </router-link>

        <!-- User Info -->
        <div class="sidebar-user">
          <div class="sidebar-avatar">
            {{ userInitial }}
          </div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">@{{ authStore.user?.username }}</div>
            <div class="sidebar-user-email">{{ authStore.user?.email }}</div>
          </div>
          <button class="sidebar-logout-btn" @click="handleLogout" title="Sign Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile Top App Bar (Visible on mobile subpages) -->
    <header v-if="!isOnMap" class="mobile-top-bar">
      <div class="mobile-top-brand">
        <div class="mobile-top-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
        </div>
        <span class="mobile-top-title">{{ currentPageTitle }}</span>
      </div>

      <div class="mobile-top-actions">
        <!-- Privacy Pill -->
        <router-link to="/settings" class="mobile-privacy-chip">
          <span class="mode-dot" :class="modeClass"></span>
          <span>{{ modeLabelMap[sharingStore.mode] || 'Ghost' }}</span>
        </router-link>

        <!-- User initial / Logout dropdown -->
        <div class="mobile-user-avatar" @click="handleLogout" title="Tap to sign out">
          {{ userInitial }}
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="app-content" :class="{ 'is-on-map': isOnMap }">
      <router-view />
    </main>

    <!-- Mobile Bottom Navigation Bar (Visible only on mobile <= 768px) -->
    <nav class="mobile-bottom-nav">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <div class="mobile-nav-icon-wrap">
          <span class="mobile-nav-icon" v-html="item.icon"></span>
          <span
            v-if="item.badge && item.badge > 0"
            class="mobile-nav-badge"
          >{{ item.badge }}</span>
        </div>
        <span class="mobile-nav-label">{{ item.label }}</span>
        <div v-if="isActive(item.to)" class="mobile-nav-indicator"></div>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSharingStore } from '../stores/sharing';
import { useFriendsStore } from '../stores/friends';
import { useSocketStore } from '../stores/socket';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const sharingStore = useSharingStore();
const friendsStore = useFriendsStore();
const socketStore = useSocketStore();

onMounted(() => {
  if (authStore.isAuthenticated || authStore.token) {
    friendsStore.fetchFriendships();
    sharingStore.fetchSettings();
  }
});

const isOnMap = computed(() => route.path === '/map' || route.path === '/');

const currentPageTitle = computed(() => {
  switch (route.path) {
    case '/friends': return 'Friends';
    case '/trail': return 'Your Trail';
    case '/settings': return 'Settings';
    case '/map': return 'Live Map';
    default: return 'FriendMap';
  }
});

const navItems = computed(() => [
  {
    to: '/map',
    label: 'Live Map',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    badge: 0,
  },
  {
    to: '/friends',
    label: 'Friends',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    badge: friendsStore.pendingRequests.length,
  },
  {
    to: '/trail',
    label: 'Your Trail',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    badge: 0,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    badge: 0,
  },
]);

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

const userInitial = computed(() =>
  authStore.user?.username?.charAt(0)?.toUpperCase() || '?',
);

function isActive(path: string): boolean {
  return route.path === path;
}

function handleLogout() {
  socketStore.disconnect();
  authStore.logout();
  router.push('/login');
}
</script>
