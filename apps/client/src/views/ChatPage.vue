<template>
  <div class="chat-page">
    <!-- Left Sidebar: Conversations List -->
    <aside
      class="chat-sidebar"
      :class="{ 'hide-on-mobile': activeFriendId !== null }"
    >
      <!-- Sidebar Header -->
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <h2 class="sidebar-title">Messages</h2>
          <span v-if="chatStore.totalUnreadCount > 0" class="unread-pill">
            {{ chatStore.totalUnreadCount }} new
          </span>
        </div>

        <!-- Search Bar -->
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search conversations..."
            class="search-input"
          />
          <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">✕</button>
        </div>
      </div>

      <!-- Quick Friends Bar to start new chat -->
      <div v-if="friendsWithoutConv.length > 0" class="quick-friends-bar">
        <div class="quick-friends-label">Start Chat:</div>
        <div class="quick-friends-list">
          <button
            v-for="friend in friendsWithoutConv"
            :key="friend.id"
            class="quick-friend-chip"
            @click="selectFriend(friend.id, friend.username)"
            :title="'Message ' + friend.username"
          >
            <div class="chip-avatar">{{ friend.username.charAt(0).toUpperCase() }}</div>
            <span class="chip-name">{{ friend.username }}</span>
          </button>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="conversations-list">
        <div v-if="filteredConversations.length === 0" class="empty-conv-list">
          <div class="empty-icon">💬</div>
          <div class="empty-title">No conversations yet</div>
          <p class="empty-desc">
            Choose a friend from above to start chatting in real time.
          </p>
        </div>

        <div
          v-for="conv in filteredConversations"
          :key="conv.friendId"
          class="conv-card"
          :class="{ active: conv.friendId === activeFriendId }"
          @click="selectFriend(conv.friendId, conv.friendUsername)"
        >
          <!-- Avatar + Presence Dot -->
          <div class="avatar-wrap">
            <div class="avatar-circle" :style="getAvatarGradient(conv.friendUsername)">
              {{ conv.friendUsername.charAt(0).toUpperCase() }}
            </div>
            <span
              class="presence-indicator"
              :class="{ online: conv.isOnline, offline: !conv.isOnline }"
              :title="conv.isOnline ? 'Online' : 'Offline'"
            ></span>
          </div>

          <!-- Info -->
          <div class="conv-details">
            <div class="conv-top-row">
              <span class="conv-username">@{{ conv.friendUsername }}</span>
              <span v-if="conv.lastMessageAt" class="conv-time">
                {{ formatRelativeTime(conv.lastMessageAt) }}
              </span>
            </div>
            <div class="conv-bottom-row">
              <span class="conv-snippet" :class="{ 'is-typing': typingUsers[conv.friendId] }">
                <template v-if="typingUsers[conv.friendId]">
                  <span class="typing-text">typing</span>
                  <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
                </template>
                <template v-else-if="conv.lastMessage">
                  {{ truncate(conv.lastMessage, 32) }}
                </template>
                <template v-else>
                  <span class="no-msg">No messages yet</span>
                </template>
              </span>
              <span v-if="conv.unreadCount > 0" class="conv-badge">
                {{ conv.unreadCount }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Right Main Area: Active Chat or Empty Placeholder -->
    <main
      class="chat-main"
      :class="{ 'show-on-mobile': activeFriendId !== null }"
    >
      <template v-if="activeFriendId && activeFriendUsername">
        <!-- Active Chat Header -->
        <header class="chat-header">
          <div class="header-left">
            <!-- Mobile Back Button -->
            <button class="mobile-back-btn" @click="chatStore.closeChat()" title="Back to messages">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <!-- Friend Avatar & Info -->
            <div class="header-avatar-wrap">
              <div class="header-avatar" :style="getAvatarGradient(activeFriendUsername)">
                {{ activeFriendUsername.charAt(0).toUpperCase() }}
              </div>
              <span
                class="header-presence-dot"
                :class="{ online: isFriendOnline }"
              ></span>
            </div>

            <div class="header-info">
              <h3 class="header-name">@{{ activeFriendUsername }}</h3>
              <div class="header-status">
                <template v-if="chatStore.isFriendTyping">
                  <span class="typing-indicator-text">
                    typing
                    <span class="typing-wave"><span></span><span></span><span></span></span>
                  </span>
                </template>
                <template v-else>
                  <span :class="isFriendOnline ? 'status-online' : 'status-offline'">
                    {{ isFriendOnline ? 'Active now' : 'Offline' }}
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- Header Actions -->
          <div class="header-actions">
            <router-link to="/map" class="map-action-btn" title="View friend on map">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <span class="btn-label">Map</span>
            </router-link>
          </div>
        </header>

        <!-- Messages Body -->
        <div ref="messagesContainerRef" class="messages-container" @scroll="handleScroll">
          <!-- Load Earlier Button -->
          <div v-if="hasMoreMessages" class="load-more-wrap">
            <button class="load-more-btn" :disabled="chatStore.loading" @click="chatStore.loadMoreHistory()">
              {{ chatStore.loading ? 'Loading...' : '↑ Load earlier messages' }}
            </button>
          </div>

          <!-- Empty message history banner -->
          <div v-if="activeMessages.length === 0" class="start-chat-banner">
            <div class="start-chat-icon">👋</div>
            <div class="start-chat-title">Say hello to @{{ activeFriendUsername }}!</div>
            <p class="start-chat-desc">
              Messages are encrypted in transit and delivered in real-time.
            </p>
          </div>

          <!-- Message Bubbles -->
          <div
            v-for="(msg, idx) in activeMessages"
            :key="msg.id || idx"
            class="message-row"
            :class="{ 'sent-by-me': msg.senderId === authStore.user?.id }"
          >
            <!-- Bubble -->
            <div class="message-bubble">
              <div class="message-text">{{ msg.content }}</div>
              <div class="message-meta">
                <span class="message-time">{{ formatMessageTime(msg.createdAt) }}</span>
                <!-- Read/Delivered checkmark for sent messages -->
                <span v-if="msg.senderId === authStore.user?.id" class="receipt-status">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>

              <!-- Delete button on hover for sender -->
              <button
                v-if="msg.senderId === authStore.user?.id"
                class="delete-msg-btn"
                @click.stop="confirmDeleteMessage(msg.id)"
                title="Delete message"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Typing Indicator Bubble -->
          <div v-if="chatStore.isFriendTyping" class="message-row typing-row">
            <div class="typing-bubble">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>

        <!-- Input Bar -->
        <footer class="chat-input-bar">
          <div class="input-container">
            <textarea
              ref="textInputRef"
              v-model="inputContent"
              class="chat-textarea"
              placeholder="Type a message... (Press Enter to send)"
              rows="1"
              maxlength="2000"
              @keydown="handleKeyDown"
              @input="handleInput"
            ></textarea>

            <button
              class="send-btn"
              :disabled="!inputContent.trim()"
              @click="handleSend"
              title="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </footer>
      </template>

      <!-- Empty Slate When No Chat Selected -->
      <div v-else class="empty-state-view">
        <div class="empty-state-illustration">
          <div class="illustration-bubble bubble-1">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="illustration-bubble bubble-2">
            <span class="live-dot"></span>
          </div>
        </div>
        <h3 class="empty-state-title">Your Direct Messages</h3>
        <p class="empty-state-subtitle">
          Connect with your friends in real-time. Select a conversation on the left or start a new chat.
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import { useFriendsStore } from '../stores/friends';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const friendsStore = useFriendsStore();
const authStore = useAuthStore();

const searchQuery = ref('');
const inputContent = ref('');
const messagesContainerRef = ref<HTMLElement | null>(null);
const textInputRef = ref<HTMLTextAreaElement | null>(null);

const activeFriendId = computed(() => chatStore.activeFriendId);
const activeMessages = computed(() => chatStore.activeMessages);
const typingUsers = computed(() => chatStore.typingUsers);

const activeFriendUsername = computed(() => {
  const conv = chatStore.activeConversation;
  if (conv) return conv.friendUsername;
  const friend = friendsStore.acceptedFriends.find(
    (f) => getFriendIdFromFriendship(f) === activeFriendId.value,
  );
  return friend ? getFriendUsernameFromFriendship(friend) : '';
});

const isFriendOnline = computed(() => {
  const conv = chatStore.activeConversation;
  return conv ? conv.isOnline : false;
});

const hasMoreMessages = computed(() => {
  if (!activeFriendId.value) return false;
  return !!chatStore.messagesByFriend[activeFriendId.value] && chatStore.hasMoreMap[activeFriendId.value];
});

// List of accepted friends who don't have a conversation yet
const friendsWithoutConv = computed(() => {
  const existingFriendIds = new Set(chatStore.conversations.map((c) => c.friendId));

  return friendsStore.acceptedFriends
    .filter((f) => f && f.friend && f.friend.id)
    .map((f) => ({
      id: f.friend.id,
      username: f.friend.username || '',
    }))
    .filter((f) => !existingFriendIds.has(f.id));
});

// Filtered conversations by search query
const filteredConversations = computed(() => {
  if (!searchQuery.value.trim()) {
    return chatStore.conversations;
  }
  const q = searchQuery.value.toLowerCase();
  return chatStore.conversations.filter((c) =>
    c.friendUsername.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q),
  );
});

onMounted(() => {
  chatStore.loadConversations();
  friendsStore.fetchFriendships();

  // If friendId in route params, open that chat directly
  const paramFriendId = route.params.friendId as string;
  if (paramFriendId) {
    selectFriend(paramFriendId);
  }
});

// Auto-scroll to bottom whenever activeMessages changes
watch(
  () => activeMessages.value.length,
  () => {
    scrollToBottom();
  },
);

watch(
  () => chatStore.isFriendTyping,
  () => {
    scrollToBottom();
  },
);

function selectFriend(friendId: string, friendUsername?: string) {
  chatStore.openChat(friendId, friendUsername);
  nextTick(() => {
    scrollToBottom();
    textInputRef.value?.focus();
  });
}

function handleInput() {
  if (!activeFriendId.value) return;
  chatStore.sendTyping(activeFriendId.value);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  const trimmed = inputContent.value.trim();
  if (!trimmed) return;

  chatStore.sendMessage(trimmed);
  inputContent.value = '';
  nextTick(() => {
    scrollToBottom();
  });
}

function confirmDeleteMessage(messageId: string) {
  if (confirm('Delete this message?')) {
    chatStore.deleteMessage(messageId);
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
}

function handleScroll() {
  // If user scrolls to top and has more, can auto-trigger loadMoreHistory
}

function getFriendIdFromFriendship(f: any): string {
  return f?.friend?.id || (f.requesterId === authStore.user?.id ? f.addresseeId : f.requesterId);
}

function getFriendUsernameFromFriendship(f: any): string {
  return f?.friend?.username || '';
}

function getAvatarGradient(name: string): string {
  const colors = [
    'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    'linear-gradient(135deg, #10b981, #06b6d4)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #ec4899, #8b5cf6)',
    'linear-gradient(135deg, #6366f1, #3b82f6)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return `background: ${colors[index]};`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max) + '...' : str;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #090d16;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* ─── Left Sidebar ─── */
.chat-sidebar {
  width: 360px;
  min-width: 300px;
  height: 100%;
  background: #0e1422;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.sidebar-header {
  padding: 1.25rem 1.25rem 0.75rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.85rem;
}

.sidebar-title {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
  margin: 0;
}

.unread-pill {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  color: #64748b;
}

.search-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 0.6rem 2rem 0.6rem 2.2rem;
  font-size: 0.875rem;
  color: #fff;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.clear-search {
  position: absolute;
  right: 0.6rem;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.8rem;
}

/* Quick Friends Bar */
.quick-friends-bar {
  padding: 0.6rem 1.25rem;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.quick-friends-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.4rem;
  font-weight: 600;
}

.quick-friends-list {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.2rem;
}

.quick-friend-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 0.25rem 0.6rem 0.25rem 0.3rem;
  color: #e2e8f0;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.quick-friend-chip:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #fff;
}

.chip-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3b82f6;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Conversations List */
.conversations-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.empty-conv-list {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #64748b;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.empty-title {
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 0.4rem;
}

.empty-desc {
  font-size: 0.8rem;
  line-height: 1.4;
}

.conv-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 0.25rem;
  border: 1px solid transparent;
}

.conv-card:hover {
  background: rgba(255, 255, 255, 0.05);
}

.conv-card.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.presence-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #0e1422;
}

.presence-indicator.online {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
}

.presence-indicator.offline {
  background: #475569;
}

.conv-details {
  flex: 1;
  min-width: 0;
}

.conv-top-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.25rem;
}

.conv-username {
  font-weight: 600;
  font-size: 0.95rem;
  color: #f1f5f9;
}

.conv-time {
  font-size: 0.72rem;
  color: #64748b;
  flex-shrink: 0;
}

.conv-bottom-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conv-snippet {
  font-size: 0.82rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
}

.conv-snippet.is-typing {
  color: #60a5fa;
  font-style: italic;
}

.no-msg {
  color: #475569;
  font-style: italic;
}

.conv-badge {
  background: #3b82f6;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
}

/* ─── Right Main Chat ─── */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0b0f19;
  position: relative;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.5rem;
  background: #0e1422;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.mobile-back-btn {
  display: none;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 8px;
}

.mobile-back-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.header-avatar-wrap {
  position: relative;
}

.header-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  color: #fff;
}

.header-presence-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #0e1422;
  background: #64748b;
}

.header-presence-dot.online {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
}

.header-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.15rem 0;
}

.header-status {
  font-size: 0.75rem;
}

.status-online {
  color: #10b981;
  font-weight: 500;
}

.status-offline {
  color: #64748b;
}

.typing-indicator-text {
  color: #60a5fa;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 3px;
}

.typing-wave span {
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #60a5fa;
  animation: typingBounce 1s infinite;
}

.typing-wave span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-wave span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.map-action-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.map-action-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  color: #fff;
}

/* Messages Container */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.load-more-wrap {
  text-align: center;
  margin-bottom: 0.5rem;
}

.load-more-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border-radius: 9999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.load-more-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.start-chat-banner {
  text-align: center;
  padding: 3rem 1rem;
  margin: auto;
  max-width: 320px;
}

.start-chat-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.start-chat-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.35rem;
}

.start-chat-desc {
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
}

.message-row {
  display: flex;
  justify-content: flex-start;
  position: relative;
}

.message-row.sent-by-me {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 68%;
  padding: 0.75rem 1rem 0.55rem 1rem;
  border-radius: 18px 18px 18px 4px;
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(12px);
  word-break: break-word;
  animation: bubblePop 0.2s ease-out;
}

@keyframes bubblePop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.message-row.sent-by-me .message-bubble {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 18px 18px 4px 18px;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
}

.message-text {
  font-size: 0.92rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.message-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  margin-top: 0.3rem;
}

.message-time {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.55);
}

.receipt-status {
  color: rgba(255, 255, 255, 0.7);
  display: flex;
}

.delete-msg-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ef4444;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.message-bubble:hover .delete-msg-btn {
  display: flex;
}

/* Typing Bubble */
.typing-row {
  margin-top: 0.25rem;
}

.typing-bubble {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 0.6rem 0.9rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.typing-bubble .dot {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: dotPulse 1.2s infinite ease-in-out;
}

.typing-bubble .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-bubble .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1.1); opacity: 1; }
}

/* Input Bar */
.chat-input-bar {
  padding: 1rem 1.5rem;
  background: #0e1422;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.input-container {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 0.5rem 0.75rem;
  transition: all 0.2s;
}

.input-container:focus-within {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.chat-textarea {
  flex: 1;
  background: none;
  border: none;
  color: #fff;
  font-size: 0.92rem;
  outline: none;
  resize: none;
  max-height: 120px;
  font-family: inherit;
  line-height: 1.4;
  padding: 0.35rem 0;
}

.chat-textarea::placeholder {
  color: #64748b;
}

.send-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

/* Empty State View */
.empty-state-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.empty-state-illustration {
  position: relative;
  width: 90px;
  height: 90px;
  margin-bottom: 1.5rem;
}

.illustration-bubble.bubble-1 {
  width: 76px;
  height: 76px;
  border-radius: 24px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2);
}

.illustration-bubble.bubble-2 {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}

.empty-state-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.empty-state-subtitle {
  font-size: 0.9rem;
  color: #64748b;
  max-width: 360px;
  line-height: 1.5;
}

/* ─── Mobile Responsiveness ─── */
@media (max-width: 768px) {
  .chat-sidebar {
    width: 100%;
    min-width: 100%;
  }

  .chat-sidebar.hide-on-mobile {
    display: none;
  }

  .chat-main {
    display: none;
  }

  .chat-main.show-on-mobile {
    display: flex;
  }

  .mobile-back-btn {
    display: block;
  }
}
</style>
