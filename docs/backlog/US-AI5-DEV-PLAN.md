# US-AI5 Development Plan - Review and Validate AI Identification Proposals

## Overview

**Story ID:** US-AI5  
**Title:** Review and validate AI identification proposals  
**Domain:** Local AI / People Tagging  
**Priority:** High  
**Status:** Ready for Development  

---

## Story Description

As an editor or administrator, I need a dedicated page to follow identification tasks and accept or reject AI-generated person identification proposals, so I can ensure accurate face tagging across the platform with proper oversight.

---

## Dependencies Status

All dependencies are **COMPLETED** ✅

| Dependency | Status | Location | Notes |
|------------|--------|----------|-------|
| AI-2 | ✅ Done | `src/routes/ai.js`, `worker/` | People identification and tagging |
| AI-3 | ✅ Done | `src/routes/photos.js` | Manual person tagging with face crops |
| AI-4 | ✅ Done | `src/routes/internal.js` | AI learns from manual tags, few-shot injection |

---

## Current Infrastructure Analysis

### Existing Components to Reuse

1. **Database Tables**
   - `person_faces` (v15 migration) - Stores face crops, person names, bounding boxes
   - `photos` - Photo metadata
   - `tags` - Tag definitions with category support
   - `photo_tags` - Photo-tag relationships
   - `users` - User accounts with roles

2. **API Endpoints**
   - `POST /api/ai/identify-people` - Queue identification job
   - `POST /api/ai/confirm-tag` - Confirm AI suggestion (stores in person_faces)
   - `POST /internal/identify-people-result` - Worker callback for identification results
   - `POST /internal/store-people-faces` - Store face crops from AI suggestions
   - `GET /internal/known-faces/:userId` - Fetch reference face crops for learning

3. **Frontend Components**
   - Socket.io real-time notifications (`src/notifications.js`)
   - Person tag display with bounding boxes on photo detail
   - Existing AI identification flow (Q-2 implementation)

4. **Middleware**
   - `requireEditor` - Role-based access control
   - `requireAuth` - Authentication
   - `wrapAsync` - Error handling

5. **Worker Infrastructure**
   - BullMQ queue system (`src/queue/producer.js`)
   - Ollama vision model integration
   - Face detection and cropping

---

## Required Changes

### 1. Database Schema Changes

#### New Table: `ai_identification_proposals`

```sql
CREATE TABLE IF NOT EXISTS ai_identification_proposals (
  id           SERIAL PRIMARY KEY,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL,
  bbox         JSONB NOT NULL,  -- {x, y, width, height} in [0,1] coordinates
  confidence   DECIMAL(5,4),    -- Confidence score from AI (0-1)
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'edited')),
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  edited_name  TEXT,            -- If user corrected the name
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_photo_idx ON ai_identification_proposals(photo_id);
CREATE INDEX IF NOT EXISTS ai_identification_proposals_status_idx ON ai_identification_proposals(status);
CREATE INDEX IF NOT EXISTS ai_identification_proposals_user_idx ON ai_identification_proposals(user_id);
CREATE INDEX IF NOT EXISTS ai_identification_proposals_created_idx ON ai_identification_proposals(created_at DESC);

COMMENT ON TABLE ai_identification_proposals IS 'Queue of AI-generated person identification proposals awaiting review';
```

#### Add Column to `photos` Table (Optional)

```sql
ALTER TABLE photos ADD COLUMN IF NOT EXISTS ai_identification_status VARCHAR(20) 
  DEFAULT NULL CHECK (ai_identification_status IN ('pending', 'in_progress', 'completed', 'failed', NULL));
```

### 2. New API Endpoints

#### `GET /api/ai/identification-queue`
- **Purpose:** Fetch all pending identification proposals for the current user
- **Access:** Editors and admins only
- **Query Parameters:**
  - `status` - Filter by status (pending/accepted/rejected)
  - `person` - Filter by person name
  - `page` - Page number (default: 1)
  - `limit` - Items per page (default: 20)
- **Response:** Paginated list of proposals with photo metadata

#### `GET /api/ai/identification-queue/:photoId`
- **Purpose:** Fetch all proposals for a specific photo
- **Access:** Editors and admins only (with permission check)
- **Response:** Array of proposals with face bounding boxes

#### `POST /api/ai/identification/:proposalId/accept`
- **Purpose:** Accept a specific identification proposal
- **Access:** Editors and admins only
- **Body:** Optional `{ editedName?: string }`
- **Actions:**
  - Update proposal status to 'accepted' (or 'edited' if name changed)
  - Store face crop in `person_faces` table
  - Link tag to photo in `photo_tags`
  - Trigger socket.io notification
  - Update continuous learning dataset

#### `POST /api/ai/identification/:proposalId/reject`
- **Purpose:** Reject a specific identification proposal
- **Access:** Editors and admins only
- **Body:** Optional `{ reason?: string }`
- **Actions:**
  - Update proposal status to 'rejected'
  - Optionally store rejection reason for AI improvement
  - Trigger socket.io notification

#### `POST /api/ai/identification/photo/:photoId/accept-all`
- **Purpose:** Accept all pending proposals for a photo
- **Access:** Editors and admins only

#### `POST /api/ai/identification/photo/:photoId/reject-all`
- **Purpose:** Reject all pending proposals for a photo
- **Access:** Editors and admins only

#### `GET /api/ai/identification/count`
- **Purpose:** Get count of pending identifications
- **Access:** Editors and admins only
- **Response:** `{ pending: number, accepted: number, rejected: number }`

### 3. Backend Implementation Files

#### New File: `src/routes/aiIdentification.js`
```javascript
// AI Identification Queue Routes
const router = require('express').Router();
const db = require('../db');
const { requireEditor, wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');

// GET /api/ai/identification-queue - List pending identifications
router.get('/identification-queue', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// GET /api/ai/identification-queue/:photoId - Get proposals for photo
router.get('/identification-queue/:photoId', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// POST /api/ai/identification/:proposalId/accept - Accept proposal
router.post('/identification/:proposalId/accept', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// POST /api/ai/identification/:proposalId/reject - Reject proposal
router.post('/identification/:proposalId/reject', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// POST /api/ai/identification/photo/:photoId/accept-all - Bulk accept
router.post('/identification/photo/:photoId/accept-all', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// POST /api/ai/identification/photo/:photoId/reject-all - Bulk reject
router.post('/identification/photo/:photoId/reject-all', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

// GET /api/ai/identification/count - Get counts
router.get('/api/ai/identification/count', requireEditor, wrapAsync(async (req, res) => {
  // Implementation
}));

module.exports = router;
```

#### New File: `src/repositories/aiIdentification.js`
```javascript
// AI Identification Repository
const db = require('../db');

async function getPendingProposals(userId, options = {}) {
  // Fetch pending proposals for user (admins see all, editors see own)
}

async function getProposalsForPhoto(photoId) {
  // Fetch all proposals for a specific photo
}

async function acceptProposal(proposalId, userId, editedName = null) {
  // Accept a proposal and store in person_faces
}

async function rejectProposal(proposalId, userId, reason = null) {
  // Reject a proposal
}

async function getIdentificationCounts(userId) {
  // Get counts of pending/accepted/rejected
}

async function createProposal(photoId, userId, personName, bbox, confidence) {
  // Create a new identification proposal
}

module.exports = {
  getPendingProposals,
  getProposalsForPhoto,
  acceptProposal,
  rejectProposal,
  getIdentificationCounts,
  createProposal
};
```

#### Modify: `src/routes/internal.js`
Add new endpoint to store proposals when AI identification completes:

```javascript
// POST /internal/store-identification-proposals
// Called by worker after processing an identify-photo job
// Stores proposals in ai_identification_proposals table instead of auto-accepting
router.post('/store-identification-proposals', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, suggestions } = req.body;
  // Store each suggestion as a pending proposal
  for (const suggestion of suggestions) {
    await db.query(
      `INSERT INTO ai_identification_proposals 
       (photo_id, user_id, person_name, bbox, confidence, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [photoId, userId, suggestion.name, JSON.stringify(suggestion.bbox), suggestion.confidence || null]
    );
  }
  // Notify user
  notifyUser(userId, { photoId, count: suggestions.length }, 'identification-proposals-ready');
  res.json({ stored: suggestions.length });
}));
```

### 4. Frontend Implementation

#### New Page: `/ai/identification-queue`

**Route:** Add to `src/app.js`
```javascript
const aiIdentificationRoutes = require('./routes/aiIdentification');
app.use('/api/ai', aiIdentificationRoutes);
```

**View File:** `src/views/aiIdentificationViews.js`
```javascript
// Render identification queue page
function renderIdentificationQueue(req, res) {
  res.render('ai-identification-queue', {
    title: 'AI Identification Review',
    user: req.session.user,
    csrf: req.session.csrf
  });
}

// Render review interface for a specific photo
function renderIdentificationReview(req, res) {
  res.render('ai-identification-review', {
    title: 'Review AI Identifications',
    photoId: req.params.photoId,
    user: req.session.user,
    csrf: req.session.csrf
  });
}
```

#### New Template: `src/views/templates/ai-identification-queue.ejs`

```html
<!-- Identification Queue Page -->
<% include ../partials/header %>

<main class="container">
  <h1>AI Identification Review</h1>
  
  <div class="notification-badge">
    <span id="pending-count">0</span> pending identifications
  </div>
  
  <div class="filters">
    <select id="status-filter">
      <option value="pending">Pending</option>
      <option value="accepted">Accepted</option>
      <option value="rejected">Rejected</option>
    </select>
    <input type="text" id="person-filter" placeholder="Filter by person...">
  </div>
  
  <div id="proposals-list">
    <!-- Populated via JavaScript -->
  </div>
  
  <div class="pagination">
    <!-- Pagination controls -->
  </div>
</main>

<script src="/js/ai-identification-queue.js"></script>
<% include ../partials/footer %>
```

#### New Template: `src/views/templates/ai-identification-review.ejs`

```html
<!-- Single Photo Review Page -->
<% include ../partials/header %>

<main class="container">
  <h1>Review Identifications</h1>
  
  <div class="photo-review">
    <div class="photo-container">
      <img id="review-photo" src="" alt="Photo for review">
      <canvas id="bbox-canvas"></canvas>
    </div>
    
    <div class="proposals-list">
      <!-- Each proposal rendered here -->
      <div class="proposal-item">
        <div class="face-thumbnail"></div>
        <div class="proposal-info">
          <span class="person-name">Person Name</span>
          <span class="confidence">Confidence: 95%</span>
        </div>
        <div class="proposal-actions">
          <button class="btn btn-accept">Accept</button>
          <button class="btn btn-edit">Edit</button>
          <button class="btn btn-reject">Reject</button>
        </div>
      </div>
    </div>
    
    <div class="bulk-actions">
      <button class="btn btn-primary" id="accept-all">Accept All</button>
      <button class="btn btn-secondary" id="reject-all">Reject All</button>
    </div>
  </div>
</main>

<script src="/js/ai-identification-review.js"></script>
<% include ../partials/footer %>
```

#### New JavaScript: `public/js/ai-identification-queue.js`

```javascript
// Identification Queue Page Logic
document.addEventListener('DOMContentLoaded', () => {
  const userRole = window.currentUser?.role;
  const isAdmin = userRole === 'admin';
  
  let currentPage = 1;
  let currentFilter = { status: 'pending', person: '' };
  
  // Fetch proposals
  async function fetchProposals() {
    const response = await fetch(
      `/api/ai/identification-queue?page=${currentPage}&status=${currentFilter.status}&person=${currentFilter.person}`
    );
    const data = await response.json();
    renderProposals(data.proposals);
    updateCounts(data.counts);
  }
  
  // Render proposals list
  function renderProposals(proposals) {
    const container = document.getElementById('proposals-list');
    container.innerHTML = proposals.map(proposal => `
      <div class="proposal-card" data-photo-id="${proposal.photoId}">
        <img src="${proposal.thumbnailUrl}" alt="${proposal.photoTitle}">
        <div class="proposal-meta">
          <h3>${proposal.photoTitle}</h3>
          <p>${proposal.date}</p>
          <span class="badge">${proposal.pendingCount} pending</span>
        </div>
        <a href="/ai/identification-review/${proposal.photoId}" class="btn">Review</a>
      </div>
    `).join('');
  }
  
  // Setup event listeners
  document.getElementById('status-filter').addEventListener('change', (e) => {
    currentFilter.status = e.target.value;
    fetchProposals();
  });
  
  document.getElementById('person-filter').addEventListener('input', (e) => {
    currentFilter.person = e.target.value;
    fetchProposals();
  });
  
  // Setup socket.io for real-time updates
  if (window._socket) {
    window._socket.on('identification-proposals-ready', (data) => {
      fetchProposals();
    });
  }
  
  // Initial load
  fetchProposals();
});
```

#### New JavaScript: `public/js/ai-identification-review.js`

```javascript
// Single Photo Review Logic
document.addEventListener('DOMContentLoaded', () => {
  const photoId = window.photoId;
  const canvas = document.getElementById('bbox-canvas');
  const ctx = canvas.getContext('2d');
  
  let proposals = [];
  let currentProposalIndex = 0;
  
  // Load photo and proposals
  async function loadReviewData() {
    const [photoResponse, proposalsResponse] = await Promise.all([
      fetch(`/api/photos/${photoId}`),
      fetch(`/api/ai/identification-queue/${photoId}`)
    ]);
    
    const photo = await photoResponse.json();
    proposals = await proposalsResponse.json();
    
    // Setup canvas
    const img = document.getElementById('review-photo');
    img.src = photo.url;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      drawBoundingBoxes();
    };
    
    renderProposalsList();
  }
  
  // Draw bounding boxes on canvas
  function drawBoundingBoxes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    proposals.forEach((proposal, index) => {
      const bbox = proposal.bbox;
      ctx.strokeStyle = getStatusColor(proposal.status);
      ctx.lineWidth = 3;
      ctx.strokeRect(
        bbox.x * canvas.width,
        bbox.y * canvas.height,
        bbox.width * canvas.width,
        bbox.height * canvas.height
      );
      
      // Draw label
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '14px Arial';
      ctx.fillText(proposal.personName, bbox.x * canvas.width, bbox.y * canvas.height - 5);
    });
  }
  
  // Handle accept/reject actions
  async function handleAction(proposalId, action, editedName = null) {
    const endpoint = action === 'accept' 
      ? `/api/ai/identification/${proposalId}/accept`
      : `/api/ai/identification/${proposalId}/reject`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrf
      },
      body: JSON.stringify({ editedName })
    });
    
    if (response.ok) {
      // Update local state
      const index = proposals.findIndex(p => p.id === proposalId);
      if (index !== -1) {
        proposals[index].status = action === 'accept' ? 'accepted' : 'rejected';
        drawBoundingBoxes();
        renderProposalsList();
      }
    }
  }
  
  // Bulk actions
  async function handleBulkAction(action) {
    const endpoint = `/api/ai/identification/photo/${photoId}/${action}-all`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrf
      }
    });
    
    if (response.ok) {
      proposals.forEach(p => p.status = action === 'accept' ? 'accepted' : 'rejected');
      drawBoundingBoxes();
      renderProposalsList();
    }
  }
  
  // Initial load
  loadReviewData();
});

function getStatusColor(status) {
  switch(status) {
    case 'accepted': return '#28a745';
    case 'rejected': return '#dc3545';
    default: return '#ffc107';
  }
}
```

### 5. Navigation & Access Control

#### Modify: `src/views/partials/navbar.ejs` or equivalent
Add navigation link for editors/admins:

```html
<% if (user && (user.role === 'editor' || user.role === 'admin')) { %>
  <li class="nav-item">
    <a href="/ai/identification-queue" class="nav-link">
      <span class="badge" id="ai-queue-badge">0</span>
      AI Review
    </a>
  </li>
<% } %>
```

#### Modify: `src/app.js`
Add route for the review page:

```javascript
// AI Identification Review Routes
app.get('/ai/identification-queue', requireAuth, requireEditor, aiIdentificationViews.renderQueue);
app.get('/ai/identification-review/:photoId', requireAuth, requireEditor, aiIdentificationViews.renderReview);
```

### 6. Worker Modifications

#### Modify: `worker/src/worker.js`
Update the identification job handler to store proposals instead of auto-accepting:

```javascript
// Instead of auto-storing face crops via /internal/store-people-faces
// Store proposals via /internal/store-identification-proposals

// In the identifyPeople function:
await fetch(`${INTERNAL_API}/store-identification-proposals`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-worker-secret': process.env.WORKER_API_SECRET
  },
  body: JSON.stringify({
    photoId: job.photoId,
    userId: job.userId,
    suggestions: enrichedSuggestions
  })
});
```

### 7. Socket.io Events

Extend `src/notifications.js` or add new event types:

```javascript
// New event: 'identification-proposals-ready'
// Triggered when new proposals are stored for a user
notifyUser(userId, { photoId, count }, 'identification-proposals-ready');
```

### 8. Tests

#### New Test File: `src/__tests__/routes/aiIdentification.test.js`

```javascript
const request = require('supertest');
const app = require('../../app');
const db = require('../../db');

describe('AI Identification Queue', () => {
  beforeEach(async () => {
    // Setup test data
  });
  
  afterEach(async () => {
    // Cleanup
  });
  
  describe('GET /api/ai/identification-queue', () => {
    it('returns pending proposals for editor', async () => {
      // Test implementation
    });
    
    it('returns all proposals for admin', async () => {
      // Test implementation
    });
    
    it('filters by status', async () => {
      // Test implementation
    });
  });
  
  describe('POST /api/ai/identification/:proposalId/accept', () => {
    it('accepts proposal and stores in person_faces', async () => {
      // Test implementation
    });
    
    it('updates proposal status', async () => {
      // Test implementation
    });
    
    it('handles edited name', async () => {
      // Test implementation
    });
  });
  
  describe('POST /api/ai/identification/:proposalId/reject', () => {
    it('rejects proposal', async () => {
      // Test implementation
    });
  });
  
  describe('Bulk actions', () => {
    it('accepts all proposals for a photo', async () => {
      // Test implementation
    });
    
    it('rejects all proposals for a photo', async () => {
      // Test implementation
    });
  });
});
```

---

## Implementation Phases

### Phase 1: Backend Infrastructure (2-3 days)
- [ ] Create database migration for `ai_identification_proposals` table
- [ ] Create repository layer (`src/repositories/aiIdentification.js`)
- [ ] Create API routes (`src/routes/aiIdentification.js`)
- [ ] Modify worker to store proposals instead of auto-accepting
- [ ] Add new internal endpoint for storing proposals

### Phase 2: Frontend Queue Page (2-3 days)
- [ ] Create queue page template
- [ ] Implement JavaScript for fetching and displaying proposals
- [ ] Add socket.io integration for real-time updates
- [ ] Add filtering and pagination
- [ ] Add navigation link

### Phase 3: Review Interface (2-3 days)
- [ ] Create review page template
- [ ] Implement bounding box visualization
- [ ] Add accept/reject/edit actions
- [ ] Add bulk actions
- [ ] Integrate with person_faces storage

### Phase 4: Testing & Polish (1-2 days)
- [ ] Write unit tests for backend
- [ ] Write integration tests
- [ ] Manual testing
- [ ] Performance optimization
- [ ] Documentation

### Phase 5: Deployment & Monitoring (1 day)
- [ ] Create migration script
- [ ] Update deployment documentation
- [ ] Monitor initial usage
- [ ] Fix any issues

---

## Total Estimated Effort

**8-11 days** for a team of 2-3 developers

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Database performance with large queue | Medium | High | Add proper indexes, implement pagination |
| Breaking existing AI-2/AI-4 flow | Low | High | Ensure backward compatibility, comprehensive testing |
| Complexity of bounding box display | Medium | Medium | Use existing canvas code from photo detail page |
| Real-time sync issues | Medium | Medium | Use socket.io rooms per user, handle reconnection |

---

## Success Metrics

1. All acceptance criteria from the story are met
2. All existing tests still pass
3. New tests cover 80%+ of new code
4. Page loads in < 2 seconds with 100+ pending proposals
5. Real-time updates work within 1 second
6. No breaking changes to existing AI features

---

## Open Questions

1. Should rejected proposals be permanently deleted or kept for AI improvement?
   - **Recommendation:** Keep in a separate status for potential future analysis

2. Should there be a confidence threshold for auto-accepting high-confidence suggestions?
   - **Recommendation:** No for v1 - all proposals require human review

3. Should editors see only their own photos or all photos?
   - **Recommendation:** Editors see photos they uploaded, admins see all

4. How should we handle duplicate proposals for the same person on the same photo?
   - **Recommendation:** Merge them in the UI, store separately in DB

5. Should we add a "Skip" option for uncertain proposals?
   - **Recommendation:** Yes, as a form of rejection with "unsure" reason

---

## Related Stories

- **AI-5 (Unified people tagging)** - Parallel development, US-AI5 can feed into it
- **AI-7 (Identification queue dashboard)** - Very similar, could potentially merge
- **Q-2 (Real-time identification notification)** - US-AI5 extends this pattern

---

## Resources

- [Story Definition](../stories/local-ai.md#us-ai5review-and-validate-ai-identification-proposals)
- [AI Infrastructure Documentation](../../architecture/ai.md)
- [Existing AI Routes](../../src/routes/ai.js)
- [Person Faces Repository](../../src/repositories/personFaces.js)
- [Worker Implementation](../../worker/src/worker.js)

---

*Document generated: 2026-06-13*  
*Prepared for: Dev Team*  
*Status: Ready for Development*
