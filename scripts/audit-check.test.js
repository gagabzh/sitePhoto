'use strict';

/**
 * Unit tests for audit-check.js advisory parsing logic
 */

const { processAuditReport } = require('./audit-check');

describe('processAuditReport', () => {
  describe('zero advisories (clean tree)', () => {
    it('should exit 0 with "No high/critical advisories found." when vulnerabilities is empty', () => {
      const report = { vulnerabilities: {} };
      const result = processAuditReport(report);
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
      expect(result.findings).toEqual([]);
    });

    it('should exit 0 when only moderate advisories exist', () => {
      const report = {
        vulnerabilities: {
          'some-package': { severity: 'moderate', via: [{ source: 123 }] }
        }
      };
      const result = processAuditReport(report);
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
      expect(result.findings).toEqual([]);
    });

    it('should exit 0 when only low advisories exist', () => {
      const report = {
        vulnerabilities: {
          'some-package': { severity: 'low', via: [{ source: 123 }] }
        }
      };
      const result = processAuditReport(report);
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
      expect(result.findings).toEqual([]);
    });
  });

  describe('all advisories exempted', () => {
    it('should exit 0 with "All high/critical advisories are exempted." when all high advisories are in exceptions', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [{ source: 123, url: 'https://example.com/advisory/123' }]
          }
        }
      };
      const result = processAuditReport(report, new Set([123]));
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
      expect(result.findings).toEqual([]);
    });

    it('should exit 0 when multiple high/critical advisories are all exempted', () => {
      const report = {
        vulnerabilities: {
          'package-a': {
            severity: 'high',
            via: [{ source: 100 }, { source: 101 }]
          },
          'package-b': {
            severity: 'critical',
            via: [{ source: 200 }]
          }
        }
      };
      const result = processAuditReport(report, new Set([100, 101, 200]));
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
      expect(result.findings).toEqual([]);
    });

    it('should exit 0 when critical advisories are exempted', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'critical',
            via: [{ source: 999 }]
          }
        }
      };
      const result = processAuditReport(report, new Set([999]));
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
    });
  });

  describe('unexempted advisories present', () => {
    it('should exit 1 with advisory details when one high advisory is not in exceptions', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [{ source: 123, url: 'https://example.com/advisory/123' }]
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 123] some-package — high — https://example.com/advisory/123');
      expect(result.findings).toEqual([{ id: 123, packageName: 'some-package', severity: 'high', url: 'https://example.com/advisory/123' }]);
    });

    it('should exit 1 when one high advisory is in exceptions but another is not', () => {
      const report = {
        vulnerabilities: {
          'package-a': {
            severity: 'high',
            via: [{ source: 100 }]
          },
          'package-b': {
            severity: 'high',
            via: [{ source: 101 }]
          }
        }
      };
      const result = processAuditReport(report, new Set([100]));
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 101] package-b — high');
      expect(result.findings).toEqual([{ id: 101, packageName: 'package-b', severity: 'high', url: '' }]);
    });

    it('should exit 1 when critical and high mixed with partial exemptions', () => {
      const report = {
        vulnerabilities: {
          'package-a': {
            severity: 'critical',
            via: [{ source: 100 }]
          },
          'package-b': {
            severity: 'high',
            via: [{ source: 101 }]
          },
          'package-c': {
            severity: 'high',
            via: [{ source: 102 }]
          }
        }
      };
      const result = processAuditReport(report, new Set([100, 102]));
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 101] package-b — high');
      expect(result.findings).toEqual([{ id: 101, packageName: 'package-b', severity: 'high', url: '' }]);
    });

    it('should only report critical advisories when high and moderate are present but only critical is unexempted', () => {
      const report = {
        vulnerabilities: {
          'package-moderate': {
            severity: 'moderate',
            via: [{ source: 1 }]
          },
          'package-high': {
            severity: 'high',
            via: [{ source: 2 }]
          },
          'package-critical': {
            severity: 'critical',
            via: [{ source: 3 }]
          }
        }
      };
      const result = processAuditReport(report, new Set([2]));
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 3] package-critical — critical');
      expect(result.findings).toEqual([{ id: 3, packageName: 'package-critical', severity: 'critical', url: '' }]);
    });
  });

  describe('severity filtering', () => {
    it('should ignore moderate and low severity advisories', () => {
      const report = {
        vulnerabilities: {
          'low-package': { severity: 'low', via: [{ source: 1 }] },
          'moderate-package': { severity: 'moderate', via: [{ source: 2 }] }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
      expect(result.findings).toEqual([]);
    });

    it('should report only critical when high is exempted and moderate is present', () => {
      const report = {
        vulnerabilities: {
          'moderate-package': { severity: 'moderate', via: [{ source: 1 }] },
          'high-package': { severity: 'high', via: [{ source: 2 }] },
          'critical-package': { severity: 'critical', via: [{ source: 3 }] }
        }
      };
      const result = processAuditReport(report, new Set([2]));
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 3] critical-package — critical');
    });
  });

  describe('via array handling', () => {
    it('should skip string entries in via array', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: ['transitive-package', { source: 123 }]
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(1);
      expect(result.findings).toEqual([{ id: 123, packageName: 'some-package', severity: 'high', url: '' }]);
    });

    it('should handle multiple via entries for one package', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [
              { source: 100, url: 'https://example.com/100' },
              { source: 101, url: 'https://example.com/101' },
              'transitive'
            ]
          }
        }
      };
      const result = processAuditReport(report, new Set([100]));
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe('[ADVISORY 101] some-package — high — https://example.com/101');
      expect(result.findings).toEqual([{ id: 101, packageName: 'some-package', severity: 'high', url: 'https://example.com/101' }]);
    });

    it('should handle empty via array', () => {
      const report = {
        vulnerabilities: {
          'some-package': { severity: 'high', via: [] }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
    });
  });

  describe('edge cases', () => {
    it('should handle missing vulnerabilities field', () => {
      const report = {};
      const result = processAuditReport(report);
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
    });

    it('should handle null vulnerabilities field', () => {
      const report = { vulnerabilities: null };
      const result = processAuditReport(report);
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('No high/critical advisories found.');
    });

    it('should handle missing via field', () => {
      const report = {
        vulnerabilities: {
          'some-package': { severity: 'high' }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
    });

    it('should handle via with object without source field', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [{ someOtherField: 'value' }]
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('All high/critical advisories are exempted.');
    });

    it('should handle via with object with source as string', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [{ source: '123' }] // source as string
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(1);
      expect(result.findings[0].id).toBe(123); // Number coercion
    });

    it('should handle empty exceptions set', () => {
      const report = {
        vulnerabilities: {
          'some-package': {
            severity: 'high',
            via: [{ source: 123 }]
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(1);
      expect(result.findings.length).toBe(1);
    });

    it('should handle multiple findings and format message correctly', () => {
      const report = {
        vulnerabilities: {
          'package-a': {
            severity: 'critical',
            via: [{ source: 1, url: 'https://example.com/1' }]
          },
          'package-b': {
            severity: 'high',
            via: [{ source: 2, url: 'https://example.com/2' }]
          }
        }
      };
      const result = processAuditReport(report, new Set());
      expect(result.exitCode).toBe(1);
      expect(result.message).toBe(
        '[ADVISORY 1] package-a — critical — https://example.com/1\n' +
        '[ADVISORY 2] package-b — high — https://example.com/2'
      );
      expect(result.findings.length).toBe(2);
    });
  });
});
