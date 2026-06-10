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

async function postIdentifyPeopleResult(result) {
  const res = await fetch(`${BASE_URL}/internal/identify-people-result`, {
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

// AI-4: Fetch known face crops for a user from Instance-1
async function fetchKnownFaces(userId) {
  const url = `${BASE_URL}/internal/known-faces/${userId}`;
  const resp = await fetch(url, {
    headers: { 'x-worker-secret': SECRET },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`known-faces ${resp.status}`);
  return resp.json();
}

// Download a file from Nextcloud via Instance-1 proxy
// Returns: Buffer
async function downloadNextcloudFile(shareUrl, fileName) {
  const url = `${BASE_URL}/internal/nextcloud-file?shareUrl=${encodeURIComponent(shareUrl)}&fileName=${encodeURIComponent(fileName)}`;
  const resp = await fetch(url, {
    headers: { 'x-worker-secret': SECRET },
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Nextcloud file download failed: ${resp.status} ${text}`);
    err.statusCode = resp.status;
    throw err;
  }
  return Buffer.from(await resp.arrayBuffer());
}

// AI-5 Step 3: Store face crops for AI-identified people
// payload: { photoId, userId, photoS3Key, suggestions }
async function storePeopleFaces(payload) {
  const res = await fetch(`${BASE_URL}/internal/store-people-faces`, {
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

module.exports = { 
  postIdentificationResult, 
  postIdentifyPeopleResult, 
  postNextcloudImportProgress, 
  insertImportedPhoto, 
  fetchKnownFaces, 
  downloadNextcloudFile,
  storePeopleFaces,
};
