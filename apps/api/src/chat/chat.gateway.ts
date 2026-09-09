import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { RedisService } from '../common/redis/redis.service';
import { WS_EVENTS } from '@friendmap/contracts';
import type {
  ChatSendPayload,
  ChatTypingPayload,
  ChatReadPayload,
  ChatDeletePayload,
  ChatHistoryRequest,
} from '@friendmap/contracts';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    username: string;
    isSubscribedToMap?: boolean;
  };
}

/** Sliding window rate limiting: max 10 messages per 10 seconds */
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 10;

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:8080',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /** In-memory sliding window timestamps for chat messages per socket: socketId -> number[] */
  private readonly messageTimestamps = new Map<string, number[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Validate JWT on connection if not already authenticated by another gateway.
   */
  async handleConnection(client: AuthenticatedSocket) {
    if (client.data?.userId) {
      return;
    }

    try {
      const authHeader =
        client.handshake.headers.authorization || client.handshake.auth?.token;

      let token: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (typeof authHeader === 'string') {
        token = authHeader;
      }

      if (!token) {
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      client.data = {
        userId: payload.sub,
        email: payload.email,
        username: payload.username,
      };

      client.join(`user:${payload.sub}`);
    } catch {
      // Handled by RealtimeGateway or connection rejection
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.messageTimestamps.delete(client.id);
  }

  /**
   * Helper to ensure socket is authenticated.
   */
  private getAuthUser(client: AuthenticatedSocket): { userId: string; username: string } | null {
    if (!client.data?.userId) {
      client.emit(WS_EVENTS.ERROR, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for chat',
      });
      return null;
    }
    return { userId: client.data.userId, username: client.data.username };
  }

  /**
   * Check rate limit for sending messages.
   */
  private checkRateLimit(socketId: string): boolean {
    const now = Date.now();
    const timestamps = (this.messageTimestamps.get(socketId) || []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );

    if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
      return false;
    }

    timestamps.push(now);
    this.messageTimestamps.set(socketId, timestamps);
    return true;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  /**
   * Send a chat message.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_SEND)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatSendPayload,
  ) {
    const user = this.getAuthUser(client);
    if (!user) return;

    if (!payload?.recipientId || !payload?.content) {
      client.emit(WS_EVENTS.ERROR, {
        code: 'BAD_REQUEST',
        message: 'recipientId and content are required',
      });
      return;
    }

    if (!this.checkRateLimit(client.id)) {
      client.emit(WS_EVENTS.ERROR, {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You are sending messages too fast. Please slow down.',
      });
      return;
    }

    try {
      const message = await this.chatService.sendMessage(
        user.userId,
        user.username,
        payload.recipientId,
        payload.content,
        payload.clientMessageId,
      );

      // Check if recipient is online
      const isRecipientOnline = await this.redisService.isUserOnline(payload.recipientId);

      if (isRecipientOnline) {
        // Mark as delivered in DB
        await this.chatService.markAsDelivered(message.id, payload.recipientId);
        // Notify sender of delivery
        this.server.to(`user:${user.userId}`).emit(WS_EVENTS.CHAT_DELIVERED, {
          messageId: message.id,
        });
      }

      // Send to recipient
      this.server.to(`user:${payload.recipientId}`).emit(WS_EVENTS.CHAT_MESSAGE, message);

      // Echo back to sender (useful for multiple devices/tabs of sender)
      this.server.to(`user:${user.userId}`).emit(WS_EVENTS.CHAT_MESSAGE, message);

      return { success: true, message };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      this.logger.warn(`Chat send error from ${user.userId}: ${message}`);
      client.emit(WS_EVENTS.ERROR, {
        code: 'CHAT_SEND_ERROR',
        message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * User is typing.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_TYPING)
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { friendId: string },
  ) {
    const user = this.getAuthUser(client);
    if (!user || !payload?.friendId) return;

    const isFriend = await this.chatService.areMutualFriends(user.userId, payload.friendId);
    if (!isFriend) return;

    this.server.to(`user:${payload.friendId}`).emit(WS_EVENTS.CHAT_TYPING, {
      userId: user.userId,
      username: user.username,
    });
  }

  /**
   * User stopped typing.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_STOP_TYPING)
  async handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { friendId: string },
  ) {
    const user = this.getAuthUser(client);
    if (!user || !payload?.friendId) return;

    const isFriend = await this.chatService.areMutualFriends(user.userId, payload.friendId);
    if (!isFriend) return;

    this.server.to(`user:${payload.friendId}`).emit(WS_EVENTS.CHAT_STOP_TYPING, {
      userId: user.userId,
      username: user.username,
    });
  }

  /**
   * Mark messages as read.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_READ)
  async handleRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatReadPayload,
  ) {
    const user = this.getAuthUser(client);
    if (!user || !payload?.friendId) return;

    try {
      const { lastReadMessageId } = await this.chatService.markAsRead(
        user.userId,
        payload.friendId,
        payload.lastReadMessageId,
      );

      // Send read receipt to the friend whose messages were read
      this.server.to(`user:${payload.friendId}`).emit(WS_EVENTS.CHAT_READ_ACK, {
        userId: user.userId,
        lastReadMessageId,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark as read';
      client.emit(WS_EVENTS.ERROR, {
        code: 'CHAT_READ_ERROR',
        message,
      });
    }
  }

  /**
   * Delete a message.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_DELETE)
  async handleDelete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatDeletePayload,
  ) {
    const user = this.getAuthUser(client);
    if (!user || !payload?.messageId) return;

    try {
      const { recipientId, messageId } = await this.chatService.deleteMessage(
        user.userId,
        payload.messageId,
      );

      const deletePayload = {
        messageId,
        deletedBy: user.userId,
      };

      // Notify recipient and sender
      this.server.to(`user:${recipientId}`).emit(WS_EVENTS.CHAT_DELETED, deletePayload);
      this.server.to(`user:${user.userId}`).emit(WS_EVENTS.CHAT_DELETED, deletePayload);

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete message';
      client.emit(WS_EVENTS.ERROR, {
        code: 'CHAT_DELETE_ERROR',
        message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Fetch chat history.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_HISTORY)
  async handleHistory(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatHistoryRequest,
  ) {
    const user = this.getAuthUser(client);
    if (!user || !payload?.friendId) return;

    try {
      const history = await this.chatService.getHistory(
        user.userId,
        payload.friendId,
        payload.cursor,
        payload.limit,
      );

      client.emit(WS_EVENTS.CHAT_HISTORY_RESP, history);
      return history;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch history';
      client.emit(WS_EVENTS.ERROR, {
        code: 'CHAT_HISTORY_ERROR',
        message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Fetch conversations list.
   */
  @SubscribeMessage(WS_EVENTS.CHAT_CONVERSATIONS)
  async handleConversations(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.getAuthUser(client);
    if (!user) return;

    try {
      const conversations = await this.chatService.getConversations(user.userId);
      const response = { conversations };

      client.emit(WS_EVENTS.CHAT_CONVERSATIONS_RESP, response);
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conversations';
      client.emit(WS_EVENTS.ERROR, {
        code: 'CHAT_CONVERSATIONS_ERROR',
        message,
      });
      return { success: false, error: message };
    }
  }
}
