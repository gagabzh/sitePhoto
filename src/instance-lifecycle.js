'use strict';

// Phase 11 — Instance-2 lifecycle management.
// Unshelves Instance-2 when a job is added to the queue; shelves it again
// after INSTANCE2_IDLE_MINUTES of queue inactivity (drained event).
// All exports are no-ops when INSTANCE2_ID / OVH credentials are not set.
//
// Uses Node 18 built-in fetch + crypto instead of the 'ovh' npm package.
// The ovh library threw ERR_UNESCAPED_CHARACTERS asynchronously inside an
// event handler, outside any Promise wrapper, crashing the process.

const { createHash } = require('crypto');

const OVH_API = 'https://eu.api.ovh.com/1.0';

const IDLE_MINUTES = parseInt(process.env.INSTANCE2_IDLE_MINUTES || '10', 10);
const IDLE_MS = IDLE_MINUTES * 60_000;

// In-memory status cache — avoids an OVH API round-trip on every upload.
// Invalidated after CACHE_TTL_MS or any API action that changes state.
const CACHE_TTL_MS = 30_000;
let cachedStatus = null;
let cacheTime = 0;
let idleTimer = null;
// Guards concurrent unshelve calls (e.g. bulk upload before cache is warm).
let unshelveInFlight = false;
// OVH server time offset (local_unix - ovh_unix), fetched once and reused.
let timeOffset = null;

function isEnabled() {
  return !!(
    process.env.INSTANCE2_ID &&
    process.env.OVH_PROJECT_ID &&
    process.env.OVH_APP_KEY &&
    process.env.OVH_APP_SECRET &&
    process.env.OVH_CONSUMER_KEY
  );
}

async function ovhTimestamp() {
  if (timeOffset === null) {
    const res = await fetch(`${OVH_API}/auth/time`);
    const serverTime = await res.json();
    timeOffset = Math.floor(Date.now() / 1000) - serverTime;
  }
  return String(Math.floor(Date.now() / 1000) - timeOffset);
}

async function ovhRequest(method, path) {
  const url = `${OVH_API}${path}`;
  const body = '';
  const ts = await ovhTimestamp();

  const sig = '$1$' + createHash('sha1')
    .update([
      process.env.OVH_APP_SECRET,
      process.env.OVH_CONSUMER_KEY,
      method.toUpperCase(),
      url,
      body,
      ts,
    ].join('+'))
    .digest('hex');

  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers: {
      'X-Ovh-Application': process.env.OVH_APP_KEY,
      'X-Ovh-Consumer': process.env.OVH_CONSUMER_KEY,
      'X-Ovh-Timestamp': ts,
      'X-Ovh-Signature': sig,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OVH ${method} ${path} → ${res.status}: ${text}`);
  }
  return method === 'POST' ? null : res.json();
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
  unshelveInFlight = false;
}

async function unshelveIfNeeded() {
  const status = await getStatus();
  if (status === 'SHELVED_OFFLOADED' && !unshelveInFlight) {
    unshelveInFlight = true;
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
  if (status !== 'ACTIVE') return;
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
  unshelveInFlight = false;
  timeOffset = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

module.exports = { isEnabled, onJobAdded, onQueueDrained, _resetForTesting };
