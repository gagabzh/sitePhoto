'use strict';

const { isValidNextcloudShareUrl } = require('../nextcloudWebdav');

describe('isValidNextcloudShareUrl', () => {
  // Valid URLs
  it('returns true for a well-formed Nextcloud share URL', () => {
    expect(isValidNextcloudShareUrl('https://cloud.example.com/s/abc123def456')).toBe(true);
  });

  it('returns true for a URL with a path segment after the token', () => {
    expect(isValidNextcloudShareUrl('https://cloud.example.com/s/tok/subpath')).toBe(true);
  });

  // Non-string / malformed
  it('returns false for a non-string value', () => {
    expect(isValidNextcloudShareUrl(null)).toBe(false);
    expect(isValidNextcloudShareUrl(42)).toBe(false);
  });

  it('returns false for a URL without https', () => {
    expect(isValidNextcloudShareUrl('http://cloud.example.com/s/abc123')).toBe(false);
  });

  it('returns false for a URL without /s/ segment', () => {
    expect(isValidNextcloudShareUrl('https://cloud.example.com/files/abc123')).toBe(false);
  });

  it('returns false for a completely invalid string', () => {
    expect(isValidNextcloudShareUrl('not-a-url')).toBe(false);
  });

  // SSRF — loopback and private addresses
  it('returns false for https://localhost/s/tok', () => {
    expect(isValidNextcloudShareUrl('https://localhost/s/tok')).toBe(false);
  });

  it('returns false for https://127.0.0.1/s/tok', () => {
    expect(isValidNextcloudShareUrl('https://127.0.0.1/s/tok')).toBe(false);
  });

  it('returns false for https://10.0.0.1/s/tok', () => {
    expect(isValidNextcloudShareUrl('https://10.0.0.1/s/tok')).toBe(false);
  });

  it('returns false for https://192.168.1.1/s/tok', () => {
    expect(isValidNextcloudShareUrl('https://192.168.1.1/s/tok')).toBe(false);
  });

  it('returns false for https://172.16.0.1/s/tok', () => {
    expect(isValidNextcloudShareUrl('https://172.16.0.1/s/tok')).toBe(false);
  });

  it('returns false for https://169.254.1.1/s/tok (link-local)', () => {
    expect(isValidNextcloudShareUrl('https://169.254.1.1/s/tok')).toBe(false);
  });

  // SSRF — IPv6 loopback with brackets (Node URL parser wraps IPv6 in brackets)
  it('returns false for https://[::1]/s/tok (IPv6 loopback with brackets)', () => {
    expect(isValidNextcloudShareUrl('https://[::1]/s/tok')).toBe(false);
  });

  it('returns false for https://[0:0:0:0:0:0:0:1]/s/tok (full IPv6 loopback)', () => {
    expect(isValidNextcloudShareUrl('https://[0:0:0:0:0:0:0:1]/s/tok')).toBe(false);
  });
});
