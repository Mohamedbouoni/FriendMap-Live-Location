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
import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { LocationsService } from '../locations/locations.service';
import { RedisService } from '../common/redis/redis.service';
import { VisibilityService } from '../common/visibility/visibility.service';
import { WS_EVENTS, LocationRemovalReason } from '@friendmap/contracts';
import { PublishLocationDto } from '../locations/dto/publish-location.dto';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    username: string;
    isSubscribedToMap?: boolean;
  };
}

/** Interval (ms) between periodic snapshot pushes to subscribed clients */
const SNAPSHOT_REFRESH_INTERVAL_MS = 30_000;

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:8080',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly clientTimestamps = new Map<string, number[]>();

  /** Per-socket interval handles for periodic snapshot refresh */
  private readonly snapshotIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly locationsService: LocationsService,
    private readonly redisService: RedisService,
    private readonly visibilityService: VisibilityService,
  ) {}

  /**
   * Validate JWT on incoming WebSocket handshake connection.
   */
  async handleConnection(client: AuthenticatedSocket) {
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
        this.logger.warn(`WS connection rejected: Missing token (socket ${client.id})`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      client.data = {
        userId: payload.sub,
        email: payload.email,
        username: payload.username,
        isSubscribedToMap: false,
      };

      // Join individual user room for targeted fan-out
      client.join(`user:${payload.sub}`);
      this.logger.log(`WS Client connected: User ${payload.username} (${payload.sub}), socket ${client.id}`);

      // Track online presence in Redis
      const justCameOnline = await this.redisService.setUserOnline(payload.sub, client.id);
      if (justCameOnline) {
        // If user already has a latest location in Redis, immediately notify authorized viewers
        const latestLoc = await this.redisService.getLatestLocation(payload.sub);
        if (latestLoc) {
          const authorizedViewers = await this.visibilityService.getAuthorizedViewers(payload.sub);
          const locationPayload = {
            userId: payload.sub,
            username: payload.username,
            ...latestLoc,
          };
          for (const viewerId of authorizedViewers) {
            this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_UPDATED, locationPayload);
          }
        }
      }
    } catch {
      this.logger.warn(`WS connection rejected: Invalid token (socket ${client.id})`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.clientTimestamps.delete(client.id);
    this.clearSnapshotInterval(client.id);
    const userId = client.data?.userId;
    if (userId) {
      this.logger.log(`WS Client disconnected: User ${client.data.username} (${userId})`);
      const isNowOffline = await this.redisService.setUserOffline(userId, client.id);
      if (isNowOffline) {
        // User has no more active socket connections — notify all authorized viewers immediately
        try {
          const authorizedViewers = await this.visibilityService.getAuthorizedViewers(userId);
          for (const viewerId of authorizedViewers) {
            this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_REMOVED, {
              userId,
              reason: LocationRemovalReason.OFFLINE,
            });
          }
        } catch (err) {
          this.logger.error(`Failed to broadcast offline removal for user ${userId}`, err);
        }
      }
    }
  }

  /**
   * map:subscribe — Client subscribes to live map updates.
   * Sends initial map:snapshot and starts periodic snapshot refresh every 30s.
   * Re-calling subscribe is safe — it replaces the existing interval.
   */
  @SubscribeMessage(WS_EVENTS.MAP_SUBSCRIBE)
  async handleMapSubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (!userId) return;

    client.data.isSubscribedToMap = true;
    client.join(`map_subscribers:${userId}`);

    // Send immediate snapshot
    await this.pushSnapshotToClient(client, userId);

    // Start periodic snapshot refresh (clear any previous interval for this socket)
    this.clearSnapshotInterval(client.id);
    const intervalId = setInterval(async () => {
      if (!client.connected || !client.data?.isSubscribedToMap) {
        this.clearSnapshotInterval(client.id);
        return;
      }
      await this.pushSnapshotToClient(client, userId);
    }, SNAPSHOT_REFRESH_INTERVAL_MS);
    this.snapshotIntervals.set(client.id, intervalId);
  }

  /**
   * map:unsubscribe — Client stops receiving live map updates.
   */
  @SubscribeMessage(WS_EVENTS.MAP_UNSUBSCRIBE)
  async handleMapUnsubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (!userId) return;

    client.data.isSubscribedToMap = false;
    client.leave(`map_subscribers:${userId}`);
    this.clearSnapshotInterval(client.id);
  }

  /**
   * location:update — Client publishes new GPS coordinates.
   * Validates velocity & age, updates Redis/Postgres, and targeted fans-out to authorized viewers.
   */
  @SubscribeMessage(WS_EVENTS.LOCATION_UPDATE)
  @UsePipes(new ValidationPipe({ transform: true }))
  async handleLocationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: PublishLocationDto,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit(WS_EVENTS.ERROR, { code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    // Rate limiting: max 3 updates per 3 seconds (1 update/sec burst 3)
    const now = Date.now();
    const timestamps = (this.clientTimestamps.get(client.id) || []).filter((t) => now - t < 3000);
    if (timestamps.length >= 3) {
      client.emit(WS_EVENTS.ERROR, {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Location update rate limit exceeded (max 1/sec, burst 3)',
      });
      return;
    }
    timestamps.push(now);
    this.clientTimestamps.set(client.id, timestamps);

    // Guard against device clock skew on mobile devices:
    // If client timestamp has drift (> 15s or future) compared to server time,
    // synchronize it to server reception time so live locations from mobile phones are NEVER dropped!
    if (Math.abs(now - dto.timestamp) > 15_000 || dto.timestamp > now + 5_000) {
      this.logger.warn(
        `Device clock skew detected for user ${userId} (${Math.round((dto.timestamp - now) / 1000)}s offset). Synchronizing to server time.`,
      );
      dto.timestamp = now;
    }

    try {
      const { locationPayload, authorizedViewerIds } =
        await this.locationsService.processLocationUpdate(userId, dto);

      // Fan out targeted updates ONLY to authorized viewers
      for (const viewerId of authorizedViewerIds) {
        this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_UPDATED, locationPayload);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Location validation failed';
      this.logger.warn(`Location update rejected for user ${userId} (${client.data?.username}): ${message}`);
      client.emit(WS_EVENTS.ERROR, {
        code: 'INVALID_LOCATION',
        message,
      });
    }
  }

  // ─── Helper methods ────────────────────────────────────

  /** Push a fresh MAP_SNAPSHOT to a single client */
  private async pushSnapshotToClient(client: AuthenticatedSocket, userId: string) {
    try {
      const locations = await this.locationsService.getSnapshotForViewer(userId);
      client.emit(WS_EVENTS.MAP_SNAPSHOT, { locations });
    } catch (err) {
      this.logger.error(`Failed to push snapshot to user ${userId}`, err);
    }
  }

  /** Clear a client's periodic snapshot interval */
  private clearSnapshotInterval(socketId: string) {
    const interval = this.snapshotIntervals.get(socketId);
    if (interval) {
      clearInterval(interval);
      this.snapshotIntervals.delete(socketId);
    }
  }

  /**
   * Broadcast location update to specific viewer
   */
  notifyLocationUpdated(viewerId: string, payload: Record<string, unknown>) {
    this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_UPDATED, payload);
  }

  /**
   * Broadcast location removal event to specific viewer
   */
  notifyLocationRemoved(viewerId: string, ownerUserId: string, reason: string) {
    this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_REMOVED, {
      userId: ownerUserId,
      reason,
    });
  }

  /**
   * Broadcast friendship changes
   */
  notifyFriendshipChanged(userId1: string, userId2: string, friendshipPayload: Record<string, unknown>) {
    this.server.to(`user:${userId1}`).to(`user:${userId2}`).emit(WS_EVENTS.FRIENDSHIP_CHANGED, friendshipPayload);
  }
}
