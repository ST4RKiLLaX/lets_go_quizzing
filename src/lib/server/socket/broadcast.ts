import type { Server } from 'socket.io';
import type { GameState } from '../game/state-machine.js';
import { serializeHostState, serializePlayerState } from './serializers.js';

export async function broadcastStateToRoom(
  io: Server,
  roomId: string,
  state: GameState,
  events: ('state:update' | 'room:update')[] = ['state:update', 'room:update']
) {
  const sockets = await io.in(roomId).fetchSockets();
  const hostState = serializeHostState(state);
  const playerState = serializePlayerState(state);
  for (const s of sockets) {
    const st = s.data.role === 'host' ? hostState : playerState;
    for (const ev of events) {
      s.emit(ev, { state: st });
    }
  }
}
