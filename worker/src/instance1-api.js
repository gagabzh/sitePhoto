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

async function postDescribePersonResult(result) {
  const res = await fetch(`${BASE_URL}/internal/describe-person-result`, {
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

// payload: { userId, importId, succeeded: true|false }
async function postNextcloudImportProgress(payload) {
  const res = await fetch(`${BASE_URL}/internal/nextcloud-import-progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Instance-1 API responded ${res.status}: ${text}`);
  }
}

// payload: { userId, importId, photoId, s3Key }
async function insertImportedPhoto(payload) {
  const res = await fetch(`${BASE_URL}/internal/nextcloud-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Instance-1 API responded ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = { postIdentificationResult, postDescribePersonResult, postNextcloudImportProgress, insertImportedPhoto };
