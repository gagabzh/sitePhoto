const express = require('express');
const session = require('express-session');
const path = require('path');
const { requireAuth, requireAdmin } = require('./middleware');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

app.use(require('./routes/auth'));
app.use(requireAuth);
app.use(require('./routes/account'));
app.use('/photos', require('./routes/photos'));
app.use('/admin/users', requireAdmin, require('./routes/admin'));

module.exports = app;
