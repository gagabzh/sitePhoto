const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const { nonceMiddleware, requireAuth, requireAdmin, csrfMiddleware, errorHandler } = require('./middleware');

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET env var is not set — using insecure default. Set it before deploying.');
}

const app = express();

// Nonce must be set before helmet so the CSP header can reference it
app.use(nonceMiddleware);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', '*.basemaps.cartocdn.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
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

// Serve Leaflet and MarkerCluster from npm packages (replaces unpkg CDN)
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
app.use('/vendor/leaflet.markercluster', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet.markercluster', 'dist')));

app.use(require('./routes/auth'));
app.use(requireAuth);
app.use(csrfMiddleware);
app.use(require('./routes/account'));
app.use('/photos', require('./routes/photos'));
app.use('/albums', require('./routes/albums'));
app.use('/tags', require('./routes/tags'));
app.use('/timeline', require('./routes/timeline'));
app.use('/map', require('./routes/map'));
app.use('/travels', require('./routes/travels'));
app.use('/api', require('./routes/api'));
app.use('/admin/ai', requireAdmin, require('./routes/admin-ai'));
app.use('/admin/users', requireAdmin, require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));

app.use(errorHandler);

module.exports = app;
