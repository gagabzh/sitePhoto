#!/usr/bin/env node
'use strict';

/**
 * One-shot script: upload all files in the local uploads/ directory to S3.
 * Run once against production after enabling S3 storage (V4 migration).
 *
 * Usage:
 *   S3_ENDPOINT=... S3_REGION=... S3_BUCKET=... S3_ACCESS_KEY=... S3_SECRET_KEY=... \
 *   UPLOAD_DIR=/app/uploads node scripts/migrate-uploads-to-s3.js
 *
 * Files already present in S3 (same key) are skipped — safe to re-run.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const BUCKET = process.env.S3_BUCKET;

if (!process.env.S3_ENDPOINT || !BUCKET) {
  console.error('ERROR: S3_ENDPOINT and S3_BUCKET env vars are required.');
  process.exit(1);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
};

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let files;
  try {
    files = await fs.promises.readdir(UPLOAD_DIR);
  } catch {
    console.error(`Cannot read UPLOAD_DIR: ${UPLOAD_DIR}`);
    process.exit(1);
  }

  const images = files.filter(f => Object.hasOwn(MIME, path.extname(f).toLowerCase()));
  console.log(`Found ${images.length} image(s) in ${UPLOAD_DIR}`);

  let uploaded = 0, skipped = 0, errors = 0;

  for (const filename of images) {
    const key = filename;
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    if (await exists(key)) {
      console.log(`  skip  ${filename} (already in S3)`);
      skipped++;
      continue;
    }

    try {
      const body = await fs.promises.readFile(path.join(UPLOAD_DIR, filename));
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
      console.log(`  ok    ${filename}`);
      uploaded++;
    } catch (err) {
      console.error(`  ERROR ${filename}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);
  if (errors) process.exit(1);
}

main();
