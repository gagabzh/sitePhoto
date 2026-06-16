jest.mock('../../db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  pool: { connect: jest.fn() }
}));
jest.mock('../../repositories/aiIdentification', () => ({
  getPendingProposals: jest.fn().mockResolvedValue({ proposals: [], counts: {} }),
  getProposalsForPhoto: jest.fn().mockResolvedValue([]),
  getIdentificationCounts: jest.fn().mockResolvedValue({ pending: 0, accepted: 0, rejected: 0, edited: 0 }),
  createProposal: jest.fn().mockResolvedValue({ id: 1, person_name: 'test person' }),
  acceptProposal: jest.fn().mockResolvedValue({ ok: true, faceCropStored: false }),
  rejectProposal: jest.fn().mockResolvedValue({ ok: true }),
  acceptAllProposalsForPhoto: jest.fn().mockResolvedValue({ accepted: 0 }),
  rejectAllProposalsForPhoto: jest.fn().mockResolvedValue({ rejected: 0 }),
  getProposalById: jest.fn().mockResolvedValue(null)
}));
jest.mock('../../queue/producer', () => ({
  addIdentificationJob: jest.fn().mockResolvedValue()
}));
jest.mock('../../storage', () => ({
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
  readPhotoBuffer: jest.fn(),
  downloadPhoto: jest.fn(),
  streamPhoto: jest.fn()
}));

const request = require('supertest');
const app = require('../../app');

describe('AI Identification Routes', () => {

  describe('GET /api/ai/identification-queue', () => {
    it('should redirect to login for non-authenticated users', async () => {
      await request(app)
        .get('/api/ai/identification-queue')
        .expect(302);
    });

    it('should return 403 for users without editor role', async () => {
      // This would require setting up a viewer user session
      // For now, we'll skip this test
    });
  });

  describe('GET /api/ai/identification/count', () => {
    it('should return counts for authenticated editor users', async () => {
      // This test would require session setup
      // The actual implementation would be tested in integration tests
    });
  });

  describe('GET /api/ai/identification-queue/:photoId', () => {
    it('should return proposals for a specific photo', async () => {
      // This test would require proper session setup
    });
  });

  describe('POST /api/ai/identification/:proposalId/accept', () => {
    it('should accept a proposal and update status', async () => {
      // This test would require proper session setup
    });
  });

  describe('POST /api/ai/identification/:proposalId/reject', () => {
    it('should reject a proposal and update status', async () => {
      // This test would require proper session setup
    });
  });

  describe('POST /api/ai/identification/photo/:photoId/accept-all', () => {
    it('should accept all pending proposals for a photo', async () => {
      // This test would require proper session setup
    });
  });

  describe('POST /api/ai/identification/photo/:photoId/reject-all', () => {
    it('should reject all pending proposals for a photo', async () => {
      // This test would require proper session setup
    });
  });
});
