jest.mock('../db');
const db = require('../db');
const { canModify, filterOwnedPhotoIds, filterAlbumPhotoIds } = require('../permissions');

beforeEach(() => jest.resetAllMocks());

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

describe('filterOwnedPhotoIds', () => {
  it('admin: queries without user_id filter and returns matching IDs', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 3 }] });
    const result = await filterOwnedPhotoIds({ role: 'admin', userId: 99 }, [1, 2, 3]);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT id FROM photos WHERE id = ANY($1::int[])',
      [[1, 2, 3]]
    );
    expect(result).toEqual([1, 3]);
  });

  it('non-admin: queries with user_id filter and returns owned IDs', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    const result = await filterOwnedPhotoIds({ role: 'editor', userId: 7 }, [1, 2, 3]);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT id FROM photos WHERE id = ANY($1::int[]) AND user_id = $2',
      [[1, 2, 3], 7]
    );
    expect(result).toEqual([2]);
  });

  it('returns empty array when no IDs match', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await filterOwnedPhotoIds({ role: 'editor', userId: 7 }, [99]);
    expect(result).toEqual([]);
  });
});

describe('filterAlbumPhotoIds', () => {
  it('admin: queries by album only, no user_id filter', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }, { id: 6 }] });
    const result = await filterAlbumPhotoIds({ role: 'admin', userId: 99 }, 42, [5, 6, 7]);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[])',
      [42, [5, 6, 7]]
    );
    expect(result).toEqual([5, 6]);
  });

  it('non-admin: queries by album and user_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const result = await filterAlbumPhotoIds({ role: 'editor', userId: 7 }, 42, [5, 6, 7]);
    expect(db.query).toHaveBeenCalledWith(
      'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[]) AND p.user_id = $3',
      [42, [5, 6, 7], 7]
    );
    expect(result).toEqual([5]);
  });

  it('returns empty array when no IDs match', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await filterAlbumPhotoIds({ role: 'editor', userId: 7 }, 42, [99]);
    expect(result).toEqual([]);
  });
});

describe('middleware re-export', () => {
  it('canModify is re-exported from middleware for backwards compatibility', () => {
    const { canModify: canModifyFromMiddleware } = require('../middleware');
    expect(canModifyFromMiddleware).toBe(canModify);
  });
});
