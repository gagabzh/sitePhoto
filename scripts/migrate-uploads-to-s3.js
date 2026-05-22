#!/usr/bin/env node
'use strict';

/**
 * One-shot script: upload all files in the local uploads/ directory to S3,
 * then set s3_key = filename in the DB for every row that was migrated.
 *
 * Without the DB update, deletePhotos() would keep using the disk path for
 * legacy photos even after they exist in S3, leaving orphan objects in the bucket.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   S3_ENDPOINT=...  S3_REGION=... S3_BUCKET=... \
 *   S3_ACCESS_KEY=... S3_SECRET_KEY=... \
 *   UPLOAD_DIR=/app/uploads \
 *   node scripts/migrate-uploads-to-s3.js
 *
 * Files already present in S3 (same key) are skipped — safe to re-run.
 * The DB UPDATE is idempotent (only touches rows where s3_key IS NULL).
 *
 * Add --dry-run to preview what would happen without writing anything.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const BUCKET = process.env.S3_BUCKET;

if (!process.env.S3_ENDPOINT || !BUCKET) {
  console.error('ERROR: S3_ENDPOINT and S3_BUCKET env vars are required.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required.');
  process.exit(1);
}

if (DRY_RUN) console.log('[dry-run] No files will be uploaded and no DB rows will be updated.\n');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
};

async function existsInS3(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
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
  const migrated = [];

  for (const filename of images) {
    const key = filename;
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    if (await existsInS3(key)) {
      console.log(`  skip  ${filename} (already in S3)`);
      skipped++;
      migrated.push(filename);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  would upload  ${filename}`);
      uploaded++;
      migrated.push(filename);
      continue;
    }

    try {
      const body = await fs.promises.readFile(path.join(UPLOAD_DIR, filename));
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
      console.log(`  ok    ${filename}`);
      uploaded++;
      migrated.push(filename);
    } catch (err) {
      console.error(`  ERROR ${filename}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nS3: ${uploaded} uploaded, ${skipped} already present, ${errors} errors`);

  // Update s3_key in DB for every file now in S3.
  // This makes deletePhotos() use the S3 path for these photos.
  if (migrated.length > 0) {
    if (DRY_RUN) {
      console.log(`[dry-run] Would UPDATE ${migrated.length} row(s): SET s3_key = filename WHERE s3_key IS NULL`);
    } else {
      const { rowCount } = await pool.query(
        'UPDATE photos SET s3_key = filename WHERE s3_key IS NULL AND filename = ANY($1::text[])',
        [migrated],
      );
      console.log(`DB: ${rowCount} row(s) updated (s3_key set)`);
    }
  }

  await pool.end();
  if (errors) process.exit(1);
}

main();
