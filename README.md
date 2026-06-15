Idle RPG
A browser-based multiplayer idle RPG. Fight monsters, level up, collect loot, trade on the market, and party up with other players — all in real time.

Stack: React + Phaser 3 (client) · Fastify + Socket.IO (server) · PostgreSQL + Redis · TypeScript throughout

Prerequisites
Node.js v18+
Docker Desktop
Getting Started
1. Start the database and cache


docker-compose up -d
2. Set up the server


cd server
cp ../.env.example .env
npm install
npx prisma db push
npm run db:seed
3. Start the server (leave this terminal running)


npm run dev
4. Start the client (in a new terminal)


cd client
npm install
npm run dev
Open http://localhost:5173, register an account, and start playing.

Features
Real-time multiplayer combat with auto-attack and chase/kite modes
EXP and leveling system with scaling rewards
Equipment with stat bonuses
Loot drops and a player-driven market
Party system with shared rooms
In-game chat (global, local, combat log, loot)
Player mail system
Project Structure

shared/   — TypeScript types and Socket.IO packet interfaces
server/   — Fastify + Socket.IO game server
client/   — React + Phaser 3 game client
