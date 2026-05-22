const sharp = require('sharp');
const fs = require('fs');

const MAX_WIDTH = parseInt(process.env.MAX_PHOTO_WIDTH || '1920');
const SIZE_THRESHOLD = parseInt(process.env.MAX_PHOTO_BYTES || String(2 * 1024 * 1024)); // 2 MB

/**
 * Resize if wider than MAX_WIDTH, then compress quality if file exceeds SIZE_THRESHOLD.
 * GIF is skipped (sharp does not support animated GIF).
 * Returns the final file size in bytes.
 */
async function optimizePhoto(filepath, mimetype) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimetype)) {
    return (await fs.promises.stat(filepath)).size;
  }

  const { size: originalSize } = await fs.promises.stat(filepath);
  const tooBig = originalSize > SIZE_THRESHOLD;

  let pipeline = sharp(filepath).resize(MAX_WIDTH, null, { fit: 'inside', withoutEnlargement: true });

  if (tooBig) {
    if (mimetype === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 75 });
    else if (mimetype === 'image/webp') pipeline = pipeline.webp({ quality: 75 });
    else if (mimetype === 'image/png')  pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const buffer = await pipeline.toBuffer();

  if (buffer.length < originalSize) {
    await fs.promises.writeFile(filepath, buffer);
    return buffer.length;
  }

  return originalSize;
}

// Buffer-based variant — used by the S3 upload path (no disk I/O).
async function optimizeBuffer(buffer, mimetype) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimetype)) {
    return buffer;
  }

  const tooBig = buffer.length > SIZE_THRESHOLD;
  let pipeline = sharp(buffer).resize(MAX_WIDTH, null, { fit: 'inside', withoutEnlargement: true });

  if (tooBig) {
    if (mimetype === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 75 });
    else if (mimetype === 'image/webp') pipeline = pipeline.webp({ quality: 75 });
    else if (mimetype === 'image/png')  pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const optimized = await pipeline.toBuffer();
  return optimized.length < buffer.length ? optimized : buffer;
}

module.exports = { optimizePhoto, optimizeBuffer };
