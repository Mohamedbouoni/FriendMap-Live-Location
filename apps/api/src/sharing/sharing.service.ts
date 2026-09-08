import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { VisibilityService } from '../common/visibility/visibility.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SharingMode, FriendshipStatus, SharingExceptionType } from '@friendmap/contracts';
import { ExceptionItemDto } from './dto/update-exceptions.dto';

interface PrismaExceptionWithFriend {
  friendId: string;
  type: SharingExceptionType;
  friend: {
    id: string;
    username: string;
  };
}

@Injectable()
export class SharingService {
  private readonly logger = new Logger(SharingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly visibilityService: VisibilityService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Get sharing settings for current user, including mode and exceptions with friend usernames.
   */
  async getSharingSettings(userId: string) {
    let settings = await this.prisma.sharingSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.sharingSettings.create({
        data: {
          userId,
          mode: SharingMode.EVERYONE,
        },
      });
    }

    const exceptions = (await this.prisma.sharingException.findMany({
      where: { ownerId: userId },
      include: {
        friend: {
          select: { id: true, username: true },
        },
      },
    })) as PrismaExceptionWithFriend[];

    return {
      mode: settings.mode as SharingMode,
      exceptions: exceptions.map((e) => ({
        friendId: e.friendId,
        friendUsername: e.friend.username,
        type: e.type,
      })),
    };
  }

  /**
   * Update sharing mode (GHOST, EVERYONE, SELECTED, EXCEPT).
   * Invalidates Redis viewer list cache and broadcasts changes to connected viewers in < 2 seconds.
   */
  async updateMode(userId: string, mode: SharingMode) {
    const prevViewers = await this.visibilityService.getAuthorizedViewers(userId);

    await this.prisma.sharingSettings.upsert({
      where: { userId },
      update: { mode },
      create: { userId, mode },
    });

    // Invalidate Redis viewer cache
    await this.visibilityService.invalidateUserViewerCache(userId);

    // Compute new viewers and push real-time diff to connected clients
    const newViewers = await this.visibilityService.getAuthorizedViewers(userId);
    await this.broadcastVisibilityDiff(userId, prevViewers, newViewers);

    return this.getSharingSettings(userId);
  }

  /**
   * Update exceptions list (ALLOW/BLOCK rules).
   * Validates that all friendIds are accepted friends of current user.
   * Invalidates Redis viewer list cache and broadcasts changes to connected viewers in < 2 seconds.
   */
  async updateExceptions(userId: string, exceptions: ExceptionItemDto[]) {
    const prevViewers = await this.visibilityService.getAuthorizedViewers(userId);

    // 1. Fetch user's accepted friend IDs to validate exception targets
    const acceptedFriendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: FriendshipStatus.ACCEPTED,
      },
    });

    const acceptedFriendIds = new Set(
      acceptedFriendships.map((f: { requesterId: string; addresseeId: string }) =>
        f.requesterId === userId ? f.addresseeId : f.requesterId,
      ),
    );

    for (const item of exceptions) {
      if (!acceptedFriendIds.has(item.friendId)) {
        throw new BadRequestException(
          `User ${item.friendId} is not an accepted friend and cannot be added to exception list`,
        );
      }
    }

    // 2. Replace exceptions atomically in a transaction
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Clear existing exceptions for this owner
      await tx.sharingException.deleteMany({
        where: { ownerId: userId },
      });

      // Insert new exceptions
      if (exceptions.length > 0) {
        await tx.sharingException.createMany({
          data: exceptions.map((e) => ({
            ownerId: userId,
            friendId: e.friendId,
            type: e.type,
          })),
        });
      }
    });

    // 3. Invalidate Redis viewer cache
    await this.visibilityService.invalidateUserViewerCache(userId);

    // 4. Compute new viewers and push real-time diff
    const newViewers = await this.visibilityService.getAuthorizedViewers(userId);
    await this.broadcastVisibilityDiff(userId, prevViewers, newViewers);

    return this.getSharingSettings(userId);
  }

  /**
   * Immediately propagate real-time location revocation or delivery to viewers
   * guarantees < 2 seconds latency for privacy toggle.
   */
  private async broadcastVisibilityDiff(
    ownerUserId: string,
    prevViewers: string[],
    newViewers: string[],
  ) {
    const newViewerSet = new Set(newViewers);
    const prevViewerSet = new Set(prevViewers);

    // 1. Viewers who lost access -> instantly remove marker
    const lostViewers = prevViewers.filter((v) => !newViewerSet.has(v));
    for (const viewerId of lostViewers) {
      this.realtimeGateway.notifyLocationRemoved(viewerId, ownerUserId, 'PRIVACY_MODE_CHANGED');
    }

    // 2. Viewers who gained access -> immediately send latest location if available
    const gainedViewers = newViewers.filter((v) => !prevViewerSet.has(v));
    if (gainedViewers.length > 0) {
      const loc = await this.redis.client.hGetAll(`friendmap:latest:${ownerUserId}`);
      if (loc && loc.latitude && loc.longitude) {
        const owner = await this.prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { username: true },
        });

        const payload = {
          userId: ownerUserId,
          username: owner?.username ?? '',
          latitude: parseFloat(loc.latitude),
          longitude: parseFloat(loc.longitude),
          accuracy: parseFloat(loc.accuracy || '0'),
          timestamp: parseInt(loc.timestamp || '0', 10),
        };

        for (const viewerId of gainedViewers) {
          this.realtimeGateway.notifyLocationUpdated(viewerId, payload);
        }
      }
    }
  }
}
