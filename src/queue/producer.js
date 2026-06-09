'use strict';

const { Queue } = require('bullmq');
const { onJobAdded } = require('../instance-lifecycle');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const identificationQueue = new Queue('identification', { connection });
const nextcloudImportQueue = new Queue('nextcloud-import', { connection });

// payload: { photoId, userId, photoS3Key }
async function addIdentificationJob(payload) {
  const job = await identificationQueue.add('identify-photo', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  onJobAdded(); // non-blocking: unshelve Instance-2 if needed
  return job;
}

// payload: { shareUrl, fileName, mimeType, userId, tags, place, albumId, importId }
async function addNextcloudImportJob(payload) {
  const job = await nextcloudImportQueue.add('import-file', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
  });
  onJobAdded(); // non-blocking: unshelve Instance-2 if needed
  return job;
}

module.exports = { addIdentificationJob, addNextcloudImportJob };
