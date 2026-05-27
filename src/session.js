'use strict';

const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple')(session);
const db = require('./db');

module.exports = session({
  store: new ConnectPgSimple({
    pool: db,
    pruneSessionInterval: 3600,
    errorLog: console.error,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
