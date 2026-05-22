'use strict';

const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // required for OVH Object Storage and MinIO
});

const BUCKET = process.env.S3_BUCKET;

async function uploadPhoto(key, buffer, mimeType) {
  await new Upload({
    client,
    params: { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mimeType },
  }).done();
}

async function downloadPhoto(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function streamPhoto(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return { stream: res.Body, contentType: res.ContentType };
}

async function deletePhoto(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Reads a photo file: tries S3 first (V4+ uploads), falls back to local disk (legacy).
async function readPhotoBuffer(filename) {
  if (process.env.S3_ENDPOINT) {
    try { return await downloadPhoto(filename); } catch { /* not in S3 yet */ }
  }
  return fs.promises.readFile(path.join(UPLOAD_DIR, filename));
}

module.exports = { uploadPhoto, downloadPhoto, streamPhoto, deletePhoto, readPhotoBuffer };
