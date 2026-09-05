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

  // ─── Location helpers ────────────────────────────
  async setLocation(userId: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.client.set(`location:${userId}`, JSON.stringify(data), { EX: ttlSeconds });
  }

  async getLocation(userId: string): Promise<Record<string, unknown> | null> {
    const raw = await this.client.get(`location:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async deleteLocation(userId: string): Promise<void> {
    await this.client.del(`location:${userId}`);
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
}
