'use strict';

const { QueueEvents } = require('bullmq');
const { onQueueDrained } = require('../instance-lifecycle');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

function startQueueEvents() {
  const queueEvents = new QueueEvents('identification', { connection });
  queueEvents.on('drained', onQueueDrained);
  queueEvents.on('error', err => {
    console.error('[queue-events] error:', err.message);
  });
  console.log('[queue-events] listening for identification queue events');
  return queueEvents;
}

module.exports = { startQueueEvents };
