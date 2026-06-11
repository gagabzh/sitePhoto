jest.mock('../db');
const db = require('../db');
const { setTags, sanitizeNextcloudUrl, nextcloudFolderUrl } = require('../uploadHelpers');

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

// US-NC7: URL sanitization and folder URL tests
describe('sanitizeNextcloudUrl', () => {
  it('returns null for null input', () => {
    expect(sanitizeNextcloudUrl(null)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(sanitizeNextcloudUrl(123)).toBeNull();
    expect(sanitizeNextcloudUrl({})).toBeNull();
    expect(sanitizeNextcloudUrl([])).toBeNull();
  });

  it('returns null for non-HTTPS URLs', () => {
    expect(sanitizeNextcloudUrl('http://cloud.example.com/s/abc')).toBeNull();
    expect(sanitizeNextcloudUrl('ftp://cloud.example.com/s/abc')).toBeNull();
  });

  it('returns null for URLs without valid share token pattern', () => {
    expect(sanitizeNextcloudUrl('https://cloud.example.com/s/')).toBeNull();
    expect(sanitizeNextcloudUrl('https://cloud.example.com/')).toBeNull();
    expect(sanitizeNextcloudUrl('https://cloud.example.com/not-a-share')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(sanitizeNextcloudUrl('not-a-url')).toBeNull();
    expect(sanitizeNextcloudUrl('javascript:alert(1)')).toBeNull();
  });

  it('accepts valid Nextcloud share URLs', () => {
    expect(sanitizeNextcloudUrl('https://cloud.example.com/s/abc123')).toBe('https://cloud.example.com/s/abc123');
    expect(sanitizeNextcloudUrl('https://cloud.example.com/s/abc123/file.jpg')).toBe('https://cloud.example.com/s/abc123/file.jpg');
    expect(sanitizeNextcloudUrl('https://nextcloud.pieterwillems.be/s/9N8fL6xqPjJZzXM')).toBe('https://nextcloud.pieterwillems.be/s/9N8fL6xqPjJZzXM');
  });
});

describe('nextcloudFolderUrl', () => {
  it('returns null for null input', () => {
    expect(nextcloudFolderUrl(null)).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(nextcloudFolderUrl('not-a-url')).toBeNull();
    expect(nextcloudFolderUrl('http://cloud.example.com/s/abc')).toBeNull();
    expect(nextcloudFolderUrl('https://cloud.example.com/')).toBeNull();
  });

  it('extracts folder URL from file share', () => {
    const folderUrl = nextcloudFolderUrl('https://cloud.example.com/s/abc123/file.jpg');
    expect(folderUrl).toBe('https://cloud.example.com/s/abc123');
  });

  it('extracts folder URL from folder share with trailing slash', () => {
    const folderUrl = nextcloudFolderUrl('https://cloud.example.com/s/abc123/');
    expect(folderUrl).toBe('https://cloud.example.com/s/abc123');
  });

  it('extracts folder URL from folder share with subpath', () => {
    const folderUrl = nextcloudFolderUrl('https://cloud.example.com/s/abc123/folder/file.jpg');
    expect(folderUrl).toBe('https://cloud.example.com/s/abc123');
  });

  it('returns folder share URL unchanged', () => {
    const folderUrl = nextcloudFolderUrl('https://cloud.example.com/s/abc123');
    expect(folderUrl).toBe('https://cloud.example.com/s/abc123');
  });
});
