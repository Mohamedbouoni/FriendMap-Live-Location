import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { FriendshipStatus } from '@friendmap/contracts';
import type {
  ChatMessagePayload,
  ChatConversationDto,
  ChatHistoryResponse,
} from '@friendmap/contracts';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Helper to derive the unique conversation key from two user IDs.
   * Sorting ensures that (A, B) and (B, A) always produce the same key.
   */
  getParticipantKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
  }

  /**
   * Verify whether two users are mutual accepted friends.
   */
  async areMutualFriends(userA: string, userB: string): Promise<boolean> {
    if (!userA || !userB || userA === userB) {
      return false;
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userA, addresseeId: userB },
          { requesterId: userB, addresseeId: userA },
        ],
        status: FriendshipStatus.ACCEPTED,
      },
    });

    return !!friendship;
  }

  /**
   * Send a chat message between mutual friends.
   */
  async sendMessage(
    senderId: string,
    senderUsername: string,
    recipientId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<ChatMessagePayload> {
    if (senderId === recipientId) {
      throw new BadRequestException('Cannot send messages to yourself');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new BadRequestException('Message content cannot be empty');
    }

    const isFriend = await this.areMutualFriends(senderId, recipientId);
    if (!isFriend) {
      throw new ForbiddenException('You can only message mutual friends');
    }

    // Idempotency check: if client provided clientMessageId, check if already exists
    if (clientMessageId) {
      const existing = await this.prisma.message.findFirst({
        where: {
          senderId,
          clientMessageId,
        },
        include: {
          sender: { select: { username: true } },
        },
      });

      if (existing) {
        return {
          id: existing.id,
          senderId: existing.senderId,
          senderUsername: existing.sender.username,
          recipientId: existing.recipientId,
          content: existing.content,
          createdAt: existing.createdAt.toISOString(),
          clientMessageId: existing.clientMessageId ?? undefined,
        };
      }
    }

    const participantKey = this.getParticipantKey(senderId, recipientId);

    const message = await this.prisma.message.create({
      data: {
        senderId,
        recipientId,
        participantKey,
        content: trimmedContent,
        clientMessageId,
      },
      include: {
        sender: { select: { username: true } },
      },
    });

    // Increment recipient's unread count in Redis
    await this.redisService.incrementUnreadCount(recipientId, senderId);

    return {
      id: message.id,
      senderId: message.senderId,
      senderUsername: message.sender.username,
      recipientId: message.recipientId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      clientMessageId: message.clientMessageId ?? undefined,
    };
  }

  /**
   * Get paginated message history between two users (cursor-based).
   */
  async getHistory(
    userId: string,
    friendId: string,
    cursor?: string,
    limit: number = 50,
  ): Promise<ChatHistoryResponse> {
    const isFriend = await this.areMutualFriends(userId, friendId);
    if (!isFriend) {
      throw new ForbiddenException('You can only view chat history with mutual friends');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const participantKey = this.getParticipantKey(userId, friendId);

    const rawMessages = await this.prisma.message.findMany({
      where: {
        participantKey,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: safeLimit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { select: { username: true } },
      },
    });
    const hasMore = rawMessages.length > safeLimit;
    const messagesSlice = hasMore ? rawMessages.slice(0, safeLimit) : rawMessages;

    const messages: ChatMessagePayload[] = messagesSlice
      .reverse() // Return in chronological order (oldest to newest)
      .map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderUsername: m.sender.username,
        recipientId: m.recipientId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        clientMessageId: m.clientMessageId ?? undefined,
      }));

    const nextCursor = hasMore ? messagesSlice[0]?.id : undefined;

    return {
      messages,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Mark messages as read from a friend.
   */
  async markAsRead(
    userId: string,
    friendId: string,
    lastReadMessageId?: string,
  ): Promise<{ affectedCount: number; lastReadMessageId?: string }> {
    const isFriend = await this.areMutualFriends(userId, friendId);
    if (!isFriend) {
      throw new ForbiddenException('You can only read messages from mutual friends');
    }

    const now = new Date();
    const whereClause: any = {
      recipientId: userId,
      senderId: friendId,
      readAt: null,
    };

    if (lastReadMessageId) {
      const targetMessage = await this.prisma.message.findUnique({
        where: { id: lastReadMessageId },
        select: { createdAt: true },
      });
      if (targetMessage) {
        whereClause.createdAt = { lte: targetMessage.createdAt };
      }
    }

    const result = await this.prisma.message.updateMany({
      where: whereClause,
      data: { readAt: now, deliveredAt: now },
    });

    // Reset unread count in Redis
    await this.redisService.resetUnreadCount(userId, friendId);

    return {
      affectedCount: result.count,
      lastReadMessageId,
    };
  }

  /**
   * Mark a message as delivered to recipient.
   */
  async markAsDelivered(messageId: string, recipientId: string): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { recipientId: true, deliveredAt: true },
    });

    if (!message || message.recipientId !== recipientId) {
      return false;
    }

    if (!message.deliveredAt) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deliveredAt: new Date() },
      });
    }

    return true;
  }

  /**
   * Soft delete a message (sender only).
   */
  async deleteMessage(
    userId: string,
    messageId: string,
  ): Promise<{ recipientId: string; messageId: string }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    return {
      recipientId: message.recipientId,
      messageId: message.id,
    };
  }

  /**
   * Get the list of all conversations for a user.
   * Lists all accepted friends, their latest message, unread count, and online status.
   */
  async getConversations(userId: string): Promise<ChatConversationDto[]> {
    // 1. Fetch all accepted friendships for this user
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: FriendshipStatus.ACCEPTED,
      },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });

    if (friendships.length === 0) {
      return [];
    }

    // Extract friend info
    const friends = friendships.map((f) => {
      return f.requesterId === userId
        ? { friendId: f.addressee.id, friendUsername: f.addressee.username }
        : { friendId: f.requester.id, friendUsername: f.requester.username };
    });

    // 2. Fetch all unread counts in one call from Redis
    const unreadMap = await this.redisService.getAllUnreadCounts(userId);

    // 3. For each friend, fetch online status and latest message
    const conversations: ChatConversationDto[] = await Promise.all(
      friends.map(async (friend) => {
        const participantKey = this.getParticipantKey(userId, friend.friendId);
        const [isOnline, lastMsg] = await Promise.all([
          this.redisService.isUserOnline(friend.friendId),
          this.prisma.message.findFirst({
            where: {
              participantKey,
              deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              content: true,
              createdAt: true,
            },
          }),
        ]);

        return {
          friendId: friend.friendId,
          friendUsername: friend.friendUsername,
          lastMessage: lastMsg?.content ?? '',
          lastMessageAt: lastMsg?.createdAt?.toISOString() ?? '',
          unreadCount: unreadMap[friend.friendId] || 0,
          isOnline,
        };
      }),
    );

    // Sort by latest message date descending (conversations with messages first)
    conversations.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return conversations;
  }
}
