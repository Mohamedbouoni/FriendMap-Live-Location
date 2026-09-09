import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSocketStore } from './socket';
import { useAuthStore } from './auth';
import { WS_EVENTS } from '@friendmap/contracts';
import type {
  ChatMessagePayload,
  ChatConversationDto,
  ChatHistoryResponse,
  ChatDeletedPayload,
  ChatReadAckPayload,
  ChatDeliveredPayload,
} from '@friendmap/contracts';

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<ChatConversationDto[]>([]);
  const activeFriendId = ref<string | null>(null);
  const messagesByFriend = ref<Record<string, ChatMessagePayload[]>>({});
  const typingUsers = ref<Record<string, boolean>>({});
  const hasMoreMap = ref<Record<string, boolean>>({});
  const nextCursorMap = ref<Record<string, string | undefined>>({});
  const loading = ref(false);
  const listenersSetup = ref(false);

  const socketStore = useSocketStore();
  const authStore = useAuthStore();

  // ─── Computed ────────────────────────────────────────────────────────────

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.friendId === activeFriendId.value) ?? null,
  );

  const activeMessages = computed(() => {
    if (!activeFriendId.value) return [];
    return messagesByFriend.value[activeFriendId.value] || [];
  });

  const totalUnreadCount = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
  );

  const isFriendTyping = computed(() => {
    if (!activeFriendId.value) return false;
    return !!typingUsers.value[activeFriendId.value];
  });

  // ─── Setup Socket Listeners ──────────────────────────────────────────────

  function setupSocketListeners() {
    const socket = socketStore.socket;
    if (!socket || listenersSetup.value) return;

    listenersSetup.value = true;

    // New message received
    socket.on(WS_EVENTS.CHAT_MESSAGE, (msg: ChatMessagePayload) => {
      const currentUserId = authStore.user?.id;
      const isSentByMe = msg.senderId === currentUserId;
      const friendId = isSentByMe ? msg.recipientId : msg.senderId;

      // Append to messages list
      if (!messagesByFriend.value[friendId]) {
        messagesByFriend.value[friendId] = [];
      }

      const existingIndex = messagesByFriend.value[friendId].findIndex(
        (m) =>
          m.id === msg.id ||
          (msg.clientMessageId && m.clientMessageId === msg.clientMessageId),
      );

      if (existingIndex !== -1) {
        messagesByFriend.value[friendId][existingIndex] = msg;
      } else {
        messagesByFriend.value[friendId].push(msg);
      }

      // Update conversation in list
      const convIndex = conversations.value.findIndex((c) => c.friendId === friendId);
      if (convIndex !== -1) {
        const conv = conversations.value[convIndex];
        conv.lastMessage = msg.content;
        conv.lastMessageAt = msg.createdAt;

        // If not looking at this chat and received from friend, increment unread
        if (!isSentByMe && activeFriendId.value !== friendId) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }

        // Move conversation to top
        conversations.value.splice(convIndex, 1);
        conversations.value.unshift(conv);
      } else {
        // Conversation not yet in list — re-fetch conversations
        loadConversations();
      }

      // If this chat is currently open and message is from friend, mark as read immediately
      if (activeFriendId.value === friendId && !isSentByMe) {
        markAsRead(friendId, msg.id);
      }
    });

    // Message delivery receipt
    socket.on(WS_EVENTS.CHAT_DELIVERED, (_payload: ChatDeliveredPayload) => {
      // Delivered indicator can be reflected if needed
    });

    // Read receipt
    socket.on(WS_EVENTS.CHAT_READ_ACK, (payload: ChatReadAckPayload) => {
      const friendId = payload.userId;
      if (messagesByFriend.value[friendId]) {
        // Can mark sent messages as read
      }
    });

    // Typing indicators
    socket.on(WS_EVENTS.CHAT_TYPING, (payload: { userId: string; username: string }) => {
      typingUsers.value = {
        ...typingUsers.value,
        [payload.userId]: true,
      };
    });

    socket.on(WS_EVENTS.CHAT_STOP_TYPING, (payload: { userId: string; username: string }) => {
      typingUsers.value = {
        ...typingUsers.value,
        [payload.userId]: false,
      };
    });

    // Message deleted
    socket.on(WS_EVENTS.CHAT_DELETED, (payload: ChatDeletedPayload) => {
      for (const friendId of Object.keys(messagesByFriend.value)) {
        messagesByFriend.value[friendId] = messagesByFriend.value[friendId].filter(
          (m) => m.id !== payload.messageId,
        );
      }
    });

    // Conversations response
    socket.on(WS_EVENTS.CHAT_CONVERSATIONS_RESP, (data: { conversations: ChatConversationDto[] }) => {
      conversations.value = data.conversations;
    });

    // History response
    socket.on(WS_EVENTS.CHAT_HISTORY_RESP, (data: ChatHistoryResponse) => {
      if (!activeFriendId.value) return;
      const friendId = activeFriendId.value;

      hasMoreMap.value[friendId] = data.hasMore;
      nextCursorMap.value[friendId] = data.nextCursor;

      const existing = messagesByFriend.value[friendId] || [];
      const newMessages = data.messages;

      // Merge avoiding duplicates
      const seenIds = new Set(existing.map((m) => m.id));
      const filteredNew = newMessages.filter((m) => !seenIds.has(m.id));

      messagesByFriend.value[friendId] = [...filteredNew, ...existing].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      loading.value = false;
    });
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  function loadConversations() {
    setupSocketListeners();
    if (socketStore.socket && socketStore.connected) {
      socketStore.socket.emit(WS_EVENTS.CHAT_CONVERSATIONS);
    }
  }

  function openChat(friendId: string, friendUsername?: string) {
    setupSocketListeners();
    activeFriendId.value = friendId;

    // If conversation doesn't exist yet, insert a placeholder
    const existing = conversations.value.find((c) => c.friendId === friendId);
    if (!existing && friendUsername) {
      conversations.value.unshift({
        friendId,
        friendUsername,
        lastMessage: '',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        isOnline: false,
      });
    }

    // Mark as read
    markAsRead(friendId);

    // Fetch message history if not loaded yet
    if (!messagesByFriend.value[friendId] || messagesByFriend.value[friendId].length === 0) {
      fetchHistory(friendId);
    }
  }

  function closeChat() {
    if (activeFriendId.value) {
      sendStopTyping(activeFriendId.value);
    }
    activeFriendId.value = null;
  }

  function fetchHistory(friendId: string, cursor?: string) {
    if (!socketStore.socket || !socketStore.connected) return;
    loading.value = true;
    socketStore.socket.emit(WS_EVENTS.CHAT_HISTORY, {
      friendId,
      cursor,
      limit: 50,
    });
  }

  function loadMoreHistory() {
    if (!activeFriendId.value) return;
    const friendId = activeFriendId.value;
    const cursor = nextCursorMap.value[friendId];
    if (hasMoreMap.value[friendId] && cursor && !loading.value) {
      fetchHistory(friendId, cursor);
    }
  }

  function sendMessage(content: string) {
    if (!activeFriendId.value || !socketStore.socket || !socketStore.connected) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    const recipientId = activeFriendId.value;
    const clientMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Stop typing indicator when message is sent
    sendStopTyping(recipientId);

    socketStore.socket.emit(WS_EVENTS.CHAT_SEND, {
      recipientId,
      content: trimmed,
      clientMessageId,
    });
  }

  function markAsRead(friendId: string, lastReadMessageId?: string) {
    if (!socketStore.socket || !socketStore.connected) return;

    socketStore.socket.emit(WS_EVENTS.CHAT_READ, {
      friendId,
      lastReadMessageId,
    });

    // Reset local unread count
    const conv = conversations.value.find((c) => c.friendId === friendId);
    if (conv) {
      conv.unreadCount = 0;
    }
  }

  function deleteMessage(messageId: string) {
    if (!socketStore.socket || !socketStore.connected) return;

    socketStore.socket.emit(WS_EVENTS.CHAT_DELETE, {
      messageId,
    });
  }

  let typingTimeout: any = null;

  function sendTyping(friendId: string) {
    if (!socketStore.socket || !socketStore.connected) return;

    socketStore.socket.emit(WS_EVENTS.CHAT_TYPING, { friendId });

    // Auto clear typing after 3 seconds of inactivity
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      sendStopTyping(friendId);
    }, 3000);
  }

  function sendStopTyping(friendId: string) {
    if (!socketStore.socket || !socketStore.connected) return;
    clearTimeout(typingTimeout);
    socketStore.socket.emit(WS_EVENTS.CHAT_STOP_TYPING, { friendId });
  }

  return {
    conversations,
    activeFriendId,
    messagesByFriend,
    typingUsers,
    loading,
    activeConversation,
    activeMessages,
    totalUnreadCount,
    isFriendTyping,
    setupSocketListeners,
    loadConversations,
    openChat,
    closeChat,
    fetchHistory,
    loadMoreHistory,
    sendMessage,
    markAsRead,
    deleteMessage,
    sendTyping,
    sendStopTyping,
  };
});
