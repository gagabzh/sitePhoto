// Tests for repositories/aiIdentification.js
// Simple tests to improve coverage

jest.mock('../../db', () => ({
  query: jest.fn()
}));

const db = require('../../db');
const {
  getPendingProposals,
  getProposalsForPhoto,
  getIdentificationCounts,
  getProposalById,
  acceptProposal,
  rejectProposal,
  acceptAllProposalsForPhoto,
  rejectAllProposalsForPhoto,
  createProposal
} = require('../../repositories/aiIdentification');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Repository functions exist and are callable', () => {
  it('getPendingProposals should be a function', () => {
    expect(typeof getPendingProposals).toBe('function');
  });

  it('getProposalsForPhoto should be a function', () => {
    expect(typeof getProposalsForPhoto).toBe('function');
  });

  it('getIdentificationCounts should be a function', () => {
    expect(typeof getIdentificationCounts).toBe('function');
  });

  it('getProposalById should be a function', () => {
    expect(typeof getProposalById).toBe('function');
  });

  it('acceptProposal should be a function', () => {
    expect(typeof acceptProposal).toBe('function');
  });

  it('rejectProposal should be a function', () => {
    expect(typeof rejectProposal).toBe('function');
  });

  it('acceptAllProposalsForPhoto should be a function', () => {
    expect(typeof acceptAllProposalsForPhoto).toBe('function');
  });

  it('rejectAllProposalsForPhoto should be a function', () => {
    expect(typeof rejectAllProposalsForPhoto).toBe('function');
  });

  it('createProposal should be a function', () => {
    expect(typeof createProposal).toBe('function');
  });
});

describe('getProposalsForPhoto', () => {
  it('should query database for proposals', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const result = await getProposalsForPhoto(100);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM ai_identification_proposals'),
      [100]
    );
    expect(result).toEqual([]);
  });

  it('should return proposals when found', async () => {
    db.query.mockResolvedValue({ 
      rows: [{ id: 1, person_name: 'Alice', photo_id: 100 }]
    });
    const result = await getProposalsForPhoto(100);
    expect(result.length).toBe(1);
    expect(result[0].person_name).toBe('Alice');
  });
});

describe('getProposalById', () => {
  it('should return proposal by id', async () => {
    db.query.mockResolvedValue({ 
      rows: [{ id: 1, user_id: 10, person_name: 'Alice', photo_id: 100, photo_owner_id: 10 }]
    });
    const result = await getProposalById(1);
    expect(result.id).toBe(1);
    expect(result.user_id).toBe(10);
  });

  it('should return null when not found', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const result = await getProposalById(999);
    expect(result).toBeNull();
  });
});

describe('createProposal', () => {
  it('should create a new proposal', async () => {
    const bbox = { x: 10, y: 20, width: 100, height: 100 };
    db.query.mockResolvedValue({ 
      rows: [{ id: 1, photo_id: 100, user_id: 10, person_name: 'Alice', bbox: JSON.stringify(bbox), confidence: 0.95, status: 'pending' }]
    });
    const result = await createProposal(100, 10, 'Alice', bbox, 0.95);
    expect(result.id).toBe(1);
    expect(result.status).toBe('pending');
  });
});

describe('acceptProposal', () => {
  it('should throw error when proposal not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(acceptProposal(999, 10)).rejects.toThrow('Proposal not found');
  });
});

describe('rejectProposal', () => {
  it('should throw error when proposal not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(rejectProposal(999, 10)).rejects.toThrow('Proposal not found');
  });
});

describe('acceptAllProposalsForPhoto', () => {
  it('should return accepted count', async () => {
    // Mock getProposalsForPhoto to return empty
    db.query.mockResolvedValue({ rows: [] });
    const result = await acceptAllProposalsForPhoto(100, 10);
    expect(result.accepted).toBe(0);
  });
});

describe('rejectAllProposalsForPhoto', () => {
  it('should return rejected count', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const result = await rejectAllProposalsForPhoto(100, 10);
    expect(result.rejected).toBe(0);
  });
});
