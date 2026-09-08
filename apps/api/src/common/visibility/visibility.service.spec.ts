import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisibilityService } from './visibility.service';

describe('VisibilityService — Central canViewerSeeOwner Authorization', () => {
  let visibilityService: VisibilityService;
  let prismaMock: any;
  let redisMock: any;

  beforeEach(() => {
    prismaMock = {
      friendship: {
        findFirst: vi.fn(),
      },
      sharingSettings: {
        findUnique: vi.fn(),
      },
      sharingException: {
        findUnique: vi.fn(),
      },
    };

    redisMock = {
      client: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
      },
      getViewers: vi.fn().mockResolvedValue(null),
      setViewers: vi.fn(),
      invalidateViewers: vi.fn(),
    };

    visibilityService = new VisibilityService(prismaMock, redisMock);
  });

  it('1. Same user (viewer === owner) -> Returns TRUE', async () => {
    const result = await visibilityService.canViewerSeeOwner('user-1', 'user-1');
    expect(result).toBe(true);
  });

  it('2. Not accepted friends (pending/rejected/none) -> Returns FALSE (fail closed)', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(null);

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('3. Accepted friends + GHOST mode -> Returns FALSE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'GHOST',
    });

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('4. Accepted friends + EVERYONE mode -> Returns TRUE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'EVERYONE',
    });

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(true);
  });

  it('5. SELECTED mode + viewer IS in allow-list -> Returns TRUE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'SELECTED',
    });
    prismaMock.sharingException.findUnique.mockResolvedValue({
      type: 'ALLOW',
    });

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(true);
  });

  it('6. SELECTED mode + viewer NOT in allow-list -> Returns FALSE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'SELECTED',
    });
    prismaMock.sharingException.findUnique.mockResolvedValue(null);

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('7. EXCEPT mode + viewer IS in block-list -> Returns FALSE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'EXCEPT',
    });
    prismaMock.sharingException.findUnique.mockResolvedValue({
      type: 'BLOCK',
    });

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('8. EXCEPT mode + viewer NOT in block-list -> Returns TRUE', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue({
      mode: 'EXCEPT',
    });
    prismaMock.sharingException.findUnique.mockResolvedValue(null);

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(true);
  });

  it('9. Missing sharing settings record -> Defaults to EVERYONE mode (Returns TRUE)', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
    prismaMock.sharingSettings.findUnique.mockResolvedValue(null);

    const result = await visibilityService.canViewerSeeOwner('viewer-1', 'owner-1');
    expect(result).toBe(true);
  });
});
