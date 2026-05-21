const crypto = require('crypto');

function nonceMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  const origSend = res.send.bind(res);
  res.send = function (body) {
    if (typeof body === 'string' && body.includes('<script')) {
      body = body.replace(/<script(\s[^>]*)?>/g, (_, attrs) => {
        const a = attrs || '';
        return /\bnonce=/.test(a) ? `<script${a}>` : `<script nonce="${nonce}"${a}>`;
      });
    }
    return origSend(body);
  };
  next();
}

function csrfMiddleware(req, res, next) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('base64url');
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('multipart/')) {
      const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
      if (!token || token !== req.session.csrf) {
        return res.status(403).send('Invalid CSRF token');
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  if (req.method === 'GET' && !/\.(ico|png|jpg|svg|css|js|woff2?)(\?|$)/i.test(req.path)) {
    req.session.returnTo = req.originalUrl;
  }
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).send('Access denied');
}

function requireEditor(req, res, next) {
  if (req.session.role === 'admin' || req.session.role === 'editor') return next();
  res.status(403).send('Access denied');
}

const { canModify } = require('./permissions');

// Catches errors forwarded via next(err) and synchronous throws in route
// handlers. Express 4 async handlers that reject without try/catch bypass
// this — they become unhandled rejections at the Node.js process level.
// Express 5 wraps async handlers automatically so those reach here too.
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = typeof err.status === 'number'     ? err.status
               : typeof err.statusCode === 'number' ? err.statusCode
               : 500;
  const msg = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';
  res.status(status).send(msg);
}

const wrapAsync = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { nonceMiddleware, csrfMiddleware, requireAuth, requireAdmin, requireEditor, canModify, errorHandler, wrapAsync };
