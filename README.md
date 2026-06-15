# Idle RPG

A browser-based multiplayer idle RPG. Fight monsters, level up, collect loot, trade on the market, and party up with other players — all in real time.

**Stack:** React + Phaser 3 · Fastify + Socket.IO · PostgreSQL + Redis · TypeScript

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/idle-game.git
cd idle-game
```

### 2. Start the database and cache

```bash
docker-compose up -d
```

### 3. Set up the server

```bash
cd server
cp ../.env.example .env
npm install
npx prisma db push
npm run db:seed
```

### 4. Run the server

```bash
npm run dev
```

### 5. Run the client (new terminal)

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), register an account, and start playing.

---

## Features

- Real-time multiplayer combat with auto-attack and chase/kite modes
- EXP and leveling with scaling rewards based on level difference
- Equipment system with stat bonuses
- Loot drops and a player-driven market
- Party system with shared socket rooms
- Tabbed in-game chat — global, local, combat log, and loot
- Player mail system

---

## Project Structure

```
shared/   TypeScript types, constants, and Socket.IO packet interfaces
server/   Fastify + Socket.IO game server (Prisma, PostgreSQL, Redis)
client/   React + Phaser 3 game client (Vite)
```

---

## Environment

The server reads from `server/.env`. Copy `.env.example` to get started — the defaults work with the Docker Compose setup out of the box.
