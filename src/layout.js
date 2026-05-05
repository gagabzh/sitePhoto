function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, body, session) {
  const nav = session ? `
    <nav>
      <strong><a href="/">sitephoto</a></strong>
      <div class="nav-right">
        ${session.role === 'admin' ? '<a href="/admin/users">Users</a>' : ''}
        ${session.role !== 'viewer' ? '<a href="/photos">Photos</a>' : ''}
        ${session.role !== 'viewer' ? '<a href="/albums">Albums</a>' : ''}
        <a href="/account/password">My account</a>
        <form method="POST" action="/logout">
          <button class="btn-nav">Logout</button>
        </form>
      </div>
    </nav>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)} — sitephoto</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: sans-serif; margin: 0; background: #f5f5f5; color: #222; }
    nav { background: #1a1a1a; color: white; padding: 0.8rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    nav a { color: white; text-decoration: none; font-size: 0.95rem; }
    nav a:hover { text-decoration: underline; }
    nav strong a { font-size: 1.1rem; }
    .nav-right { display: flex; gap: 1.5rem; align-items: center; }
    .btn-nav { background: none; border: 1px solid #888; color: white; padding: 0.25rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    .btn-nav:hover { border-color: white; }
    main { max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; }
    h1 { margin-top: 0; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #fafafa; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
    tr:last-child td { border-bottom: none; }
    .actions { display: flex; gap: 0.4rem; }
    .btn { display: inline-block; padding: 0.45rem 1rem; background: #1a1a1a; color: white; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 0.9rem; }
    .btn:hover { background: #333; }
    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
    .btn-secondary { background: #666; }
    .btn-secondary:hover { background: #444; }
    .btn-danger { background: #b00; }
    .btn-danger:hover { background: #900; }
    .btn-icon { display:inline-flex; align-items:center; justify-content:center; padding:0.35rem 0.6rem; }
    .btn-icon svg { width:1rem; height:1rem; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .btn-sm.btn-icon { padding:0.2rem 0.4rem; }
    .btn-sm.btn-icon svg { width:0.85rem; height:0.85rem; }
    form.inline { display: inline; }
    .form-col { display: flex; flex-direction: column; gap: 1rem; max-width: 400px; }
    label { font-size: 0.9rem; font-weight: 500; display: flex; flex-direction: column; gap: 0.3rem; }
    input, select { padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; width: 100%; }
    input:focus, select:focus { outline: 2px solid #1a1a1a; border-color: transparent; }
    .row { display: flex; gap: 0.75rem; }
    .msg-error { color: #b00; background: #fff0f0; border: 1px solid #fcc; padding: 0.6rem 1rem; border-radius: 4px; font-size: 0.9rem; }
    .msg-success { color: #060; background: #f0fff0; border: 1px solid #cfc; padding: 0.6rem 1rem; border-radius: 4px; font-size: 0.9rem; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge-admin { background: #1a1a1a; color: white; }
    .badge-editor { background: #3b82f6; color: white; }
    .badge-viewer { background: #e5e7eb; color: #555; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.25rem; }
    .photo-card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .photo-card a { text-decoration: none; color: inherit; }
    .photo-card img { width: 100%; height: 180px; object-fit: cover; display: block; }
    .photo-meta { padding: 0.75rem; }
    .photo-meta strong { display: block; margin-bottom: 0.2rem; }
    .uploader { color: #888; font-size: 0.8rem; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.5rem; }
    .tag { background: #f0f0f0; border-radius: 20px; padding: 0.15rem 0.6rem; font-size: 0.75rem; color: #555; }
    textarea { padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; width: 100%; font-family: inherit; }
    textarea:focus { outline: 2px solid #1a1a1a; border-color: transparent; }
    .album-card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-decoration: none; color: inherit; display: block; }
    .album-cover { width: 100%; height: 160px; object-fit: cover; display: block; }
    .album-cover-empty { width: 100%; height: 160px; background: #e8e8e8; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 2rem; }
    .album-meta { padding: 0.85rem; }
    .album-meta strong { display: block; margin-bottom: 0.2rem; font-size: 1rem; }
    .album-meta small { color: #888; font-size: 0.8rem; }
  </style>
</head>
<body>
  ${nav}
  <main>${body}</main>
</body>
</html>`;
}

module.exports = { page, esc };
