'use strict';

const { processAuditReport } = require('../../scripts/audit-check');

// Helpers to build minimal synthetic npm audit v8 JSON objects.

function buildReport(vulnerabilities = {}) {
  return { vulnerabilities };
}

function buildVuln(severity, advisories = []) {
  // advisories: array of { source, url? } objects (or strings for transitive refs)
  return { severity, via: advisories };
}

function advisory(source, url) {
  return url ? { source, url } : { source };
}

// ─── 1. Clean report (empty vulnerabilities) ────────────────────────────────

describe('processAuditReport — clean report', () => {
  it('exits 0 and prints "No high/critical advisories found." when vulnerabilities is empty', () => {
    const { exitCode, lines } = processAuditReport(buildReport(), new Set());
    expect(exitCode).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ level: 'log', text: 'No high/critical advisories found.' });
  });

  it('exits 0 and prints "No high/critical advisories found." when only moderate advisories exist', () => {
    const report = buildReport({
      'some-package': buildVuln('moderate', [advisory(1001)]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set());
    expect(exitCode).toBe(0);
    expect(lines[0].text).toBe('No high/critical advisories found.');
  });
});

// ─── 2. One unexempted high advisory ────────────────────────────────────────

describe('processAuditReport — unexempted advisory', () => {
  it('exits 1 and prints the advisory line for an unexempted high advisory', () => {
    const report = buildReport({
      'bad-pkg': buildVuln('high', [advisory(1234, 'https://example.com/1234')]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set());
    expect(exitCode).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      level: 'error',
      text: '[ADVISORY 1234] bad-pkg — high — https://example.com/1234',
    });
  });

  it('exits 1 for an unexempted critical advisory (no URL)', () => {
    const report = buildReport({
      'critical-pkg': buildVuln('critical', [advisory(9999)]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set());
    expect(exitCode).toBe(1);
    expect(lines[0].text).toBe('[ADVISORY 9999] critical-pkg — critical');
  });
});

// ─── 3. Exempted by ID ───────────────────────────────────────────────────────

describe('processAuditReport — exempted advisory', () => {
  it('exits 0 and prints "All high/critical advisories are exempted." when the single advisory is exempted', () => {
    const report = buildReport({
      'bad-pkg': buildVuln('high', [advisory(1234)]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set([1234]));
    expect(exitCode).toBe(0);
    expect(lines[0].text).toBe('All high/critical advisories are exempted.');
  });
});

// ─── 4. Mix: one exempted + one unexempted ───────────────────────────────────

describe('processAuditReport — mixed exempted and unexempted', () => {
  it('exits 1 and only prints the unexempted advisory', () => {
    const report = buildReport({
      'exempted-pkg': buildVuln('high', [advisory(1000)]),
      'flagged-pkg': buildVuln('critical', [advisory(2000, 'https://example.com/2000')]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set([1000]));
    expect(exitCode).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('2000');
    expect(lines[0].text).toContain('flagged-pkg');
  });
});

// ─── 5. moderate-only advisory ───────────────────────────────────────────────

describe('processAuditReport — severity filtering', () => {
  it('exits 0 for a moderate-only advisory (not flagged)', () => {
    const report = buildReport({
      'moderate-pkg': buildVuln('moderate', [advisory(5555)]),
    });
    const { exitCode, lines } = processAuditReport(report, new Set());
    expect(exitCode).toBe(0);
    expect(lines[0].text).toBe('No high/critical advisories found.');
  });

  it('exits 0 for a low advisory', () => {
    const report = buildReport({
      'low-pkg': buildVuln('low', [advisory(6666)]),
    });
    const { exitCode } = processAuditReport(report, new Set());
    expect(exitCode).toBe(0);
  });
});

// ─── 6. Missing / null / undefined exceptions set ────────────────────────────

describe('processAuditReport — missing exceptions', () => {
  it('treats undefined exceptions as empty set (no exemptions)', () => {
    const report = buildReport({
      'bad-pkg': buildVuln('high', [advisory(1234)]),
    });
    const { exitCode } = processAuditReport(report, undefined);
    expect(exitCode).toBe(1);
  });

  it('treats null exceptions as empty set (no exemptions)', () => {
    const report = buildReport({
      'bad-pkg': buildVuln('high', [advisory(1234)]),
    });
    const { exitCode } = processAuditReport(report, null);
    expect(exitCode).toBe(1);
  });

  it('exits 0 with "No high/critical advisories found." on clean report with null exceptions', () => {
    const { exitCode, lines } = processAuditReport(buildReport(), null);
    expect(exitCode).toBe(0);
    expect(lines[0].text).toBe('No high/critical advisories found.');
  });
});

// ─── 7. Transitive (string) via entries ──────────────────────────────────────

describe('processAuditReport — transitive via entries', () => {
  it('skips string via entries (transitive package references, not advisory IDs)', () => {
    // A string via entry means the vuln is transitive; the root advisory is
    // captured elsewhere. String entries carry no advisory ID so nothing to flag.
    const report = buildReport({
      'transitive-pkg': buildVuln('high', ['direct-dep']),
    });
    const { exitCode, lines } = processAuditReport(report, new Set());
    // No object entries with source → preFilterCount stays 0 → "No high/critical found"
    expect(exitCode).toBe(0);
    expect(lines[0].text).toBe('No high/critical advisories found.');
  });
});
