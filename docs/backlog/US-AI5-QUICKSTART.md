# US-AI5 Quick Start Guide

## 🚀 Getting Started

This guide will get your development team up and running with US-AI5 implementation.

---

## 1. Prerequisites Check

Before starting, verify all dependencies are in place:

```bash
# Check that these files exist and are complete
ls -la src/routes/ai.js          # AI-2 implementation
ls -la src/routes/photos.js      # AI-3 implementation  
ls -la src/routes/internal.js    # AI-4 implementation
ls -la src/repositories/personFaces.js  # Person faces repository
ls -la worker/src/worker.js      # Worker with AI identification
```

---

## 2. Setup Environment

### Apply Database Migration

```bash
# Run the migration
psql -U your_db_user -d your_db_name -f migrations/v16-us-ai5-identification-queue.sql

# Verify tables were created
psql -U your_db_user -d your_db_name -c "\dt ai_identification_proposals"
psql -U your_db_user -d your_db_name -c "\d ai_identification_proposals"
```

### Verify Migration

```sql
-- Check the table exists
SELECT * FROM ai_identification_proposals LIMIT 1;

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'ai_identification_proposals';

-- Check the view
SELECT * FROM v_ai_identification_pending LIMIT 1;
```

---

## 3. Implementation Order

Follow this order to implement US-AI5:

### 📌 Phase 1: Backend (Start Here)

1. **Create Repository** (`src/repositories/aiIdentification.js`)
   - Implement all repository functions
   - Test with manual SQL queries first

2. **Create Routes** (`src/routes/aiIdentification.js`)
   - Wire up all API endpoints
   - Use existing middleware (`requireEditor`, `wrapAsync`)

3. **Modify Internal Routes** (`src/routes/internal.js`)
   - Add `POST /internal/store-identification-proposals` endpoint
   - Update existing endpoints if needed

4. **Update Worker** (`worker/src/worker.js`)
   - Modify identification job to use new endpoint
   - Ensure confidence scores are passed through

### 📌 Phase 2: Frontend

5. **Create View Templates**
   - `src/views/templates/ai-identification-queue.ejs`
   - `src/views/templates/ai-identification-review.ejs`

6. **Create View Controllers** (`src/views/aiIdentificationViews.js`)
   - Render functions for both pages

7. **Add Routes** (`src/app.js`)
   - `/ai/identification-queue`
   - `/ai/identification-review/:photoId`

8. **Create JavaScript**
   - `public/js/ai-identification-queue.js`
   - `public/js/ai-identification-review.js`

9. **Add Navigation**
   - Update navbar for editors/admins
   - Add badge counter

### 📌 Phase 3: Testing

10. **Write Backend Tests** (`src/__tests__/routes/aiIdentification.test.js`)
11. **Manual Testing**
12. **Performance Testing**

---

## 4. Code Snippets

### Repository Function Example

```javascript
// src/repositories/aiIdentification.js
async function getPendingProposals(userId, { page = 1, limit = 20, status, person } = {}) {
  const offset = (page - 1) * limit;
  
  let whereClause = 'p.status = $1';
  const params = [status || 'pending'];
  let paramIndex = 2;
  
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
  }
  
  const query = `
    SELECT p.*, 
           photos.title as photo_title,
           photos.s3_key as photo_s3_key,
           photos.taken_at as photo_date
    FROM ai_identification_proposals p
    JOIN photos ON p.photo_id = photos.id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(limit, offset);
  
  const { rows } = await db.query(query, params);
  return rows;
}
```

### Route Example

```javascript
// src/routes/aiIdentification.js
router.get('/identification-queue', requireEditor, wrapAsync(async (req, res) => {
  const userId = req.session.userId;
  const { page = 1, limit = 20, status, person } = req.query;
  
  const proposals = await aiIdentificationRepo.getPendingProposals(userId, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    status,
    person
  });
  
  const counts = await aiIdentificationRepo.getIdentificationCounts(userId);
  
  res.json({ proposals, counts, page: parseInt(page, 10) });
}));
```

### Accept Proposal Example

```javascript
// src/routes/aiIdentification.js
router.post('/identification/:proposalId/accept', requireEditor, wrapAsync(async (req, res) => {
  const proposalId = parseInt(req.body.proposalId, 10);
  const userId = req.session.userId;
  const { editedName } = req.body;
  
  if (!Number.isInteger(proposalId)) {
    return res.status(400).json({ error: 'Invalid proposalId' });
  }
  
  // Get the proposal
  const proposal = await aiIdentificationRepo.getProposalById(proposalId);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }
  
  // Accept the proposal
  const result = await aiIdentificationRepo.acceptProposal(
    proposalId, 
    userId, 
    editedName
  );
  
  // Store in person_faces for continuous learning
  if (result.faceCropStored) {
    // Trigger socket.io notification
    notifyUser(proposal.user_id, { 
      proposalId, 
      status: 'accepted',
      personName: editedName || proposal.person_name
    }, 'identification-proposal-updated');
  }
  
  res.json({ ok: true, ...result });
}));
```

---

## 5. Testing Commands

### Run Tests

```bash
# Run all tests
npm test

# Run only AI identification tests
npm test -- --grep "AI Identification"

# Run with coverage
npm test -- --coverage
```

### Manual Testing

```bash
# Start the server
npm start

# Test endpoints with curl
# Get queue (as editor)
curl -H "Cookie: connect.sid=YOUR_EDITOR_SESSION" \
  http://localhost:3000/api/ai/identification-queue

# Accept a proposal
curl -X POST \
  -H "Cookie: connect.sid=YOUR_EDITOR_SESSION" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"editedName": "John Doe"}' \
  http://localhost:3000/api/ai/identification/1/accept
```

---

## 6. Common Issues & Solutions

### Issue: Database connection errors
**Solution:** Verify `.env` file has correct DB credentials

### Issue: 403 Forbidden on API endpoints
**Solution:** Ensure user has `editor` or `admin` role in session

### Issue: Bounding boxes not displaying
**Solution:** Check bbox format is `{x, y, width, height}` in [0,1] range

### Issue: Socket.io not working
**Solution:** Verify socket.io is initialized in `src/app.js`

### Issue: Proposals not appearing in queue
**Solution:** Check worker is calling `/internal/store-identification-proposals`

---

## 7. File Checklist

Before committing, verify these files are created/modified:

- [ ] `migrations/v16-us-ai5-identification-queue.sql` (DONE)
- [ ] `src/repositories/aiIdentification.js`
- [ ] `src/routes/aiIdentification.js`
- [ ] `src/routes/internal.js` (modified)
- [ ] `worker/src/worker.js` (modified)
- [ ] `src/views/aiIdentificationViews.js`
- [ ] `src/views/templates/ai-identification-queue.ejs`
- [ ] `src/views/templates/ai-identification-review.ejs`
- [ ] `public/js/ai-identification-queue.js`
- [ ] `public/js/ai-identification-review.js`
- [ ] `src/app.js` (modified - add routes)
- [ ] `src/views/partials/navbar.ejs` (modified - add nav link)
- [ ] `src/__tests__/routes/aiIdentification.test.js`

---

## 8. Team Coordination

### Daily Standup Questions
1. What did you implement yesterday?
2. What are you implementing today?
3. Any blockers?

### Pair Programming Recommendations
- Pair on the repository layer first
- Pair on the first API endpoint
- Review each other's frontend code

### Code Review Checklist
- [ ] All acceptance criteria are covered
- [ ] Error handling is comprehensive
- [ ] Access control is correct (editors/admins only)
- [ ] Tests are written and passing
- [ ] Performance is acceptable
- [ ] No breaking changes to existing features

---

## 9. Resources

- [Full Implementation Plan](US-AI5-DEV-PLAN.md)
- [Story Definition](../stories/local-ai.md#us-ai5review-and-validate-ai-identification-proposals)
- [Existing AI Routes](../../src/routes/ai.js)
- [Database Schema](../../init-db.sql)
- [Worker Code](../../worker/src/worker.js)

---

## 10. Contacts

- **Product Owner:** [Name/Email]
- **Tech Lead:** [Name/Email]
- **QA Lead:** [Name/Email]

---

*Last Updated: 2026-06-13*
