'use strict';

const db = require('../db');

// Helper to get user role
async function getUserRole(userId) {
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0]?.role || null;
}

/**
 * Get pending proposals for a user with optional filtering and pagination
 * @param {number} userId - The user ID
 * @param {object} options - Filtering and pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 20)
 * @param {string} options.status - Filter by status (pending/accepted/rejected/edited)
 * @param {string} options.person - Filter by person name
 * @returns {Promise<{proposals: Array, counts: object}>}
 */
async function getPendingProposals(userId, options = {}) {
  const { page = 1, limit = 20, status, person } = options;
  const offset = (page - 1) * limit;
  
  let whereClause = '';
  const params = [];
  let paramIndex = 1;

  // Status filter
  if (status) {
    whereClause += ` AND p.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  } else {
    // Default to pending if no status specified
    whereClause += ` AND p.status = $${paramIndex}`;
    params.push('pending');
    paramIndex++;
  }

  // Person name filter
  if (person) {
    whereClause += ` AND p.person_name ILIKE $${paramIndex}`;
    params.push(`%${person}%`);
    paramIndex++;
  }

  // Admins see all, editors see their own
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    whereClause += ` AND p.user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  // Main query with photo metadata
  const query = `
    SELECT p.*, 
           photos.title as photo_title,
           photos.filename as photo_filename,
           photos.s3_key as photo_s3_key,
           photos.taken_at as photo_date
    FROM ai_identification_proposals p
    JOIN photos ON p.photo_id = photos.id
    WHERE 1=1 ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const { rows: proposals } = await db.query(query, params);
  
  // Get counts
  const counts = await getIdentificationCounts(userId, role, status, person);

  return { proposals, counts, page: parseInt(page, 10), limit: parseInt(limit, 10) };
}

/**
 * Get identification counts for a user
 * @param {number} userId - The user ID
 * @param {string} role - User role (admin/editor)
 * @param {string} status - Optional status filter
 * @param {string} person - Optional person name filter
 * @returns {Promise<{pending: number, accepted: number, rejected: number, edited: number}>}
 */
async function getIdentificationCounts(userId, role = null, status = null, person = null) {
  if (role === null) {
    role = await getUserRole(userId);
  }

  let whereClause = '';
  const params = [];
  let paramIndex = 1;

  // Admins see all, editors see their own
  if (role !== 'admin') {
    whereClause += ` AND user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (person) {
    whereClause += ` AND person_name ILIKE $${paramIndex}`;
    params.push(`%${person}%`);
    paramIndex++;
  }

  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE status = 'edited') as edited
    FROM ai_identification_proposals
    WHERE 1=1 ${whereClause}
  `;

  const { rows } = await db.query(query, params);
  const result = rows[0] || {};

  return {
    pending: parseInt(result.pending || '0', 10),
    accepted: parseInt(result.accepted || '0', 10),
    rejected: parseInt(result.rejected || '0', 10),
    edited: parseInt(result.edited || '0', 10),
  };
}

/**
 * Get all proposals for a specific photo
 * @param {number} photoId - The photo ID
 * @returns {Promise<Array>} - Array of proposals
 */
async function getProposalsForPhoto(photoId) {
  const { rows } = await db.query(
    `SELECT p.*, 
            photos.title as photo_title,
            photos.s3_key as photo_s3_key
     FROM ai_identification_proposals p
     JOIN photos ON p.photo_id = photos.id
     WHERE p.photo_id = $1
     ORDER BY p.created_at ASC`,
    [photoId]
  );
  return rows;
}

/**
 * Get a single proposal by ID
 * @param {number} proposalId - The proposal ID
 * @returns {Promise<object|null>} - The proposal or null
 */
async function getProposalById(proposalId) {
  const { rows } = await db.query(
    `SELECT p.*, photos.user_id as photo_owner_id 
     FROM ai_identification_proposals p
     JOIN photos ON p.photo_id = photos.id
     WHERE p.id = $1`,
    [proposalId]
  );
  return rows[0] || null;
}

/**
 * Accept a proposal and store in person_faces
 * @param {number} proposalId - The proposal ID
 * @param {number} reviewerId - The user ID of the reviewer
 * @param {string|null} editedName - Optional edited name
 * @returns {Promise<{ok: boolean, faceCropStored: boolean}>}
 */
async function acceptProposal(proposalId, reviewerId, editedName = null) {
  const proposal = await getProposalById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }

  const finalName = editedName || proposal.person_name;
  const finalStatus = editedName ? 'edited' : 'accepted';

  // Update proposal status
  await db.query(
    `UPDATE ai_identification_proposals 
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), edited_name = $3
     WHERE id = $4`,
    [finalStatus, reviewerId, editedName, proposalId]
  );

  // Store in person_faces table
  let faceCropStored = false;
  try {
    await db.query(
      `INSERT INTO person_faces (user_id, person_name, photo_id, bbox, crop_s3_key, created_at)
       VALUES ($1, $2, $3, $4, NULL, NOW())
       ON CONFLICT (user_id, person_name, photo_id, bbox) DO NOTHING`,
      [proposal.user_id, finalName.toLowerCase(), proposal.photo_id, JSON.stringify(proposal.bbox)]
    );
    faceCropStored = true;

    // Link tag to photo if not already linked
    // First, ensure the tag exists
    const { rows: tagRows } = await db.query(
      `INSERT INTO tags (name, category) VALUES ($1, 'people')
       ON CONFLICT (name) DO UPDATE SET category = 'people'
       RETURNING id`,
      [finalName.toLowerCase()]
    );
    
    const tagId = tagRows[0]?.id;
    if (tagId) {
      await db.query(
        'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [proposal.photo_id, tagId]
      );
    }
  } catch (err) {
    console.error('[aiIdentification] Failed to store face crop:', err.message);
    // Don't throw - the proposal was still accepted
  }

  return { ok: true, faceCropStored };
}

/**
 * Reject a proposal
 * @param {number} proposalId - The proposal ID
 * @param {number} reviewerId - The user ID of the reviewer
 * @param {string|null} reason - Optional rejection reason
 * @returns {Promise<{ok: boolean}>}
 */
async function rejectProposal(proposalId, reviewerId, reason = null) {
  const proposal = await getProposalById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }

  await db.query(
    `UPDATE ai_identification_proposals 
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
     WHERE id = $3`,
    [reviewerId, reason, proposalId]
  );

  return { ok: true };
}

/**
 * Accept all pending proposals for a photo
 * @param {number} photoId - The photo ID
 * @param {number} reviewerId - The user ID of the reviewer
 * @returns {Promise<{accepted: number}>}
 */
async function acceptAllProposalsForPhoto(photoId, reviewerId) {
  // Get all pending proposals for this photo
  const proposals = await getProposalsForPhoto(photoId);
  const pendingProposals = proposals.filter(p => p.status === 'pending');

  let acceptedCount = 0;
  for (const proposal of pendingProposals) {
    try {
      await acceptProposal(proposal.id, reviewerId, null);
      acceptedCount++;
    } catch (err) {
      console.error(`[aiIdentification] Failed to accept proposal ${proposal.id}:`, err.message);
    }
  }

  return { accepted: acceptedCount };
}

/**
 * Reject all pending proposals for a photo
 * @param {number} photoId - The photo ID
 * @param {number} reviewerId - The user ID of the reviewer
 * @returns {Promise<{rejected: number}>}
 */
async function rejectAllProposalsForPhoto(photoId, reviewerId) {
  // Get all pending proposals for this photo
  const proposals = await getProposalsForPhoto(photoId);
  const pendingProposals = proposals.filter(p => p.status === 'pending');

  let rejectedCount = 0;
  for (const proposal of pendingProposals) {
    try {
      await rejectProposal(proposal.id, reviewerId, null);
      rejectedCount++;
    } catch (err) {
      console.error(`[aiIdentification] Failed to reject proposal ${proposal.id}:`, err.message);
    }
  }

  return { rejected: rejectedCount };
}

/**
 * Create a new identification proposal
 * @param {number} photoId - The photo ID
 * @param {number} userId - The user ID
 * @param {string} personName - The suggested person name
 * @param {object} bbox - Bounding box {x, y, width, height}
 * @param {number|null} confidence - Confidence score (0-1)
 * @returns {Promise<object>} - The created proposal
 */
async function createProposal(photoId, userId, personName, bbox, confidence = null) {
  const { rows } = await db.query(
    `INSERT INTO ai_identification_proposals 
     (photo_id, user_id, person_name, bbox, confidence, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [photoId, userId, personName, JSON.stringify(bbox), confidence]
  );
  return rows[0];
}

module.exports = {
  getPendingProposals,
  getProposalsForPhoto,
  getProposalById,
  acceptProposal,
  rejectProposal,
  acceptAllProposalsForPhoto,
  rejectAllProposalsForPhoto,
  getIdentificationCounts,
  createProposal,
};
