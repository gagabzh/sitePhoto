const express = require('express');
const session = require('express-session');
const { requireAuth, requireAdmin } = require('./middleware');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

app.use(require('./routes/auth'));
app.use(requireAuth);
app.use(require('./routes/account'));
app.use('/admin/users', requireAdmin, require('./routes/admin'));

module.exports = app;
