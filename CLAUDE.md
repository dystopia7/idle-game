# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code and documentation in this repository.

## Project Overview

Browser-based multiplayer idle RPG. Three packages in one repo (no workspace manager — installs are per-package):

- `shared/` — TypeScript types, constants, and Socket.IO packet interfaces consumed by both client and server
- `server/` — Fastify + Socket.IO game server with Prisma (PostgreSQL) and Redis
- `client/` — React + Phaser 3 game client bundled by Vite
- `docs/` — Obsidian knowledge base tracking the game's development

## Commands

Infrastructure (run once before first dev session):
```bash
docker-compose up -d          # start Postgres and Redis
cd server
npm install
npx prisma db push            # apply schema to DB
npm run db:seed               # seed monsters and items
```

Development (run in separate terminals):
```bash
# Terminal 1 — server (hot-reloads via tsx watch)
cd server && npm run dev

# Terminal 2 — client (Vite dev server, proxies /api to localhost:3000)
cd client && npm install && npm run dev
```

Useful server scripts:
```bash
npm run db:studio     # open Prisma Studio at localhost:5555
npm run db:generate   # regenerate Prisma client after schema changes
npm run db:push       # push schema changes without migration files
```

There are no tests yet.

## Architecture

### Data flow
Auth is HTTP (Fastify REST at `/api/auth`). After login the client stores a JWT in `localStorage` and passes it as `auth: { token }` when opening the Socket.IO connection. All real-time gameplay (combat, party, chat, equip) runs over that socket.

### Monster state lives in Redis, not Postgres
`seedMonstersToRedis()` copies `Monster` rows from Postgres into a Redis hash (`HSET monsters <id> <json>`) on server start (skipped if the hash already has entries). All live HP mutations happen in Redis. Postgres `Monster` rows are the source of truth for static data; Redis is the live world state. Monster respawns are handled by a `setTimeout` that resets HP in Redis and broadcasts `monster_update` to the zone room.

### Socket handlers (`server/src/sockets/`)
- `index.ts` — JWT middleware, online player tracking in Redis (`online_players` hash), offline gold calculation on reconnect, broadcasts all monster state to newly connected players, registers sub-handlers, handles `chat` and `disconnect` events
- `combatHandlers.ts` — `attack_monster` event: rate-limit via Redis key `combat_cd:<playerId>` (TTL = `COMBAT_COOLDOWN_MS`), resolve a combat round, update monster HP in Redis, persist player HP/exp/gold/level to Postgres on kill, roll drops, schedule respawn
- `partyHandlers.ts` — `create_party`, `join_party`, `leave_party`, `disconnect`: parties are stored in Postgres; sockets join/leave Socket.IO rooms `party:<id>`; empty parties are deleted

### Shared package resolution
Vite resolves `@idle-rpg/shared` via a path alias in `vite.config.ts` pointing directly at `shared/src/index.ts` (no build step needed in dev). The server uses `tsx` which handles TypeScript paths directly. The `shared/package.json` `"main"` also points at the source `.ts` file for the same reason.

### Combat formulas (server/src/game/combat.ts)
- Damage: `max(1, attacker.attack − floor(defender.defense × 0.5) + rand(0,4))`
- Effective stats aggregate equipped inventory bonuses on top of base stats
- EXP threshold per level (Tibia formula): `50 × (level² − 5×level + 8)` — where `level` is the target level. Cumulative total to reach level x: `(50/3)(x³ − 6x² + 17x − 12)`
- EXP reward scales with level difference: +50% for fighting above your level, −10% per level below (floor 10%)

### HTTP routes (Fastify)
- `POST /api/auth/register` / `POST /api/auth/login` — no auth required, returns JWT
- `GET /api/market/listings`, `POST /api/market/list`, `POST /api/market/buy/:id`, `DELETE /api/market/listing/:id` — JWT required via `preHandler` hook
- `GET/POST /api/mail/*` — JWT required

### Environment
Copy `.env.example` to `server/.env`. The client reads `VITE_SERVER_URL` (defaults to `http://localhost:3000`); Vite's dev proxy handles `/api` so this is only needed for the socket URL in production.

---

## Client Architecture (React + Phaser 3)

The client is a React app that embeds a Phaser 3 canvas. React owns routing, all UI chrome, and shared state. Phaser owns game world rendering only. The two layers communicate through a typed event bus — never import React into Phaser scenes or Phaser into React components (except `GameCanvas`).

### Entry point and routing
`main.tsx` → `<App>` → reads `localStorage` token → renders either `<LoginView>` or `<GameLayout>`.
React handles all routing. Phaser scenes are not responsible for login/logout flow.

### React component tree
```
App
├── LoginView           (views/LoginView.tsx)  — fetch /api/auth/*, stores JWT, calls onLogin
└── GameLayout          (views/GameLayout.tsx)
    ├── TopBar          — nav bar, player username, online count, error flash, logout
    ├── LeftSidebar     — main menu nav, chase/kite mode buttons, boosted creatures
    ├── GameViewport    — Phaser canvas wrapper + floating overlay panels
    │   └── GameCanvas  — mounts/destroys Phaser.Game into a div ref
    ├── RightSidebar    — character stats (HP/XP bars), equipment grid, backpack grid
    └── BottomChat      — tabbed chat (Global/Local/Combat Log/Loot) + input
```

### GameBridge (`client/src/lib/gameBridge.ts`)
A typed singleton event bus (`GameBridge`) that decouples Phaser scenes from React components.

- Phaser → React events: `player_init`, `player_update`, `combat_log`, `chat_message`, `target_update`, `game_error`
- React → Phaser events: `set_move_mode`, `set_kite_range`, `chat_send`

Use `gameBridge.emit(event, data)` to send and `gameBridge.on(event, fn)` to subscribe (returns an unsubscribe function). `App` wires all Phaser→React bridge events to store setters once on mount.

`getGameToken()` / `setGameToken()` on the bridge module let `GameScene` read the JWT without prop-drilling through Phaser.

### GameStore (`client/src/lib/gameStore.ts`)
Vanilla `useSyncExternalStore`-based state — no Redux, no Zustand. Stores: `playerStore`, `targetStore`, `combatLog`, `chatMessages`, `modeStore`. Each store exposes:
- A plain module-level variable holding current state
- Setter/patcher functions that mutate the variable and notify listeners
- A `useXxxStore()` hook for React components to subscribe

Do not add a new state library. For new game state, follow the same `useSyncExternalStore` pattern in `gameStore.ts`.

### Phaser scenes (`client/src/scenes/`)
`BootScene` — preloads assets (all sprites are procedurally generated Phaser Graphics; no image files) then starts `GameScene`.
`GameScene` — connects Socket.IO via `connectSocket()`, handles game world rendering. Reads the JWT via `getGameToken()`. Emits bridge events to push state to React. Listens for React→Phaser bridge events (move mode, kite range).

Always use `getSocket()` (from `client/src/network/socket.ts`) after the initial connect rather than re-instantiating.

---

## Obsidian Vault Guidelines

The game development knowledge base lives in `docs/`. Claude must follow these rules to maintain daily notes, capture architectural decisions, and keep the vault map current.

### Vault structure
```
docs/
├── Daily Notes/        YYYY-MM-DD.md — chronological dev log
├── Architecture/       Technical deep-dives (Redis, Socket events, formulas)
├── Features/           System specs (Combat, Market, Mail, Parties)
└── Index.md            Map of the vault — links every major note
```

### When to update the vault
Update whenever completing a significant task: new feature, behavior-changing bug fix, architectural refactor, or schema change. Cosmetic or trivial edits do not require a vault update.

### Daily note (`docs/Daily Notes/YYYY-MM-DD.md`)
- Create the file if it does not exist for today's date.
- Append new sections for each work session; do not rewrite earlier entries.
- Use wiki-style internal links `[[Note Title]]` to reference affected system docs.

**Template:**
```markdown
# YYYY-MM-DD Dev Log

## Changes Completed
- Short bullet points describing what was added or changed.

## Fixed Bugs
- Describe the bug and how it was resolved.

## Structural Updates
- Note any architecture or schema changes and link the affected doc, e.g. [[Redis State Management]].
```

### Architecture and feature docs
When a formula, data flow, or system design changes:
1. Update the relevant file in `docs/Architecture/` or `docs/Features/`.
2. Update `CLAUDE.md` if the change affects how future code should be written.

When creating a new doc:
1. Write the file in the appropriate `docs/` subfolder.
2. Immediately add a one-line entry with an internal link to `docs/Index.md` under the matching category.

### `docs/Index.md` maintenance
Every note in `docs/Architecture/` and `docs/Features/` must have a link here. Format:
```markdown
## Architecture
- [[Redis State Management]] — live monster HP and online player tracking
- [[Socket Events]] — full client↔server Socket.IO event reference

## Features
- [[Combat System]] — formulas, EXP scaling, drop rolls
- [[Market System]] — listing, buying, and delisting items
```

### What NOT to put in the vault
- Code snippets that duplicate what is already readable in source files.
- Setup or workflow instructions — those belong in `CLAUDE.md`.
- Temporary debugging notes — daily notes are fine for these, but do not promote them to feature docs.
