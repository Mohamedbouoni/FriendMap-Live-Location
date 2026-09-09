import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FriendshipStatus } from '@friendmap/contracts';

describe('ChatService — 1-to-1 Mutual Friend Authorization & Messaging', () => {
  let chatService: ChatService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(() => {
    prismaMock = {
      friendship: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      message: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    redisMock = {
      incrementUnreadCount: vi.fn().mockResolvedValue(1),
      resetUnreadCount: vi.fn().mockResolvedValue(undefined),
      getUnreadCount: vi.fn().mockResolvedValue(0),
      getAllUnreadCounts: vi.fn().mockResolvedValue({}),
      isUserOnline: vi.fn().mockResolvedValue(true),
    };

    chatService = new ChatService(prismaMock, redisMock);
  });

  describe('Participant Key', () => {
    it('generates deterministic participantKey regardless of argument order', () => {
      const key1 = chatService.getParticipantKey('alice-id', 'bob-id');
      const key2 = chatService.getParticipantKey('bob-id', 'alice-id');
      expect(key1).toBe('alice-id:bob-id');
      expect(key2).toBe('alice-id:bob-id');
    });
  });

  describe('areMutualFriends Authorization', () => {
    it('returns true when mutual friendship is ACCEPTED', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f-1',
        requesterId: 'user-1',
        addresseeId: 'user-2',
        status: FriendshipStatus.ACCEPTED,
      });

      const isFriend = await chatService.areMutualFriends('user-1', 'user-2');
      expect(isFriend).toBe(true);
    });

    it('returns false when friendship is PENDING or does not exist', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue(null);

      const isFriend = await chatService.areMutualFriends('user-1', 'user-2');
      expect(isFriend).toBe(false);
    });

    it('returns false when user IDs are identical', async () => {
      const isFriend = await chatService.areMutualFriends('user-1', 'user-1');
      expect(isFriend).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('allows mutual friends to send messages and increments unread count in Redis', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f-1',
        status: FriendshipStatus.ACCEPTED,
      });

      const createdDate = new Date();
      prismaMock.message.create.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        recipientId: 'user-2',
        content: 'Hello Bob!',
        clientMessageId: 'client-123',
        createdAt: createdDate,
        sender: { username: 'alice' },
      });

      const result = await chatService.sendMessage(
        'user-1',
        'alice',
        'user-2',
        'Hello Bob!',
        'client-123',
      );

      expect(result.id).toBe('msg-1');
      expect(result.content).toBe('Hello Bob!');
      expect(result.senderUsername).toBe('alice');
      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: {
          senderId: 'user-1',
          recipientId: 'user-2',
          participantKey: 'user-1:user-2',
          content: 'Hello Bob!',
          clientMessageId: 'client-123',
        },
        include: {
          sender: { select: { username: true } },
        },
      });
      expect(redisMock.incrementUnreadCount).toHaveBeenCalledWith('user-2', 'user-1');
    });

    it('rejects sending messages to non-friends with ForbiddenException', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue(null);

      await expect(
        chatService.sendMessage('user-1', 'alice', 'user-stranger', 'Hi stranger'),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it('rejects sending messages to self with BadRequestException', async () => {
      await expect(
        chatService.sendMessage('user-1', 'alice', 'user-1', 'Talking to myself'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty messages with BadRequestException', async () => {
      await expect(
        chatService.sendMessage('user-1', 'alice', 'user-2', '   '),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteMessage', () => {
    it('allows sender to delete their own message', async () => {
      prismaMock.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        recipientId: 'user-2',
      });
      prismaMock.message.update.mockResolvedValue({});

      const result = await chatService.deleteMessage('user-1', 'msg-1');

      expect(result.messageId).toBe('msg-1');
      expect(result.recipientId).toBe('user-2');
      expect(prismaMock.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('forbids non-sender from deleting the message', async () => {
      prismaMock.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        recipientId: 'user-2',
      });

      await expect(
        chatService.deleteMessage('user-2', 'msg-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.message.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if message does not exist', async () => {
      prismaMock.message.findUnique.mockResolvedValue(null);

      await expect(
        chatService.deleteMessage('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsRead', () => {
    it('marks messages as read and resets Redis unread count', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f-1',
        status: FriendshipStatus.ACCEPTED,
      });
      prismaMock.message.updateMany.mockResolvedValue({ count: 3 });

      const res = await chatService.markAsRead('user-2', 'user-1');

      expect(res.affectedCount).toBe(3);
      expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
        where: {
          recipientId: 'user-2',
          senderId: 'user-1',
          readAt: null,
        },
        data: {
          readAt: expect.any(Date),
          deliveredAt: expect.any(Date),
        },
      });
      expect(redisMock.resetUnreadCount).toHaveBeenCalledWith('user-2', 'user-1');
    });
  });

  describe('getHistory', () => {
    it('returns paginated messages in chronological order for mutual friends', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f-1',
        status: FriendshipStatus.ACCEPTED,
      });

      const t1 = new Date('2026-09-08T10:00:00Z');
      const t2 = new Date('2026-09-08T10:01:00Z');

      prismaMock.message.findMany.mockResolvedValue([
        {
          id: 'msg-2',
          senderId: 'user-2',
          recipientId: 'user-1',
          content: 'Reply',
          createdAt: t2,
          sender: { username: 'bob' },
        },
        {
          id: 'msg-1',
          senderId: 'user-1',
          recipientId: 'user-2',
          content: 'Hello',
          createdAt: t1,
          sender: { username: 'alice' },
        },
      ]);

      const history = await chatService.getHistory('user-1', 'user-2', undefined, 10);

      expect(history.messages.length).toBe(2);
      expect(history.messages[0].id).toBe('msg-1');
      expect(history.messages[1].id).toBe('msg-2');
      expect(history.hasMore).toBe(false);
    });

    it('rejects history request for non-friends', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue(null);

      await expect(
        chatService.getHistory('user-1', 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
