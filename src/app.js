const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const { requireAuth, requireAdmin } = require('./middleware');

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET env var is not set — using insecure default. Set it before deploying.');
}

const app = express();

app.use(helmet({
  // Leaflet loads tiles from OpenStreetMap and unpkg CDN; relax CSP accordingly
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', '*.basemaps.cartocdn.com', 'unpkg.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

app.use(require('./routes/auth'));
app.use(requireAuth);
app.use(require('./routes/account'));
app.use('/photos', require('./routes/photos'));
app.use('/albums', require('./routes/albums'));
app.use('/tags', require('./routes/tags'));
app.use('/timeline', require('./routes/timeline'));
app.use('/map', require('./routes/map'));
app.use('/admin/users', requireAdmin, require('./routes/admin'));

module.exports = app;
