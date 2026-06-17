'use strict';

/**
 * audit-check.js — reads `npm audit --audit-level=high --json` from stdin,
 * filters out exempted advisory IDs from .npm-audit-exceptions, and exits 1
 * if any unexempted high/critical advisories remain.
 *
 * Usage:
 *   npm audit --audit-level=high --json | node scripts/audit-check.js
 */

const fs = require('fs');
const path = require('path');

function loadExceptions() {
  const exceptionsPath = path.join(__dirname, '..', '.npm-audit-exceptions');
  try {
    const content = fs.readFileSync(exceptionsPath, 'utf8');
    return new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const n = Number(line);
          if (!Number.isInteger(n) || n <= 0) {
            console.error(`audit-check: invalid exception entry "${line}" — must be a positive integer advisory ID`);
            process.exit(1);
          }
          return n;
        })
    );
  } catch {
    // File doesn't exist — no exemptions.
    return new Set();
  }
}

/**
 * Process an npm audit report and return the result.
 * @param {object} report - The parsed JSON from npm audit --json
 * @param {Set<number>} exceptions - Set of exempted advisory IDs
 * @returns {{ exitCode: number, message: string, findings: Array<{id: number, packageName: string, severity: string, url: string}> }}
 */
function processAuditReport(report, exceptions = new Set()) {
  const vulnerabilities = report.vulnerabilities || {};
  const findings = [];
  let hasHighOrCritical = false;

  for (const [packageName, vuln] of Object.entries(vulnerabilities)) {
    const severity = vuln.severity;
    if (severity !== 'high' && severity !== 'critical') continue;
    hasHighOrCritical = true;

    // Collect advisory IDs from the `via` array.
    // Each entry is either a string or an object with a `source` field (numeric ID).
    const via = vuln.via || [];
    for (const entry of via) {
      if (typeof entry === 'object' && entry.source) {
        const id = Number(entry.source);
        if (!exceptions.has(id)) {
          const url = entry.url || '';
          findings.push({ id, packageName, severity, url });
        }
      } else if (typeof entry === 'string') {
        // String entries are package names, not advisory IDs — skip.
        // (These appear when a vulnerability is transitive; the root cause
        // advisory will be captured in another vulnerability object.)
      }
    }
  }

  if (findings.length === 0) {
    if (!hasHighOrCritical) {
      return { exitCode: 0, message: 'No high/critical advisories found.', findings };
    } else {
      return { exitCode: 0, message: 'All high/critical advisories are exempted.', findings };
    }
  }

  const lines = findings.map(({ id, packageName, severity, url }) => {
    const urlPart = url ? ` — ${url}` : '';
    return `[ADVISORY ${id}] ${packageName} — ${severity}${urlPart}`;
  });
  return { exitCode: 1, message: lines.join('\n'), findings };
}

// Export for testing
module.exports = { processAuditReport, loadExceptions };

// Main entry point
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      console.error('audit-check: failed to parse npm audit output');
      process.exit(1);
    }

    const exceptions = loadExceptions();
    const { exitCode, message, findings } = processAuditReport(report, exceptions);

    if (exitCode === 0) {
      console.log(message);
    } else {
      console.error(message);
    }
    process.exit(exitCode);
  });
}
