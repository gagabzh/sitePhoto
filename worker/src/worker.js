'use strict';

const { Worker, Queue } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { downloadPhoto, uploadPhoto } = require('./storage');
const { generate } = require('./ai');
const {
  postIdentificationResult,
  postDescribePersonResult,
  postNextcloudImportProgress,
  insertImportedPhoto,
  fetchKnownFaces,
  downloadNextcloudFile,
} = require('./instance1-api');
const { EXT_MAP } = require('./nextcloudWebdav');

const IDENTIFICATION_PROMPT =
  process.env.IDENTIFICATION_PROMPT ||
  'List the people visible in this photo. Return a plain comma-separated list of names, or "unknown" if no one is recognisable.';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const identificationQueue = new Queue('identification', { connection });

const worker = new Worker('identification', async (job) => {
  if (job.name === 'describe-person') {
    const { tagId, tagName, photoFilenames, userId } = job.data;
    console.log(`[worker] job ${job.id} — describe-person tag ${tagId} (${tagName}), ${photoFilenames.length} photo(s)`);

    const images = [];
    for (const filename of photoFilenames) {
      try {
        const buf = await downloadPhoto(filename);
        images.push(buf.toString('base64'));
      } catch { /* skip photos that can't be downloaded */ }
    }
    if (!images.length) throw new Error('could not download any photos for describe-person');

    const prompt = `Analyze all the people in the photo${images.length > 1 ? 's' : ''}:
1. For each person, describe their physical appearance: hair color/style, approximate age, distinctive features.
2. If you recognize the same person from other photos in this collection, state their name.
3. If unknown, provide a unique identifier based on their appearance (e.g., "blonde woman with glasses").
4. Note the person's position in the photo (left/center/right, foreground/background).`;
    const result = await generate({ prompt, images });
    const description = (result.response || '').trim().replace(/^["']|["']$/g, '').slice(0, 500);

    await postDescribePersonResult({ tagId, description, userId });
    console.log(`[worker] job ${job.id} done — describe-person tag ${tagId}`);
    return;
  }

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
    prompt = `Known people in this collection:\n${names}\n\nIdentify the people visible in the last image. For each person, provide their name if they match a known person, or describe them briefly if unknown. Also describe the scene.`;
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

  const responseText = (ollamaResponse.response || '').toLowerCase();
  const tagRows = knownFaces.map(f => ({ id: f.personName, name: f.personName }));
  const suggestions = tagRows
    .filter(t => responseText.includes(t.name.toLowerCase()))
    .map(t => ({ tagId: t.id, name: t.name, hasReference: true }));

  if (isManual) {
    await postIdentifyPeopleResult({ photoId, userId, suggestions });
  } else {
    await postIdentificationResult({ photoId, userId, tags: responseText });
  }
  console.log(`[worker] job ${job.id} done`);
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
  if (job?.name === 'describe-person') {
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      const { tagId, userId } = job.data;
      postDescribePersonResult({ tagId, userId, error: err.message }).catch(() => {});
    }
  }
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
