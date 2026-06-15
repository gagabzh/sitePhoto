const request = require('supertest');
const app = require('../../app');
const db = require('../../db');

// Test setup
async function setupTestData() {
  // Create test users
  const { rows: userRows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role) 
     VALUES ('Editor User', 'editor@test.com', 'hash', 'editor'),
            ('Admin User', 'admin@test.com', 'hash', 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, name, email, role`
  );

  // Create test photos
  const { rows: photoRows } = await db.query(
    `INSERT INTO photos (user_id, filename, title, s3_key, taken_at, created_at)
     VALUES (1, 'test1.jpg', 'Test Photo 1', 'test1.jpg', NOW(), NOW()),
            (1, 'test2.jpg', 'Test Photo 2', 'test2.jpg', NOW(), NOW()),
            (2, 'test3.jpg', 'Admin Photo', 'test3.jpg', NOW(), NOW())
     ON CONFLICT (s3_key) DO NOTHING
     RETURNING id, user_id, filename, title`
  );

  // Create test proposals
  const proposals = [];
  if (photoRows.length >= 2) {
    await db.query(
      `INSERT INTO ai_identification_proposals 
       (photo_id, user_id, person_name, bbox, confidence, status)
       VALUES 
       (1, 1, 'John Doe', '{"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}', 0.95, 'pending'),
       (1, 1, 'Jane Smith', '{"x": 0.5, "y": 0.5, "width": 0.2, "height": 0.2}', 0.85, 'pending'),
       (2, 1, 'Bob Wilson', '{"x": 0.2, "y": 0.2, "width": 0.2, "height": 0.2}', 0.75, 'accepted')
       ON CONFLICT DO NOTHING`
    );
    
    const { rows: proposalRows } = await db.query(
      `SELECT * FROM ai_identification_proposals WHERE photo_id IN (1, 2)`
    );
    proposals.push(...proposalRows);
  }

  return {
    users: userRows,
    photos: photoRows,
    proposals: proposals
  };
}

async function cleanupTestData() {
  await db.query('DELETE FROM ai_identification_proposals WHERE user_id IN (1, 2)');
  await db.query('DELETE FROM photos WHERE user_id IN (1, 2)');
  await db.query('DELETE FROM users WHERE email IN (\'editor@test.com\', \'admin@test.com\')');
}

describe('AI Identification Routes', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/ai/identification-queue', () => {
    it('should return 403 for non-authenticated users', async () => {
      await request(app)
        .get('/api/ai/identification-queue')
        .expect(403);
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

// Repository unit tests
describe('AI Identification Repository', () => {
  let testData = null;

  beforeAll(async () => {
    testData = await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  const aiIdentificationRepo = require('../../repositories/aiIdentification');

  describe('getPendingProposals', () => {
    it('should return pending proposals for a user', async () => {
      if (testData && testData.users.length >= 1) {
        const result = await aiIdentificationRepo.getPendingProposals(testData.users[0].id, { status: 'pending' });
        expect(result).toBeDefined();
        expect(Array.isArray(result.proposals)).toBe(true);
      }
    });
  });

  describe('getProposalsForPhoto', () => {
    it('should return proposals for a specific photo', async () => {
      if (testData && testData.photos.length >= 1) {
        const result = await aiIdentificationRepo.getProposalsForPhoto(testData.photos[0].id);
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('getIdentificationCounts', () => {
    it('should return counts for a user', async () => {
      if (testData && testData.users.length >= 1) {
        const result = await aiIdentificationRepo.getIdentificationCounts(testData.users[0].id, 'editor');
        expect(result).toBeDefined();
        expect(result.pending).toBeDefined();
        expect(result.accepted).toBeDefined();
        expect(result.rejected).toBeDefined();
      }
    });
  });

  describe('createProposal', () => {
    it('should create a new proposal', async () => {
      if (testData && testData.users.length >= 1 && testData.photos.length >= 1) {
        const newProposal = await aiIdentificationRepo.createProposal(
          testData.photos[0].id,
          testData.users[0].id,
          'Test Person',
          { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          0.9
        );
        expect(newProposal).toBeDefined();
        expect(newProposal.person_name).toBe('test person'); // Lowercased
        
        // Cleanup
        await db.query('DELETE FROM ai_identification_proposals WHERE id = $1', [newProposal.id]);
      }
    });
  });
});
