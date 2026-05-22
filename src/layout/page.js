const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('./esc');

// Computed once at startup; changes when CSS content changes, busting browser caches
let cssVersion = '1';
try {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'style.css'));
  cssVersion = crypto.createHash('sha256').update(css).digest('hex').slice(0, 8);
} catch { /* fallback to '1' in test environments without the file */ }

function page(title, body, session) {
  const initial = session ? esc((session.name || '?')[0].toUpperCase()) : '';
  const nav = session ? `
    <nav>
      <strong><a href="/">sitephoto<span class="nav-dot">.</span></a></strong>
      <div class="nav-right">
        ${session.role !== 'viewer' ? '<a href="/photos">Photos</a>' : ''}
        <a href="/albums">Albums</a>
        <a href="/tags">Tags</a>
        <a href="/timeline">Timeline</a>
        ${session.role !== 'viewer' ? '<a href="/travels">Travels</a>' : ''}
        <a href="/map">Map</a>
        <div class="nav-avatar-wrap">
          <span class="nav-avatar" role="button" aria-label="Account menu">${initial}</span>
          <div class="nav-menu" role="menu">
            <a href="/account/password" role="menuitem">Account</a>
            <a href="/tags/recipes" role="menuitem">My Recipes</a>
            ${session.role === 'admin' ? `<hr class="nav-menu-sep">
            <span class="nav-menu-section">ADMIN</span>
            <a href="/admin/users" role="menuitem">Users</a>
            <a href="/tags/manage" role="menuitem">Manage Tags</a>
            <a href="/tags/recipes?scope=all" role="menuitem">All Recipes</a>
            <a href="/admin/ai" role="menuitem">AI Tools</a>` : ''}
            <hr class="nav-menu-sep">
            <form method="POST" action="/logout">
              <button class="nav-menu-logout" type="submit">Logout</button>
            </form>
          </div>
        </div>
      </div>
    </nav>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${session && session.csrf ? `<meta name="csrf-token" content="${esc(session.csrf)}">` : ''}
  <title>${esc(title)} — sitephoto</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&family=Architects+Daughter&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=${cssVersion}">
</head>
<body>
  ${nav}
  <main>${body}</main>
  ${session ? `<nav class="bottom-nav-mobile" aria-label="Main navigation">
    <a href="/" class="bn-item" data-path="/" data-exact="1"><span class="bn-ic">⌂</span><span>home</span></a>
    <a href="/albums" class="bn-item" data-path="/albums"><span class="bn-ic">▦</span><span>albums</span></a>
    <a href="/photos/upload" class="bn-item bn-upload" data-path="/photos/upload"><span class="bn-ic">+</span></a>
    <a href="/map" class="bn-item" data-path="/map"><span class="bn-ic">⌖</span><span>map</span></a>
    <div class="bn-more-wrap">
      <button class="bn-item bn-more-btn" id="bn-more" aria-label="More"><span class="bn-ic">···</span><span>more</span></button>
      <div class="bn-more-menu" id="bn-more-menu" role="menu">
        <a href="/timeline" class="bn-more-item" data-path="/timeline"><span class="bn-ic">◷</span><span>timeline</span></a>
        <a href="/tags"     class="bn-more-item" data-path="/tags"><span class="bn-ic">#</span><span>tags</span></a>
      </div>
    </div>
  </nav>
  <script>(function(){
    var p=window.location.pathname;
    document.querySelectorAll('.bn-item[data-path]').forEach(function(a){
      var dp=a.getAttribute('data-path');
      var exact=a.getAttribute('data-exact');
      if(exact?p===dp:p===dp||p.startsWith(dp+'/')||p.startsWith(dp+'?')){
        a.classList.add('bn-on');
      }
    });
    document.querySelectorAll('.bn-more-item[data-path]').forEach(function(a){
      if(p===a.dataset.path||p.startsWith(a.dataset.path+'/')||p.startsWith(a.dataset.path+'?')){
        a.classList.add('bn-on');
        var btn=document.getElementById('bn-more');
        if(btn)btn.classList.add('bn-on');
      }
    });
    var btn=document.getElementById('bn-more');
    var menu=document.getElementById('bn-more-menu');
    if(btn&&menu){
      btn.addEventListener('click',function(e){e.stopPropagation();menu.classList.toggle('open');});
      document.addEventListener('click',function(){menu.classList.remove('open');});
    }
  })();</script>` : ''}
  ${session ? `<script>(function(){
    var w=document.querySelector('.nav-avatar-wrap');
    if(!w)return;
    w.querySelector('.nav-avatar').addEventListener('click',function(e){e.stopPropagation();w.classList.toggle('open');});
    document.addEventListener('click',function(){w.classList.remove('open');});
  })();</script>` : ''}
  <script>(function(){
    function initAc(input) {
      var wrap = input.parentNode;
      wrap.classList.add('tag-ac-wrap');
      var drop = null, active = -1;
      function close() { if(drop){drop.remove();drop=null;active=-1;} }
      function open(items) {
        close();
        if(!items.length) return;
        drop = document.createElement('div');
        drop.className = 'tag-ac';
        items.forEach(function(s,i) {
          var d = document.createElement('div');
          d.className = 'tag-ac-item';
          d.textContent = s;
          d.addEventListener('mousedown', function(e){ e.preventDefault(); pick(s); });
          drop.appendChild(d);
        });
        wrap.appendChild(drop);
      }
      function pick(s) {
        var parts = input.value.split(',');
        parts[parts.length-1] = ' '+s;
        input.value = parts.join(',') + ', ';
        close(); input.focus();
      }
      function highlight(i) {
        if(!drop) return;
        var items = drop.querySelectorAll('.tag-ac-item');
        items.forEach(function(el,j){ el.classList.toggle('active', j===i); });
        active = i;
      }
      input.addEventListener('input', function() {
        var parts = this.value.split(',');
        var q = parts[parts.length-1].trim();
        if(!q){ close(); return; }
        fetch('/tags/autocomplete?q='+encodeURIComponent(q))
          .then(function(r){ return r.json(); }).then(open).catch(close);
      });
      input.addEventListener('keydown', function(e) {
        if(!drop) return;
        var items = drop.querySelectorAll('.tag-ac-item');
        if(e.key==='ArrowDown'){ e.preventDefault(); highlight(Math.min(active+1,items.length-1)); }
        else if(e.key==='ArrowUp'){ e.preventDefault(); highlight(Math.max(active-1,0)); }
        else if(e.key==='Enter'&&active>=0){ e.preventDefault(); pick(items[active].textContent); }
        else if(e.key==='Escape'){ close(); }
      });
      input.addEventListener('blur', function(){ setTimeout(close, 150); });
    }
    document.querySelectorAll('input[name="tags"]').forEach(initAc);

    function initLocationSearch(wrap) {
      var latName = wrap.dataset.latName || 'latitude';
      var lonName = wrap.dataset.lonName || 'longitude';
      var input   = wrap.querySelector('.loc-search-input');
      var latIn   = wrap.parentNode.querySelector('input[name="' + latName + '"]');
      var lonIn   = wrap.parentNode.querySelector('input[name="' + lonName + '"]');
      var clearBtn = wrap.querySelector('.loc-clear-btn');
      if (!input || !latIn || !lonIn) return;
      var drop = null, timer = null;
      function closeDrop(){ if(drop){ drop.remove(); drop=null; } }
      function openDrop(items){
        closeDrop();
        if(!items.length) return;
        drop = document.createElement('div');
        drop.className = 'tag-ac';
        items.forEach(function(item){
          var d = document.createElement('div');
          d.className = 'tag-ac-item';
          d.textContent = item.name;
          d.addEventListener('mousedown', function(e){
            e.preventDefault();
            latIn.value = item.lat;
            lonIn.value = item.lon;
            input.value = item.name;
            if(clearBtn) clearBtn.style.display = '';
            closeDrop();
          });
          drop.appendChild(d);
        });
        wrap.appendChild(drop);
      }
      if(clearBtn){
        clearBtn.addEventListener('click', function(){
          latIn.value = ''; lonIn.value = '';
          input.value = ''; input.placeholder = 'Search a place…';
          clearBtn.style.display = 'none';
          closeDrop();
        });
      }
      input.addEventListener('input', function(){
        latIn.value = ''; lonIn.value = '';
        if(clearBtn) clearBtn.style.display = 'none';
        clearTimeout(timer);
        var q = this.value.trim();
        if(q.length < 2){ closeDrop(); return; }
        timer = setTimeout(function(){
          fetch('/api/geocode?q='+encodeURIComponent(q))
            .then(function(r){ return r.json(); }).then(openDrop).catch(closeDrop);
        }, 350);
      });
      input.addEventListener('blur', function(){ setTimeout(closeDrop, 150); });
      var form = wrap.closest('form');
      if(form){
        form.addEventListener('submit', function(e){
          var q = input.value.trim();
          if(q.length >= 2 && !latIn.value){
            e.preventDefault();
            fetch('/api/geocode?q='+encodeURIComponent(q))
              .then(function(r){ return r.json(); })
              .then(function(results){
                if(results.length){ latIn.value = results[0].lat; lonIn.value = results[0].lon; }
                form.submit();
              })
              .catch(function(){ form.submit(); });
          }
        });
      }
    }
    document.querySelectorAll('.loc-search-wrap').forEach(initLocationSearch);
  })();</script>
<script>(function(){var t=document.querySelector('meta[name="csrf-token"]');if(!t||!t.content)return;var c=t.content;document.querySelectorAll('form[method="POST"],form[method="post"]').forEach(function(f){if(!f.querySelector('[name="_csrf"]')){var i=document.createElement('input');i.type='hidden';i.name='_csrf';i.value=c;f.appendChild(i);}});var o=window.fetch;window.fetch=function(u,p){if(p&&p.method&&!/^(GET|HEAD)$/i.test(p.method)){p=Object.assign({},p);p.headers=Object.assign({'X-CSRF-Token':c},p.headers||{});}return o.call(this,u,p);};}());</script>
  ${session ? '<script src="/socket.io/socket.io.js"></script><script src="/socket-client.js"></script>' : ''}
</body>
</html>`;
}

module.exports = { page };
