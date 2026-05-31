const { photoThumb, selectionBar, selectionScript, lbOverlay, lbScript } = require('../components');

// ── photoThumb ────────────────────────────────────────────────────────────────

describe('photoThumb', () => {
  it('renders photo link and thumbnail', () => {
    const html = photoThumb({ id: 1, filename: 'test.jpg', title: 'A Photo' });
    expect(html).toContain('href="/photos/1"');
    expect(html).toContain('src="/uploads/test.jpg"');
    expect(html).toContain('alt="A Photo"');
  });

  it('renders as plain thumb (no selection chrome) when owns=false', () => {
    const html = photoThumb({ id: 1, filename: 'a.jpg', title: 'T' });
    expect(html).not.toContain('sel-tile');
    expect(html).not.toContain('hovercheck');
    expect(html).not.toContain('sel-cbox');
  });

  it('renders sel-tile with selection chrome when owns=true', () => {
    const html = photoThumb({ id: 42, filename: 'a.jpg', title: 'T' }, { owns: true });
    expect(html).toContain('sel-tile');
    expect(html).toContain('data-photo-id="42"');
    expect(html).toContain('data-href="/photos/42"');
    expect(html).toContain('class="hovercheck"');
    expect(html).toContain('class="press-ring"');
    expect(html).toContain('class="sel-cbox"');
  });

  it('escapes HTML in title', () => {
    const html = photoThumb({ id: 1, filename: 'f.jpg', title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in filename', () => {
    const html = photoThumb({ id: 1, filename: 'a"b.jpg', title: 'T' });
    expect(html).toContain('&quot;');
  });

  it('escapes title in sel-cbox aria-label when owns=true', () => {
    const html = photoThumb({ id: 1, filename: 'f.jpg', title: '<b>bold</b>' }, { owns: true });
    expect(html).not.toContain('aria-label="<b>bold</b>"');
    expect(html).toContain('&lt;b&gt;');
  });
});

// ── selectionBar ─────────────────────────────────────────────────────────────

describe('selectionBar', () => {
  it('renders #sel-bar container', () => {
    const html = selectionBar();
    expect(html).toContain('id="sel-bar"');
    expect(html).toContain('class="sel-bar"');
  });

  it('renders row 1 with master checkbox, count pill, all/none/invert, done', () => {
    const html = selectionBar();
    expect(html).toContain('id="sel-master"');
    expect(html).toContain('id="sel-count"');
    expect(html).toContain('id="sel-of-n"');
    expect(html).toContain('id="sel-all"');
    expect(html).toContain('id="sel-none"');
    expect(html).toContain('id="sel-invert"');
    expect(html).toContain('id="sel-done"');
  });

  it('renders keyboard hint with Shift and Esc', () => {
    const html = selectionBar();
    expect(html).toContain('sel-kbd-hint');
    expect(html).toContain('Esc');
  });

  it('renders row 2 with download button always present', () => {
    const html = selectionBar();
    expect(html).toContain('id="sel-download-btn"');
  });

  it('does not render tag controls when showTag is false', () => {
    const html = selectionBar();
    expect(html).not.toContain('sel-tag-mode-add');
    expect(html).not.toContain('sel-tag-input');
    expect(html).not.toContain('sel-apply-btn');
  });

  it('renders tag controls when showTag is true', () => {
    const html = selectionBar({ showTag: true, tagAction: '/photos/bulk-tag', untagAction: '/photos/bulk-untag' });
    expect(html).toContain('id="sel-tag-mode-add"');
    expect(html).toContain('id="sel-tag-mode-remove"');
    expect(html).toContain('id="sel-tag-input"');
    expect(html).toContain('id="sel-apply-btn"');
    expect(html).toContain('sel-tag-datalist');
  });

  it('sets formaction and data-action attrs on apply button', () => {
    const html = selectionBar({ showTag: true, tagAction: '/photos/bulk-tag', untagAction: '/photos/bulk-untag' });
    expect(html).toContain('formaction="/photos/bulk-tag"');
    expect(html).toContain('data-tag-action="/photos/bulk-tag"');
    expect(html).toContain('data-untag-action="/photos/bulk-untag"');
  });

  it('renders remove-from-album button when removeAction is set', () => {
    const html = selectionBar({ removeAction: '/albums/5/photos/bulk-remove' });
    expect(html).toContain('id="sel-remove-btn"');
    expect(html).toContain('formaction="/albums/5/photos/bulk-remove"');
  });

  it('does not render remove button when removeAction is absent', () => {
    const html = selectionBar();
    expect(html).not.toContain('sel-remove-btn');
  });

  it('renders delete button with count span when deleteAction is set', () => {
    const html = selectionBar({ deleteAction: '/photos/bulk-delete' });
    expect(html).toContain('id="sel-delete-btn"');
    expect(html).toContain('formaction="/photos/bulk-delete"');
    expect(html).toContain('id="sel-delete-count"');
  });

  it('does not render delete button when deleteAction is absent', () => {
    const html = selectionBar();
    expect(html).not.toContain('sel-delete-btn');
  });

  it('escapes HTML in action URLs', () => {
    const html = selectionBar({ removeAction: '/path?a=1&b=2' });
    expect(html).toContain('&amp;');
    expect(html).not.toContain('?a=1&b=2"');
  });

  it('renders master checkbox with aria attributes', () => {
    const html = selectionBar();
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('tabindex="0"');
  });
});

// ── selectionScript ───────────────────────────────────────────────────────────

describe('selectionScript', () => {
  it('returns a script tag string', () => {
    const s = selectionScript();
    expect(s).toContain('<script>');
    expect(s).toContain('</script>');
  });

  it('references all key DOM element IDs', () => {
    const s = selectionScript();
    expect(s).toContain('sel-bar');
    expect(s).toContain('sel-select-btn');
    expect(s).toContain('sel-done');
    expect(s).toContain('sel-master');
    expect(s).toContain('sel-count');
    expect(s).toContain('sel-all');
    expect(s).toContain('sel-none');
    expect(s).toContain('sel-invert');
    expect(s).toContain('sel-delete-btn');
    expect(s).toContain('sel-download-btn');
  });

  it('queries sel-tile elements', () => {
    const s = selectionScript();
    expect(s).toContain('.sel-tile');
    expect(s).toContain('photoId');  // dataset.photoId reads the data-photo-id attribute
  });

  it('implements long-press with LONG_MS=450', () => {
    const s = selectionScript();
    expect(s).toContain('LONG_MS=450');
    expect(s).toContain('pointerdown');
    expect(s).toContain('pointerup');
  });

  it('handles keyboard shortcuts (Esc, Ctrl+A)', () => {
    const s = selectionScript();
    expect(s).toContain('Escape');
    expect(s).toContain("'a'");
    expect(s).toContain('metaKey');
    expect(s).toContain('ctrlKey');
  });

  it('injects hidden photo_ids before form submit', () => {
    const s = selectionScript();
    expect(s).toContain('data-sel-form');
    expect(s).toContain('photo_ids');
    expect(s).toContain('sel-hidden');
  });

  it('handles shift+click range selection', () => {
    const s = selectionScript();
    expect(s).toContain('shiftKey');
    expect(s).toContain('rangeSelectTo');
  });

  it('includes coachmark with localStorage persistence', () => {
    const s = selectionScript();
    expect(s).toContain('sel-coachmark');
    expect(s).toContain('sel-coached');
    expect(s).toContain('localStorage');
  });

  it('fetches tag autocomplete from /api/tags/index', () => {
    const s = selectionScript();
    expect(s).toContain('/api/tags/index');
    expect(s).toContain('sel-tag-datalist');
  });

  it('exposes window.registerSelTiles for lazy-loaded tile registration', () => {
    const s = selectionScript();
    expect(s).toContain('registerSelTiles');
    expect(s).toContain('setupTile');
  });
});

// ── lbOverlay ─────────────────────────────────────────────────────────────────

describe('lbOverlay', () => {
  it('returns the lightbox overlay HTML with all required elements', () => {
    const html = lbOverlay();
    expect(html).toContain('id="lightbox"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Photo viewer"');
    expect(html).toContain('id="lb-close"');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('id="lb-prev"');
    expect(html).toContain('aria-label="Previous photo"');
    expect(html).toContain('id="lb-next"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain('id="lb-img"');
    expect(html).toContain('id="lb-caption"');
    expect(html).toContain('id="lb-counter"');
  });
});

// ── lbScript ──────────────────────────────────────────────────────────────────

describe('lbScript', () => {
  it('returns a script tag string', () => {
    const s = lbScript();
    expect(s).toContain('<script>');
    expect(s).toContain('</script>');
  });

  it('references the lightbox DOM element ids', () => {
    const s = lbScript();
    expect(s).toContain('lb-img');
    expect(s).toContain('lb-close');
    expect(s).toContain('lb-prev');
    expect(s).toContain('lb-next');
    expect(s).toContain('lb-caption');
    expect(s).toContain('lb-counter');
  });

  it('handles keyboard navigation keys', () => {
    const s = lbScript();
    expect(s).toContain('Escape');
    expect(s).toContain('ArrowLeft');
    expect(s).toContain('ArrowRight');
  });

  it('uses LB_PHOTOS array and data-lb-index attributes', () => {
    const s = lbScript();
    expect(s).toContain('LB_PHOTOS');
    expect(s).toContain('data-lb-index');
  });
});
