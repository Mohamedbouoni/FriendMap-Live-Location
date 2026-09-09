import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatGateway } from './chat.gateway';
import { WS_EVENTS } from '@friendmap/contracts';

describe('ChatGateway — WebSocket Event Handling & Rate Limiting', () => {
  let chatGateway: ChatGateway;
  let jwtServiceMock: any;
  let chatServiceMock: any;
  let redisServiceMock: any;
  let mockServer: any;

  beforeEach(() => {
    jwtServiceMock = {
      verifyAsync: vi.fn(),
    };

    chatServiceMock = {
      sendMessage: vi.fn(),
      areMutualFriends: vi.fn(),
      markAsRead: vi.fn(),
      markAsDelivered: vi.fn(),
      deleteMessage: vi.fn(),
      getHistory: vi.fn(),
      getConversations: vi.fn(),
    };

    redisServiceMock = {
      isUserOnline: vi.fn().mockResolvedValue(true),
    };

    mockServer = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    };

    chatGateway = new ChatGateway(jwtServiceMock, chatServiceMock, redisServiceMock);
    chatGateway.server = mockServer;
  });

  it('handles sending messages: validates, persists via service, emits to recipient & sender', async () => {
    const mockSocket: any = {
      id: 'socket-1',
      data: {
        userId: 'user-1',
        username: 'alice',
      },
      emit: vi.fn(),
    };

    const payload = {
      recipientId: 'user-2',
      content: 'Hello Bob!',
      clientMessageId: 'cli-1',
    };

    const createdMsg = {
      id: 'msg-101',
      senderId: 'user-1',
      senderUsername: 'alice',
      recipientId: 'user-2',
      content: 'Hello Bob!',
      createdAt: new Date().toISOString(),
      clientMessageId: 'cli-1',
    };

    chatServiceMock.sendMessage.mockResolvedValue(createdMsg);

    const result = await chatGateway.handleSendMessage(mockSocket, payload);

    expect(chatServiceMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      'alice',
      'user-2',
      'Hello Bob!',
      'cli-1',
    );
    expect(mockServer.to).toHaveBeenCalledWith('user:user-2');
    expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
    expect(result?.success).toBe(true);
  });

  it('enforces rate limiting (max 10 messages per 10s window)', async () => {
    const mockSocket: any = {
      id: 'socket-burst',
      data: {
        userId: 'user-1',
        username: 'alice',
      },
      emit: vi.fn(),
    };

    chatServiceMock.sendMessage.mockResolvedValue({ id: 'msg' });

    // Send 10 messages successfully
    for (let i = 0; i < 10; i++) {
      await chatGateway.handleSendMessage(mockSocket, {
        recipientId: 'user-2',
        content: `Msg ${i}`,
      });
    }

    // 11th message should be rate limited
    await chatGateway.handleSendMessage(mockSocket, {
      recipientId: 'user-2',
      content: 'Exceeding message',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      WS_EVENTS.ERROR,
      expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    );
  });

  it('relays typing events only between mutual friends', async () => {
    const mockSocket: any = {
      id: 'socket-typing',
      data: {
        userId: 'user-1',
        username: 'alice',
      },
      emit: vi.fn(),
    };

    chatServiceMock.areMutualFriends.mockResolvedValue(true);

    await chatGateway.handleTyping(mockSocket, { friendId: 'user-2' });

    expect(mockServer.to).toHaveBeenCalledWith('user:user-2');
  });

  it('rejects typing events between non-friends', async () => {
    const mockSocket: any = {
      id: 'socket-typing-reject',
      data: {
        userId: 'user-1',
        username: 'alice',
      },
      emit: vi.fn(),
    };

    chatServiceMock.areMutualFriends.mockResolvedValue(false);

    await chatGateway.handleTyping(mockSocket, { friendId: 'user-stranger' });

    expect(mockServer.to).not.toHaveBeenCalledWith('user:user-stranger');
  });
});
