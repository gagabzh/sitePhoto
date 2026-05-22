'use strict';

// In Docker the Dockerfile replaces this file with src/storage.js from the repo root.
// In local dev (node src/worker.js outside Docker), this re-export resolves to the same file.
module.exports = require('../../src/storage');
