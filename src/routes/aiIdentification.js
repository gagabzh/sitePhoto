const router = require('express').Router();
const db = require('../db');
const { requireEditor, wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');
const aiIdentificationRepo = require('../repositories/aiIdentification');

// ── GET /api/ai/identification-queue ────────────────────────────────────
// Fetch all pending identification proposals for the current user
router.get('/identification-queue', requireEditor, wrapAsync(async (req, res) => {
  const userId = req.session.userId;
  const { page = 1, limit = 20, status, person } = req.query;

  const result = await aiIdentificationRepo.getPendingProposals(userId, {
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    status: status || undefined,
    person: person || undefined
  });

  res.json(result);
}));

// ── GET /api/ai/identification-queue/:photoId ────────────────────────────
// Fetch all proposals for a specific photo
router.get('/identification-queue/:photoId', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  const userId = req.session.userId;

  if (!Number.isInteger(photoId)) {
    return res.status(400).json({ error: 'Invalid photoId' });
  }

  // Check if user has permission to view this photo's proposals
  // Admins can see all, editors can only see their own
  const role = req.session.role;
  if (role !== 'admin') {
    const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [photoId]);
    if (!rows.length || rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const proposals = await aiIdentificationRepo.getProposalsForPhoto(photoId);
  res.json(proposals);
}));

// ── GET /api/ai/identification/count ──────────────────────────────────────
// Get count of pending identifications
router.get('/identification/count', requireEditor, wrapAsync(async (req, res) => {
  const userId = req.session.userId;
  const { status, person } = req.query;

  const counts = await aiIdentificationRepo.getIdentificationCounts(
    userId,
    req.session.role,
    status || undefined,
    person || undefined
  );

  res.json(counts);
}));

// ── POST /api/ai/identification/:proposalId/accept ────────────────────────
// Accept a specific identification proposal
router.post('/identification/:proposalId/accept', requireEditor, wrapAsync(async (req, res) => {
  const proposalId = parseInt(req.params.proposalId, 10);
  const userId = req.session.userId;
  const { editedName } = req.body;

  if (!Number.isInteger(proposalId)) {
    return res.status(400).json({ error: 'Invalid proposalId' });
  }

  // Get the proposal to verify it exists and check permissions
  const proposal = await aiIdentificationRepo.getProposalById(proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  // Check if user has permission to review this proposal
  // Admins can review all, editors can only review their own
  const role = req.session.role;
  if (role !== 'admin' && proposal.user_id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Accept the proposal
  const result = await aiIdentificationRepo.acceptProposal(
    proposalId,
    userId,
    editedName
  );

  // Notify the photo owner
  if (result.faceCropStored) {
    notifyUser(proposal.user_id, {
      proposalId,
      photoId: proposal.photo_id,
      status: 'accepted',
      personName: editedName || proposal.person_name
    }, 'identification-proposal-updated');
  }

  res.json({ ok: true, ...result });
}));

// ── POST /api/ai/identification/:proposalId/reject ────────────────────────
// Reject a specific identification proposal
router.post('/identification/:proposalId/reject', requireEditor, wrapAsync(async (req, res) => {
  const proposalId = parseInt(req.params.proposalId, 10);
  const userId = req.session.userId;
  const { reason } = req.body;

  if (!Number.isInteger(proposalId)) {
    return res.status(400).json({ error: 'Invalid proposalId' });
  }

  // Get the proposal to verify it exists and check permissions
  const proposal = await aiIdentificationRepo.getProposalById(proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  // Check if user has permission to review this proposal
  // Admins can review all, editors can only review their own
  const role = req.session.role;
  if (role !== 'admin' && proposal.user_id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Reject the proposal
  const result = await aiIdentificationRepo.rejectProposal(
    proposalId,
    userId,
    reason || null
  );

  // Notify the photo owner
  notifyUser(proposal.user_id, {
    proposalId,
    photoId: proposal.photo_id,
    status: 'rejected',
    personName: proposal.person_name,
    reason: reason || 'No reason provided'
  }, 'identification-proposal-updated');

  res.json({ ok: true, ...result });
}));

// ── POST /api/ai/identification/photo/:photoId/accept-all ──────────────────
// Accept all pending proposals for a photo
router.post('/identification/photo/:photoId/accept-all', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  const userId = req.session.userId;

  if (!Number.isInteger(photoId)) {
    return res.status(400).json({ error: 'Invalid photoId' });
  }

  // Check if user has permission to review proposals for this photo
  const role = req.session.role;
  if (role !== 'admin') {
    const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [photoId]);
    if (!rows.length || rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const result = await aiIdentificationRepo.acceptAllProposalsForPhoto(photoId, userId);

  // Notify the photo owner
  notifyUser(userId, {
    photoId,
    status: 'accepted-all',
    count: result.accepted
  }, 'identification-proposals-updated');

  res.json({ ok: true, ...result });
}));

// ── POST /api/ai/identification/photo/:photoId/reject-all ──────────────────
// Reject all pending proposals for a photo
router.post('/identification/photo/:photoId/reject-all', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  const userId = req.session.userId;

  if (!Number.isInteger(photoId)) {
    return res.status(400).json({ error: 'Invalid photoId' });
  }

  // Check if user has permission to review proposals for this photo
  const role = req.session.role;
  if (role !== 'admin') {
    const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [photoId]);
    if (!rows.length || rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const result = await aiIdentificationRepo.rejectAllProposalsForPhoto(photoId, userId);

  // Notify the photo owner
  notifyUser(userId, {
    photoId,
    status: 'rejected-all',
    count: result.rejected
  }, 'identification-proposals-updated');

  res.json({ ok: true, ...result });
}));

module.exports = router;
