// ─── Socket.IO Event Names ────────────────────────────
// Single source of truth for event strings used by both API gateway and client socket store.

export const WS_EVENTS = {
  // Client → Server (Map)
  MAP_SUBSCRIBE: 'map:subscribe',
  MAP_UNSUBSCRIBE: 'map:unsubscribe',
  LOCATION_UPDATE: 'location:update',

  // Server → Client (Map)
  MAP_SNAPSHOT: 'map:snapshot',
  LOCATION_UPDATED: 'location:updated',
  LOCATION_REMOVED: 'location:removed',
  FRIENDSHIP_CHANGED: 'friendship:changed',
  ERROR: 'error',

  // ─── Chat ──────────────────────────────────────────
  // Client → Server
  CHAT_SEND: 'chat:send',
  CHAT_TYPING: 'chat:typing',
  CHAT_STOP_TYPING: 'chat:stop_typing',
  CHAT_READ: 'chat:read',
  CHAT_DELETE: 'chat:delete',
  CHAT_HISTORY: 'chat:history',
  CHAT_CONVERSATIONS: 'chat:conversations',

  // Server → Client
  CHAT_MESSAGE: 'chat:message',
  CHAT_DELIVERED: 'chat:delivered',
  CHAT_READ_ACK: 'chat:read_ack',
  CHAT_DELETED: 'chat:deleted',
  CHAT_HISTORY_RESP: 'chat:history_resp',
  CHAT_CONVERSATIONS_RESP: 'chat:conversations_resp',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
