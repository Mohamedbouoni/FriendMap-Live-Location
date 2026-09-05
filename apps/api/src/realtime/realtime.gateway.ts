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
import { WS_EVENTS } from '@friendmap/contracts';
import { PublishLocationDto } from '../locations/dto/publish-location.dto';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    username: string;
    isSubscribedToMap?: boolean;
  };
}

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

  constructor(
    private readonly jwtService: JwtService,
    private readonly locationsService: LocationsService,
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
    } catch {
      this.logger.warn(`WS connection rejected: Invalid token (socket ${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.clientTimestamps.delete(client.id);
    if (client.data?.userId) {
      this.logger.log(`WS Client disconnected: User ${client.data.username} (${client.data.userId})`);
    }
  }

  /**
   * map:subscribe — Client subscribes to live map updates.
   * Sends initial map:snapshot payload of all currently visible friend locations.
   */
  @SubscribeMessage(WS_EVENTS.MAP_SUBSCRIBE)
  async handleMapSubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (!userId) return;

    client.data.isSubscribedToMap = true;
    client.join(`map_subscribers:${userId}`);

    const locations = await this.locationsService.getSnapshotForViewer(userId);
    client.emit(WS_EVENTS.MAP_SNAPSHOT, { locations });
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

    try {
      const { locationPayload, authorizedViewerIds } =
        await this.locationsService.processLocationUpdate(userId, dto);

      // Fan out targeted updates ONLY to authorized viewers
      for (const viewerId of authorizedViewerIds) {
        this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_UPDATED, locationPayload);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Location validation failed';
      client.emit(WS_EVENTS.ERROR, {
        code: 'INVALID_LOCATION',
        message,
      });
    }
  }

  /**
   * Helper method to broadcast location update to specific viewer
   */
  notifyLocationUpdated(viewerId: string, payload: Record<string, unknown>) {
    this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_UPDATED, payload);
  }

  /**
   * Helper method to broadcast location removal event to specific viewer
   */
  notifyLocationRemoved(viewerId: string, ownerUserId: string, reason: string) {
    this.server.to(`user:${viewerId}`).emit(WS_EVENTS.LOCATION_REMOVED, {
      userId: ownerUserId,
      reason,
    });
  }

  /**
   * Helper method to broadcast friendship changes
   */
  notifyFriendshipChanged(userId1: string, userId2: string, friendshipPayload: Record<string, unknown>) {
    this.server.to(`user:${userId1}`).to(`user:${userId2}`).emit(WS_EVENTS.FRIENDSHIP_CHANGED, friendshipPayload);
  }
}
