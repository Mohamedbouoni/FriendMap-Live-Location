// ─── Socket.IO Event Names ────────────────────────────
// Single source of truth for event strings used by both API gateway and client socket store.

export const WS_EVENTS = {
  // Client → Server
  MAP_SUBSCRIBE: 'map:subscribe',
  MAP_UNSUBSCRIBE: 'map:unsubscribe',
  LOCATION_UPDATE: 'location:update',

  // Server → Client
  MAP_SNAPSHOT: 'map:snapshot',
  LOCATION_UPDATED: 'location:updated',
  LOCATION_REMOVED: 'location:removed',
  FRIENDSHIP_CHANGED: 'friendship:changed',
  ERROR: 'error',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
