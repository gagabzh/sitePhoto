'use strict';

const { Server } = require('socket.io');
const sessionMiddleware = require('./session');

let io;
const userSockets = new Map(); // userId (number) → Set<socketId>

function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: false }, // same-origin only
  });

  // Share Express session so we can read userId from the socket handshake.
  // A shim response is required because express-session calls setHeader/getHeader
  // even with resave:false — real res is unavailable on the WS upgrade request.
  const sessionShim = { getHeader: () => undefined, setHeader: () => {}, end: () => {} };
  io.use((socket, next) => {
    sessionMiddleware(socket.request, sessionShim, next);
  });

  io.on('connection', (socket) => {
    const userId = socket.request.session?.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    socket.on('disconnect', () => {
      userSockets.get(userId)?.delete(socket.id);
      if (!userSockets.get(userId)?.size) userSockets.delete(userId);
    });
  });

  return io;
}

function notifyUser(userId, payload) {
  const socketIds = userSockets.get(Number(userId));
  if (!socketIds || !io) return;
  for (const sid of socketIds) {
    io.to(sid).emit('identification-complete', payload);
  }
}

module.exports = { initSocketIO, notifyUser };
