import { initSocket } from './socket.server';
import { registerSocketEvents } from './socket.events.new';
import { socketAuth } from './socket.auth';
import logger from '../config/logger';

export const initRealtime = (httpServer: any) => {
  const io = initSocket(httpServer)
  
  io.use(socketAuth);
  registerSocketEvents(io);
};
