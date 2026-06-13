const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const sessionMiddleware = require('./session');
const { UPLOAD_DIR } = require('./uploadHelpers');
const { streamPhoto } = require('./storage');
const { nonceMiddleware, requireAuth, requireAdmin, csrfMiddleware, errorHandler } = require('./middleware');

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET env var is not set — using insecure default. Set it before deploying.');
}

const app = express();

// Trust the first proxy hop (Caddy) so express-rate-limit and req.ip use
// the real client IP from X-Forwarded-For instead of Caddy's container IP.
app.set('trust proxy', 1);

// Rate limiters — applied before auth routes and globally after static serving.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts, please try again later.' }),
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts, please try again later.' }),
});

// Nonce must be set before helmet so the CSP header can reference it
app.use(nonceMiddleware);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
      styleSrcElem: ["'self'", 'fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"], // permits inline style= attributes; future hardening: remove inline styles then drop this directive
      imgSrc: ["'self'", 'data:', '*.basemaps.cartocdn.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      connectSrc: ["'self'"], // 'self' covers wss:// on the same origin (HTTPS → wss:// upgrade)
      scriptSrcAttr: ["'unsafe-inline'"], // existing onclick= handlers in views
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Permissions-Policy is not yet part of helmet's defaults; set it manually.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(sessionMiddleware);

// Serve photos: S3 first (new uploads), disk fallback (legacy pre-V4 photos).
app.get('/uploads/:filename', async (req, res) => {
  const { filename } = req.params;
  if (filename.includes('/') || filename.includes('..')) return res.status(400).end();

  if (process.env.S3_ENDPOINT) {
    try {
      const { stream, contentType } = await streamPhoto(filename);
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      stream.pipe(res);
      return;
    } catch {
      // Not in S3 — fall through to disk (photo uploaded before V4 migration).
    }
  }

  res.sendFile(path.join(UPLOAD_DIR, filename), (err) => {
    if (err) res.status(404).end();
  });
});
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1y', immutable: true }));

// Serve Leaflet and MarkerCluster from npm packages (replaces unpkg CDN)
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
app.use('/vendor/leaflet.markercluster', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet.markercluster', 'dist')));

// Global rate limit — after static assets so files are not counted against the limit.
app.use(globalLimiter);

// Internal worker endpoint — authenticated by WORKER_API_SECRET, not by session
app.use('/internal', require('./routes/internal'));

// Auth rate limit — applied to login before the auth router handles it.
app.post('/login', authLimiter);
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
app.use('/api/me', require('./routes/apiMe'));
app.use('/api', require('./routes/api'));
app.use('/admin/ai', requireAdmin, require('./routes/admin-ai'));
app.use('/admin/users', requireAdmin, require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ai', require('./routes/aiIdentification'));

// AI Identification Review pages (HTML views)
const { renderIdentificationQueue, renderIdentificationReview } = require('./routes/aiIdentificationViews');
app.get('/ai/identification-queue', requireAuth, requireEditor, (req, res) => {
  res.send(renderIdentificationQueue(req.session));
});
app.get('/ai/identification-review/:photoId', requireAuth, requireEditor, (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  if (!Number.isInteger(photoId)) {
    return res.status(400).send('Invalid photoId');
  }
  res.send(renderIdentificationReview(req.session, photoId));
});

app.use(errorHandler);

module.exports = app;
