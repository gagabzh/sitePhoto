(function () {
  if (typeof io === 'undefined') return;

  var socket = io({ transports: ['websocket'] });

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
