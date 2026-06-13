// AI Identification Queue Page Logic
(function() {
  'use strict';

  // Check if we're on the right page
  if (!document.getElementById('proposals-container')) {
    return;
  }

  const session = window._session || {};
  const userRole = session.role;
  const isEditor = userRole === 'editor' || userRole === 'admin';
  const csrfToken = session.csrf;

  let currentPage = 1;
  let currentStatus = '';
  let currentPersonFilter = '';
  let hasMorePages = false;

  // DOM elements
  const proposalsContainer = document.getElementById('proposals-container');
  const pendingCountEl = document.getElementById('pending-count');
  const acceptedCountEl = document.getElementById('accepted-count');
  const rejectedCountEl = document.getElementById('rejected-count');
  const statusFilterEl = document.getElementById('status-filter');
  const personFilterEl = document.getElementById('person-filter');
  const refreshBtn = document.getElementById('refresh-btn');
  const paginationEl = document.getElementById('pagination');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const pageInfoEl = document.getElementById('page-info');

  // Fetch proposals from API
  async function fetchProposals(page = 1) {
    try {
      const params = new URLSearchParams({
        page: page,
        limit: 20
      });

      if (currentStatus) {
        params.append('status', currentStatus);
      }

      if (currentPersonFilter) {
        params.append('person', currentPersonFilter);
      }

      const response = await fetch(`/api/ai/identification-queue?${params.toString()}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[ai-identification-queue] Failed to fetch proposals:', err.message);
      showError('Failed to load proposals. Please try again.');
      return null;
    }
  }

  // Fetch counts
  async function fetchCounts() {
    try {
      const params = new URLSearchParams();
      if (currentStatus) {
        params.append('status', currentStatus);
      }
      if (currentPersonFilter) {
        params.append('person', currentPersonFilter);
      }

      const response = await fetch(`/api/ai/identification/count?${params.toString()}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('[ai-identification-queue] Failed to fetch counts:', err.message);
      return null;
    }
  }

  // Render a single proposal card
  function renderProposal(proposal) {
    const photoUrl = proposal.photo_s3_key ? `/uploads/${proposal.photo_s3_key}` : `/uploads/${proposal.photo_filename}`;
    const thumbnailUrl = proposal.photo_filename ? `/uploads/${proposal.photo_filename}` : photoUrl;
    
    const dateStr = proposal.photo_date ? new Date(proposal.photo_date).toLocaleDateString() : 'Unknown date';
    const confidenceStr = proposal.confidence ? `${(parseFloat(proposal.confidence) * 100).toFixed(0)}%` : 'N/A';

    // Count pending proposals for this photo
    const statusClass = proposal.status || 'pending';

    return `
      <div class="ai-proposal-card" data-photo-id="${proposal.photo_id}">
        <img class="ai-proposal-thumb" src="${thumbnailUrl}" alt="${proposal.photo_title || 'Photo'}" loading="lazy">
        <div class="ai-proposal-info">
          <h3>${proposal.photo_title || 'Untitled'}</h3>
          <p>${dateStr}</p>
          <div class="ai-proposal-badges">
            <span class="ai-badge">${proposal.person_name}</span>
            <span class="ai-badge">${confidenceStr} confidence</span>
          </div>
        </div>
        <div class="ai-proposal-actions">
          <a href="/ai/identification-review/${proposal.photo_id}" class="btn btn-primary">Review</a>
        </div>
      </div>
    `;
  }

  // Render all proposals
  function renderProposals(proposals) {
    if (!proposals || proposals.length === 0) {
      proposalsContainer.innerHTML = `
        <div class="ai-queue-empty">
          <p>No identification proposals found.</p>
          <p style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">
            ${currentStatus ? `No ${currentStatus} proposals` : 'All proposals have been reviewed'}
          </p>
        </div>
      `;
      return;
    }

    const html = proposals.map(renderProposal).join('');
    proposalsContainer.innerHTML = html;
  }

  // Update counts display
  function updateCounts(counts) {
    if (counts) {
      pendingCountEl.textContent = counts.pending || 0;
      acceptedCountEl.textContent = counts.accepted || 0;
      rejectedCountEl.textContent = counts.rejected || 0;
    }
  }

  // Update pagination
  function updatePagination(page, hasMore) {
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = !hasMore;
    pageInfoEl.textContent = `Page ${page}`;
    paginationEl.style.display = 'flex';
  }

  // Show error message
  function showError(message) {
    proposalsContainer.innerHTML = `
      <div class="ai-queue-empty" style="color: var(--danger);">
        <p>${message}</p>
        <button class="btn" onclick="location.reload()" style="margin-top: 1rem;">Retry</button>
      </div>
    `;
  }

  // Load and display proposals
  async function loadProposals(page = 1) {
    const container = proposalsContainer;
    container.innerHTML = '<div class="ai-queue-loading">Loading proposals...</div>';

    const data = await fetchProposals(page);
    if (!data) return;

    // Update pagination
    hasMorePages = data.proposals && data.proposals.length === data.limit;
    currentPage = page;
    updatePagination(page, hasMorePages);

    // Update counts
    if (data.counts) {
      updateCounts(data.counts);
    }

    // Render proposals
    renderProposals(data.proposals);
  }

  // Event listeners
  function setupEventListeners() {
    // Status filter
    statusFilterEl.addEventListener('change', function() {
      currentStatus = this.value;
      currentPage = 1;
      loadProposals(1);
    });

    // Person filter with debounce
    let personFilterTimeout;
    personFilterEl.addEventListener('input', function() {
      clearTimeout(personFilterTimeout);
      personFilterTimeout = setTimeout(() => {
        currentPersonFilter = this.value.trim();
        currentPage = 1;
        loadProposals(1);
      }, 300);
    });

    // Refresh button
    refreshBtn.addEventListener('click', function() {
      loadProposals(currentPage);
    });

    // Pagination
    prevPageBtn.addEventListener('click', function() {
      if (currentPage > 1) {
        loadProposals(currentPage - 1);
      }
    });

    nextPageBtn.addEventListener('click', function() {
      if (hasMorePages) {
        loadProposals(currentPage + 1);
      }
    });

    // Socket.io for real-time updates
    if (window._socket) {
      window._socket.on('identification-proposals-ready', function(data) {
        // New proposals arrived, refresh the queue
        loadProposals(1);
      });

      window._socket.on('identification-proposal-updated', function(data) {
        // A proposal was accepted/rejected, refresh the queue
        loadProposals(currentPage);
      });

      window._socket.on('identification-proposals-updated', function(data) {
        // Bulk update, refresh the queue
        loadProposals(currentPage);
      });
    }
  }

  // Initialize
  function init() {
    // Set up global variables for the JavaScript
    window.currentUser = {
      role: userRole
    };
    window.csrf = csrfToken;

    loadProposals(1);
    setupEventListeners();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();