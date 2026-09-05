import { PrismaClient, SharingMode, FriendshipStatus, SharingExceptionType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FriendMap database...');

  const password = await argon2.hash('Password123!', { type: argon2.argon2id });

  // ─── Create demo users ─────────────────────────────
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'alice@example.com',
      username: 'alice',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.EVERYONE } },
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'bob@example.com',
      username: 'bob',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.SELECTED } },
    },
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'charlie@example.com',
      username: 'charlie',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.EXCEPT } },
    },
  });

  const diana = await prisma.user.upsert({
    where: { email: 'diana@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'diana@example.com',
      username: 'diana',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.GHOST } },
    },
  });

  const david = await prisma.user.upsert({
    where: { email: 'david@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'david@example.com',
      username: 'david',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.GHOST } },
    },
  });

  const eve = await prisma.user.upsert({
    where: { email: 'eve@example.com' },
    update: { passwordHash: password },
    create: {
      email: 'eve@example.com',
      username: 'eve',
      passwordHash: password,
      sharingSettings: { create: { mode: SharingMode.GHOST } },
    },
  });

  console.log('  ✅ Users created: alice, bob, charlie, diana, david, eve');
  console.log('     Password for all: Password123!');

  // ─── Create accepted friendships ──────────────────────
  const friendshipPairs = [
    [alice.id, bob.id],
    [alice.id, charlie.id],
    [alice.id, diana.id],
    [bob.id, charlie.id],
    [charlie.id, eve.id],
  ];

  for (const [requesterId, addresseeId] of friendshipPairs) {
    await prisma.friendship.upsert({
      where: {
        requesterId_addresseeId: { requesterId, addresseeId },
      },
      update: {},
      create: {
        requesterId,
        addresseeId,
        status: FriendshipStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });
  }

  console.log('  ✅ Friendships: alice↔bob, alice↔charlie, alice↔diana, bob↔charlie, charlie↔eve');

  // ─── Sharing exceptions ──────────────────────────────
  // Bob (SELECTED mode): allows only alice
  await prisma.sharingException.upsert({
    where: {
      ownerId_friendId: { ownerId: bob.id, friendId: alice.id },
    },
    update: {},
    create: {
      ownerId: bob.id,
      friendId: alice.id,
      type: SharingExceptionType.ALLOW,
    },
  });

  // Charlie (EXCEPT mode): blocks bob
  await prisma.sharingException.upsert({
    where: {
      ownerId_friendId: { ownerId: charlie.id, friendId: bob.id },
    },
    update: {},
    create: {
      ownerId: charlie.id,
      friendId: bob.id,
      type: SharingExceptionType.BLOCK,
    },
  });

  console.log('  ✅ Exceptions: bob ALLOWs alice, charlie BLOCKs bob');
  console.log('');
  console.log('🎉 Seed complete! Demo visibility matrix:');
  console.log('   alice (EVERYONE) → visible to: bob, charlie, diana');
  console.log('   bob (SELECTED, allow alice) → visible to: alice only');
  console.log('   charlie (EXCEPT, block bob) → visible to: alice, eve (not bob)');
  console.log('   diana (GHOST) → visible to: nobody');
  console.log('   eve (EVERYONE) → visible to: charlie');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
