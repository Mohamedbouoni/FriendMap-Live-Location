import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LocationsService } from './locations.service';

describe('LocationsService — Ingestion, Velocity & Out-of-Order Protection', () => {
  let locationsService: LocationsService;
  let prismaMock: any;
  let redisMock: any;
  let visibilityServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      locationHistory: {
        create: vi.fn().mockReturnValue({ catch: vi.fn() }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ username: 'alice' }),
      },
    };

    redisMock = {
      getLatestLocation: vi.fn().mockResolvedValue(null),
      setLatestLocation: vi.fn().mockResolvedValue(undefined),
      filterOnlineUsers: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
      isUserOnline: vi.fn().mockResolvedValue(true),
      client: {
        hGetAll: vi.fn().mockResolvedValue(null),
        hSet: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
      },
    };

    visibilityServiceMock = {
      getAuthorizedViewers: vi.fn().mockResolvedValue(['bob', 'charlie']),
      canViewerSeeOwner: vi.fn().mockResolvedValue(true),
    };

    configServiceMock = {
      get: vi.fn((key: string, defaultValue: any) => defaultValue),
    };

    locationsService = new LocationsService(
      prismaMock,
      redisMock,
      visibilityServiceMock,
      configServiceMock,
    );
  });

  it('1. Rejects timestamp older than 60 seconds (stale)', async () => {
    const staleTimestamp = Date.now() - 70_000;
    await expect(
      locationsService.processLocationUpdate('user-1', {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
        timestamp: staleTimestamp,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('2. Rejects timestamp more than 10 seconds in the future', async () => {
    const futureTimestamp = Date.now() + 15_000;
    await expect(
      locationsService.processLocationUpdate('user-1', {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
        timestamp: futureTimestamp,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. Rejects out-of-order timestamp (timestamp <= last known timestamp)', async () => {
    const now = Date.now();
    // Simulate last location recorded at 'now - 5000'
    redisMock.getLatestLocation.mockResolvedValue({
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      timestamp: now - 5000,
    });

    // Incoming point has timestamp earlier than or equal to previous point
    await expect(
      locationsService.processLocationUpdate('user-1', {
        latitude: 37.7750,
        longitude: -122.4190,
        accuracy: 5,
        timestamp: now - 6000,
      }),
    ).rejects.toThrow(/newer than previously accepted/);
  });

  it('4. Rejects movement exceeding maximum ground speed (500 km/h)', async () => {
    const now = Date.now();
    // Last location: San Francisco (37.7749, -122.4194) 5 seconds ago
    redisMock.getLatestLocation.mockResolvedValue({
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      timestamp: now - 5000,
    });

    // Next location: New York City (40.7128, -74.0060) 5 seconds later (~4,100 km in 5s)
    await expect(
      locationsService.processLocationUpdate('user-1', {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 5,
        timestamp: now,
      }),
    ).rejects.toThrow(/maximum allowed speed/);
  });

  it('5. Accepts valid update and returns authorized viewer IDs', async () => {
    const now = Date.now();
    redisMock.getLatestLocation.mockResolvedValue({
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      timestamp: now - 10000,
    });

    // Valid small movement (~11m in 10s = ~4 km/h)
    const result = await locationsService.processLocationUpdate('user-1', {
      latitude: 37.7750,
      longitude: -122.4194,
      accuracy: 5,
      timestamp: now,
    });

    expect(result.locationPayload.userId).toBe('user-1');
    expect(result.locationPayload.latitude).toBe(37.7750);
    expect(result.authorizedViewerIds).toEqual(['bob', 'charlie']);
    expect(redisMock.setLatestLocation).toHaveBeenCalled();
  });

  it('6. getSnapshotForViewer returns only ONLINE friends with latest location', async () => {
    prismaMock.friendship = {
      findMany: vi.fn().mockResolvedValue([
        { requesterId: 'alice', addresseeId: 'bob' },
        { requesterId: 'charlie', addresseeId: 'alice' },
      ]),
    };
    prismaMock.user.findMany = vi.fn().mockResolvedValue([
      { id: 'bob', username: 'Bob' },
      { id: 'charlie', username: 'Charlie' },
    ]);

    // Only 'bob' is online in Redis; 'charlie' is offline
    redisMock.filterOnlineUsers.mockResolvedValue(['bob']);
    redisMock.getLatestLocation.mockImplementation((userId: string) => {
      if (userId === 'bob') {
        return Promise.resolve({
          latitude: 48.8566,
          longitude: 2.3522,
          accuracy: 5,
          timestamp: 1700000000,
        });
      }
      return Promise.resolve(null);
    });

    const snapshot = await locationsService.getSnapshotForViewer('alice');

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].userId).toBe('bob');
    expect(snapshot[0].username).toBe('Bob');
    expect(snapshot[0].latitude).toBe(48.8566);
  });
});
