const sharp = require('sharp');
const path = require('path');

// Difference hash (dHash): resize to 9×8 grayscale, compare adjacent pixels
// in each row. Returns a 64-bit BigInt (one bit per comparison).
async function dHash(filepath) {
  const { data } = await sharp(filepath)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (data[row * 9 + col] > data[row * 9 + col + 1]) {
        hash |= 1n << BigInt(row * 8 + col);
      }
    }
  }
  return hash;
}

// Number of differing bits between two 64-bit hashes.
function hammingDistance(a, b) {
  let diff = a ^ b;
  let n = 0;
  while (diff) { n += Number(diff & 1n); diff >>= 1n; }
  return n;
}

// Cluster photos into duplicate groups.
// Each photo object must have { id, filename, title }.
// Returns an array of groups (arrays of photo objects); only groups with ≥ 2
// photos are included. Photos whose file cannot be read are silently skipped.
// maxDist: maximum Hamming distance to consider a pair near-duplicate (default 10).
async function findDuplicates(photos, uploadDir, maxDist = 10) {
  const hashes = [];
  for (const photo of photos) {
    try {
      const h = await dHash(path.join(uploadDir, photo.filename));
      hashes.push({ photo, hash: h });
    } catch {
      // Unsupported format or file missing — skip silently
    }
  }

  const used = new Set();
  const groups = [];

  for (let i = 0; i < hashes.length; i++) {
    if (used.has(i)) continue;
    const group = [hashes[i].photo];
    for (let j = i + 1; j < hashes.length; j++) {
      if (used.has(j)) continue;
      if (hammingDistance(hashes[i].hash, hashes[j].hash) <= maxDist) {
        group.push(hashes[j].photo);
        used.add(j);
      }
    }
    if (group.length > 1) {
      used.add(i);
      groups.push(group);
    }
  }

  return groups;
}

module.exports = { dHash, hammingDistance, findDuplicates };
