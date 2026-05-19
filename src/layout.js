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
            <a href="/tags/recipes" role="menuitem">My Recipes</a>
            ${session.role === 'admin' ? `<hr class="nav-menu-sep">
            <span class="nav-menu-section">ADMIN</span>
            <a href="/admin/users" role="menuitem">Users</a>
            <a href="/tags/manage" role="menuitem">Manage Tags</a>
            <a href="/tags/recipes?scope=all" role="menuitem">All Recipes</a>` : ''}
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
      --paper-3:    #e1dccc;
      --ink:        #1a1814;
      --ink-soft:   #4a463e;
      --ink-faint:  #8a8377;
      --ink-ghost:  #b5ad9d;
      --accent:     oklch(62% 0.14 35);
      --accent-cool:oklch(62% 0.14 220);
      --danger:     oklch(58% 0.18 25);
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
      min-width: 148px; z-index: 1500;
    }
    .nav-avatar-wrap.open .nav-menu { display: flex; }
    .nav-menu a {
      font-family: 'Kalam', cursive; font-size: 0.9rem;
      padding: 0.5rem 0.875rem; color: var(--ink); text-decoration: none;
      border-bottom: 1px dashed var(--ink-faint); display: block;
    }
    .nav-menu a:hover { background: var(--paper-2); }
    .nav-menu-sep { border: none; border-top: 1.5px dashed var(--ink-faint); margin: 0; }
    .nav-menu-section { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 1.5px; color: var(--ink-faint); padding: 6px 14px 2px; display: block; }
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
    .tl-group-row {
      display: flex; align-items: center; gap: 0.4rem;
      border-top: 1px dashed var(--ink-faint); padding-top: 0.5rem; margin-top: 0.1rem;
      font-family: 'Kalam', cursive; font-size: 0.85rem; font-weight: 700; color: var(--ink);
    }
    .tl-filter-bar select, .tl-filter-bar input[type="date"], .tl-group-row select {
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
    .map-loc-section { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.25rem; }
    .map-loc-label { margin: 0; font-size: 0.65rem; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.15em; color: var(--ink-faint); text-transform: uppercase; }
    .map-radius-row { display: flex; align-items: center; gap: 0.5rem; }
    .map-radius-row label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; flex: 1; }
    .map-radius-input { width: 4.5rem; font-family: 'Kalam', cursive; font-size: 0.85rem; padding: 0.25rem 0.4rem; border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink); }
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
    .ad-cell { overflow: hidden; position: relative; cursor: pointer; }
    .ad-cell a { display: block; height: 100%; }
    .ad-cell img { width: 100%; height: 100%; object-fit: cover; display: block; transition: opacity 0.15s; }
    .ad-cell:hover img { opacity: 0.88; }
    .ad-lb-btn {
      position: absolute; top: 6px; right: 6px;
      background: rgba(0,0,0,0.45); color: #fff; border: none; border-radius: 4px;
      font-size: 0.9rem; line-height: 1; padding: 3px 5px; cursor: pointer;
      opacity: 0; transition: opacity 0.15s; pointer-events: none;
    }
    .ad-cell:hover .ad-lb-btn,
    .photo-thumb:hover .ad-lb-btn { opacity: 1; pointer-events: auto; }
    .photo-thumb { position: relative; }

    /* ── Lightbox ── */
    .lb-overlay {
      display: none; position: fixed; inset: 0; z-index: 1000;
      background: rgba(20,18,14,0.93); align-items: center; justify-content: center;
    }
    .lb-overlay.lb-open { display: flex; }
    .lb-img-wrap { position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center; }
    .lb-img-wrap img { max-width: 90vw; max-height: 85vh; object-fit: contain; display: block; border: 2px solid var(--ink); }
    .lb-caption {
      position: absolute; bottom: -1.8rem; left: 0; right: 0; text-align: center;
      font-family: 'Kalam', cursive; font-size: 0.85rem; color: rgba(240,235,220,0.7);
    }
    .lb-btn {
      position: fixed; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; padding: 1rem;
      font-family: 'JetBrains Mono', monospace; font-size: 1.6rem;
      color: rgba(240,235,220,0.7); transition: color 0.15s;
    }
    .lb-btn:hover { color: rgba(240,235,220,1); }
    .lb-prev { left: 0.75rem; }
    .lb-next { right: 0.75rem; }
    .lb-close {
      position: fixed; top: 1rem; right: 1.25rem;
      background: none; border: none; cursor: pointer;
      font-family: 'JetBrains Mono', monospace; font-size: 1.4rem;
      color: rgba(240,235,220,0.7); transition: color 0.15s;
    }
    .lb-close:hover { color: rgba(240,235,220,1); }
    .lb-counter {
      position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%);
      font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
      color: rgba(240,235,220,0.45); letter-spacing: 0.08em;
    }

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

    /* ── Tag autocomplete ── */
    .tag-ac-wrap { position: relative; }
    .loc-search-wrap { display: flex; align-items: center; gap: 6px; }
    .loc-search-input { flex: 1; }
    .loc-clear-btn {
      background: none; border: none; cursor: pointer; padding: 0 4px;
      font-family: 'Kalam', cursive; font-size: 0.8rem; color: var(--ink-faint);
      white-space: nowrap;
    }
    .loc-clear-btn:hover { color: var(--accent); }
    .tag-ac {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 300;
      background: var(--paper); border: 1.5px solid var(--ink);
      box-shadow: 3px 3px 0 var(--ink); max-height: 200px; overflow-y: auto;
    }
    .tag-ac-item {
      padding: 0.4rem 0.75rem; font-family: 'Kalam', cursive; font-size: 0.9rem;
      cursor: pointer; border-bottom: 1px dashed var(--ink-faint);
    }
    .tag-ac-item:last-child { border-bottom: none; }
    .tag-ac-item:hover, .tag-ac-item.active { background: var(--paper-2); }

    /* ── Tag Combinator ── */
    .cb-layout {
      display: grid; grid-template-columns: 300px 1fr;
      margin: -2rem -2rem -4rem; min-height: calc(100vh - 64px);
      border-top: none;
    }
    .cb-sidebar {
      border-right: 2px solid var(--ink); background: var(--paper);
      overflow-y: auto; max-height: calc(100vh - 64px);
      position: sticky; top: 0; display: flex; flex-direction: column;
    }
    .cb-sidebar-inner { padding: 22px 18px 24px; flex: 1; display: flex; flex-direction: column; gap: 0; }
    .cb-header { margin-bottom: 0.75rem; }
    .cb-header h1 { font-family: 'Caveat', cursive; font-size: 2.25rem; font-weight: 700; margin: 0 0 0.1rem; line-height: 1; }
    .cb-header h1 em { color: var(--accent); font-style: italic; }
    .cb-sub { font-family: 'Kalam', cursive; font-size: 0.82rem; color: var(--ink-soft); margin: 0; line-height: 1.4; }
    /* section */
    .cb-section { padding: 0; }
    .cb-section-head {
      display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
      margin: 14px 0 8px; padding-bottom: 4px;
      border-bottom: 1.5px dashed var(--ink-ghost);
    }
    .cb-section-h {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600;
      letter-spacing: 2px; text-transform: uppercase; color: var(--ink-faint); margin: 0; flex: none;
    }
    .cb-section-status {
      font-family: 'Kalam', cursive; font-size: 12px; color: var(--ink-soft);
      flex: 1; text-align: right; letter-spacing: 0; text-transform: none;
    }
    .cb-status-on  { color: var(--accent); font-weight: 700; }
    .cb-status-not { color: var(--accent); }
    .cb-clear {
      font-family: 'Kalam', cursive; font-size: 11px; color: var(--ink-ghost);
      text-decoration: none; cursor: pointer; display: none; flex: none;
    }
    .cb-clear.visible { display: inline; }
    .cb-clear:hover { color: var(--accent); }
    /* search */
    .cb-search {
      width: 100%; padding: 4px 10px; margin-bottom: 8px;
      font-family: 'Kalam', cursive; font-size: 13px;
      border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink);
      outline: none;
    }
    .cb-search:focus { box-shadow: 2px 2px 0 var(--ink); }
    /* tag list + rows */
    .cb-tag-list { margin-bottom: 6px; }
    .cb-row {
      display: flex; align-items: center; gap: 9px;
      padding: 4px 8px; cursor: pointer; user-select: none;
      font-family: 'Kalam', cursive; font-size: 15px;
      line-height: 1.15; border-radius: 2px;
    }
    .cb-row:hover { background: var(--paper-2); }
    .cb-row[hidden] { display: none; }
    .cb-row[data-state="on"]  { background: var(--paper-2); }
    .cb-row[data-state="not"] .cb-name { text-decoration: line-through; color: var(--accent); }
    .cb-box {
      width: 14px; height: 14px; flex: none; border: 1.5px solid var(--ink);
      display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Kalam', cursive; font-size: 12px; line-height: 1; background: var(--paper);
    }
    .cb-row[data-state="on"]  .cb-box { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .cb-row[data-state="on"]  .cb-box::after { content: '✓'; }
    .cb-row[data-state="not"] .cb-box { background: var(--accent); color: var(--paper); border-color: var(--accent); }
    .cb-row[data-state="not"] .cb-box::after { content: '–'; }
    .cb-name { flex: 0 0 auto; }
    .cb-dots { flex: 1; border-bottom: 1.5px dotted var(--ink-ghost); transform: translateY(-3px); margin: 0 4px; }
    .cb-count { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-faint); }
    .cb-pinned-sep { border: none; border-bottom: 1px dashed var(--ink-ghost); margin: 6px 4px 4px; }
    /* year chips */
    .cb-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
    .cb-chip {
      font-family: 'Kalam', cursive; font-size: 13px;
      border: 1.5px solid var(--ink); padding: 2px 9px;
      cursor: pointer; user-select: none;
      background: var(--paper); color: var(--ink);
    }
    .cb-chip[data-state="on"]  { background: var(--ink); color: var(--paper); }
    .cb-chip[data-state="not"] { background: var(--paper); color: var(--accent); border-color: var(--accent); text-decoration: line-through; }
    /* logic toggle — any/all only */
    .cb-logic { display: flex; margin-top: 10px; border: 1.5px solid var(--ink); }
    .cb-logic-btn {
      flex: 1; padding: 4px 0; text-align: center;
      font-family: 'Kalam', cursive; font-size: 12px;
      letter-spacing: 1px; text-transform: lowercase; color: var(--ink);
      background: var(--paper); border: none; border-right: 1.5px solid var(--ink); cursor: pointer;
    }
    .cb-logic-btn:last-child { border-right: none; }
    .cb-logic-btn.active { background: var(--ink); color: var(--paper); }
    /* saved recipes */
    .cb-recipes { margin-top: auto; padding-top: 12px; border-top: 1.5px dashed var(--ink); }
    .cb-recipes-h { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 6px; }
    .cb-recipe-row {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 0; border-bottom: 1px dashed var(--ink-faint); cursor: pointer;
      font-family: 'Kalam', cursive; font-size: 0.82rem;
    }
    .cb-recipe-row:hover { color: var(--accent); }
    .cb-recipe-row:last-of-type { border-bottom: none; }
    .cb-recipe-n { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cb-recipe-cnt { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--ink-faint); flex: none; }
    .cb-recipe-del { font-size: 0.75rem; color: var(--ink-faint); background: none; border: none; cursor: pointer; padding: 0 2px; display: none; }
    .cb-recipe-row:hover .cb-recipe-del { display: inline; color: var(--accent); }
    .cb-recipe-album { font-size: 0.75rem; color: var(--ink-faint); background: none; border: none; cursor: pointer; padding: 0 2px; display: none; }
    .cb-recipe-row:hover .cb-recipe-album { display: inline; color: var(--accent); }
    .cb-recipe-add {
      font-family: 'Kalam', cursive; font-size: 0.78rem; color: var(--ink-faint);
      font-style: italic; margin-top: 6px; cursor: pointer; background: none; border: none;
      padding: 0; text-align: left;
    }
    .cb-recipe-add:hover { color: var(--accent); }
    /* main panel */
    .cb-main { display: flex; flex-direction: column; background: #fffdf7; }
    /* recipe bar */
    .cb-recipe-bar {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 14px 22px; border-bottom: 1.5px dashed var(--ink); flex: none;
    }
    .cb-pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1; min-width: 0; }
    .cb-empty-hint { font-family: 'Kalam', cursive; font-size: 0.82rem; color: var(--ink-faint); font-style: italic; }
    @keyframes cb-pill-in { from { opacity: 0; transform: scale(0.75); } to { opacity: 1; transform: scale(1); } }
    .cb-pill {
      display: inline-flex; align-items: center; gap: 4px;
      font-family: 'Kalam', cursive; font-size: 0.82rem;
      background: var(--ink); color: var(--paper);
      border: 1.5px solid var(--ink); border-radius: 999px; padding: 2px 10px;
      animation: cb-pill-in 0.12s ease both;
    }
    .cb-pill.not {
      background: var(--paper); color: var(--accent);
      border-color: var(--accent); text-decoration: line-through;
    }
    .cb-pill-x {
      font-size: 0.9rem; line-height: 1; cursor: pointer;
      background: none; border: none; color: inherit; padding: 0; margin: 0;
    }
    .cb-pill-op {
      font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
      color: var(--accent); letter-spacing: 0.05em; font-weight: 600;
    }
    .cb-save-btn, .cb-share-btn {
      font-family: 'Kalam', cursive; font-size: 0.82rem;
      background: var(--paper); color: var(--ink); border: 1.5px solid var(--ink);
      padding: 3px 12px; cursor: pointer; white-space: nowrap; flex: none;
    }
    .cb-save-btn:disabled, .cb-share-btn:disabled { opacity: 0.4; cursor: default; }
    .cb-save-btn:not(:disabled):hover, .cb-share-btn:not(:disabled):hover { background: var(--paper-2); }
    .cb-shared-banner {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 10px 22px; background: oklch(96% 0.04 220);
      border-bottom: 1.5px dashed var(--accent-cool);
      font-family: 'Kalam', cursive; font-size: 0.85rem; flex: none;
    }
    .cb-banner-warn { color: var(--danger); flex: 1; }
    .cb-banner-fork {
      font-family: 'Kalam', cursive; font-size: 0.82rem;
      background: var(--ink); color: var(--paper); border: 1.5px solid var(--ink);
      padding: 3px 12px; cursor: pointer; white-space: nowrap; margin-left: auto;
    }
    .cb-banner-fork:hover { opacity: 0.85; }
    .cb-recipe-share {
      font-size: 0.72rem; color: var(--ink-faint); background: none; border: none;
      cursor: pointer; padding: 0 2px; display: none;
    }
    .cb-recipe-row:hover .cb-recipe-share { display: inline; color: var(--accent); }
    /* result header */
    .cb-result-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 22px 8px; flex: none; flex-wrap: wrap; gap: 0.5rem;
    }
    .cb-result-head h3 { font-family: 'Caveat', cursive; font-size: 1.8rem; margin: 0; font-weight: 700; }
    .cb-result-head h3 em { color: var(--accent); font-style: normal; }
    .cb-sort-row { display: flex; gap: 10px; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-faint); letter-spacing: 0.1em; text-transform: uppercase; }
    .cb-sort-row select { font-family: 'Kalam', cursive; font-size: 0.82rem; letter-spacing: 0; padding: 2px 6px; border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink); text-transform: none; }
    /* result grid */
    .cb-grid { padding: 8px 22px 22px; flex: 1; overflow-y: auto; transition: opacity 0.12s; }
    .cb-grid.cb-loading { opacity: 0.6; pointer-events: none; }
    .cb-grid.view-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .cb-grid.view-grid6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
    .cb-grid.view-list  { display: flex; flex-direction: column; gap: 0; }
    .cb-grid.view-mosaic { display: grid; gap: 8px; grid-template-columns: repeat(4,1fr); }
    /* grid / mosaic tile */
    .cb-tile { overflow: hidden; position: relative; border: 1.5px solid var(--ink); cursor: pointer; }
    .cb-grid.view-grid4 .cb-tile,
    .cb-grid.view-grid6 .cb-tile { aspect-ratio: 1/1; }
    .cb-grid.view-mosaic .cb-tile:nth-child(5n+1) { grid-column: span 2; grid-row: span 2; }
    .cb-tile a { display: block; height: 100%; }
    .cb-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cb-tile-overlay {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(26,24,20,0.7));
      padding: 20px 8px 6px;
      font-family: 'Kalam', cursive; font-size: 0.72rem; color: var(--paper);
      opacity: 0; transition: opacity 0.15s;
    }
    .cb-tile:hover .cb-tile-overlay { opacity: 1; }
    /* list tile */
    .cb-grid.view-list .cb-tile {
      display: flex; align-items: center; gap: 10px;
      padding: 6px; border: none; border-bottom: 1px dashed var(--ink-faint);
      aspect-ratio: unset;
    }
    .cb-grid.view-list .cb-tile:last-child { border-bottom: none; }
    .cb-grid.view-list .cb-tile img { width: 60px; height: 60px; object-fit: cover; flex: none; border: 1.5px solid var(--ink); }
    .cb-list-meta { font-family: 'Kalam', cursive; font-size: 0.82rem; flex: 1; min-width: 0; }
    .cb-list-meta strong { font-weight: 700; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cb-list-meta small { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--ink-faint); }
    /* empty state */
    .cb-no-filter { padding: 3rem 22px; font-family: 'Kalam', cursive; font-size: 1rem; color: var(--ink-faint); font-style: italic; }
    .cb-no-results { padding: 3rem 22px; font-family: 'Kalam', cursive; font-size: 1rem; color: var(--ink-faint); font-style: italic; }
    /* save dialog */
    .cb-dialog-backdrop {
      position: fixed; inset: 0; z-index: 2000; display: flex;
      background: rgba(26,24,20,0.5); align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
    }
    .cb-dialog-backdrop.open { opacity: 1; pointer-events: auto; }
    .cb-dialog {
      background: var(--paper); border: 2px solid var(--ink);
      box-shadow: 6px 6px 0 var(--ink); padding: 1.5rem; min-width: 280px;
      transform: scale(0.94) translateY(-8px); transition: transform 0.15s;
    }
    .cb-dialog-backdrop.open .cb-dialog { transform: scale(1) translateY(0); }
    .cb-dialog h3 { font-family: 'Caveat', cursive; font-size: 1.5rem; margin: 0 0 0.75rem; font-weight: 700; }
    .cb-dialog input { width: 100%; margin-bottom: 0.875rem; padding: 0.4rem 0.6rem; font-family: 'Kalam', cursive; font-size: 0.95rem; border: 1.5px solid var(--ink); background: var(--paper); }
    .cb-dialog input:focus { outline: none; box-shadow: 2px 2px 0 var(--ink); }
    .cb-dialog-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }

    /* ── Bottom nav (mobile-only) ── */
    .bottom-nav-mobile { display: none; }

    /* ── Mobile responsive ── */
    @media (max-width: 640px) {
      /* Nav → compact app bar (top nav only, not the bottom nav) */
      nav:not(.bottom-nav-mobile) { padding: 10px 1rem; position: sticky; top: 0; z-index: 200; }
      .nav-right > a { display: none; }

      /* Main → reduce padding, space for fixed bottom nav */
      main { padding: 1.25rem 1rem 5.5rem; }

      /* Headings */
      h1 { font-size: 2rem; }
      h2 { font-size: 1.6rem; }
      .top-bar h1 { font-size: 2rem; }

      /* ── Bottom tab nav ── */
      .bottom-nav-mobile {
        display: grid; grid-template-columns: repeat(5, 1fr);
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 300;
        background: var(--paper); border-top: 1.5px solid var(--ink);
        padding: 6px 0 max(12px, env(safe-area-inset-bottom));
      }
      .bn-item {
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        font-family: 'Kalam', cursive; font-size: 11px; color: var(--ink-faint);
        text-decoration: none; padding: 4px 0;
      }
      .bn-ic {
        width: 24px; height: 24px; border: 1.5px solid currentColor; border-radius: 5px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 13px; font-family: 'Architects Daughter', cursive;
      }
      .bn-item.bn-on { color: var(--ink); }
      .bn-item.bn-on .bn-ic { background: var(--ink); color: var(--paper); }
      .bn-upload .bn-ic {
        width: 42px; height: 42px; border-radius: 50%;
        background: var(--ink); color: var(--paper); border: 2px solid var(--ink);
        font-size: 24px; font-family: 'Caveat', cursive; font-weight: 700; line-height: 1;
        transform: translateY(-8px); box-shadow: 2px 2px 0 rgba(26,24,20,0.35);
      }
      /* "more" menu */
      .bn-more-wrap { position: relative; display: flex; }
      .bn-more-btn { background: none; border: none; padding: 0; cursor: pointer; width: 100%; }
      @keyframes bn-more-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      .bn-more-menu {
        display: none; position: absolute; bottom: calc(100% + 6px); right: -2px;
        background: var(--paper); border: 1.5px solid var(--ink); box-shadow: 3px 3px 0 var(--ink);
        min-width: 130px; padding: 4px 0;
      }
      .bn-more-menu.open { display: block; animation: bn-more-in 0.12s ease; }
      .bn-more-item {
        display: flex; align-items: center; gap: 10px; padding: 9px 14px;
        text-decoration: none; color: var(--ink-faint);
        font-family: 'Kalam', cursive; font-size: 13px;
      }
      .bn-more-item .bn-ic { font-size: 12px; }
      .bn-more-item.bn-on { color: var(--ink); font-weight: 600; }
      .bn-more-item.bn-on .bn-ic { background: var(--ink); color: var(--paper); }

      /* ── Photo grid ── */
      .photo-grid { grid-template-columns: repeat(2, 1fr); }
      .photo-thumb img, .photo-card img { height: 130px; }

      /* ── Album books grid ── */
      .ab-grid { grid-template-columns: repeat(2, 1fr); gap: 1rem 1.5rem; padding: 1rem 0; }
      .ab-page-h { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
      .ab-page-h h1 { font-size: 2.5rem; }

      /* ── Album detail ── */
      .ad-head { grid-template-columns: 1fr; gap: 1rem; }
      .ad-cover { aspect-ratio: 16/9; }
      .ad-info h1 { font-size: 2.5rem; }
      .ad-mosaic { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 90px; }
      .ad-mosaic .ad-cell:nth-child(n) { grid-column: span 1; grid-row: span 1; }
      .ad-mosaic .ad-cell:nth-child(1) { grid-column: span 2; grid-row: span 2; }

      /* ── Timeline ── */
      .tl-hero { grid-template-columns: 1fr; }
      .tl-stats { display: none; }
      .tl-headline { font-size: 2.2rem; }
      .tl-entry { grid-template-columns: 64px 1fr; gap: 0.75rem; }
      .tl-grid.k1 { grid-template-rows: 160px; }
      .tl-grid.k2 { grid-template-rows: 120px; }
      .tl-grid.k3 { grid-template-rows: 110px; }
      .tl-grid.k4 { grid-template-columns: repeat(3, 1fr); grid-template-rows: 90px; }
      .tl-grid.k4 .tl-cell:first-child { grid-column: span 1; }
      .tl-grid.k5 { grid-template-columns: 1.5fr 1fr 1fr; grid-template-rows: 80px 80px; }

      /* ── Map: sidebar → compact filter strip above the map ── */
      .map-frame { grid-template-columns: 1fr; grid-template-rows: auto 1fr; margin: -1.25rem -1rem -5.5rem; }
      .map-side { border-right: none; border-bottom: 2px solid var(--ink); padding: 0.75rem 1rem; max-height: none; overflow-y: visible; }
      .map-side h1, .map-side .map-sub, .map-side-h, .map-place { display: none; }
      .map-loc-section { flex-direction: row; flex-wrap: wrap; align-items: center; }
      .map-loc-label { display: none; }
      .map-filter-form { flex-direction: row; flex-wrap: wrap; padding-bottom: 0; border-bottom: none; gap: 0.5rem; }
      .map-filter-form select { width: auto; flex: 1; min-width: 0; }
      .map-area, #map { min-height: calc(100vh - 180px); min-height: calc(100dvh - 180px); }
      .map-strip { left: 8px; right: 8px; bottom: 8px; }
      .map-strip-photos { grid-template-columns: repeat(4, 1fr); }

      /* ── Family wall ── */
      .wall-cols { grid-template-columns: 1fr; }
      .wall-side { display: none; }
      .wall-hero { grid-template-columns: repeat(2, 1fr); }
      .wall-hero-img { height: 130px; }
      .wall-mosaic {
        grid-template-columns: 2fr 1fr;
        grid-template-rows: 120px 120px 90px;
        grid-template-areas: "a b" "a c" "d e";
      }
      .wall-cell:nth-child(1) { grid-area: a; }
      .wall-cell:nth-child(2) { grid-area: b; }
      .wall-cell:nth-child(3) { grid-area: c; }
      .wall-cell:nth-child(4) { grid-area: d; }
      .wall-cell:nth-child(5) { grid-area: e; }
      .wall-cell:nth-child(n+6) { display: none; }

      /* ── Album access ── */
      .ac-body { grid-template-columns: 1fr; }
      .ac-main { border-right: none; padding-right: 0; padding-bottom: 1.5rem; border-bottom: 1.5px dashed var(--ink); }
      .ac-side { padding-left: 0; }
      .ac-head { grid-template-columns: 1fr; }
      .ac-head h1 { font-size: 2rem; }

      /* ── Users table ── */
      .ul-page-h { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
      .ul-page-h h1 { font-size: 2.5rem; }
      .ul-since { display: none; }
      .ul-acts { opacity: 1; }

      /* ── Misc ── */
      .form-col { max-width: 100%; }
      .card { padding: 1.25rem; }
      .bulk-bar { flex-wrap: wrap; }
      #bulk-actions { flex-direction: column !important; align-items: flex-start !important; gap: 0.5rem !important; }
      .filter-bar { gap: 0.5rem; }
    }

    /* ── Tag manage page ── */
    .tm-page { max-width: 1200px; margin: 0 auto; }
    .tm-stats { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1.5px dashed var(--ink-faint); }
    .tm-stat { padding: 16px 20px; border-right: 1.5px dashed var(--ink-faint); }
    .tm-stat:last-child { border-right: none; }
    .tm-stat .num { font-family:'Caveat',cursive; font-size:34px; font-weight:700; line-height:1; }
    .tm-stat .num em { color:var(--accent); font-style:normal; }
    .tm-stat .lbl { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1.5px; color:var(--ink-faint); margin-top:4px; }

    .tm-toolbar { padding:12px 20px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-bottom:1.5px dashed var(--ink-faint); }
    .tm-toolbar .tl { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:1.5px; color:var(--ink-faint); }
    .tm-search { font-family:'Kalam',cursive; font-size:14px; padding:5px 12px; border:1.5px solid var(--ink); background:var(--paper); min-width:200px; outline:none; }
    .tm-seg { display:flex; border:1.5px solid var(--ink); }
    .tm-seg a { font-family:'Kalam',cursive; font-size:13px; padding:4px 11px; background:var(--paper); border:none; border-right:1.5px solid var(--ink); cursor:pointer; text-decoration:none; color:var(--ink); }
    .tm-seg a:last-child { border-right:none; }
    .tm-seg a.on { background:var(--ink); color:var(--paper); }
    .tm-pill-toggle { font-family:'Kalam',cursive; font-size:13px; padding:3px 11px; border:1.5px solid var(--ink); border-radius:999px; background:var(--paper); cursor:pointer; text-decoration:none; display:inline-block; color:var(--ink); }
    .tm-pill-toggle.on { background:var(--ink); color:var(--paper); }

    .tm-bulk { padding:9px 20px; display:none; gap:10px; align-items:center; background:var(--paper-2); border-bottom:1.5px dashed var(--ink-faint); font-family:'Kalam',cursive; font-size:14px; }
    .tm-bulk.show { display:flex; }
    .tm-bulk .sel-count { font-family:'Caveat',cursive; font-size:18px; font-weight:700; }
    .tm-bulk .sel-count em { color:var(--accent); font-style:normal; }
    .tm-bulk-btn { font-family:'Kalam',cursive; font-size:13px; padding:3px 12px; border:1.5px solid var(--ink); background:var(--paper); cursor:pointer; }
    .tm-bulk-btn.danger { color:var(--danger); border-color:var(--danger); }

    .tm-table { width:100%; border-collapse:collapse; }
    .tm-table th { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1.5px; color:var(--ink-faint); text-align:left; padding:8px 14px; border-bottom:1.5px solid var(--ink); position:sticky; top:0; background:var(--paper); z-index:1; }
    .tm-table td { padding:9px 14px; border-bottom:1px dashed var(--ink-faint); vertical-align:middle; }
    .tm-table tr:hover td { background:var(--paper-2); }
    .tm-table tr.sel td { background:rgba(217,169,99,0.18); }
    .tm-table tr.unused td { color:var(--ink-faint); }
    .tm-ck { width:16px; height:16px; border:1.5px solid var(--ink); cursor:pointer; appearance:none; background:var(--paper); flex-shrink:0; }
    .tm-ck:checked { background:var(--ink); }
    .tm-cover { width:36px; height:36px; border:1.5px solid var(--ink); object-fit:cover; display:block; background:repeating-linear-gradient(135deg,rgba(0,0,0,0.06) 0 4px,transparent 4px 8px) var(--paper-2); }
    .tm-name { font-family:'Caveat',cursive; font-size:20px; font-weight:700; cursor:pointer; }
    .tm-name .hash { color:var(--accent); }
    .tm-alias { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--ink-faint); display:block; margin-top:1px; }
    .tm-kchip { font-family:'Kalam',cursive; font-size:11px; padding:2px 8px; border:1.5px solid var(--ink); border-radius:999px; white-space:nowrap; }
    .tm-kchip.people { background:oklch(94% 0.04 35); }
    .tm-kchip.places { background:oklch(94% 0.04 220); }
    .tm-kchip.years  { background:oklch(94% 0.04 90); }
    .tm-kchip.themes { background:var(--paper); }
    .tm-mono { font-family:'JetBrains Mono',monospace; font-size:12px; }
    .tm-avstack { display:inline-flex; }
    .tm-av { width:22px; height:22px; border-radius:50%; border:1.5px solid var(--ink); background:var(--paper-2); display:inline-flex; align-items:center; justify-content:center; font-family:'Caveat',cursive; font-size:12px; margin-left:-5px; }
    .tm-av:first-child { margin-left:0; }
    .tm-row-actions { display:flex; gap:4px; justify-content:flex-end; opacity:0; }
    tr:hover .tm-row-actions { opacity:1; }
    .tm-act { font-family:'Kalam',cursive; font-size:13px; padding:1px 8px; border:1.5px solid var(--ink); background:var(--paper); cursor:pointer; }
    .tm-act.danger { color:var(--danger); border-color:var(--danger); }
    .tm-pager { padding:12px 20px; display:flex; justify-content:space-between; align-items:center; font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--ink-soft); border-top:1.5px dashed var(--ink-faint); flex-wrap:wrap; gap:8px; }
    .tm-pager-btns { display:flex; gap:3px; }
    .tm-pager-btns a { font-family:'Caveat',cursive; font-size:15px; padding:1px 9px; border:1.5px solid var(--ink); background:var(--paper); text-decoration:none; color:var(--ink); }
    .tm-pager-btns a.on { background:var(--ink); color:var(--paper); }
    .tm-pager-btns a.disabled { opacity:.4; pointer-events:none; }

    /* Tag manage drawer */
    .tm-backdrop { display:none; position:fixed; inset:0; z-index:150; }
    .tm-backdrop.show { display:block; }
    .tm-drawer { position:fixed; top:0; right:0; bottom:0; width:380px; background:var(--paper); border-left:2px solid var(--ink); box-shadow:-4px 0 0 rgba(0,0,0,0.04); padding:20px; overflow-y:auto; z-index:200; display:flex; flex-direction:column; gap:14px; transform:translateX(100%); transition:transform .2s ease; }
    .tm-drawer.open { transform:translateX(0); }
    .tm-drawer-close { align-self:flex-end; font-family:'Caveat',cursive; font-size:20px; border:1.5px solid var(--ink); background:var(--paper); width:30px; height:30px; border-radius:50%; cursor:pointer; }
    .tm-drawer h3 { font-family:'Caveat',cursive; font-size:34px; margin:0; font-weight:700; }
    .tm-drawer h3 .hash { color:var(--accent); }
    .tm-drawer .df { display:flex; flex-direction:column; gap:4px; }
    .tm-drawer .df label { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1.5px; color:var(--ink-faint); }
    .tm-drawer .df input, .tm-drawer .df select, .tm-drawer .df textarea { font-family:'Kalam',cursive; font-size:14px; padding:6px 10px; border:1.5px solid var(--ink); background:var(--paper); outline:none; }
    .tm-dz { border-top:1.5px dashed var(--danger); padding-top:10px; margin-top:auto; }
    .tm-dz h4 { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1.5px; color:var(--danger); margin:0 0 8px; }
    .tm-dz-btn { font-family:'Kalam',cursive; font-size:14px; padding:3px 12px; border:1.5px solid var(--danger); color:var(--danger); background:var(--paper); cursor:pointer; }
    .tm-toast { position:fixed; bottom:20px; right:20px; font-family:'JetBrains Mono',monospace; font-size:12px; background:var(--ink); color:var(--paper); padding:6px 14px; border-radius:3px; opacity:0; transition:opacity .2s; z-index:300; pointer-events:none; }
    .tm-toast.show { opacity:1; }
    .tm-alias-pills { display:flex; flex-wrap:wrap; gap:6px; }
    .tm-alias-pill { font-family:'Kalam',cursive; font-size:12px; padding:2px 8px; border:1.5px solid var(--ink); border-radius:999px; background:var(--ink); color:var(--paper); display:inline-flex; align-items:center; gap:4px; }
    .tm-alias-add { font-family:'Kalam',cursive; font-size:12px; padding:2px 8px; border:1.5px solid var(--ink); border-radius:999px; background:var(--paper); cursor:pointer; }

    /* Recipes page */
    .tr-page { max-width:1200px; margin:0 auto; }
    .tr-filter { padding:12px 20px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-bottom:1.5px dashed var(--ink-faint); }
    .tr-filter .tl { font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:1.5px; color:var(--ink-faint); }
    .tr-search { font-family:'Kalam',cursive; font-size:14px; padding:5px 12px; border:1.5px solid var(--ink); background:var(--paper); min-width:200px; outline:none; }
    .tr-seg { display:flex; border:1.5px solid var(--ink); }
    .tr-seg a { font-family:'Kalam',cursive; font-size:13px; padding:4px 11px; background:var(--paper); border:none; border-right:1.5px solid var(--ink); cursor:pointer; text-decoration:none; color:var(--ink); }
    .tr-seg a:last-child { border-right:none; }
    .tr-seg a.on { background:var(--ink); color:var(--paper); }
    .tr-sec-h { padding:18px 20px 8px; font-family:'Caveat',cursive; font-size:26px; font-weight:700; display:flex; align-items:baseline; gap:10px; border-top:1.5px dashed var(--ink-faint); }
    .tr-sec-h:first-of-type { border-top:none; }
    .tr-sec-count { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--ink-faint); }
    .tr-cards { padding:8px 20px 20px; display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
    .tr-card { border:2px solid var(--ink); background:var(--paper); box-shadow:4px 4px 0 var(--ink); display:flex; flex-direction:column; position:relative; transition:transform .12s; }
    .tr-card:nth-child(odd) { transform:rotate(-0.4deg); }
    .tr-card:nth-child(even) { transform:rotate(0.4deg); }
    .tr-card:hover { transform:rotate(0deg) translateY(-2px); }
    .tr-star { position:absolute; top:-10px; left:14px; font-family:'Caveat',cursive; font-size:22px; background:var(--accent); color:var(--paper); width:28px; height:28px; border:1.5px solid var(--ink); border-radius:50%; display:flex; align-items:center; justify-content:center; transform:rotate(-8deg); cursor:pointer; z-index:1; }
    .tr-star.unpinned { background:var(--paper); color:var(--ink-faint); }
    .tr-covers { display:grid; grid-template-columns:2fr 1fr; grid-template-rows:1fr 1fr; gap:2px; height:120px; border-bottom:1.5px solid var(--ink); }
    .tr-covers .tc { background:repeating-linear-gradient(135deg,rgba(0,0,0,0.06) 0 4px,transparent 4px 8px) var(--paper-2); }
    .tr-covers .tc:first-child { grid-row:span 2; }
    .tr-covers .tc img { width:100%; height:100%; object-fit:cover; display:block; }
    .tr-card-body { padding:12px 14px 10px; display:flex; flex-direction:column; gap:7px; }
    .tr-card-body h3 { font-family:'Caveat',cursive; font-size:26px; margin:0; line-height:1.1; font-weight:700; }
    .tr-pills { display:flex; flex-wrap:wrap; gap:3px; align-items:center; }
    .tr-pill { font-family:'Kalam',cursive; font-size:11px; padding:2px 7px; border:1.5px solid var(--ink); border-radius:999px; }
    .tr-pill.inc { background:var(--ink); color:var(--paper); }
    .tr-pill.exc { background:var(--paper); color:var(--accent); text-decoration:line-through; border-color:var(--accent); }
    .tr-op { font-family:'JetBrains Mono',monospace; font-size:9px; color:var(--accent); letter-spacing:1px; }
    .tr-by { font-family:'Kalam',cursive; font-size:12px; color:var(--ink-soft); }
    .tr-meta { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--ink-faint); display:flex; justify-content:space-between; }
    .tr-meta b { font-family:'Caveat',cursive; font-size:15px; color:var(--accent); font-weight:700; }
    .tr-card-footer { display:flex; gap:5px; padding:9px 12px; border-top:1.5px dashed var(--ink); background:var(--paper-2); }
    .tr-card-footer a, .tr-card-footer button { font-family:'Kalam',cursive; font-size:14px; padding:2px 9px 0; border:1.5px solid var(--ink); background:var(--paper); cursor:pointer; text-decoration:none; color:var(--ink); }
    .tr-card-footer .primary { background:var(--ink); color:var(--paper); flex:1; text-align:center; }
    .tr-card-footer .icon { min-width:32px; text-align:center; }
    .tr-card-footer .danger { color:var(--danger); border-color:var(--danger); }
    .tr-empty-card { border:2px dashed var(--ink); background:transparent; box-shadow:none; transform:rotate(0) !important; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:200px; cursor:pointer; text-decoration:none; color:var(--ink); }
    .tr-empty-card:hover { background:var(--paper); }
    .tr-list { padding:0 20px 20px; }
    .tr-row { display:grid; grid-template-columns:36px 1fr 1fr 80px 110px 120px; gap:10px; align-items:center; padding:10px 4px; border-bottom:1px dashed var(--ink-faint); font-family:'Kalam',cursive; font-size:14px; }
    .tr-row:hover { background:var(--paper-2); }
    .tr-row .star-btn { font-family:'Caveat',cursive; font-size:18px; background:none; border:none; cursor:pointer; color:var(--accent); padding:0; text-align:center; width:100%; }
    .tr-row .star-btn.muted { color:var(--ink-faint); }
    .tr-row .rname { font-family:'Caveat',cursive; font-size:20px; font-weight:700; }
    .tr-row .mono { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--ink-faint); }
    .tr-row-actions { display:flex; gap:3px; justify-content:flex-end; }
    .tr-row-actions a, .tr-row-actions button { font-family:'Kalam',cursive; font-size:12px; padding:1px 7px; border:1.5px solid var(--ink); background:var(--paper); cursor:pointer; text-decoration:none; color:var(--ink); }
    .tr-row-actions .primary { background:var(--ink); color:var(--paper); }
    .tr-row-actions .danger { color:var(--danger); border-color:var(--danger); }
    .tr-empty { padding:40px 20px; text-align:center; font-family:'Caveat',cursive; font-size:22px; color:var(--ink-faint); }
    .tr-shared-from { font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:1px; text-transform:uppercase; background:oklch(90% 0.06 220); color:oklch(40% 0.1 220); padding:3px 10px; text-align:center; }
    .tr-row-owner { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--accent-cool); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tr-row-dup { background: oklch(97% 0.04 35); }
    .tr-dup-badge { font-family:'JetBrains Mono',monospace; font-size:9px; color:var(--danger); letter-spacing:1px; text-transform:uppercase; vertical-align:middle; }
    .tr-share-modal-backdrop { display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,.45); align-items:center; justify-content:center; }
    .tr-share-modal { background:var(--paper); border:2px solid var(--ink); padding:24px; min-width:320px; max-width:400px; width:90%; }
    .tr-share-results { display:flex; flex-direction:column; gap:4px; max-height:200px; overflow-y:auto; }
    .tr-share-user { font-family:'Kalam',cursive; font-size:14px; padding:8px 12px; border:1.5px solid var(--ink-faint); background:var(--paper); cursor:pointer; text-align:left; }
    .tr-share-user:hover { background:var(--paper-2); border-color:var(--ink); }
    .tr-share-none { font-family:'Kalam',cursive; font-size:13px; color:var(--ink-faint); padding:8px 0; }

    @media (max-width: 900px) {
      .cb-layout { grid-template-columns: 1fr; margin: -1.25rem -1rem -5.5rem; }
      .cb-sidebar { position: static; max-height: none; border-right: none; border-bottom: 2px solid var(--ink); overflow-y: visible; }
      .cb-grid.view-grid4, .cb-grid.view-grid6 { grid-template-columns: repeat(2, 1fr); }
      .cb-grid.view-mosaic { grid-template-columns: repeat(2, 1fr); }
      .cb-grid.view-mosaic .cb-tile:nth-child(5n+1) { grid-column: span 1; grid-row: span 1; }

      /* collapsible sidebar sections on mobile */
      .cb-section-head { cursor: pointer; }
      .cb-section-h::after { content: ' ▾'; font-size: 0.6em; display: inline-block; transition: transform 0.15s; }
      .cb-section.cb-collapsed .cb-section-h::after { transform: rotate(-90deg); }
      .cb-section .cb-search,
      .cb-section .cb-tag-list,
      .cb-section .cb-chips,
      .cb-section .cb-logic { overflow: hidden; max-height: 600px; transition: max-height 0.22s ease; }
      .cb-section.cb-collapsed .cb-search,
      .cb-section.cb-collapsed .cb-tag-list,
      .cb-section.cb-collapsed .cb-chips,
      .cb-section.cb-collapsed .cb-logic { max-height: 0; }
      .tr-cards { grid-template-columns: repeat(2,1fr); }
      .tm-stats { grid-template-columns: repeat(2,1fr); }
      .tr-row { grid-template-columns: 36px 1fr 80px 100px; }
      .tr-row .tr-pills, .tr-row .mono:not(.n) { display: none; }
      .tm-drawer { width: 100%; }
    }
    @media (max-width: 600px) {
      .tr-cards { grid-template-columns: 1fr; }
    }
  </style>
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
</body>
</html>`;
}

module.exports = { page, esc };
