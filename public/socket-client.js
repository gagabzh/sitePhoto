(function () {
  if (typeof io === 'undefined') return;

  var socket = io({ transports: ['websocket'] });
  window._socket = socket;

  socket.on('identification-complete', function (data) {
    var photoId = data.photoId;
    var tags = data.tags || [];

    // Mark any visible tile for this photo
    document.querySelectorAll('[data-photo-id="' + photoId + '"]').forEach(function (el) {
      el.classList.add('sp-identified');
    });

    var label = tags.length ? tags.join(', ') : 'no people detected';
    showToast('👤 Photo #' + photoId + ' identified — ' + label);
  });

  // US-AI5: New identification proposals ready for review
  socket.on('identification-proposals-ready', function (data) {
    var photoId = data.photoId || 0;
    var count = data.count || 0;
    var label = count + ' new identification' + (count > 1 ? 's' : '') + ' ready for review';
    showToast('🤖 Photo #' + photoId + ' — ' + label);
    
    // Update badge counter if present
    var badge = document.getElementById('ai-queue-badge');
    if (badge) {
      fetch('/api/ai/identification/count')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var total = (data.pending || 0) + (data.accepted || 0) + (data.rejected || 0);
          badge.textContent = total;
        });
    }
  });

  // US-AI5: Individual proposal updated (accepted/rejected)
  socket.on('identification-proposal-updated', function (data) {
    var photoId = data.photoId || 0;
    var status = data.status || '';
    var personName = data.personName || '';
    var label = 'Proposal for ' + personName + ' was ' + (status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : status);
    showToast('✓ ' + label);
  });

  // US-AI5: Bulk proposal updates
  socket.on('identification-proposals-updated', function (data) {
    var photoId = data.photoId || 0;
    var status = data.status || '';
    var count = data.count || 0;
    var label = count + ' proposals ' + (status === 'accepted-all' ? 'accepted' : 'rejected');
    showToast('✓ ' + label);
  });

  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'sp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('sp-toast-on'); });
    });
    setTimeout(function () {
      t.classList.remove('sp-toast-on');
      t.addEventListener('transitionend', function () { t.remove(); }, { once: true });
    }, 5000);
  }
})();
