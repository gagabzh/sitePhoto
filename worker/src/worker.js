'use strict';

const { Worker } = require('bullmq');
const { downloadPhoto } = require('./storage');
const { generate } = require('./ai');
const { postIdentificationResult } = require('./instance1-api');

const IDENTIFICATION_PROMPT =
  process.env.IDENTIFICATION_PROMPT ||
  'List the people visible in this photo. Return a plain comma-separated list of names, or "unknown" if no one is recognisable.';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const worker = new Worker('identification', async (job) => {
  const { photoId, userId, photoS3Key } = job.data;
  console.log(`[worker] job ${job.id} — photo ${photoId} (${photoS3Key})`);

  const photoBuffer = await downloadPhoto(photoS3Key);
  const base64 = photoBuffer.toString('base64');

  const result = await generate({
    prompt: IDENTIFICATION_PROMPT,
    images: [base64],
  });

  await postIdentificationResult({ photoId, userId, tags: result.response });
  console.log(`[worker] job ${job.id} done`);
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});
worker.on('error', (err) => {
  console.error('[worker] error:', err.message);
});

console.log('[worker] listening on queue: identification');
