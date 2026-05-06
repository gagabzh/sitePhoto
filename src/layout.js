function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
        <a href="/map">Map</a>
        <div class="nav-avatar-wrap">
          <span class="nav-avatar" role="button" aria-label="Account menu">${initial}</span>
          <div class="nav-menu" role="menu">
            <a href="/account/password" role="menuitem">Account</a>
            ${session.role === 'admin' ? '<a href="/admin/users" role="menuitem">Admin</a>' : ''}
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
  <title>${esc(title)} — sitephoto</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&family=Architects+Daughter&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    /* ── Design tokens ── */
    :root {
      --paper:      #f6f3ec;
      --paper-2:    #ece7da;
      --ink:        #1a1814;
      --ink-soft:   #4a463e;
      --ink-faint:  #8a8377;
      --accent:     oklch(62% 0.14 35);
      --accent-cool:oklch(62% 0.14 220);
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: 'Architects Daughter', cursive;
      font-size: 16px;
      line-height: 1.5;
    }
    body {
      background-image:
        radial-gradient(rgba(26,24,20,0.05) 1px, transparent 1px),
        radial-gradient(rgba(26,24,20,0.04) 1px, transparent 1px);
      background-size: 22px 22px, 11px 11px;
      background-position: 0 0, 6px 6px;
      min-height: 100vh;
    }

    /* ── Navigation ── */
    nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 2rem; gap: 1rem;
      background: var(--paper);
      border-bottom: 1.5px dashed var(--ink);
    }
    nav strong a {
      font-family: 'Caveat', cursive;
      font-size: 1.7rem; font-weight: 700;
      color: var(--ink); text-decoration: none;
    }
    .nav-dot { color: var(--accent); }
    .nav-right {
      display: flex; gap: 1.25rem; align-items: center;
      font-family: 'Kalam', cursive; font-size: 0.95rem;
    }
    .nav-right > a { color: var(--ink); text-decoration: none; }
    .nav-right > a:hover { border-bottom: 1.5px solid var(--ink); }

    /* avatar + dropdown */
    .nav-avatar-wrap { position: relative; }
    .nav-avatar {
      width: 30px; height: 30px; border: 1.5px solid var(--ink);
      border-radius: 50%; background: var(--paper-2);
      display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1rem; font-weight: 700;
      flex: none; cursor: pointer; user-select: none;
      transition: background 0.1s;
    }
    .nav-avatar:hover, .nav-avatar-wrap.open .nav-avatar { background: var(--ink); color: var(--paper); }
    .nav-menu {
      display: none; flex-direction: column;
      position: absolute; right: 0; top: calc(100% + 10px);
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 4px 4px 0 var(--ink);
      min-width: 148px; z-index: 200;
    }
    .nav-avatar-wrap.open .nav-menu { display: flex; }
    .nav-menu a {
      font-family: 'Kalam', cursive; font-size: 0.9rem;
      padding: 0.5rem 0.875rem; color: var(--ink); text-decoration: none;
      border-bottom: 1px dashed var(--ink-faint); display: block;
    }
    .nav-menu a:hover { background: var(--paper-2); }
    .nav-menu-sep { border: none; border-top: 1.5px dashed var(--ink-faint); margin: 0; }
    .nav-menu-logout {
      font-family: 'Kalam', cursive; font-size: 0.9rem;
      padding: 0.5rem 0.875rem; color: var(--ink-soft); background: none;
      border: none; cursor: pointer; text-align: left; width: 100%; display: block;
    }
    .nav-menu-logout:hover { background: var(--paper-2); color: var(--ink); }

    /* ── Main wrapper ── */
    main { max-width: 1200px; margin: 0 auto; padding: 2rem 2rem 4rem; }

    /* ── Headings ── */
    h1 { font-family: 'Caveat', cursive; font-weight: 700; font-size: 2.8rem; margin: 0 0 0.5rem; line-height: 1; }
    h2 { font-family: 'Caveat', cursive; font-weight: 700; font-size: 2rem; }
    h3 { font-family: 'Caveat', cursive; font-weight: 700; font-size: 1.5rem; margin: 0 0 0.5rem; }
    h4 { font-family: 'Caveat', cursive; font-weight: 700; font-size: 1.2rem; margin: 0 0 0.4rem; }
    p  { font-family: 'Kalam', cursive; color: var(--ink-soft); margin: 0.5rem 0; }

    /* ── Card ── */
    .card {
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 5px 5px 0 var(--ink); padding: 2rem;
    }

    /* ── Tables ── */
    table {
      width: 100%; border-collapse: collapse; background: var(--paper);
      border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink);
    }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px dashed var(--ink-faint); }
    th {
      background: var(--paper-2);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em;
      color: var(--ink-faint); text-transform: uppercase;
    }
    tr:last-child td { border-bottom: none; }

    /* ── Buttons ── */
    .btn {
      display: inline-block; padding: 5px 16px 3px;
      background: var(--ink); color: var(--paper);
      border: 2px solid var(--ink); cursor: pointer; text-decoration: none;
      font-family: 'Caveat', cursive; font-size: 1.05rem; line-height: 1.4;
      transform: rotate(-0.5deg); transition: transform 0.1s, background 0.1s;
      vertical-align: middle;
    }
    .btn:hover { transform: rotate(0); background: var(--ink-soft); border-color: var(--ink-soft); color: var(--paper); }
    .btn-sm { padding: 2px 10px 1px; font-size: 0.9rem; }
    .btn-secondary { background: var(--paper); color: var(--ink); }
    .btn-secondary:hover { background: var(--paper-2); color: var(--ink); border-color: var(--ink); }
    .btn-danger { background: var(--accent); border-color: var(--accent); color: var(--paper); }
    .btn-danger:hover { opacity: 0.85; transform: rotate(0); }
    .btn-icon { display: inline-flex; align-items: center; justify-content: center; padding: 5px 8px; }
    .btn-icon svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .btn-sm.btn-icon { padding: 2px 5px; }
    .btn-sm.btn-icon svg { width: 0.85rem; height: 0.85rem; }

    /* ── Forms ── */
    .form-col { display: flex; flex-direction: column; gap: 1rem; max-width: 440px; }
    label {
      font-family: 'Kalam', cursive; font-size: 0.95rem; font-weight: 700;
      display: flex; flex-direction: column; gap: 0.3rem; color: var(--ink);
    }
    label small {
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
      color: var(--ink-faint); font-weight: 400; letter-spacing: 0.5px;
    }
    input[type="text"], input[type="email"], input[type="password"],
    input[type="number"], select {
      padding: 0.5rem 0.6rem; font-family: 'Kalam', cursive; font-size: 1rem;
      border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink); width: 100%;
    }
    input[type="file"] {
      font-family: 'Kalam', cursive; font-size: 0.9rem;
      padding: 0.4rem 0; border: none; background: none;
      width: 100%; color: var(--ink-soft);
    }
    textarea {
      padding: 0.5rem 0.6rem; font-family: 'Kalam', cursive; font-size: 1rem;
      border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink); width: 100%;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: var(--ink); box-shadow: 2px 2px 0 var(--ink);
    }

    /* ── Layout helpers ── */
    .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    form.inline { display: inline; }
    .actions { display: flex; gap: 0.4rem; }

    /* ── Messages ── */
    .msg-error {
      color: var(--accent); background: oklch(97% 0.03 35);
      border: 1.5px solid var(--accent); padding: 0.6rem 1rem;
      font-family: 'Kalam', cursive; font-size: 0.95rem; margin-bottom: 1rem;
    }
    .msg-success {
      color: #2a6a2a; background: #f0fff0; border: 1.5px solid #6c6;
      padding: 0.6rem 1rem; font-family: 'Kalam', cursive; font-size: 0.95rem; margin-bottom: 1rem;
    }

    /* ── Role badges ── */
    .badge {
      display: inline-block; padding: 2px 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; border: 1.5px solid var(--ink);
    }
    .badge-admin  { background: var(--ink); color: var(--paper); }
    .badge-editor { background: var(--accent-cool); color: var(--paper); }
    .badge-viewer { background: var(--paper); color: var(--ink); }

    /* ── Top bar (page header row) ── */
    .top-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;
    }
    .top-bar h1 { font-family: 'Caveat', cursive; font-size: 3rem; font-weight: 700; margin: 0; line-height: 1; }

    /* ── Photo grid ── */
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .photo-card {
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 4px 4px 0 var(--ink); overflow: hidden;
    }
    .photo-card a { text-decoration: none; color: inherit; display: block; }
    .photo-card img { width: 100%; height: 180px; object-fit: cover; display: block; border-bottom: 2px solid var(--ink); }
    .photo-meta { padding: 0.6rem 0.75rem; }
    .photo-meta strong { font-family: 'Caveat', cursive; font-size: 1.1rem; display: block; margin-bottom: 0.1rem; }
    .uploader { font-family: 'JetBrains Mono', monospace; color: var(--ink-faint); font-size: 0.72rem; }

    /* ── Album cards ── */
    .album-card {
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 4px 4px 0 var(--ink); text-decoration: none; color: inherit; display: block;
    }
    .album-cover { width: 100%; height: 160px; object-fit: cover; display: block; border-bottom: 2px solid var(--ink); }
    .album-cover-empty {
      width: 100%; height: 160px; background: var(--paper-2);
      display: flex; align-items: center; justify-content: center;
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
      color: var(--ink-faint); letter-spacing: 2px; text-transform: lowercase;
      border-bottom: 2px solid var(--ink);
    }
    .album-meta { padding: 0.75rem 0.85rem; }
    .album-meta strong { font-family: 'Caveat', cursive; font-size: 1.25rem; display: block; margin-bottom: 0.15rem; }
    .album-meta small { font-family: 'JetBrains Mono', monospace; color: var(--ink-faint); font-size: 0.72rem; }

    /* ── Bulk action bar ── */
    .bulk-bar {
      display: flex; align-items: center; gap: 0.75rem;
      margin-bottom: 1.25rem; background: var(--paper-2);
      padding: 0.65rem 1rem; border: 1.5px solid var(--ink);
    }

    /* ── Photo thumb with checkbox ── */
    .photo-thumb { position: relative; }
    .photo-thumb a { display: block; }
    .photo-thumb img { display: block; width: 100%; height: 180px; object-fit: cover; }
    .photo-checkbox-label { position: absolute; top: 0.5rem; left: 0.5rem; z-index: 1; cursor: pointer; }
    .photo-checkbox-label input[type="checkbox"] { display: block; width: 1.1rem; height: 1.1rem; accent-color: var(--ink); cursor: pointer; }
    .photo-card-selectable:has(input:checked) img { outline: 3px solid var(--ink); }

    /* ── Tags ── */
    .tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.5rem; }
    .tag {
      font-family: 'Kalam', cursive; font-size: 0.78rem;
      border: 1.5px solid var(--ink); border-radius: 999px;
      padding: 1px 10px; color: var(--ink); background: var(--paper);
    }
    .tag-cloud { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .tag-cloud a {
      font-family: 'Kalam', cursive; font-size: 0.9rem;
      border: 1.5px solid var(--ink); border-radius: 999px;
      padding: 3px 12px; color: var(--ink); text-decoration: none; background: var(--paper);
      transition: background 0.1s, color 0.1s;
    }
    .tag-cloud a:hover { background: var(--ink); color: var(--paper); }
    .tag-count { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--ink-faint); margin-left: 0.2rem; }

    /* ── Access list ── */
    .access-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

    /* ── Filter bar ── */
    .filter-bar {
      display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
      margin-bottom: 1.5rem; background: var(--paper-2);
      padding: 0.65rem 1rem; border: 1.5px solid var(--ink);
    }
    .filter-bar select {
      padding: 0.4rem 0.6rem; font-family: 'Kalam', cursive;
      font-size: 0.9rem; border: 1.5px solid var(--ink); background: var(--paper);
    }
    .filter-bar label {
      font-family: 'Kalam', cursive; font-size: 0.9rem; font-weight: 700;
      flex-direction: row; align-items: center; gap: 0.4rem;
    }

    /* ── Timeline (legacy class kept for any external use) ── */
    .timeline-month {
      font-family: 'Caveat', cursive; font-size: 1.8rem; font-weight: 700;
      margin: 2rem 0 0.75rem; padding-bottom: 0.4rem;
      border-bottom: 1.5px dashed var(--ink); color: var(--ink);
    }
    .timeline-month:first-child { margin-top: 0; }

    /* ── Timeline Story (approach 2) ── */
    .tl-hero {
      display: grid; grid-template-columns: 1fr 220px; gap: 1.5rem; align-items: end;
      padding-bottom: 1.25rem; margin-bottom: 0;
      border-bottom: 1.5px dashed var(--ink);
    }
    .tl-hero h1 {
      font-family: 'JetBrains Mono', monospace; font-size: 0.68rem;
      font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--ink-faint); margin: 0 0 0.6rem; line-height: 1;
    }
    .tl-headline {
      font-family: 'Caveat', cursive; font-size: 3.2rem; font-weight: 700;
      line-height: 0.95; margin: 0; color: var(--ink);
    }
    .tl-headline em { font-style: italic; color: var(--accent); }
    .tl-lede {
      font-family: 'Kalam', cursive; font-size: 0.95rem;
      color: var(--ink-soft); margin: 0.6rem 0 0;
    }
    .tl-stats {
      font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; line-height: 2.2;
      text-align: right; color: var(--ink-soft);
      border-left: 1.5px solid var(--ink); padding: 0.4rem 0 0.4rem 1rem;
    }
    .tl-stats b {
      color: var(--ink); font-family: 'Caveat', cursive; font-size: 1.3rem; font-weight: 700;
    }
    .tl-filter-bar {
      display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
      padding: 0.6rem 0; margin-bottom: 0.5rem;
      border-bottom: 1px dashed var(--ink-faint);
    }
    .tl-filter-bar label {
      font-family: 'Kalam', cursive; font-size: 0.85rem; font-weight: 700;
      flex-direction: row; align-items: center; gap: 0.4rem; color: var(--ink);
    }
    .tl-filter-bar select {
      font-family: 'Kalam', cursive; font-size: 0.85rem;
      padding: 0.3rem 0.5rem; border: 1.5px solid var(--ink);
      background: var(--paper); color: var(--ink);
    }
    .tl-entry {
      display: grid; grid-template-columns: 120px 1fr; gap: 1.5rem;
      padding: 1.4rem 0; border-bottom: 1.5px dashed var(--ink);
    }
    .tl-entry:last-child { border-bottom: none; }
    .tl-entry h3 {
      font-family: 'Caveat', cursive; font-size: 2rem; margin: 0 0 0.15rem; font-weight: 700;
    }
    .tl-when {
      font-family: 'Caveat', cursive; font-size: 1.2rem; line-height: 1.1; padding-top: 0.25rem;
    }
    .tl-when-dot {
      display: inline-block; width: 9px; height: 9px; background: var(--ink);
      border-radius: 50%; margin-right: 5px; vertical-align: middle; flex: none;
    }
    .tl-when-yr {
      display: block; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
      color: var(--ink-faint); margin-top: 0.2rem; padding-left: 14px;
    }
    .tl-meta { font-family: 'Kalam', cursive; font-size: 0.85rem; color: var(--ink-soft); margin: 0 0 0.65rem; }
    .tl-meta em { font-style: italic; }
    .tl-empty { font-family: 'Kalam', cursive; color: var(--ink-faint); margin-top: 1rem; }

    /* photo grids inside timeline entries */
    .tl-grid { display: grid; gap: 5px; }
    .tl-grid.k1 { grid-template-columns: 1fr;              grid-template-rows: 240px; }
    .tl-grid.k2 { grid-template-columns: 1.3fr 1fr;        grid-template-rows: 240px; }
    .tl-grid.k3 { grid-template-columns: 1fr 1fr 1fr;      grid-template-rows: 200px; }
    .tl-grid.k4 { grid-template-columns: 2fr 1fr 1fr 1fr;  grid-template-rows: 180px; }
    .tl-grid.k5 { grid-template-columns: 1.5fr 1fr 1fr;    grid-template-rows: 130px 130px; }
    .tl-grid.k5 .tl-cell:first-child { grid-row: span 2; }
    .tl-cell { overflow: hidden; }
    .tl-cell a { display: block; height: 100%; }
    .tl-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tl-more {
      display: flex; align-items: center; justify-content: center; height: 100%;
      background: var(--paper-2); border: 1.5px solid var(--ink);
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
      color: var(--ink-soft); text-decoration: none;
    }
    .tl-more:hover { background: var(--paper); }

    /* ── EXIF metadata ── */
    .photo-exif {
      display: grid; grid-template-columns: max-content 1fr;
      gap: 0.2rem 0.75rem; margin: 0.75rem 0 0;
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
    }
    .photo-exif dt { color: var(--ink-faint); }
    .photo-exif dd { margin: 0; color: var(--ink-soft); }

    /* ── Map page ── */
    .map-frame {
      display: grid; grid-template-columns: 280px 1fr;
      margin: -2rem -2rem -4rem;
      min-height: calc(100vh - 64px);
    }
    .map-side {
      border-right: 2px solid var(--ink); padding: 1.5rem 1.1rem;
      background: var(--paper); overflow-y: auto;
      max-height: calc(100vh - 64px);
    }
    .map-side h1 {
      font-family: 'Caveat', cursive; font-size: 2rem; font-weight: 700;
      margin: 0 0 0.15rem; line-height: 1.05;
    }
    .map-sub {
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
      color: var(--ink-faint); margin: 0 0 1rem; letter-spacing: 0.02em;
    }
    .map-filter-form {
      display: flex; flex-direction: column; gap: 0.4rem;
      padding-bottom: 0.75rem;
      border-bottom: 1.5px dashed var(--ink-faint);
    }
    .map-filter-form select {
      width: 100%; font-family: 'Kalam', cursive; font-size: 0.85rem;
      padding: 0.3rem 0.5rem; border: 1.5px solid var(--ink);
      background: var(--paper); color: var(--ink);
    }
    .map-side-h {
      font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
      letter-spacing: 0.15em; color: var(--ink-faint); text-transform: uppercase;
      margin: 1rem 0 0.4rem;
    }
    .map-place {
      display: flex; align-items: center; gap: 0.6rem;
      padding: 0.45rem 0.25rem; border-bottom: 1px dashed var(--ink-faint);
      cursor: pointer; text-decoration: none; color: inherit;
    }
    .map-place:hover, .map-place.active { background: var(--paper-2); }
    .map-place-pin { font-size: 0.9rem; width: 18px; text-align: center; flex: none; }
    .map-place-name { font-family: 'Caveat', cursive; font-size: 1.1rem; flex: 1; }
    .map-place-n { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-faint); }
    .map-area { position: relative; overflow: hidden; }
    #map { height: 100%; width: 100%; min-height: 400px; }
    .map-strip {
      position: absolute; left: 18px; right: 18px; bottom: 18px; z-index: 1000;
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 4px 4px 0 var(--ink); padding: 0.75rem 1rem;
    }
    .map-strip-head {
      display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;
    }
    .map-strip-head h3 { font-family: 'Caveat', cursive; font-size: 1.4rem; margin: 0; flex: 1; }
    .map-strip-where { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-faint); }
    .map-strip-close {
      background: none; border: 1.5px solid var(--ink); cursor: pointer;
      font-family: 'Caveat', cursive; font-size: 1.3rem; line-height: 1;
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; flex: none;
    }
    .map-strip-photos { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; height: 100px; }
    .map-strip-photos a { display: block; height: 100%; overflow: hidden; }
    .map-strip-photos img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .map-strip-more {
      display: flex; align-items: center; justify-content: center;
      background: var(--paper-2); border: 1.5px solid var(--ink);
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-soft);
      text-decoration: none;
    }

    /* ── Family Wall ── */
    .wall-greet { margin-bottom: 1.25rem; }
    .wall-greet h1 { margin-bottom: 0.1rem; }
    .wall-count {
      font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
      color: var(--ink-faint); margin: 0;
    }

    .wall-hero {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px;
      margin-bottom: 1.5rem; border: 2px solid var(--ink);
    }
    .wall-hero a { display: block; overflow: hidden; }
    .wall-hero-img {
      width: 100%; height: 220px; object-fit: cover; display: block;
      transition: transform 0.25s;
    }
    .wall-hero a:hover .wall-hero-img { transform: scale(1.03); }

    .wall-cols {
      display: grid; grid-template-columns: 1fr 260px;
      gap: 2rem; align-items: start;
    }

    /* mosaic — groups of 9 with a featured first photo */
    .wall-mosaic {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      grid-template-rows: 140px 140px 110px;
      grid-template-areas:
        "a b c d"
        "a e f g"
        "h i i i";
      gap: 3px; margin-bottom: 1rem;
    }
    .wall-cell { overflow: hidden; position: relative; }
    .wall-cell:nth-child(1) { grid-area: a; }
    .wall-cell:nth-child(2) { grid-area: b; }
    .wall-cell:nth-child(3) { grid-area: c; }
    .wall-cell:nth-child(4) { grid-area: d; }
    .wall-cell:nth-child(5) { grid-area: e; }
    .wall-cell:nth-child(6) { grid-area: f; }
    .wall-cell:nth-child(7) { grid-area: g; }
    .wall-cell:nth-child(8) { grid-area: h; }
    .wall-cell:nth-child(9) { grid-area: i; }
    .wall-cell a { display: block; height: 100%; }
    .wall-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .wall-checkbox {
      position: absolute; top: 0.4rem; left: 0.4rem; z-index: 1; cursor: pointer;
    }
    .wall-checkbox input[type="checkbox"] {
      display: block; width: 1.1rem; height: 1.1rem; accent-color: var(--ink); cursor: pointer;
    }
    .photo-card-selectable:has(input:checked) img { outline: 3px solid var(--ink); }

    /* sidebar */
    .wall-side { display: flex; flex-direction: column; gap: 1.25rem; }
    .wall-panel {
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 3px 3px 0 var(--ink); padding: 1rem;
    }
    .wall-section-h {
      font-family: 'Caveat', cursive; font-size: 1.3rem; font-weight: 700;
      margin: 0 0 0.75rem; padding-bottom: 0.4rem;
      border-bottom: 1.5px dashed var(--ink);
    }
    .wall-who { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .wall-who li { display: flex; align-items: center; gap: 0.6rem; font-family: 'Kalam', cursive; font-size: 0.9rem; }
    .wall-who-av {
      width: 28px; height: 28px; border-radius: 50%; flex: none;
      background: var(--paper-2); border: 1.5px solid var(--ink);
      display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1rem; font-weight: 700;
    }
    .wall-who-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--ink-faint); }
    .wall-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .wall-album-cover {
      width: 100%; height: 110px; object-fit: cover; display: block;
      border: 1.5px solid var(--ink); margin-bottom: 0.5rem;
    }
    .wall-album-cover-empty {
      display: flex; align-items: center; justify-content: center;
      background: var(--paper-2); font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem; color: var(--ink-faint);
    }
    .wall-album-title {
      font-family: 'Caveat', cursive; font-size: 1.2rem; font-weight: 700;
      display: block; color: var(--ink); text-decoration: none;
    }
    .wall-album-title:hover { text-decoration: underline; }

    /* ── Album Books (list page) ── */
    .ab-page-h {
      display: flex; justify-content: space-between; align-items: flex-end; gap: 1.5rem;
      padding-bottom: 1.25rem; border-bottom: 1.5px dashed var(--ink); flex-wrap: wrap;
      margin-bottom: 0;
    }
    .ab-page-h h1 { font-family: 'Caveat', cursive; font-size: 3.8rem; font-weight: 700; line-height: 0.95; margin: 0; }
    .ab-page-h h1 em { font-style: italic; color: var(--accent); }
    .ab-sub { font-family: 'Kalam', cursive; font-size: 0.9rem; color: var(--ink-soft); margin: 0.4rem 0 0; }
    .ab-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
    .ab-grid { padding: 1.5rem 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.75rem 2.25rem; }
    .ab-book { position: relative; }
    .ab-spine {
      position: absolute; left: -6px; top: 8px; bottom: 8px; width: 8px;
      background: var(--ink); box-shadow: -2px 0 0 var(--paper-2);
    }
    .ab-cover {
      display: flex; flex-direction: column; justify-content: flex-end;
      aspect-ratio: 4/5; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink);
      background: var(--paper-2); position: relative; overflow: hidden; text-decoration: none;
    }
    .ab-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .ab-cover-empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-faint); letter-spacing: 2px;
    }
    .ab-ribbon {
      position: absolute; top: 14px; right: -6px;
      font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; padding: 3px 10px;
      background: var(--accent); color: var(--paper);
      border: 1.5px solid var(--ink); letter-spacing: 0.08em; transform: rotate(2deg);
    }
    .ab-ribbon-empty { background: var(--paper); color: var(--ink); }
    .ab-label {
      position: relative; z-index: 1; margin: 1rem;
      background: var(--paper); border: 1.5px solid var(--ink); padding: 10px 12px;
      transform: rotate(-1.5deg); box-shadow: 3px 3px 0 rgba(0,0,0,0.25);
    }
    .ab-label h3 { font-family: 'Caveat', cursive; font-size: 1.6rem; margin: 0; line-height: 1; font-weight: 700; }
    .ab-label-sub { font-family: 'Kalam', cursive; font-size: 0.8rem; color: var(--ink-soft); margin-top: 2px; }
    .ab-meta-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 0.875rem; font-family: 'Kalam', cursive; font-size: 0.85rem;
      color: var(--ink-soft); padding: 0 4px;
    }
    .ab-meta-who { font-style: italic; }
    .ab-meta-acts { display: flex; gap: 0.4rem; }
    .ab-new {
      aspect-ratio: 4/5; border: 2px dashed var(--ink); background: transparent;
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      cursor: pointer; font-family: 'Caveat', cursive; font-size: 1.3rem;
      text-decoration: none; color: var(--ink-soft);
    }
    .ab-new-plus { font-size: 3rem; line-height: 1; color: var(--accent); margin-bottom: 0.25rem; }

    /* ── Album Detail (Inside an Album) ── */
    .ad-head {
      display: grid; grid-template-columns: 320px 1fr; gap: 1.75rem;
      padding-bottom: 1.25rem; margin-bottom: 1rem;
      border-bottom: 1.5px dashed var(--ink);
    }
    .ad-cover {
      aspect-ratio: 4/3; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink);
      background: var(--paper-2); position: relative; overflow: hidden;
    }
    .ad-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ad-cover-empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-faint); letter-spacing: 2px;
    }
    .ad-crumbs {
      font-family: 'JetBrains Mono', monospace; font-size: 0.68rem;
      color: var(--ink-faint); letter-spacing: 0.1em; margin-bottom: 0.4rem;
    }
    .ad-crumbs a { color: var(--ink-soft); text-decoration: none; }
    .ad-crumbs a:hover { text-decoration: underline; }
    .ad-info h1 { font-family: 'Caveat', cursive; font-size: 4rem; line-height: 0.95; margin: 0.25rem 0 0.4rem; font-weight: 700; }
    .ad-desc { font-family: 'Kalam', cursive; font-size: 0.95rem; color: var(--ink-soft); max-width: 580px; line-height: 1.5; margin: 0 0 0.75rem; }
    .ad-stats { display: flex; gap: 1.4rem; margin: 0.75rem 0; font-family: 'Kalam', cursive; font-size: 0.85rem; color: var(--ink-soft); }
    .ad-stats b { font-family: 'Caveat', cursive; font-size: 1.4rem; display: block; line-height: 1; color: var(--ink); }
    .ad-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
    .ad-mosaic {
      display: grid; grid-template-columns: repeat(6, 1fr);
      grid-auto-rows: 110px; gap: 6px; margin-bottom: 1rem;
    }
    .ad-mosaic .ad-cell:nth-child(1) { grid-column: span 3; grid-row: span 2; }
    .ad-mosaic .ad-cell:nth-child(2) { grid-column: span 2; grid-row: span 2; }
    .ad-mosaic .ad-cell:nth-child(3) { grid-column: span 1; grid-row: span 1; }
    .ad-mosaic .ad-cell:nth-child(4) { grid-column: span 1; grid-row: span 1; }
    .ad-mosaic .ad-cell:nth-child(5) { grid-column: span 2; grid-row: span 2; }
    .ad-mosaic .ad-cell:nth-child(6) { grid-column: span 2; grid-row: span 1; }
    .ad-mosaic .ad-cell:nth-child(7) { grid-column: span 2; grid-row: span 1; }
    .ad-mosaic .ad-cell:nth-child(8) { grid-column: span 3; grid-row: span 2; }
    .ad-mosaic .ad-cell:nth-child(9) { grid-column: span 3; grid-row: span 2; }
    .ad-cell { overflow: hidden; position: relative; }
    .ad-cell a { display: block; height: 100%; }
    .ad-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }

    /* ── Album Access (Vault) ── */
    .ac-head {
      display: grid; grid-template-columns: 1fr auto; gap: 1.5rem; align-items: end;
      padding-bottom: 1.25rem; border-bottom: 1.5px dashed var(--ink);
    }
    .ac-crumbs {
      font-family: 'JetBrains Mono', monospace; font-size: 0.68rem;
      color: var(--ink-faint); letter-spacing: 0.1em; margin-bottom: 0.4rem;
    }
    .ac-crumbs a { color: var(--ink-soft); text-decoration: none; }
    .ac-head h1 { font-family: 'Caveat', cursive; font-size: 3rem; line-height: 0.95; margin: 0.25rem 0 0.25rem; font-weight: 700; }
    .ac-head h1 em { color: var(--accent); font-style: italic; }
    .ac-sub { font-family: 'Kalam', cursive; font-size: 0.9rem; color: var(--ink-soft); max-width: 580px; margin: 0; }
    .ac-summary {
      display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
      padding: 0.875rem 0; border-bottom: 1.5px dashed var(--ink);
      font-family: 'Kalam', cursive; font-size: 0.9rem; color: var(--ink-soft);
    }
    .ac-lock {
      font-family: 'Caveat', cursive; font-size: 1.1rem; padding: 2px 12px;
      border: 1.5px solid var(--ink); background: var(--ink); color: var(--paper);
      transform: rotate(-1deg); display: inline-block;
    }
    .ac-body { display: grid; grid-template-columns: 1fr 300px; gap: 0; }
    .ac-main { padding: 1.25rem 1.5rem 1.5rem 0; border-right: 1.5px dashed var(--ink); }
    .ac-main h3 {
      font-family: 'Caveat', cursive; font-size: 1.5rem; margin: 0 0 0.25rem; font-weight: 700;
      display: flex; align-items: baseline; gap: 0.75rem;
    }
    .ac-count { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; color: var(--ink-faint); letter-spacing: 0.1em; }
    .ac-hint { font-family: 'Kalam', cursive; font-size: 0.82rem; color: var(--ink-soft); margin: 0 0 0.75rem; }
    .ac-row {
      display: grid; grid-template-columns: 44px 1fr auto; gap: 0.875rem;
      align-items: center; padding: 0.75rem 4px;
      border-bottom: 1px dashed var(--ink-faint);
    }
    .ac-row:last-child { border-bottom: none; }
    .ac-av {
      width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid var(--ink);
      background: var(--paper-2); display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1.4rem; font-weight: 700; flex: none;
    }
    .ac-nm { font-family: 'Caveat', cursive; font-size: 1.2rem; font-weight: 700; line-height: 1; }
    .ac-em { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--ink-soft); }
    .ac-empty {
      padding: 1.25rem; text-align: center; border: 1.5px dashed var(--ink-faint);
      font-family: 'Kalam', cursive; font-size: 0.9rem; color: var(--ink-faint); margin: 0.75rem 0;
    }
    .ac-side { padding: 1.25rem 0 1.5rem 1.5rem; }
    .ac-side h4 {
      font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
      letter-spacing: 0.15em; color: var(--ink-faint); margin: 0 0 0.6rem; text-transform: uppercase;
    }
    .ac-cand {
      display: flex; align-items: center; gap: 0.625rem;
      padding: 0.45rem; border-bottom: 1px dashed var(--ink-faint);
    }
    .ac-cand:last-of-type { border-bottom: none; }
    .ac-cand-av {
      width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid var(--ink);
      background: var(--paper-2); display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1rem; font-weight: 700; flex: none;
    }
    .ac-cand-nm { font-family: 'Caveat', cursive; font-size: 1.05rem; font-weight: 700; line-height: 1; }
    .ac-cand-em { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; color: var(--ink-soft); }

    /* ── Users Ledger ── */
    .ul-page-h {
      display: flex; justify-content: space-between; align-items: flex-end; gap: 1.5rem;
      padding-bottom: 1.25rem; border-bottom: 1.5px dashed var(--ink); flex-wrap: wrap;
      margin-bottom: 0;
    }
    .ul-page-h h1 { font-family: 'Caveat', cursive; font-size: 3.8rem; font-weight: 700; line-height: 0.95; margin: 0; }
    .ul-page-h h1 em { font-style: italic; color: var(--accent); }
    .ul-sub { font-family: 'Kalam', cursive; font-size: 0.9rem; color: var(--ink-soft); margin: 0.4rem 0 0; }
    .ul-table {
      width: 100%; border-collapse: collapse;
      border: none; box-shadow: none; background: transparent;
    }
    .ul-table th {
      font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.12em;
      color: var(--ink-faint); font-weight: 600; text-align: left;
      padding: 1rem 1.125rem 0.5rem; border-bottom: 1.5px solid var(--ink);
      background: transparent;
    }
    .ul-table td {
      padding: 0.875rem 1.125rem; border-bottom: 1px dashed var(--ink-faint);
      vertical-align: middle; background: transparent;
    }
    .ul-table tbody tr:hover td { background: var(--paper-2); }
    .ul-table tbody tr:last-child td { border-bottom: 1.5px solid var(--ink); }
    .ul-name-cell { display: flex; align-items: center; gap: 0.75rem; }
    .ul-av {
      width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--ink);
      background: var(--paper-2); display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1.1rem; font-weight: 700; flex: none;
    }
    .ul-nm { font-family: 'Caveat', cursive; font-size: 1.3rem; font-weight: 700; line-height: 1; }
    .ul-you {
      font-family: 'Caveat', cursive; font-size: 0.85rem; color: var(--accent);
      margin-left: 0.4rem; transform: rotate(-3deg); display: inline-block;
    }
    .ul-email { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-soft); margin-top: 2px; }
    .ul-since { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-soft); }
    .ul-chip {
      font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; letter-spacing: 0.1em;
      padding: 3px 10px; border: 1.5px solid var(--ink); display: inline-block;
    }
    .ul-chip-admin  { background: var(--ink); color: var(--paper); }
    .ul-chip-editor { background: var(--accent-cool); color: var(--paper); }
    .ul-chip-viewer { background: var(--paper); color: var(--ink); }
    .ul-acts { display: flex; gap: 0.4rem; align-items: center; opacity: 0.2; transition: opacity 0.15s; }
    .ul-table tbody tr:hover .ul-acts { opacity: 1; }
    .ul-pill {
      font-family: 'Kalam', cursive; font-size: 0.78rem;
      padding: 2px 9px; border: 1.5px solid var(--ink); border-radius: 999px;
      background: var(--paper); color: var(--ink); text-decoration: none;
      cursor: pointer; white-space: nowrap; display: inline-block;
    }
    .ul-pill:hover { background: var(--paper-2); }
    .ul-pill-danger { color: var(--accent); border-color: var(--accent); }
    .ul-pill-danger:hover { background: oklch(97% 0.03 35); }
    .ul-foot {
      padding: 0.875rem 1.125rem;
      font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-faint);
    }
  </style>
</head>
<body>
  ${nav}
  <main>${body}</main>
  ${session ? `<script>(function(){
    var w=document.querySelector('.nav-avatar-wrap');
    if(!w)return;
    w.querySelector('.nav-avatar').addEventListener('click',function(e){e.stopPropagation();w.classList.toggle('open');});
    document.addEventListener('click',function(){w.classList.remove('open');});
  })();</script>` : ''}
</body>
</html>`;
}

module.exports = { page, esc };
