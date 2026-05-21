function canModify(session, entity) {
  return session.role === 'admin' || entity.user_id === session.userId;
}

module.exports = { canModify };
