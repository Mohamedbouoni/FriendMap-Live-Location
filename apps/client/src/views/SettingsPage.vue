<template>
  <div class="page anim-fade-in">
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure your privacy, account, and location sharing preferences</p>
    </div>

    <!-- Feedback Alerts -->
    <div v-if="successMessage" class="alert alert-success mb-4 anim-scale-up">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>{{ successMessage }}</span>
    </div>

    <div v-if="sharingStore.error" class="alert alert-error mb-4 anim-scale-up">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ sharingStore.error }}</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Profile Card -->
      <div class="card" style="padding: 24px;">
        <h2 style="font-size: 16px; font-weight: 700; color: var(--color-text); margin-bottom: 16px;">Account Profile</h2>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: var(--color-sidebar); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; font-family: var(--font-heading);">
            {{ userInitial }}
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 700; color: var(--color-text);">@{{ authStore.user?.username }}</div>
            <div style="font-size: 13px; color: var(--color-text-muted);">{{ authStore.user?.email }}</div>
            <div style="margin-top: 6px;">
              <span class="badge badge-success" style="font-size: 11px;">Active Account</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Privacy Mode Selector -->
      <div class="card" style="padding: 24px;">
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 16px; font-weight: 700; color: var(--color-text);">Location Privacy Mode</h2>
          <p style="font-size: 13px; color: var(--color-text-muted); margin-top: 4px;">
            Control who can see your real-time GPS position on the live map
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <!-- Ghost Mode -->
          <div
            class="radio-card"
            :class="{ active: selectedMode === 'GHOST', 'ghost-active': selectedMode === 'GHOST' }"
            @click="selectMode('GHOST')"
          >
            <div class="radio-dot">
              <div class="radio-dot-inner" v-if="selectedMode === 'GHOST'"></div>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="radio-card-title">Ghost Mode</span>
                <span class="badge badge-ghost" style="font-size: 10px;">Maximum Privacy</span>
              </div>
              <p class="radio-card-desc">Nobody can see your live location or updates. You remain completely invisible on the map.</p>
            </div>
          </div>

          <!-- Everyone Mode -->
          <div
            class="radio-card"
            :class="{ active: selectedMode === 'EVERYONE', 'live-active': selectedMode === 'EVERYONE' }"
            @click="selectMode('EVERYONE')"
          >
            <div class="radio-dot">
              <div class="radio-dot-inner" v-if="selectedMode === 'EVERYONE'"></div>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="radio-card-title">Everyone</span>
                <span class="badge badge-live" style="font-size: 10px;">All Friends</span>
              </div>
              <p class="radio-card-desc">All accepted friends can see your live location in real time.</p>
            </div>
          </div>

          <!-- Selected Friends Mode -->
          <div
            class="radio-card"
            :class="{ active: selectedMode === 'SELECTED', 'selected-active': selectedMode === 'SELECTED' }"
            @click="selectMode('SELECTED')"
          >
            <div class="radio-dot">
              <div class="radio-dot-inner" v-if="selectedMode === 'SELECTED'"></div>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="radio-card-title">Selected Friends Only</span>
                <span class="badge" style="background: rgba(88, 86, 214, 0.1); color: var(--color-selected); font-size: 10px;">Allow-list</span>
              </div>
              <p class="radio-card-desc">Only friends checked in the list below can view your live coordinates.</p>
            </div>
          </div>

          <!-- Except Selected Friends Mode -->
          <div
            class="radio-card"
            :class="{ active: selectedMode === 'EXCEPT', 'except-active': selectedMode === 'EXCEPT' }"
            @click="selectMode('EXCEPT')"
          >
            <div class="radio-dot">
              <div class="radio-dot-inner" v-if="selectedMode === 'EXCEPT'"></div>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="radio-card-title">Except Selected Friends</span>
                <span class="badge" style="background: rgba(255, 149, 0, 0.1); color: var(--color-except); font-size: 10px;">Block-list</span>
              </div>
              <p class="radio-card-desc">All accepted friends can see you, EXCEPT the friends checked below.</p>
            </div>
          </div>
        </div>

        <!-- Exception Picker -->
        <div
          v-if="selectedMode === 'SELECTED' || selectedMode === 'EXCEPT'"
          style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--color-border-light);"
          class="anim-fade-in"
        >
          <div style="margin-bottom: 12px;">
            <h3 style="font-size: 14px; font-weight: 700; color: var(--color-text);">
              {{ selectedMode === 'SELECTED' ? 'Check Friends Allowed to View:' : 'Check Friends Blocked from Viewing:' }}
            </h3>
            <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px;">
              {{ selectedMode === 'SELECTED' ? 'Only selected friends will see your marker' : 'Selected friends will never see your location' }}
            </p>
          </div>

          <div v-if="friendsStore.acceptedFriends.length === 0" class="empty-state" style="padding: 24px;">
            <div class="empty-state-title" style="font-size: 14px;">No accepted friends found</div>
            <div class="empty-state-desc" style="font-size: 12px;">Add friends first to configure specific sharing permissions.</div>
          </div>

          <div v-else style="display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto;">
            <div
              v-for="item in friendsStore.acceptedFriends"
              :key="item.friend.id"
              @click="toggleException(item.friend.id)"
              class="card card-hover"
              style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;"
            >
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--color-card-muted); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--color-text);">
                  {{ item.friend.username.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: var(--color-text);">@{{ item.friend.username }}</div>
                  <div style="font-size: 11px; color: var(--color-text-muted);">{{ item.friend.email }}</div>
                </div>
              </div>

              <input
                type="checkbox"
                :checked="selectedFriendIds.has(item.friend.id)"
                style="width: 18px; height: 18px; accent-color: var(--color-accent); cursor: pointer;"
                @click.stop="toggleException(item.friend.id)"
              />
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
          <button
            @click="saveSettings"
            class="btn btn-primary"
            :disabled="sharingStore.loading"
          >
            <svg v-if="!sharingStore.loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {{ sharingStore.loading ? 'Saving Changes…' : 'Save Changes' }}
          </button>
        </div>
      </div>

      <!-- Privacy Info Card -->
      <div class="card-muted" style="padding: 20px; display: flex; gap: 16px; align-items: flex-start;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <div style="font-size: 13px; color: var(--color-text-muted); line-height: 1.5;">
          <strong style="color: var(--color-text);">Real-Time Privacy Engine</strong><br />
          FriendMap enforces your sharing rules on every single GPS broadcast. When in Ghost Mode or when blocked by an exception rule, your coordinates are never transmitted to unauthorized friends.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useSharingStore } from '../stores/sharing';
import { useFriendsStore } from '../stores/friends';
import type { SharingMode } from '@friendmap/contracts';

const authStore = useAuthStore();
const sharingStore = useSharingStore();
const friendsStore = useFriendsStore();

const selectedMode = ref<SharingMode>(sharingStore.mode);
const selectedFriendIds = ref<Set<string>>(new Set());
const successMessage = ref<string | null>(null);

const userInitial = computed(() =>
  authStore.user?.username?.charAt(0)?.toUpperCase() || '?',
);

onMounted(async () => {
  await Promise.all([
    sharingStore.fetchSettings(),
    friendsStore.fetchFriendships(),
  ]);

  selectedMode.value = sharingStore.mode;
  selectedFriendIds.value = new Set(sharingStore.exceptions.map((e) => e.friendId));
});

function selectMode(mode: SharingMode) {
  selectedMode.value = mode;
}

function toggleException(friendId: string) {
  const updated = new Set(selectedFriendIds.value);
  if (updated.has(friendId)) {
    updated.delete(friendId);
  } else {
    updated.add(friendId);
  }
  selectedFriendIds.value = updated;
}

async function saveSettings() {
  successMessage.value = null;
  try {
    // 1. Save Mode
    await sharingStore.setMode(selectedMode.value);

    // 2. Save Exceptions if mode is SELECTED or EXCEPT
    if (selectedMode.value === 'SELECTED' || selectedMode.value === 'EXCEPT') {
      const type = selectedMode.value === 'SELECTED' ? 'ALLOW' : 'BLOCK';
      const exceptionsList = Array.from(selectedFriendIds.value).map((friendId) => ({
        friendId,
        type: type as any,
      }));
      await sharingStore.setExceptions(exceptionsList);
    } else {
      // Clear exceptions when in Ghost or Everyone
      await sharingStore.setExceptions([]);
    }

    successMessage.value = 'Privacy settings saved successfully!';
    setTimeout(() => {
      successMessage.value = null;
    }, 4000);
  } catch (err) {
    // Error handled in store
  }
}
</script>
