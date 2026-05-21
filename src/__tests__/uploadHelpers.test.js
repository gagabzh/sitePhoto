jest.mock('../db');
const db = require('../db');
const { setTags } = require('../uploadHelpers');

beforeEach(() => jest.resetAllMocks());

describe('setTags', () => {
  it('bulk-upserts tags and links them to the photo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                          // DELETE photo_tags
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })     // INSERT tags (unnest)
      .mockResolvedValueOnce({ rows: [] });                         // INSERT photo_tags (unnest)

    await setTags(42, 'Paris, 2024');

    expect(db.query).toHaveBeenNthCalledWith(1,
      'DELETE FROM photo_tags WHERE photo_id = $1', [42]
    );
    expect(db.query).toHaveBeenNthCalledWith(2,
      'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [['paris', '2024']]
    );
    expect(db.query).toHaveBeenNthCalledWith(3,
      'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
      [42, [1, 2]]
    );
  });

  it('issues only the DELETE when rawTags is empty', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // DELETE photo_tags

    await setTags(42, '');

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('issues only the DELETE when rawTags is all whitespace/commas', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await setTags(42, ' , , ');

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('trims and lowercases tag names', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    await setTags(7, '  PARIS  ');

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.any(String),
      [['paris']]
    );
  });
});
