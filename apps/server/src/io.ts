import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@tacam/shared';

export type HudServer = Server<ClientToServerEvents, ServerToClientEvents>;
