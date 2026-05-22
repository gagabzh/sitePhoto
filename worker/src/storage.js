'use strict';

const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // required for both OVH Object Storage and MinIO
});

const BUCKET = process.env.S3_BUCKET;

async function uploadPhoto(key, buffer, mimeType) {
  await new Upload({
    client,
    params: { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mimeType },
  }).done();
  return key;
}

async function downloadPhoto(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function deletePhoto(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadPhoto, downloadPhoto, deletePhoto };
