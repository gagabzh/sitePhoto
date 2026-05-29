'use strict';

const { parseUserAgent, relativeTime } = require('../utils/session-helpers');

// ── parseUserAgent ─────────────────────────────────────────────────────────────

describe('parseUserAgent', () => {
  it('returns "Unknown device" for null input', () => {
    expect(parseUserAgent(null)).toBe('Unknown device');
  });

  it('returns "Unknown device" for undefined input', () => {
    expect(parseUserAgent(undefined)).toBe('Unknown device');
  });

  it('returns "Unknown device" for empty string', () => {
    expect(parseUserAgent('')).toBe('Unknown device');
  });

  it('detects Edge on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(parseUserAgent(ua)).toBe('Edge on Windows');
  });

  it('detects Mobile Safari on iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgent(ua)).toBe('Mobile Safari on iPhone');
  });

  it('detects Firefox on Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(parseUserAgent(ua)).toBe('Firefox on Linux');
  });

  it('detects Chrome on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(parseUserAgent(ua)).toBe('Chrome on macOS');
  });

  it('truncates unknown UA string to 60 chars with ellipsis', () => {
    // A UA string longer than 60 chars with no recognised browser or OS tokens
    const ua = 'CustomAgent/1.0 (UnknownOS; X11; SomeArchitecture) XYZEngine/42.0.0.0 Compat/99';
    const result = parseUserAgent(ua);
    // Should be truncated to 60 chars + ellipsis, not the full string
    expect(result.length).toBeLessThanOrEqual(63); // 60 chars + '…' (3 bytes but 1 char)
    expect(result).toMatch(/…$/);
  });

  it('does not truncate UA string of exactly 60 chars', () => {
    const ua = 'A'.repeat(60);
    const result = parseUserAgent(ua);
    // No recognised tokens → falls through to truncation check; length === 60 so no ellipsis
    expect(result).toBe(ua);
    expect(result).not.toMatch(/…$/);
  });

  it('detects Chrome on Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(parseUserAgent(ua)).toBe('Chrome on Android');
  });
});

// ── relativeTime ───────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  it('returns null for null input', () => {
    expect(relativeTime(null)).toBeNull();
  });

  it('returns null for non-Date input', () => {
    expect(relativeTime('2024-01-01')).toBeNull();
  });

  it('returns null for an invalid Date object', () => {
    expect(relativeTime(new Date('not-a-date'))).toBeNull();
  });

  it('returns "just now" for a timestamp less than 60 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(relativeTime(date)).toBe('just now');
  });

  it('returns "1 minute ago" (singular)', () => {
    const date = new Date(Date.now() - 90 * 1000); // 1.5 minutes → 1 minute
    expect(relativeTime(date)).toBe('1 minute ago');
  });

  it('returns "2 minutes ago" (plural)', () => {
    const date = new Date(Date.now() - 2 * 60 * 1000 - 1);
    expect(relativeTime(date)).toBe('2 minutes ago');
  });

  it('returns "1 hour ago" (singular)', () => {
    const date = new Date(Date.now() - 90 * 60 * 1000); // 1.5 hours → 1 hour
    expect(relativeTime(date)).toBe('1 hour ago');
  });

  it('returns "3 hours ago" (plural)', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000 - 1);
    expect(relativeTime(date)).toBe('3 hours ago');
  });

  it('returns "1 day ago" (singular)', () => {
    const date = new Date(Date.now() - 36 * 60 * 60 * 1000); // 1.5 days → 1 day
    expect(relativeTime(date)).toBe('1 day ago');
  });

  it('returns "5 days ago" (plural)', () => {
    const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 - 1);
    expect(relativeTime(date)).toBe('5 days ago');
  });

  it('returns "1 month ago" (singular)', () => {
    const date = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days → 1 month
    expect(relativeTime(date)).toBe('1 month ago');
  });

  it('returns "2 months ago" (plural)', () => {
    const date = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
    expect(relativeTime(date)).toBe('2 months ago');
  });

  it('returns "1 year ago" (singular)', () => {
    const date = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // ~13 months → 1 year
    expect(relativeTime(date)).toBe('1 year ago');
  });

  it('returns "2 years ago" (plural)', () => {
    const date = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
    expect(relativeTime(date)).toBe('2 years ago');
  });

  it('handles a past timestamp correctly', () => {
    // Any past date should return a non-null string
    const date = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const result = relativeTime(date);
    expect(result).toBe('10 minutes ago');
  });
});
