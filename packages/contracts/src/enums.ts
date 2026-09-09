// ─── Sharing Mode ──────────────────────────────────────
export enum SharingMode {
  GHOST = 'GHOST',
  EVERYONE = 'EVERYONE',
  SELECTED = 'SELECTED',
  EXCEPT = 'EXCEPT',
}

// ─── Friendship Status ────────────────────────────────
export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
}

// ─── Sharing Exception Type ──────────────────────────
export enum SharingExceptionType {
  ALLOW = 'ALLOW',
  BLOCK = 'BLOCK',
}

// ─── Location Removal Reason ─────────────────────────
export enum LocationRemovalReason {
  GHOST = 'ghost',
  BLOCKED = 'blocked',
  UNFRIENDED = 'unfriended',
  SETTINGS_CHANGED = 'settings_changed',
  OFFLINE = 'offline',
  PRIVACY_MODE_CHANGED = 'privacy_mode_changed',
}
