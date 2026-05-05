function requireAuth(req, res, next) {
  if (req.session.userId) return next();
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

module.exports = { requireAuth, requireAdmin, requireEditor };
