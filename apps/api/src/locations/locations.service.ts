import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { VisibilityService } from '../common/visibility/visibility.service';
import { speedKmh, haversineDistanceKm } from '../common/utils/haversine';
import { PublishLocationDto } from './dto/publish-location.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly maxSpeedKmh: number;
  private readonly maxPastMs: number;
  private readonly maxFutureMs: number;
  private readonly locationTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly visibilityService: VisibilityService,
    private readonly configService: ConfigService,
  ) {
    this.maxSpeedKmh = this.configService.get<number>('MAX_SPEED_KMH', 500);
    this.maxPastMs = this.configService.get<number>('MAX_PAST_MS', 60_000);
    this.maxFutureMs = this.configService.get<number>('MAX_FUTURE_MS', 10_000);
    this.locationTtlSec = this.configService.get<number>('LOCATION_TTL_SEC', 86_400);
  }

  /**
   * Validate, store, and process a location update for a user.
   */
  async processLocationUpdate(userId: string, dto: PublishLocationDto) {
    const now = Date.now();

    // 1. Timestamp Freshness Check
    if (now - dto.timestamp > this.maxPastMs) {
      throw new BadRequestException(`Location timestamp is too old (exceeds ${Math.round(this.maxPastMs / 1000)} seconds)`);
    }
    if (dto.timestamp - now > this.maxFutureMs) {
      throw new BadRequestException('Location timestamp is too far in the future');
    }

    // 2. Checks against last known location
    const prev = await this.redis.getLatestLocation(userId);
    if (prev) {
      // 2a. Out-of-order rejection
      if (dto.timestamp <= prev.timestamp) {
        throw new BadRequestException(
          'Location timestamp must be newer than previously accepted update',
        );
      }

      // 2b. Haversine Speed Check (with GPS micro-jitter guard: > 50 meters)
      const distKm = haversineDistanceKm(prev.latitude, prev.longitude, dto.latitude, dto.longitude);
      const calculatedSpeed = speedKmh(
        prev.latitude,
        prev.longitude,
        prev.timestamp,
        dto.latitude,
        dto.longitude,
        dto.timestamp,
      );

      if (distKm > 0.05 && calculatedSpeed > this.maxSpeedKmh) {
        this.logger.warn(
          `Speed check failed for user ${userId}: ${calculatedSpeed.toFixed(2)} km/h exceeds ${this.maxSpeedKmh} km/h (dist: ${(distKm * 1000).toFixed(0)}m)`,
        );
        throw new BadRequestException(
          `Movement speed exceeds maximum allowed speed of ${this.maxSpeedKmh} km/h`,
        );
      }
    }

    // 3. Fast Store in Redis
    await this.redis.setLatestLocation(
      userId,
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        timestamp: dto.timestamp,
      },
      this.locationTtlSec,
    );

    // 4. Async Store in Postgres LocationHistory
    this.prisma.locationHistory
      .create({
        data: {
          userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          clientTimestamp: new Date(dto.timestamp),
        },
      })
      .catch((err: Error) => {
        this.logger.error(`Failed to persist location history for user ${userId}: ${err.message}`);
      });

    // 5. Get user details for broadcast payload
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const locationPayload = {
      userId,
      username: user?.username ?? 'Unknown',
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      timestamp: dto.timestamp,
    };

    // 6. Get authorized viewers
    const authorizedViewerIds = await this.visibilityService.getAuthorizedViewers(userId);

    return {
      locationPayload,
      authorizedViewerIds,
    };
  }

  /**
   * Fetch user's own location history for the last 24 hours.
   */
  async getUserHistory(userId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const history = await this.prisma.locationHistory.findMany({
      where: {
        userId,
        clientTimestamp: { gte: twentyFourHoursAgo },
      },
      orderBy: { clientTimestamp: 'asc' },
      take: 1000,
    });

    return history.map((h: { latitude: number; longitude: number; accuracy: number; clientTimestamp: Date; receivedAt: Date }) => ({
      latitude: h.latitude,
      longitude: h.longitude,
      accuracy: h.accuracy,
      clientTimestamp: h.clientTimestamp.toISOString(),
      receivedAt: h.receivedAt.toISOString(),
    }));
  }

  /**
   * Fetch snapshot of latest locations for all authorized, currently ONLINE visible friends of viewer.
   */
  async getSnapshotForViewer(viewerId: string) {
    // 1. Find all accepted friends of viewer
    const acceptedFriendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
        status: 'ACCEPTED',
      },
    });

    const friendIds = acceptedFriendships.map((f: { requesterId: string; addresseeId: string }) =>
      f.requesterId === viewerId ? f.addresseeId : f.requesterId,
    );

    if (friendIds.length === 0) return [];

    // 2. Only consider friends who are CURRENTLY ONLINE in Redis
    const onlineFriendIds = await this.redis.filterOnlineUsers(friendIds);
    if (onlineFriendIds.length === 0) return [];

    // Batch fetch usernames for online friends
    const users = await this.prisma.user.findMany({
      where: { id: { in: onlineFriendIds } },
      select: { id: true, username: true },
    });
    const usernameMap = new Map(users.map((u: { id: string; username: string }) => [u.id, u.username]));

    // 3. Parallelize visibility check and location fetching for online friends
    const results = await Promise.all(
      onlineFriendIds.map(async (friendId: string) => {
        const canSee = await this.visibilityService.canViewerSeeOwner(viewerId, friendId);
        if (!canSee) return null;

        const loc = await this.redis.getLatestLocation(friendId);
        if (!loc) return null;

        return {
          userId: friendId,
          username: usernameMap.get(friendId) ?? '',
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          timestamp: loc.timestamp,
        };
      }),
    );

    return results.filter((item): item is NonNullable<typeof item> => item !== null);
  }
}
