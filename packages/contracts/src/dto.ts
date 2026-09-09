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

// ─── Chat ────────────────────────────────────────────

/** Client → Server: send a chat message */
export interface ChatSendPayload {
  recipientId: string;
  content: string;
  clientMessageId?: string; // client-side idempotency key
}

/** Server → Client: a new chat message */
export interface ChatMessagePayload {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  content: string;
  createdAt: string; // ISO 8601
  clientMessageId?: string;
}

/** Bidirectional: typing indicator */
export interface ChatTypingPayload {
  userId: string;
  username: string;
}

/** Client → Server: mark messages as read */
export interface ChatReadPayload {
  friendId: string;
  lastReadMessageId: string;
}

/** Server → Client: read receipt acknowledgement */
export interface ChatReadAckPayload {
  userId: string; // the user who read the messages
  lastReadMessageId: string;
}

/** Server → Client: delivery confirmation */
export interface ChatDeliveredPayload {
  messageId: string;
}

/** Client → Server: delete a message */
export interface ChatDeletePayload {
  messageId: string;
}

/** Server → Client: message was deleted */
export interface ChatDeletedPayload {
  messageId: string;
  deletedBy: string;
}

/** Client → Server: request message history */
export interface ChatHistoryRequest {
  friendId: string;
  cursor?: string; // message ID for cursor-based pagination
  limit?: number;  // default 50
}

/** Server → Client: paginated message history */
export interface ChatHistoryResponse {
  messages: ChatMessagePayload[];
  hasMore: boolean;
  nextCursor?: string;
}

/** A conversation summary for the conversation list */
export interface ChatConversationDto {
  friendId: string;
  friendUsername: string;
  lastMessage: string;
  lastMessageAt: string; // ISO 8601
  unreadCount: number;
  isOnline: boolean;
}

/** Server → Client: full conversations list */
export interface ChatConversationsResponse {
  conversations: ChatConversationDto[];
}

