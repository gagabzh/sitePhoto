'use strict';

const session = require('express-session');

// Single session config shared by Express (app.js) and socket.io (notifications.js).
module.exports = session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
