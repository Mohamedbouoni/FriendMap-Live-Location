import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = createClient({ url }) as RedisClientType;

    this.client.on('error', (err: any) => {
      this.logger.error('Redis client error', err);
    });

    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Disconnected from Redis');
  }

  // ─── Online Presence helpers ──────────────────────

  /**
   * Register an active socket for a user.
   * Returns true if this is the user's first connection (user just came online).
   */
  async setUserOnline(userId: string, socketId: string): Promise<boolean> {
    const socketKey = `presence:sockets:${userId}`;
    const onlineSetKey = 'presence:online_users';

    const pipeline = this.client.multi();
    pipeline.sAdd(socketKey, socketId);
    pipeline.sAdd(onlineSetKey, userId);
    pipeline.sCard(socketKey);
    const results = await pipeline.exec();

    // results[2] is the cardinality after sAdd. If 1, user just transitioned to online.
    const socketCount = (results?.[2] as number) || 1;
    return socketCount === 1;
  }

  /**
   * Deregister a socket for a user upon disconnect.
   * Returns true if user has 0 active sockets left (user is now completely offline).
   */
  async setUserOffline(userId: string, socketId: string): Promise<boolean> {
    const socketKey = `presence:sockets:${userId}`;
    const onlineSetKey = 'presence:online_users';

    await this.client.sRem(socketKey, socketId);
    const remainingSockets = await this.client.sCard(socketKey);

    if (remainingSockets === 0) {
      const pipeline = this.client.multi();
      pipeline.sRem(onlineSetKey, userId);
      pipeline.del(socketKey);
      await pipeline.exec();
      return true; // Completely offline
    }

    return false; // Still has other active sockets
  }

  /**
   * Check if a specific user is currently online.
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.client.sIsMember('presence:online_users', userId);
  }

  /**
   * Filter a list of user IDs to only those who are currently online.
   */
  async filterOnlineUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const checks = await this.client.smIsMember('presence:online_users', userIds);
    return userIds.filter((_, idx) => checks[idx]);
  }

  // ─── Latest Location helpers ──────────────────────

  async setLatestLocation(
    userId: string,
    data: { latitude: number; longitude: number; accuracy: number; timestamp: number },
    ttlSeconds: number,
  ): Promise<void> {
    const key = `friendmap:latest:${userId}`;
    await this.client.hSet(key, {
      latitude: data.latitude.toString(),
      longitude: data.longitude.toString(),
      accuracy: data.accuracy.toString(),
      timestamp: data.timestamp.toString(),
    });
    await this.client.expire(key, ttlSeconds);
  }

  async getLatestLocation(
    userId: string,
  ): Promise<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null> {
    const raw = await this.client.hGetAll(`friendmap:latest:${userId}`);
    if (!raw || !raw.latitude || !raw.longitude) return null;
    return {
      latitude: parseFloat(raw.latitude),
      longitude: parseFloat(raw.longitude),
      accuracy: parseFloat(raw.accuracy || '0'),
      timestamp: parseInt(raw.timestamp || '0', 10),
    };
  }

  async deleteLatestLocation(userId: string): Promise<void> {
    await this.client.del(`friendmap:latest:${userId}`);
  }

  // ─── Visibility cache helpers ────────────────────
  async setViewers(ownerId: string, viewerIds: string[]): Promise<void> {
    const key = `visibility:viewers:${ownerId}`;
    const pipeline = this.client.multi();
    pipeline.del(key);
    if (viewerIds.length > 0) {
      pipeline.sAdd(key, viewerIds);
    }
    pipeline.expire(key, 300); // 5 min TTL
    await pipeline.exec();
  }

  async getViewers(ownerId: string): Promise<string[] | null> {
    const key = `visibility:viewers:${ownerId}`;
    const exists = await this.client.exists(key);
    if (!exists) return null;
    return this.client.sMembers(key);
  }

  async invalidateViewers(ownerId: string): Promise<void> {
    await this.client.del(`visibility:viewers:${ownerId}`);
  }

  // ─── Lua script for atomic location update ──────
  async atomicLocationUpdate(
    userId: string,
    newData: Record<string, unknown>,
    newTimestamp: number,
    ttlSeconds: number,
  ): Promise<boolean> {
    const script = `
      local current = redis.call('GET', KEYS[1])
      if current then
        local prev = cjson.decode(current)
        if tonumber(ARGV[2]) <= prev.clientTimestamp then
          return 0
        end
      end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
      return 1
    `;

    const result = await this.client.eval(script, {
      keys: [`location:${userId}`],
      arguments: [JSON.stringify(newData), String(newTimestamp), String(ttlSeconds)],
    });

    return result === 1;
  }

  // ─── Chat unread count helpers ──────────────────────

  /**
   * Increment unread message count for recipient from a specific sender.
   * Uses Redis hash: chat:unread:${recipientId} → { senderId: count }
   */
  async incrementUnreadCount(recipientId: string, senderId: string): Promise<number> {
    return this.client.hIncrBy(`chat:unread:${recipientId}`, senderId, 1);
  }

  /**
   * Reset unread count for a user from a specific friend (user read the chat).
   */
  async resetUnreadCount(userId: string, friendId: string): Promise<void> {
    await this.client.hDel(`chat:unread:${userId}`, friendId);
  }

  /**
   * Get unread count from a specific friend.
   */
  async getUnreadCount(userId: string, friendId: string): Promise<number> {
    const count = await this.client.hGet(`chat:unread:${userId}`, friendId);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Get all unread counts for a user. Returns { friendId: count } map.
   */
  async getAllUnreadCounts(userId: string): Promise<Record<string, number>> {
    const raw = await this.client.hGetAll(`chat:unread:${userId}`);
    const result: Record<string, number> = {};
    for (const [friendId, count] of Object.entries(raw)) {
      result[friendId] = parseInt(String(count), 10);
    }
    return result;
  }

  /**
   * Get total unread message count across all chats.
   */
  async getTotalUnreadCount(userId: string): Promise<number> {
    const counts = await this.getAllUnreadCounts(userId);
    return Object.values(counts).reduce((sum, c) => sum + c, 0);
  }
}
