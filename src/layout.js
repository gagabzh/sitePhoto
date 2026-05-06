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
        ${session.role === 'admin' ? '<a href="/admin/users">Users</a>' : ''}
        ${session.role !== 'viewer' ? '<a href="/photos">Photos</a>' : ''}
        <a href="/albums">Albums</a>
        <a href="/tags">Tags</a>
        <a href="/timeline">Timeline</a>
        <a href="/map">Map</a>
        <a href="/account/password">Account</a>
        <form method="POST" action="/logout">
          <button class="btn-nav">Logout</button>
        </form>
        <span class="nav-avatar">${initial}</span>
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
      flex-wrap: wrap;
    }
    .nav-right a { color: var(--ink); text-decoration: none; }
    .nav-right a:hover { border-bottom: 1.5px solid var(--ink); }
    .btn-nav {
      background: none; border: 1.5px solid var(--ink);
      color: var(--ink); padding: 3px 12px;
      cursor: pointer; font-family: 'Kalam', cursive; font-size: 0.9rem;
    }
    .btn-nav:hover { background: var(--paper-2); }
    .nav-avatar {
      width: 28px; height: 28px; border: 1.5px solid var(--ink);
      border-radius: 50%; background: var(--paper-2);
      display: inline-flex; align-items: center; justify-content: center;
      font-family: 'Caveat', cursive; font-size: 1rem; font-weight: 700;
      flex: none;
    }

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
    .photo-card-selectable:has(input:checked) .photo-thumb img { outline: 3px solid var(--ink); }

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

    /* ── Timeline ── */
    .timeline-month {
      font-family: 'Caveat', cursive; font-size: 1.8rem; font-weight: 700;
      margin: 2rem 0 0.75rem; padding-bottom: 0.4rem;
      border-bottom: 1.5px dashed var(--ink); color: var(--ink);
    }
    .timeline-month:first-child { margin-top: 0; }

    /* ── EXIF metadata ── */
    .photo-exif {
      display: grid; grid-template-columns: max-content 1fr;
      gap: 0.2rem 0.75rem; margin: 0.75rem 0 0;
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
    }
    .photo-exif dt { color: var(--ink-faint); }
    .photo-exif dd { margin: 0; color: var(--ink-soft); }
  </style>
</head>
<body>
  ${nav}
  <main>${body}</main>
</body>
</html>`;
}

module.exports = { page, esc };
