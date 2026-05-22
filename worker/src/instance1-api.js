'use strict';

const BASE_URL = process.env.INSTANCE1_API_URL || 'http://localhost:3001';
const SECRET   = process.env.WORKER_API_SECRET;

async function postIdentificationResult(result) {
  const res = await fetch(`${BASE_URL}/internal/identification-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': SECRET,
    },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Instance-1 API responded ${res.status}: ${text}`);
  }
}

module.exports = { postIdentificationResult };
