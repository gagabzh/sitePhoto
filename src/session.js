'use strict';

const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const db = require('./db');

const PgSession = connectPgSimple(session);

// Single session config shared by Express (app.js) and socket.io (notifications.js).
// Sessions are persisted in PostgreSQL so they survive restarts and deploys.
module.exports = session({
  store: new PgSession({
    pool: db,
    createTableIfMissing: false,  // migration v10.sql owns the schema
    pruneSessionInterval: 3600,   // prune expired sessions every hour
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,                  // reset expiry on every response so active users stay logged in
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  },
});
