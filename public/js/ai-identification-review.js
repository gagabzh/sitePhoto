// AI Identification Review Page Logic
(function() {
  'use strict';

  // Check if we're on the right page
  const reviewPhotoEl = document.getElementById('review-photo');
  if (!reviewPhotoEl) {
    return;
  }

  // Extract photoId from the page
  const pathParts = window.location.pathname.split('/');
  const photoId = parseInt(pathParts[pathParts.length - 1], 10);
  if (!Number.isFinite(photoId)) {
    console.error('[ai-identification-review] Invalid photoId');
    return;
  }

  const session = window._session || {};
  const csrfToken = session.csrf;

  // DOM elements
  const canvasEl = document.getElementById('bbox-canvas');
  const ctx = canvasEl.getContext('2d');
  const proposalsListEl = document.getElementById('proposals-list');
  const acceptAllBtn = document.getElementById('accept-all');
  const rejectAllBtn = document.getElementById('reject-all');

  // State
  let proposals = [];
  let selectedProposalIndex = null;
  let editingProposalId = null;

  // Color mapping for status
  const statusColors = {
    pending: '#ffc107',
    accepted: '#28a745',
    rejected: '#dc3545',
    edited: '#007bff'
  };

  // Fetch photo and proposals
  async function loadData() {
    try {
      // Fetch photo data
      const photoResponse = await fetch(`/api/photos/${photoId}`);
      if (!photoResponse.ok) {
        throw new Error(`Failed to load photo: ${photoResponse.status}`);
      }
      const photo = await photoResponse.json();

      // Fetch proposals
      const proposalsResponse = await fetch(`/api/ai/identification-queue/${photoId}`);
      if (!proposalsResponse.ok) {
        // No proposals yet, that's okay
        proposals = [];
      } else {
        proposals = await proposalsResponse.json();
      }

      // Set photo image
      const photoUrl = photo.s3_key ? `/uploads/${photo.s3_key}` : `/uploads/${photo.filename}`;
      reviewPhotoEl.src = photoUrl;

      // Initialize canvas and proposals
      await initializeCanvas(photoUrl);
      renderProposalsList();
      drawBoundingBoxes();

    } catch (err) {
      console.error('[ai-identification-review] Failed to load data:', err.message);
      proposalsListEl.innerHTML = `
        <div class="ai-review-empty" style="color: var(--danger);">
          <p>Failed to load photo or proposals.</p>
          <p style="margin-top: 0.5rem;">${err.message}</p>
          <a href="/ai/identification-queue" class="btn" style="margin-top: 1rem; display: inline-block;">Back to Queue</a>
        </div>
      `;
    }
  }

  // Initialize canvas
  function initializeCanvas(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        // Set canvas dimensions to match image
        canvasEl.width = img.naturalWidth;
        canvasEl.height = img.naturalHeight;
        resolve();
      };
      img.onerror = function() {
        console.error('[ai-identification-review] Failed to load image');
        resolve(); // Continue anyway
      };
      img.src = imageUrl;
    });
  }

  // Draw bounding boxes on canvas
  function drawBoundingBoxes() {
    // Clear canvas
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (!proposals || proposals.length === 0) return;

    proposals.forEach((proposal, index) => {
      const bbox = proposal.bbox;
      if (!bbox) return;

      // Convert normalized coordinates to canvas coordinates
      const x = bbox.x * canvasEl.width;
      const y = bbox.y * canvasEl.height;
      const width = bbox.width * canvasEl.width;
      const height = bbox.height * canvasEl.height;

      // Set color based on status
      const color = statusColors[proposal.status] || statusColors.pending;
      
      // Draw rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth = index === selectedProposalIndex ? 4 : 2;
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      ctx.fillStyle = color;
      ctx.font = '14px Arial, sans-serif';
      const text = `${proposal.person_name}${proposal.confidence ? ` (${Math.round(parseFloat(proposal.confidence) * 100)}%)` : ''}`;
      const textWidth = ctx.measureText(text).width + 10;
      
      // Draw label background
      ctx.fillRect(x, y - 20, textWidth, 20);
      
      // Draw text
      ctx.fillStyle = 'white';
      ctx.fillText(text, x + 5, y - 5);

      // Draw number if there are multiple proposals
      if (proposals.length > 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + width, y + height, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), x + width, y + height);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    });
  }

  // Render proposals list
  function renderProposalsList() {
    if (!proposals || proposals.length === 0) {
      proposalsListEl.innerHTML = `
        <div class="ai-review-empty">
          <p>No identification proposals for this photo.</p>
        </div>
      `;
      return;
    }

    const html = proposals.map((proposal, index) => {
      const statusClass = `ai-review-status-${proposal.status || 'pending'}`;
      const statusText = proposal.status === 'pending' ? 'Pending' : 
                       proposal.status === 'accepted' ? 'Accepted' :
                       proposal.status === 'rejected' ? 'Rejected' : 'Edited';
      const confidenceStr = proposal.confidence ? `${(parseFloat(proposal.confidence) * 100).toFixed(0)}%` : 'N/A';
      const isSelected = index === selectedProposalIndex;

      return `
        <div class="ai-review-proposal${isSelected ? ' selected' : ''}" 
             data-proposal-id="${proposal.id}"
             data-index="${index}"
             onclick="selectProposal(${index})">
          <div class="ai-review-proposal-header">
            <span class="ai-review-person-name">${proposal.person_name}</span>
            <span class="${statusClass}">${statusText}</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            Confidence: ${confidenceStr}
          </div>
          <div class="ai-review-actions">
            <button class="btn btn-accept" onclick="handleAction(${proposal.id}, 'accept')" ${proposal.status !== 'pending' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              Accept
            </button>
            <button class="btn btn-edit" onclick="handleEdit(${proposal.id}, '${proposal.person_name.replace(/'/g, "\\'")}')" ${proposal.status !== 'pending' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              Edit
            </button>
            <button class="btn btn-reject" onclick="handleAction(${proposal.id}, 'reject')" ${proposal.status !== 'pending' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              Reject
            </button>
          </div>
        </div>
      `;
    }).join('');

    proposalsListEl.innerHTML = html;
    
    // Update bulk buttons
    const hasPending = proposals.some(p => p.status === 'pending');
    acceptAllBtn.disabled = !hasPending;
    rejectAllBtn.disabled = !hasPending;
  }

  // Select a proposal (called from HTML onclick)
  window.selectProposal = function(index) {
    selectedProposalIndex = index;
    drawBoundingBoxes();
    renderProposalsList();
  };

  // Handle accept/reject action (called from HTML onclick)
  window.handleAction = function(proposalId, action) {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    const confirmMessage = action === 'accept' ? 
      `Accept "${proposal.person_name}" identification?` :
      `Reject "${proposal.person_name}" identification?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    performAction(proposalId, action);
  };

  // Handle edit action (called from HTML onclick)
  window.handleEdit = function(proposalId, currentName) {
    editingProposalId = proposalId;
    const editControls = document.getElementById('edit-controls');
    const editNameInput = document.getElementById('edit-name');
    
    editNameInput.value = currentName;
    editControls.style.display = 'block';
    
    // Set up edit control handlers
    document.getElementById('save-edit').onclick = function() {
      const newName = editNameInput.value.trim();
      if (newName) {
        performAction(proposalId, 'accept', newName);
        editControls.style.display = 'none';
        editingProposalId = null;
      } else {
        alert('Please enter a name');
      }
    };

    document.getElementById('cancel-edit').onclick = function() {
      editControls.style.display = 'none';
      editingProposalId = null;
    };
  };

  // Perform API action
  async function performAction(proposalId, action, editedName = null) {
    try {
      const endpoint = action === 'accept' ? 
        `/api/ai/identification/${proposalId}/accept` :
        `/api/ai/identification/${proposalId}/reject`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ editedName: editedName || undefined })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      if (result.ok) {
        // Update local state
        const index = proposals.findIndex(p => p.id === proposalId);
        if (index !== -1) {
          proposals[index].status = action === 'accept' ? (editedName ? 'edited' : 'accepted') : 'rejected';
          if (editedName) {
            proposals[index].person_name = editedName;
          }
          
          // Refresh display
          drawBoundingBoxes();
          renderProposalsList();
          
          // Show success message
          showToast(`${action === 'accept' ? 'Accepted' : 'Rejected'} successfully`);
        }
      }
    } catch (err) {
      console.error(`[ai-identification-review] Failed to ${action} proposal:`, err.message);
      showToast(`Failed to ${action}: ${err.message}`);
    }
  }

  // Handle bulk actions
  async function handleBulkAction(action) {
    const confirmMessage = action === 'accept' ? 
      'Accept ALL pending proposals for this photo?' :
      'Reject ALL pending proposals for this photo?';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const endpoint = `/api/ai/identification/photo/${photoId}/${action}-all`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      if (result.ok) {
        // Update all proposals
        const count = action === 'accept' ? result.accepted || 0 : result.rejected || 0;
        proposals.forEach(p => {
          if (p.status === 'pending') {
            p.status = action === 'accept' ? 'accepted' : 'rejected';
          }
        });
        
        // Refresh display
        drawBoundingBoxes();
        renderProposalsList();
        
        showToast(`${action === 'accept' ? 'Accepted' : 'Rejected'} ${count} proposals`);
      }
    } catch (err) {
      console.error(`[ai-identification-review] Failed to bulk ${action}:`, err.message);
      showToast(`Failed to bulk ${action}: ${err.message}`);
    }
  }

  // Show toast notification
  function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.ai-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--bg);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid var(--border);
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Event listeners
  function setupEventListeners() {
    // Bulk actions
    acceptAllBtn.onclick = () => handleBulkAction('accept');
    rejectAllBtn.onclick = () => handleBulkAction('reject');

    // Socket.io for real-time updates
    if (window._socket) {
      window._socket.on('identification-proposal-updated', function(data) {
        if (data.photoId === photoId) {
          // A proposal for this photo was updated, reload
          loadData();
        }
      });

      window._socket.on('identification-proposals-updated', function(data) {
        if (data.photoId === photoId) {
          // Bulk update for this photo, reload
          loadData();
        }
      });
    }
  }

  // Initialize
  function init() {
    window.csrf = csrfToken;
    loadData();
    setupEventListeners();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();