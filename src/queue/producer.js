'use strict';

const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const identificationQueue = new Queue('identification', { connection });

// payload: { photoId, userId, photoS3Key }
async function addIdentificationJob(payload) {
  return identificationQueue.add('identify-photo', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

module.exports = { addIdentificationJob };
