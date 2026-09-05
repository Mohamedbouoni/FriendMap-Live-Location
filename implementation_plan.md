# FriendMap — Full-Stack Implementation Plan

Real-time friend location sharing with server-enforced privacy, JWT auth, WebSocket delivery, and a Vue 3 + Leaflet map client.

---

## User Review Required

> [!IMPORTANT]
> **This is a large project (~60+ files, ~8,000+ lines of code).** Estimated implementation time is significant. I will build it in phases, each verifiable independently, so you can review progress incrementally.

> [!WARNING]
> **NestJS 12 is ESM-first.** The plan uses NestJS 12 with ESM modules, Vitest (not Jest), and `prisma.config.ts`. If you prefer CommonJS/Jest for familiarity, let me know before I scaffold.

> [!IMPORTANT]
> **Docker Compose is required** for local development. Postgres and Redis run as containers. The NestJS API and Vue client also run in containers for the full demo, but can run on host during development.

---

## Open Questions

1. **Location history** — The spec says "optionally view only their own location history from the last 24 hours." Should I enable this by default, or make it a user-togglable setting? **I'll default to enabled.**

2. **Refresh tokens** — The spec mentions rotating refresh tokens stored hashed in Postgres. Should I implement full refresh-token rotation, or is a simpler long-lived JWT acceptable for the demo? **I'll implement full rotation.**

3. **Avatar system** — The spec mentions "avatar/initial data." Should users upload an avatar, or should I generate initials/identicons? **I'll generate colored initials from username.**

4. **Kubernetes manifests** — The spec describes K8s in detail. Should I produce actual K8s YAML, or keep it to Docker Compose for the demo? **I'll do Docker Compose only, with K8s documented as a future step in the README.**

---

## Proposed Changes

The project follows a monorepo structure under the workspace root:

```
friendmap/
├── apps/
│   ├── api/          ← NestJS 12 backend
│   └── client/       ← Vue 3 + Vite frontend
├── packages/
│   └── contracts/    ← Shared TypeScript types/event names
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── prisma.config.ts
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.client
├── .env.example
├── README.md
└── package.json      ← Root workspace
```

---

### Phase 1: Project Scaffolding & Infrastructure

#### [NEW] Root workspace setup
- `package.json` — npm workspaces: `apps/api`, `apps/client`, `packages/contracts`
- `.env.example` — All environment variables documented
- `docker-compose.yml` — Postgres 16, Redis 7, API, Client services
- `Dockerfile.api` — Multi-stage build for NestJS
- `Dockerfile.client` — Multi-stage build for Vue (nginx serve)

#### [NEW] `packages/contracts/`
Shared TypeScript types used by both API and client:
- `src/events.ts` — Socket.IO event name constants
- `src/dto.ts` — Location, friendship, sharing types (interfaces only; runtime validation is server-side)
- `src/enums.ts` — `SharingMode`, `FriendshipStatus`, `SharingExceptionType`

---

### Phase 2: Database & Prisma Schema

#### [NEW] `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  // Relations
  sentRequests     Friendship[]      @relation("requester")
  receivedRequests Friendship[]      @relation("addressee")
  sharingSettings  SharingSettings?
  sharingExceptionsOwned SharingException[] @relation("owner")
  sharingExceptionsFriend SharingException[] @relation("friend")
  locationHistory  LocationHistory[]
  refreshTokens    RefreshToken[]
}

model Friendship {
  id          String           @id @default(uuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  acceptedAt  DateTime?

  requester User @relation("requester", fields: [requesterId], references: [id])
  addressee User @relation("addressee", fields: [addresseeId], references: [id])

  @@unique([requesterId, addresseeId])
  @@index([addresseeId])
}

model SharingSettings {
  userId String      @id
  mode   SharingMode @default(GHOST)
  user   User        @relation(fields: [userId], references: [id])
}

model SharingException {
  id      String                @id @default(uuid())
  ownerId String
  friendId String
  type    SharingExceptionType

  owner  User @relation("owner", fields: [ownerId], references: [id])
  friend User @relation("friend", fields: [friendId], references: [id])

  @@unique([ownerId, friendId])
}

model LocationHistory {
  id              String   @id @default(uuid())
  userId          String
  latitude        Float
  longitude       Float
  accuracy        Float
  clientTimestamp  DateTime
  receivedAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, receivedAt])
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  REJECTED
  REMOVED
}

enum SharingMode {
  GHOST
  EVERYONE
  SELECTED
  EXCEPT
}

enum SharingExceptionType {
  ALLOW
  BLOCK
}
```

#### [NEW] `prisma.config.ts`
Prisma 7 configuration pointing to schema and DATABASE_URL.

---

### Phase 3: NestJS API — Core Modules

#### [NEW] `apps/api/src/main.ts`
- Bootstrap NestJS with RedisIoAdapter
- Helmet, CORS, global validation pipe, rate limiting
- Graceful shutdown hooks

#### [NEW] `apps/api/src/app.module.ts`
- Import all feature modules
- ConfigModule with `.env` validation
- ThrottlerModule for rate limiting

---

#### Auth Module (`apps/api/src/auth/`)

| File | Purpose |
|------|---------|
| `auth.module.ts` | Module definition |
| `auth.controller.ts` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| `auth.service.ts` | Argon2id hashing, JWT signing, refresh token rotation |
| `dto/register.dto.ts` | Email, username, password validation |
| `dto/login.dto.ts` | Email/username + password |
| `dto/refresh.dto.ts` | Refresh token |
| `strategies/jwt.strategy.ts` | Passport JWT strategy |
| `guards/jwt-auth.guard.ts` | Global HTTP guard |
| `guards/ws-auth.guard.ts` | WebSocket handshake authentication |

**Key decisions:**
- Access token: 15 min expiry, signed with RS256 or HS256
- Refresh token: 7 day expiry, stored as Argon2 hash in Postgres
- Registration creates default `SharingSettings` with `GHOST` mode

---

#### Users Module (`apps/api/src/users/`)

| File | Purpose |
|------|---------|
| `users.module.ts` | Module definition |
| `users.controller.ts` | `GET /users/me`, `GET /users/search?q=`, `PATCH /users/me` |
| `users.service.ts` | User CRUD, search by email/username |
| `dto/search-users.dto.ts` | Query validation |

---

#### Friendships Module (`apps/api/src/friendships/`)

| File | Purpose |
|------|---------|
| `friendships.module.ts` | Module definition |
| `friendships.controller.ts` | REST endpoints |
| `friendships.service.ts` | Business logic + real-time notifications |
| `dto/send-request.dto.ts` | Target user identifier |
| `dto/respond-request.dto.ts` | Accept/reject |

**Endpoints:**
- `POST /friendships/request` — Send friend request
- `PATCH /friendships/:id/respond` — Accept or reject
- `DELETE /friendships/:id` — Remove friendship
- `GET /friendships` — List all (with status filter)
- `GET /friendships/pending` — Pending requests for current user

**On removal:** Immediately triggers `location:removed` via the visibility service.

---

#### Sharing Module (`apps/api/src/sharing/`)

| File | Purpose |
|------|---------|
| `sharing.module.ts` | Module definition |
| `sharing.controller.ts` | REST endpoints |
| `sharing.service.ts` | Mode changes, exception list management |
| `dto/update-mode.dto.ts` | New mode |
| `dto/update-exceptions.dto.ts` | Allow/block list changes |

**Endpoints:**
- `GET /sharing/settings` — Current mode + exception list
- `PUT /sharing/mode` — Change sharing mode
- `PUT /sharing/exceptions` — Set allow/block list (replaces entire list)
- `POST /sharing/exceptions` — Add single exception
- `DELETE /sharing/exceptions/:friendId` — Remove single exception

**On mode change:** Recalculates visibility for all friends, emits `location:removed` or `location:available` per friend.

---

#### Visibility Service (`apps/api/src/common/services/visibility.service.ts`)

**The core security function:**

```typescript
async canViewerSeeOwner(viewerId: string, ownerId: string): Promise<boolean> {
  // 1. Check friendship is ACCEPTED
  // 2. Load owner's SharingSettings
  // 3. If GHOST → false
  // 4. If EVERYONE → true
  // 5. If SELECTED → check allow-list for viewer
  // 6. If EXCEPT → check block-list for viewer (true if NOT blocked)
  // 7. Default → false (fail closed)
}
```

**Also provides:**
- `getAuthorizedViewers(ownerId: string): Promise<string[]>` — All user IDs who can see this owner
- `getVisibleOwners(viewerId: string): Promise<string[]>` — All user IDs this viewer can see
- Redis caching with versioned invalidation

**Used by:** Location endpoints, WebSocket subscription, every live event, friend removal, sharing changes.

---

#### Locations Module (`apps/api/src/locations/`)

| File | Purpose |
|------|---------|
| `locations.module.ts` | Module definition |
| `locations.controller.ts` | `GET /locations/history` (own history only) |
| `locations.service.ts` | Validation, speed check, Redis write, history write |
| `dto/location-update.dto.ts` | Lat/lng/accuracy/timestamp validation |
| `validators/location.validator.ts` | Haversine speed check, timestamp freshness, bounds |

**Validation rules:**
- Latitude: -90 to 90
- Longitude: -180 to 180
- Accuracy: > 0, < 10000 meters
- Timestamp: not older than 60s, not more than 10s in the future
- Speed: ≤ 500 km/h between consecutive accepted points (Haversine)
- First point: no speed check, normal validation only

**Redis key:** `location:{userId}` — JSON with lat, lng, accuracy, clientTimestamp, acceptedAt, version. TTL 24h.

---

#### Realtime Module (`apps/api/src/realtime/`)

| File | Purpose |
|------|---------|
| `realtime.module.ts` | Module definition |
| `realtime.gateway.ts` | Socket.IO gateway with auth |
| `realtime.service.ts` | Room management, targeted fan-out |
| `adapters/redis-io.adapter.ts` | Socket.IO Redis adapter |

**Socket.IO Events:**

| Direction | Event | Payload | Purpose |
|-----------|-------|---------|---------|
| C→S | `map:subscribe` | — | Request initial snapshot of visible friends |
| C→S | `map:unsubscribe` | — | Stop receiving updates |
| C→S | `location:update` | `{lat, lng, accuracy, timestamp}` | Publish own location |
| S→C | `map:snapshot` | `{locations: [...]}` | Initial visible friend locations |
| S→C | `location:updated` | `{userId, lat, lng, accuracy, ts}` | Friend moved |
| S→C | `location:removed` | `{userId}` | Friend became invisible |
| S→C | `location:stale` | `{userId}` | 60s without update |
| S→C | `friendship:changed` | `{friendshipId, status}` | Friendship state changed |

**Room strategy:** Each user joins `user:{userId}`. Fan-out iterates authorized viewers and emits to their rooms.

**Stale detection:** Server-side timer per tracked user. After 60s without a location update, emit `location:stale` to that user's authorized viewers. Reset timer on each accepted update.

---

#### Health Module (`apps/api/src/health/`)
- `GET /health` — Liveness (always 200)
- `GET /ready` — Readiness (checks Postgres + Redis connectivity)

---

#### Common Module (`apps/api/src/common/`)

| File | Purpose |
|------|---------|
| `guards/jwt-auth.guard.ts` | HTTP JWT guard |
| `guards/ws-auth.guard.ts` | WebSocket JWT guard |
| `pipes/validation.pipe.ts` | Global class-validator pipe |
| `filters/all-exceptions.filter.ts` | Structured error responses |
| `decorators/current-user.decorator.ts` | Extract user from request |
| `services/redis.service.ts` | Redis client wrapper |
| `services/visibility.service.ts` | Core authorization logic |
| `utils/haversine.ts` | Distance calculation |
| `utils/speed-check.ts` | Speed validation |

---

### Phase 4: Vue 3 Client

#### [NEW] `apps/client/` — Vite + Vue 3 + TypeScript

**Project setup:** `create-vite` with Vue + TypeScript template.

**Key dependencies:** `vue-router`, `pinia`, `socket.io-client`, `leaflet`, `@types/leaflet`, `axios`

#### Pages & Components

| Component | Purpose |
|-----------|---------|
| `views/LoginView.vue` | Login form |
| `views/RegisterView.vue` | Registration form |
| `views/MapView.vue` | Main map page (Leaflet) |
| `views/FriendsView.vue` | Friend list + requests |
| `views/SettingsView.vue` | Sharing mode + exception list |
| `components/MapContainer.vue` | Leaflet map with friend markers |
| `components/FriendMarker.vue` | Individual marker (live/stale styling) |
| `components/FriendList.vue` | Friends sidebar |
| `components/FriendRequest.vue` | Pending request card |
| `components/SharingControls.vue` | Mode selector + friend picker |
| `components/NavBar.vue` | Top navigation |
| `components/LocationHistory.vue` | Own history polyline/timeline |

#### Stores (Pinia)

| Store | Purpose |
|-------|---------|
| `stores/auth.ts` | JWT tokens, login/register/logout, auto-refresh |
| `stores/friends.ts` | Friend list, requests, search |
| `stores/location.ts` | Own location tracking (Geolocation API), visible friends |
| `stores/sharing.ts` | Current sharing mode, exception list |
| `stores/socket.ts` | Socket.IO connection, event handling |

#### Composables

| Composable | Purpose |
|------------|---------|
| `composables/useGeolocation.ts` | Browser Geolocation API wrapper (5-15s interval) |
| `composables/useSocket.ts` | Socket.IO lifecycle management |
| `composables/useStaleDetection.ts` | Client-side 60s stale timer per marker |

#### Client Design

The UI will use a **dark-theme design** with:
- A full-screen Leaflet map as the primary view
- A collapsible left sidebar for friends/settings
- Glassmorphism panels overlaying the map
- Smooth marker animations (CSS transitions on position)
- Color-coded markers: green (live), amber (stale), with user initials
- Toast notifications for friend requests, mode changes
- Responsive layout (works on mobile browsers for multi-tab demo)

---

### Phase 5: Testing

#### Unit Tests (Vitest)

| Test file | What it covers |
|-----------|----------------|
| `visibility.service.spec.ts` | **The visibility matrix** — all combinations of mode × friendship status × exception type |
| `location.validator.spec.ts` | Coordinate bounds, timestamp freshness, speed checks |
| `auth.service.spec.ts` | Registration, login, password hashing, JWT |
| `friendships.service.spec.ts` | Request/accept/reject/remove flows |
| `sharing.service.spec.ts` | Mode changes, exception CRUD |
| `haversine.spec.ts` | Distance calculation accuracy |

The visibility matrix test should cover at minimum:

| Scenario | Expected |
|----------|----------|
| Ghost mode, accepted friend | ❌ |
| Everyone mode, accepted friend | ✅ |
| Everyone mode, pending friend | ❌ |
| Everyone mode, removed friend | ❌ |
| Selected mode, friend in allow-list | ✅ |
| Selected mode, friend NOT in allow-list | ❌ |
| Except mode, friend NOT in block-list | ✅ |
| Except mode, friend in block-list | ❌ |
| No friendship at all | ❌ |
| Viewer = owner (self) | ❌ |

#### Integration Tests
- E2E friendship + visibility flow using Supertest against a test database
- WebSocket connection + event delivery test

---

### Phase 6: Docker & Documentation

#### [NEW] `docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: friendmap
      POSTGRES_USER: friendmap
      POSTGRES_PASSWORD: friendmap_dev
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports: ["3000:3000"]
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://friendmap:friendmap_dev@postgres:5432/friendmap
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret-change-in-production

  client:
    build:
      context: .
      dockerfile: Dockerfile.client
    ports: ["8080:80"]
    depends_on: [api]

volumes:
  pgdata:
```

#### [NEW] `README.md`
Comprehensive documentation covering:
- Architecture diagram
- Quick start (`docker compose up`)
- Environment variables
- API endpoint reference
- WebSocket event reference
- Demonstration walkthrough (the 15 scenarios from the spec)
- Trade-offs section:
  - Why Vue 3 (browser geolocation, multi-tab demo)
  - Why Postgres + Redis split
  - Fan-out scaling limits
  - 100K concurrent users analysis
  - Location history: enabled, 24h TTL
  - Redis TTL enforcement
  - Authorization during initial load vs live updates
- What would break first at scale

---

## Implementation Order

| Phase | What | Depends On |
|-------|------|------------|
| 1 | Scaffolding, Docker Compose, shared contracts | — |
| 2 | Prisma schema, migrations, PrismaService | Phase 1 |
| 3a | Auth module (register, login, JWT, refresh) | Phase 2 |
| 3b | Users module | Phase 2 |
| 3c | Friendships module | Phase 3a |
| 3d | Visibility service | Phase 3c |
| 3e | Sharing module | Phase 3d |
| 3f | Locations module (validation, Redis, history) | Phase 3d |
| 3g | Realtime module (Socket.IO, events) | Phase 3d, 3f |
| 3h | Health module | Phase 2 |
| 4 | Vue 3 client (all pages + WebSocket integration) | Phase 3 |
| 5 | Tests (visibility matrix + location validation) | Phase 3 |
| 6 | Docker builds, README, demo walkthrough | Phase 4, 5 |

---

## Verification Plan

### Automated Tests
```bash
# Run all unit tests
cd apps/api && npx vitest run

# Run specific visibility matrix tests
cd apps/api && npx vitest run visibility

# Run location validation tests
cd apps/api && npx vitest run location.validator
```

### Manual Verification (Demo Walkthrough)
The 15 scenarios from the spec, executed in multiple browser tabs:

1. ✅ Two users register and log in
2. ✅ User A sends friend request to User B
3. ✅ User B accepts
4. ✅ User A shares in Everyone mode → B sees A's marker
5. ✅ User A switches to Ghost → B's marker disappears < 2s
6. ✅ User A switches to Selected, allows only B → B sees A
7. ✅ Third friend C cannot see A
8. ✅ User A switches to Except, blocks B → B loses access, C retains
9. ✅ Stale marker appears after 60s of silence
10. ✅ Invalid/impossible-speed location rejected
11. ✅ Removing friendship immediately removes access
12. ✅ `docker compose down && docker compose up` preserves data

### Docker Verification
```bash
docker compose up --build
# Open http://localhost:8080 in multiple tabs
# Run through demo scenarios
docker compose down
docker compose up  # Verify data persistence
```
