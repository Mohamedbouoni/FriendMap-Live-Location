import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { VisibilityService } from '../common/visibility/visibility.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FriendshipStatus, LocationRemovalReason } from '@friendmap/contracts';

interface UserSummary {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}

interface FriendshipWithRelations {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  requester: UserSummary;
  addressee: UserSummary;
}

@Injectable()
export class FriendshipsService {
  private readonly logger = new Logger(FriendshipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly visibilityService: VisibilityService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * List all friendships (accepted, pending sent, pending received) for current user.
   */
  async getFriendships(currentUserId: string) {
    const friendships = (await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
        status: { in: [FriendshipStatus.ACCEPTED, FriendshipStatus.PENDING] },
      },
      include: {
        requester: {
          select: { id: true, email: true, username: true, createdAt: true },
        },
        addressee: {
          select: { id: true, email: true, username: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as unknown as FriendshipWithRelations[];

    return friendships.map((f) => {
      const isRequester = f.requesterId === currentUserId;
      const friendUser = isRequester ? f.addressee : f.requester;
      return {
        id: f.id,
        requesterId: f.requesterId,
        addresseeId: f.addresseeId,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
        acceptedAt: f.acceptedAt ? f.acceptedAt.toISOString() : null,
        friend: {
          ...friendUser,
          createdAt: friendUser.createdAt.toISOString(),
        },
      };
    });
  }

  /**
   * Send a friend request by email or username identifier.
   */
  async sendRequest(currentUserId: string, identifier: string) {
    const cleanId = identifier.trim().toLowerCase();

    const targetUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanId, mode: 'insensitive' } },
          { username: { equals: cleanId, mode: 'insensitive' } },
        ],
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User with specified email or username not found');
    }

    if (targetUser.id === currentUserId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check existing relationship in either direction
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, addresseeId: targetUser.id },
          { requesterId: targetUser.id, addresseeId: currentUserId },
        ],
      },
    });

    if (existing) {
      if (existing.status === FriendshipStatus.ACCEPTED) {
        throw new ConflictException('You are already friends with this user');
      }
      if (existing.status === FriendshipStatus.PENDING) {
        throw new ConflictException('A friend request is already pending between you two');
      }

      // If status is REJECTED or REMOVED, allow re-requesting by updating existing record
      const updated = (await this.prisma.friendship.update({
        where: { id: existing.id },
        data: {
          requesterId: currentUserId,
          addresseeId: targetUser.id,
          status: FriendshipStatus.PENDING,
          acceptedAt: null,
        },
        include: {
          addressee: {
            select: { id: true, email: true, username: true, createdAt: true },
          },
        },
      })) as unknown as { id: string; requesterId: string; addresseeId: string; status: FriendshipStatus; createdAt: Date; addressee: UserSummary };

      const responsePayload = {
        id: updated.id,
        requesterId: updated.requesterId,
        addresseeId: updated.addresseeId,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        acceptedAt: null,
        friend: {
          ...updated.addressee,
          createdAt: updated.addressee.createdAt.toISOString(),
        },
      };

      this.realtimeGateway.notifyFriendshipChanged(currentUserId, targetUser.id, responsePayload);

      return responsePayload;
    }

    // Create new friendship request
    const created = (await this.prisma.friendship.create({
      data: {
        requesterId: currentUserId,
        addresseeId: targetUser.id,
        status: FriendshipStatus.PENDING,
      },
      include: {
        addressee: {
          select: { id: true, email: true, username: true, createdAt: true },
        },
      },
    })) as unknown as { id: string; requesterId: string; addresseeId: string; status: FriendshipStatus; createdAt: Date; addressee: UserSummary };

    const responsePayload = {
      id: created.id,
      requesterId: created.requesterId,
      addresseeId: created.addresseeId,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      acceptedAt: null,
      friend: {
        ...created.addressee,
        createdAt: created.addressee.createdAt.toISOString(),
      },
    };

    this.realtimeGateway.notifyFriendshipChanged(currentUserId, targetUser.id, responsePayload);

    return responsePayload;
  }

  /**
   * Respond to a friend request (accept or reject).
   * Only the addressee can respond.
   */
  async respondToRequest(friendshipId: string, currentUserId: string, accept: boolean) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('Only the addressee can respond to a friend request');
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('Friend request is no longer pending');
    }

    const newStatus = accept ? FriendshipStatus.ACCEPTED : FriendshipStatus.REJECTED;

    const updated = (await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: newStatus,
        acceptedAt: accept ? new Date() : null,
      },
      include: {
        requester: {
          select: { id: true, email: true, username: true, createdAt: true },
        },
        addressee: {
          select: { id: true, email: true, username: true, createdAt: true },
        },
      },
    })) as unknown as { id: string; requesterId: string; addresseeId: string; status: FriendshipStatus; createdAt: Date; acceptedAt: Date | null; requester: UserSummary; addressee: UserSummary };

    // Invalidate Redis viewer list cache for both users
    await this.visibilityService.invalidateUserViewerCache(friendship.requesterId);
    await this.visibilityService.invalidateUserViewerCache(friendship.addresseeId);

    const payload = {
      id: updated.id,
      requesterId: updated.requesterId,
      addresseeId: updated.addresseeId,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      acceptedAt: updated.acceptedAt ? updated.acceptedAt.toISOString() : null,
      friend: {
        ...updated.requester,
        createdAt: updated.requester.createdAt.toISOString(),
      },
    };

    // Notify both users in real-time
    this.realtimeGateway.notifyFriendshipChanged(friendship.requesterId, friendship.addresseeId, payload);

    // If accepted, check if either user can now see the other's location
    if (accept) {
      await this.checkAndSendLocationAfterAccept(friendship.requesterId, friendship.addresseeId);
      await this.checkAndSendLocationAfterAccept(friendship.addresseeId, friendship.requesterId);
    }

    return payload;
  }

  /**
   * Remove a friendship or cancel a request.
   * Either party can perform this.
   */
  async removeFriendship(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    if (friendship.requesterId !== currentUserId && friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('You are not a member of this friendship');
    }

    await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.REMOVED },
    });

    // Invalidate Redis viewer cache for both users
    await this.visibilityService.invalidateUserViewerCache(friendship.requesterId);
    await this.visibilityService.invalidateUserViewerCache(friendship.addresseeId);

    // Remove live markers from both users' maps immediately (< 2s SLA)
    this.realtimeGateway.notifyLocationRemoved(friendship.requesterId, friendship.addresseeId, LocationRemovalReason.UNFRIENDED);
    this.realtimeGateway.notifyLocationRemoved(friendship.addresseeId, friendship.requesterId, LocationRemovalReason.UNFRIENDED);

    // Notify both clients of friendship status change
    this.realtimeGateway.notifyFriendshipChanged(friendship.requesterId, friendship.addresseeId, {
      id: friendshipId,
      status: FriendshipStatus.REMOVED,
    });

    return { success: true, message: 'Friendship removed' };
  }

  private async checkAndSendLocationAfterAccept(viewerId: string, ownerId: string) {
    const canSee = await this.visibilityService.canViewerSeeOwner(viewerId, ownerId);
    if (canSee) {
      // Only send location if owner is currently ONLINE
      const isOnline = await this.redis.isUserOnline(ownerId);
      if (isOnline) {
        const loc = await this.redis.getLatestLocation(ownerId);
        if (loc) {
          const owner = await this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { username: true },
          });

          this.realtimeGateway.notifyLocationUpdated(viewerId, {
            userId: ownerId,
            username: owner?.username ?? '',
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp,
          });
        }
      }
    }
  }
}
