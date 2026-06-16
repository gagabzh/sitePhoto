const { page } = require('../layout');

/**
 * Render the AI identification queue page
 * @param {object} session - User session
 * @param {boolean} socket - Whether to include socket.io
 * @returns {string} - HTML page
 */
function renderIdentificationQueue(session, socket = false) {

  return page('AI Identification Review', `
    <style>
      .ai-queue-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
      }
      .ai-queue-header h1 {
        margin: 0;
        font-size: 1.5rem;
      }
      .ai-queue-stats {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .ai-queue-stat {
        background: var(--bg-light);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .ai-queue-stat .count {
        font-weight: 600;
        font-size: 1.1rem;
      }
      .ai-queue-filters {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .ai-queue-filters select,
      .ai-queue-filters input {
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border);
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .ai-queue-filters input[type="text"] {
        min-width: 200px;
      }
      .ai-proposal-card {
        background: var(--bg-light);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      .ai-proposal-thumb {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .ai-proposal-info {
        flex: 1;
        min-width: 0;
      }
      .ai-proposal-info h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
      }
      .ai-proposal-info p {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }
      .ai-proposal-badges {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.25rem;
      }
      .ai-badge {
        background: var(--accent);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
      }
      .ai-proposal-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
      }
      .ai-proposal-actions .btn {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
      }
      .btn-accept {
        background: var(--success);
        color: white;
        border: none;
      }
      .btn-reject {
        background: var(--danger);
        color: white;
        border: none;
      }
      .btn-edit {
        background: var(--primary);
        color: white;
        border: none;
      }
      .ai-queue-empty {
        text-align: center;
        padding: 3rem;
        color: var(--text-secondary);
      }
      .ai-queue-loading {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
      }
      .ai-pagination {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 2rem;
      }
      .ai-pagination button {
        padding: 0.5rem 1rem;
        border: 1px solid var(--border);
        background: var(--bg-light);
        border-radius: 4px;
        cursor: pointer;
      }
      .ai-pagination button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .ai-pagination button:not(:disabled):hover {
        background: var(--bg);
      }
      .ai-proposal-person {
        font-weight: 500;
        color: var(--accent);
      }
      @media (max-width: 768px) {
        .ai-proposal-card {
          flex-direction: column;
          align-items: flex-start;
        }
        .ai-proposal-actions {
          width: 100%;
          justify-content: flex-end;
        }
      }
    </style>
    
    <div class="ai-queue-header">
      <div>
        <h1>AI Identification Review</h1>
        <p style="color: var(--text-secondary); margin: 0.25rem 0 0 0; font-size: 0.9rem;">
          Review and validate AI-generated person identification proposals
        </p>
      </div>
    </div>
    
    <div class="ai-queue-stats">
      <div class="ai-queue-stat">
        <span>Pending:</span> <span class="count" id="pending-count">0</span>
      </div>
      <div class="ai-queue-stat">
        <span>Accepted:</span> <span class="count" id="accepted-count">0</span>
      </div>
      <div class="ai-queue-stat">
        <span>Rejected:</span> <span class="count" id="rejected-count">0</span>
      </div>
    </div>
    
    <div class="ai-queue-filters">
      <select id="status-filter">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
        <option value="edited">Edited</option>
      </select>
      <input type="text" id="person-filter" placeholder="Filter by person name...">
      <button class="btn" id="refresh-btn">Refresh</button>
    </div>
    
    <div id="proposals-container">
      <div class="ai-queue-loading">Loading proposals...</div>
    </div>
    
    <div class="ai-pagination" id="pagination" style="display: none;">
      <button id="prev-page" disabled>Previous</button>
      <span id="page-info">Page 1</span>
      <button id="next-page" disabled>Next</button>
    </div>
    <script src="/js/people-autocomplete.js"></script>
    <script src="/js/ai-identification-queue.js"></script>
  `, session, socket);
}

/**
 * Render the AI identification review page for a specific photo
 * @param {object} session - User session
 * @param {number} photoId - The photo ID being reviewed
 * @param {boolean} socket - Whether to include socket.io
 * @returns {string} - HTML page
 */
function renderIdentificationReview(session, photoId, socket = false) {
  return page('Review AI Identifications', `
    <style>
      .ai-review-container {
        display: grid;
        grid-template-columns: 1fr 300px;
        gap: 2rem;
        max-width: 1200px;
        margin: 0 auto;
      }
      .ai-review-photo {
        position: relative;
      }
      .ai-review-photo img {
        max-width: 100%;
        border-radius: 8px;
        display: block;
      }
      .ai-review-canvas {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
      }
      .ai-review-sidebar {
        background: var(--bg-light);
        padding: 1.5rem;
        border-radius: 8px;
        height: fit-content;
      }
      .ai-review-sidebar h2 {
        margin: 0 0 1rem 0;
        font-size: 1.2rem;
      }
      .ai-review-proposal {
        background: var(--bg);
        padding: 1rem;
        border-radius: 6px;
        margin-bottom: 1rem;
        border: 2px solid transparent;
      }
      .ai-review-proposal:hover {
        border-color: var(--border);
      }
      .ai-review-proposal.selected {
        border-color: var(--accent);
      }
      .ai-review-proposal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
      }
      .ai-review-person-name {
        font-weight: 600;
        font-size: 1.1rem;
        color: var(--accent);
      }
      .ai-review-confidence {
        background: var(--bg);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
      }
      .ai-review-status {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 500;
      }
      .ai-review-status-pending { background: #fff3cd; color: #856404; }
      .ai-review-status-accepted { background: #d4edda; color: #155724; }
      .ai-review-status-rejected { background: #f8d7da; color: #721c24; }
      .ai-review-status-edited { background: #cce5ff; color: #004085; }
      .ai-review-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .ai-review-actions .btn {
        flex: 1;
        padding: 0.5rem;
        font-size: 0.85rem;
      }
      .btn-accept {
        background: var(--success);
        color: white;
        border: none;
      }
      .btn-reject {
        background: var(--danger);
        color: white;
        border: none;
      }
      .btn-edit {
        background: var(--primary);
        color: white;
        border: none;
      }
      .ai-review-bulk {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border);
      }
      .ai-review-bulk h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
      }
      .ai-review-bulk-actions {
        display: flex;
        gap: 0.5rem;
      }
      .ai-review-bulk-actions .btn {
        flex: 1;
        padding: 0.75rem;
      }
      .ai-review-controls {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border);
      }
      .ai-review-controls label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .ai-review-controls input[type="text"] {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid var(--border);
        border-radius: 4px;
        box-sizing: border-box;
      }
      .ai-review-empty {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
      }
      .ai-face-thumbnail {
        width: 60px;
        height: 60px;
        background: var(--bg);
        border-radius: 4px;
        margin-bottom: 0.5rem;
        overflow: hidden;
      }
      .ai-face-thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      @media (max-width: 900px) {
        .ai-review-container {
          grid-template-columns: 1fr;
        }
        .ai-review-sidebar {
          order: -1;
        }
      }
    </style>
    
    <div class="ai-review-container">
      <div class="ai-review-main">
        <h1 style="margin-bottom: 1rem;">Review Identifications</h1>
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
          Review and accept/reject AI-generated person identification proposals for this photo.
        </p>
        
        <div class="ai-review-photo" id="review-photo-container">
          <img id="review-photo" src="" alt="Photo for review" style="max-width: 100%;">
          <canvas id="bbox-canvas"></canvas>
        </div>
      </div>
      
      <div class="ai-review-sidebar">
        <h2>Proposals</h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
          Click on a proposal to highlight it on the photo
        </p>
        
        <div id="proposals-list">
          <div class="ai-review-empty">Loading proposals...</div>
        </div>
        
        <div class="ai-review-bulk">
          <h3>Bulk Actions</h3>
          <div class="ai-review-bulk-actions">
            <button class="btn btn-primary" id="accept-all">Accept All</button>
            <button class="btn btn-secondary" id="reject-all">Reject All</button>
          </div>
        </div>
        
        <div class="ai-review-controls" id="edit-controls" style="display: none;">
          <label for="edit-name">Edit Person Name</label>
          <input type="text" id="edit-name" placeholder="Enter corrected name..." data-people-autocomplete="true">
          <button class="btn btn-primary" id="save-edit" style="margin-top: 0.5rem; width: 100%;">Save Edit</button>
          <button class="btn btn-secondary" id="cancel-edit" style="margin-top: 0.5rem; width: 100%;">Cancel</button>
        </div>
        
        <a href="/ai/identification-queue" class="btn" style="margin-top: 1.5rem; width: 100%; text-align: center; display: block;">
          Back to Queue
        </a>
      </div>
    </div>
    <script src="/js/people-autocomplete.js"></script>
    <script src="/js/ai-identification-review.js"></script>
  `, session, socket);
}

module.exports = {
  renderIdentificationQueue,
  renderIdentificationReview,
};
