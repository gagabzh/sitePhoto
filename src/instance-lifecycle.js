'use strict';

// Phase 11 — Instance-2 lifecycle management.
// Unshelves Instance-2 when a job is added to the queue; shelves it again
// after INSTANCE2_IDLE_MINUTES of queue inactivity (drained event).
// All exports are no-ops when INSTANCE2_ID / OVH credentials are not set.

const ovh = require('ovh');

const IDLE_MINUTES = parseInt(process.env.INSTANCE2_IDLE_MINUTES || '10', 10);
const IDLE_MS = IDLE_MINUTES * 60_000;

// In-memory status cache — avoids an OVH API round-trip on every upload.
// Invalidated after CACHE_TTL_MS or any API action that changes state.
const CACHE_TTL_MS = 30_000;
let cachedStatus = null;
let cacheTime = 0;
let idleTimer = null;
let _client = null;

function isEnabled() {
  return !!(
    process.env.INSTANCE2_ID &&
    process.env.OVH_PROJECT_ID &&
    process.env.OVH_APP_KEY
  );
}

function getClient() {
  if (!_client) {
    _client = ovh({
      endpoint: 'ovh-eu',
      appKey: process.env.OVH_APP_KEY,
      appSecret: process.env.OVH_APP_SECRET,
      consumerKey: process.env.OVH_CONSUMER_KEY,
    });
  }
  return _client;
}

function ovhRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    getClient().request(method, path, body || {}, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function getStatus() {
  const now = Date.now();
  if (cachedStatus && now - cacheTime < CACHE_TTL_MS) return cachedStatus;
  const instance = await ovhRequest(
    'GET',
    `/cloud/project/${process.env.OVH_PROJECT_ID}/instance/${process.env.INSTANCE2_ID}`,
  );
  cachedStatus = instance.status;
  cacheTime = now;
  return cachedStatus;
}

function setStatus(status) {
  cachedStatus = status;
  cacheTime = Date.now();
}

async function unshelveIfNeeded() {
  const status = await getStatus();
  if (status === 'SHELVED_OFFLOADED') {
    console.log('[lifecycle] Instance-2 shelved — requesting unshelve');
    await ovhRequest(
      'POST',
      `/cloud/project/${process.env.OVH_PROJECT_ID}/instance/${process.env.INSTANCE2_ID}/unshelve`,
    );
    setStatus('UNSHELVING');
    console.log('[lifecycle] Unshelve requested (boot takes ~2 min)');
  }
}

async function shelveInstance() {
  const status = await getStatus();
  if (status !== 'ACTIVE') return; // already shelved or in transition
  console.log('[lifecycle] Queue idle — shelving Instance-2');
  await ovhRequest(
    'POST',
    `/cloud/project/${process.env.OVH_PROJECT_ID}/instance/${process.env.INSTANCE2_ID}/shelve`,
  );
  setStatus('SHELVING');
  console.log('[lifecycle] Shelve requested');
}

function onJobAdded() {
  if (!isEnabled()) return;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  unshelveIfNeeded().catch(err => {
    console.warn('[lifecycle] unshelveIfNeeded error:', err.message);
  });
}

function onQueueDrained() {
  if (!isEnabled()) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    shelveInstance().catch(err => {
      console.warn('[lifecycle] shelveInstance error:', err.message);
    });
  }, IDLE_MS);
  console.log(`[lifecycle] Queue drained — shelving in ${IDLE_MINUTES} min if idle`);
}

// Exposed for test isolation only
function _resetForTesting() {
  cachedStatus = null;
  cacheTime = 0;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  _client = null;
}

module.exports = { isEnabled, onJobAdded, onQueueDrained, _resetForTesting };
