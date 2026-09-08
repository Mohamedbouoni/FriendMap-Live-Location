import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SharingMode } from '@friendmap/contracts';

@Injectable()
export class VisibilityService {
  private readonly logger = new Logger(VisibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Core authorization function ─────────────────
  // This is the single, centralized, fail-closed function
  // used by HTTP, WebSocket subscribe, and every live event.
  async canViewerSeeOwner(viewerId: string, ownerId: string): Promise<boolean> {
    try {
      // 0. Self-view: user can always view their own location
      if (viewerId === ownerId) return true;

      // 1. Friendship must be ACCEPTED (checks both directions)
      const friendship = await this.findAcceptedFriendship(viewerId, ownerId);
      if (!friendship) return false;

      // 2. Load owner's SharingSettings (default to EVERYONE if none exist)
      const settings = await this.getSharingSettings(ownerId);
      const mode = settings?.mode ?? SharingMode.EVERYONE;

      // 3. Evaluate mode
      switch (mode) {
        case SharingMode.GHOST:
          return false;

        case SharingMode.EVERYONE:
          return true;

        case SharingMode.SELECTED:
          return this.isInAllowList(ownerId, viewerId);

        case SharingMode.EXCEPT:
          return !(await this.isInBlockList(ownerId, viewerId));

        default:
          return false; // fail closed on unknown mode
      }
    } catch (error) {
      // Fail closed on any error — never leak location on failure
      this.logger.error(
        `canViewerSeeOwner failed for viewer=${viewerId} owner=${ownerId}`,
        error,
      );
      return false;
    }
  }

  // ─── Get all viewers authorized to see an owner ──
  async getAuthorizedViewers(ownerId: string): Promise<string[]> {
    // Check Redis cache first
    const cached = await this.redis.getViewers(ownerId);
    if (cached !== null) return cached;

    // Compute from database
    const viewers = await this.computeAuthorizedViewers(ownerId);

    // Cache in Redis
    await this.redis.setViewers(ownerId, viewers);

    return viewers;
  }

  // ─── Get all owners visible to a viewer ──────────
  async getVisibleOwners(viewerId: string): Promise<string[]> {
    // Get all accepted friends
    const friends = await this.getAcceptedFriendIds(viewerId);

    // Check visibility for each friend
    const checks = await Promise.all(
      friends.map(async (friendId) => ({
        friendId,
        visible: await this.canViewerSeeOwner(viewerId, friendId),
      })),
    );

    return checks.filter((c) => c.visible).map((c) => c.friendId);
  }

  // ─── Invalidate cache on changes ─────────────────
  async invalidateOwnerCache(ownerId: string): Promise<void> {
    await this.redis.invalidateViewers(ownerId);
  }

  async invalidateUserViewerCache(userId: string): Promise<void> {
    await this.invalidateOwnerCache(userId);
  }

  async invalidateBothUsers(userId1: string, userId2: string): Promise<void> {
    await Promise.all([
      this.redis.invalidateViewers(userId1),
      this.redis.invalidateViewers(userId2),
    ]);
  }

  // ─── Private helpers ─────────────────────────────

  private async findAcceptedFriendship(userId1: string, userId2: string) {
    return this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId1, addresseeId: userId2 },
          { requesterId: userId2, addresseeId: userId1 },
        ],
      },
    });
  }

  private async getSharingSettings(userId: string) {
    return this.prisma.sharingSettings.findUnique({
      where: { userId },
    });
  }

  private async isInAllowList(ownerId: string, viewerId: string): Promise<boolean> {
    const exception = await this.prisma.sharingException.findUnique({
      where: {
        ownerId_friendId: { ownerId, friendId: viewerId },
      },
    });
    return exception?.type === 'ALLOW';
  }

  private async isInBlockList(ownerId: string, viewerId: string): Promise<boolean> {
    const exception = await this.prisma.sharingException.findUnique({
      where: {
        ownerId_friendId: { ownerId, friendId: viewerId },
      },
    });
    return exception?.type === 'BLOCK';
  }

  private async getAcceptedFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });

    return friendships.map((f: { requesterId: string; addresseeId: string }) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );
  }

  private async computeAuthorizedViewers(ownerId: string): Promise<string[]> {
    const settings = await this.getSharingSettings(ownerId);
    const mode = settings?.mode ?? SharingMode.EVERYONE;
    if (mode === SharingMode.GHOST) return [];

    const friendIds = await this.getAcceptedFriendIds(ownerId);
    if (friendIds.length === 0) return [];

    switch (mode) {
      case SharingMode.EVERYONE:
        return friendIds;

      case SharingMode.SELECTED: {
        const allowList = await this.prisma.sharingException.findMany({
          where: { ownerId, type: 'ALLOW' },
          select: { friendId: true },
        });
        const allowedIds = new Set(allowList.map((e: { friendId: string }) => e.friendId));
        return friendIds.filter((id) => allowedIds.has(id));
      }

      case SharingMode.EXCEPT: {
        const blockList = await this.prisma.sharingException.findMany({
          where: { ownerId, type: 'BLOCK' },
          select: { friendId: true },
        });
        const blockedIds = new Set(blockList.map((e: { friendId: string }) => e.friendId));
        return friendIds.filter((id) => !blockedIds.has(id));
      }

      default:
        return [];
    }
  }
}
