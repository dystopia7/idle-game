import { io, type Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@idle-rpg/shared'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let _socket: GameSocket | null = null

export function connectSocket(token: string): GameSocket {
  _socket = io(import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000', {
    auth:                { token },
    reconnectionAttempts: 5,
    reconnectionDelay:   2000,
  }) as GameSocket
  return _socket
}

export function getSocket(): GameSocket {
  if (!_socket) throw new Error('Socket not initialised — call connectSocket first')
  return _socket
}

export function disconnectSocket() {
  _socket?.disconnect()
  _socket = null
}
