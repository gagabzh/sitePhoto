const { photoThumb, bulkBar, bulkScript, lbOverlay, lbScript } = require('../components');

// ── photoThumb ────────────────────────────────────────────────────────────────

describe('photoThumb', () => {
  it('renders photo link and thumbnail', () => {
    const html = photoThumb({ id: 1, filename: 'test.jpg', title: 'A Photo' });
    expect(html).toContain('href="/photos/1"');
    expect(html).toContain('src="/uploads/test.jpg"');
    expect(html).toContain('alt="A Photo"');
  });

  it('omits checkbox by default (owns=false)', () => {
    const html = photoThumb({ id: 1, filename: 'a.jpg', title: 'T' });
    expect(html).not.toContain('checkbox');
    expect(html).not.toContain('photo_ids');
  });

  it('includes checkbox with photo id when owns=true', () => {
    const html = photoThumb({ id: 42, filename: 'a.jpg', title: 'T' }, { owns: true });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="photo_ids"');
    expect(html).toContain('value="42"');
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
});

// ── bulkBar ───────────────────────────────────────────────────────────────────

describe('bulkBar', () => {
  it('renders select-all checkbox and bulk-actions container', () => {
    const html = bulkBar();
    expect(html).toContain('id="select-all"');
    expect(html).toContain('id="bulk-actions"');
  });

  it('renders with no optional sections by default', () => {
    const html = bulkBar();
    expect(html).not.toContain('Apply tag');
    expect(html).not.toContain('Remove from album');
    expect(html).not.toContain('Delete selected');
  });

  it('renders tag input and apply button when showTag is true', () => {
    const html = bulkBar({ showTag: true });
    expect(html).toContain('Apply tag');
    expect(html).toContain('name="tag"');
    expect(html).toContain('placeholder="e.g. Paris"');
  });

  it('renders remove button with correct formaction when removeAction is set', () => {
    const html = bulkBar({ removeAction: '/albums/5/remove-photos' });
    expect(html).toContain('Remove from album');
    expect(html).toContain('formaction="/albums/5/remove-photos"');
  });

  it('renders delete button with correct formaction when deleteAction is set', () => {
    const html = bulkBar({ deleteAction: '/photos/delete-many' });
    expect(html).toContain('Delete selected');
    expect(html).toContain('formaction="/photos/delete-many"');
  });

  it('escapes HTML in action URLs', () => {
    const html = bulkBar({ removeAction: '/path?a=1&b=2' });
    expect(html).toContain('&amp;');
    expect(html).not.toContain('?a=1&b=2"');
  });

  it('renders all three optional sections together', () => {
    const html = bulkBar({ showTag: true, removeAction: '/remove', deleteAction: '/delete' });
    expect(html).toContain('Apply tag');
    expect(html).toContain('Remove from album');
    expect(html).toContain('Delete selected');
  });
});

// ── bulkScript ────────────────────────────────────────────────────────────────

describe('bulkScript', () => {
  it('returns a script tag string', () => {
    const s = bulkScript();
    expect(s).toContain('<script>');
    expect(s).toContain('</script>');
  });

  it('references the expected DOM element ids', () => {
    const s = bulkScript();
    expect(s).toContain('bulk-actions');
    expect(s).toContain('select-all');
    expect(s).toContain('photo_ids');
  });
});

// ── lbOverlay ─────────────────────────────────────────────────────────────────

describe('lbOverlay', () => {
  it('returns the lightbox overlay HTML with all required elements', () => {
    const html = lbOverlay();
    expect(html).toContain('id="lb"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="lb-close"');
    expect(html).toContain('id="lb-prev"');
    expect(html).toContain('id="lb-next"');
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

  it('handles data-lb-src attributes', () => {
    const s = lbScript();
    expect(s).toContain('data-lb-src');
    expect(s).toContain('data-lb-title');
  });
});
