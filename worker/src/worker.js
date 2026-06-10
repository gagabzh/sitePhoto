'use strict';

const { Worker, Queue } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { downloadPhoto, uploadPhoto } = require('./storage');
const { generate } = require('./ai');
const {
  postIdentificationResult,
  postNextcloudImportProgress,
  insertImportedPhoto,
  fetchKnownFaces,
  downloadNextcloudFile,
} = require('./instance1-api');
const { EXT_MAP } = require('./nextcloudWebdav');

const IDENTIFICATION_PROMPT =
  process.env.IDENTIFICATION_PROMPT ||
  'List the people visible in this photo. For each person, provide their name and approximate face location as (name, x1, y1, x2, y2) where coordinates are normalized to [0, 1] (top-left to bottom-right). Return one entry per line, or "unknown" if no one is recognisable.';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const identificationQueue = new Queue('identification', { connection });

const worker = new Worker('identification', async (job) => {
  // identify-photo or manual-identify-photo
  const { photoId, userId, photoS3Key, source } = job.data;
  const isManual = source === 'manual';
  console.log(`[worker] job ${job.id} — photo ${photoId} (${photoS3Key})${isManual ? ' [manual]' : ''}`);

  // AI-4: fetch known faces for few-shot injection (fail gracefully)
  let knownFaces = [];
  try {
    knownFaces = await fetchKnownFaces(userId);
  } catch (err) {
    console.warn('[worker] known-faces fetch failed, proceeding without:', err.message);
  }

  const photoBuffer = await downloadPhoto(photoS3Key);
  const base64 = photoBuffer.toString('base64');

  // Build images array: known face crops first, then the photo to identify
  const images = [...knownFaces.map(f => f.cropBase64), base64];

  // Build prompt with optional few-shot section
  let prompt = IDENTIFICATION_PROMPT;
  if (knownFaces.length) {
    const names = knownFaces.map(f => `- ${f.personName}`).join('\n');
    prompt = `Known people in this collection:\n${names}\n\nIdentify the people visible in the last image. For each person, provide their name (if they match a known person) and approximate face location as (name, x1, y1, x2, y2) where coordinates are normalized to [0, 1] (top-left to bottom-right). Return one entry per line. If a person is unknown, describe them briefly.`;
  }

  let ollamaResponse;
  try {
    ollamaResponse = await generate({ prompt, images });
  } catch (err) {
    // For manual jobs, post error to client; for nextcloud jobs, let the existing error handling work
    if (isManual) {
      await postIdentifyPeopleResult({ photoId, userId, error: err.message });
    }
    throw err;
  }

  const responseText = ollamaResponse.response || '';
  
  // Parse response to extract people with bounding boxes
  // Expected format: "(name, x1, y1, x2, y2)" on each line
  const personMatches = responseText.match(/(\w+)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)/g) || [];
  
  const suggestions = personMatches.map(match => {
    const parsed = match.match(/(\w+)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)/);
    if (!parsed) return null;
    
    const name = parsed[1].toLowerCase();
    const x1 = parseFloat(parsed[2]);
    const y1 = parseFloat(parsed[3]);
    const x2 = parseFloat(parsed[4]);
    const y2 = parseFloat(parsed[5]);
    
    // Check if this person is in our known faces
    const knownFace = knownFaces.find(f => f.personName.toLowerCase() === name);
    
    // Convert bounding box from (x1,y1,x2,y2) to (x,y,width,height) format
    const width = x2 - x1;
    const height = y2 - y1;
    const bbox = { x: x1, y: y1, width, height };
    
    return {
      name,
      hasReference: !!knownFace,
      bbox, // Always include bbox
    };
  }).filter(Boolean);

  if (isManual) {
    await postIdentifyPeopleResult({ photoId, userId, suggestions });
  } else {
    // For auto-identification (photo upload), extract just the names
    const names = suggestions.map(s => s.name);
    await postIdentificationResult({ photoId, userId, tags: names.join(', ') });
  }
  console.log(`[worker] job ${job.id} done`);
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});
worker.on('error', (err) => {
  console.error('[worker] error:', err.message);
});

// NC-4: nextcloud-import queue — one job per file in the shared folder
const ncWorker = new Worker('nextcloud-import', async (job) => {
  const { shareUrl, fileName, mimeType, userId, tags, latitude, longitude, albumId, importId } = job.data;
  console.log(`[worker] nc-import job ${job.id} — ${fileName} (import ${importId})`);

  let succeeded = false;
  try {
    // Step a: download from Nextcloud via Instance-1 proxy
    const buffer = await downloadNextcloudFile(shareUrl, fileName);

    // Step b: generate S3 key
    const ext = EXT_MAP[mimeType] || '.jpg';
    const s3Key = `${uuidv4()}${ext}`;

    // Step c: upload to S3
    await uploadPhoto(s3Key, buffer, mimeType);

    // Step d+e+f: insert photo row, album membership, tags via Instance-1
    const { photoId } = await insertImportedPhoto({
      userId, s3Key, fileName, mimeType, shareUrl, latitude, longitude, albumId, tags, importId,
    });

    // Step g: enqueue AI identification
    await identificationQueue.add('identify-photo', { photoId, userId, photoS3Key: s3Key }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    succeeded = true;
    console.log(`[worker] nc-import job ${job.id} done — photoId ${photoId}`);
  } catch (err) {
    console.error(`[worker] nc-import job ${job.id} file "${fileName}" failed:`, err.message);
    succeeded = false;
  }

  // Steps h+i: atomic DB increment + socket.io notification (via Instance-1)
  await postNextcloudImportProgress({ userId, importId, succeeded });
}, { connection });

ncWorker.on('error', (err) => {
  console.error('[worker] nc-import error:', err.message);
});

console.log('[worker] listening on queues: identification, nextcloud-import');
