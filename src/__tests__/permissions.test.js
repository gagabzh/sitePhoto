const { canModify } = require('../permissions');

describe('canModify', () => {
  it('returns true for admin regardless of ownership', () => {
    expect(canModify({ role: 'admin', userId: 99 }, { user_id: 10 })).toBe(true);
  });

  it('returns true for owner', () => {
    expect(canModify({ role: 'editor', userId: 10 }, { user_id: 10 })).toBe(true);
  });

  it('returns false for non-owner editor', () => {
    expect(canModify({ role: 'editor', userId: 20 }, { user_id: 10 })).toBe(false);
  });

  it('returns false for non-owner viewer', () => {
    expect(canModify({ role: 'viewer', userId: 20 }, { user_id: 10 })).toBe(false);
  });
});

describe('middleware re-export', () => {
  it('canModify is re-exported from middleware for backwards compatibility', () => {
    const { canModify: canModifyFromMiddleware } = require('../middleware');
    expect(canModifyFromMiddleware).toBe(canModify);
  });
});
