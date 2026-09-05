import {
  SharingMode,
  FriendshipStatus,
  SharingExceptionType,
  LocationRemovalReason,
} from './enums';

// ─── User ─────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

// ─── Auth ─────────────────────────────────────────────
export interface LoginRequest {
  identifier: string; // email or username
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

// ─── Friendship ───────────────────────────────────────
export interface FriendshipDto {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt: string | null;
  friend: UserProfile; // The "other" user relative to the viewer
}

export interface SendFriendRequestDto {
  identifier: string; // email or username
}

export interface RespondFriendRequestDto {
  accept: boolean;
}

// ─── Sharing ──────────────────────────────────────────
export interface SharingSettingsDto {
  mode: SharingMode;
  exceptions: SharingExceptionDto[];
}

export interface SharingExceptionDto {
  friendId: string;
  friendUsername: string;
  type: SharingExceptionType;
}

export interface UpdateSharingModeDto {
  mode: SharingMode;
}

export interface UpdateExceptionsDto {
  exceptions: Array<{
    friendId: string;
    type: SharingExceptionType;
  }>;
}

// ─── Location ─────────────────────────────────────────
export interface LocationUpdatePayload {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number; // Unix ms
}

export interface FriendLocation {
  userId: string;
  username: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number; // Unix ms — client uses this for stale detection
}

export interface MapSnapshotPayload {
  locations: FriendLocation[];
}

export interface LocationRemovedPayload {
  userId: string;
  reason: LocationRemovalReason;
}

export interface LocationUpdatedPayload extends FriendLocation {}

// ─── Friendship Changed ──────────────────────────────
export interface FriendshipChangedPayload {
  friendship: FriendshipDto;
  status: FriendshipStatus;
}

// ─── Location History ────────────────────────────────
export interface LocationHistoryEntry {
  latitude: number;
  longitude: number;
  accuracy: number;
  clientTimestamp: string;
  receivedAt: string;
}

// ─── Error ───────────────────────────────────────────
export interface WsErrorPayload {
  code: string;
  message: string;
}
