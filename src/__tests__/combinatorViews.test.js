const { renderSection, renderPills, renderGrid } = require('../routes/tags/combinatorViews');

// Default empty section state
const emptyState = () => ({ on: [], not: [], logic: 'any' });

// ── renderSection — people (row-based) ───────────────────────────────────────

describe('renderSection — people', () => {
  const tags = [
    { name: 'alice', count: 10 },
    { name: 'bob',   count: 5  },
    { name: 'carol', count: 2  },
  ];

  it('renders .cb-section wrapper with data-section attribute', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).toContain('class="cb-section"');
    expect(html).toContain('data-section="people"');
  });

  it('renders a .cb-row per tag with required data attributes', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).toContain('data-tag="alice"');
    expect(html).toContain('data-tag="bob"');
    expect(html).toContain('data-count="10"');
    expect(html).toContain('data-count="5"');
  });

  it('renders .cb-box, .cb-name, .cb-dots, .cb-count inside each row', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).toContain('class="cb-box"');
    expect(html).toContain('class="cb-name"');
    expect(html).toContain('class="cb-dots"');
    expect(html).toContain('class="cb-count"');
  });

  it('sets data-state="off" for unselected tags', () => {
    const html = renderSection('people', tags, emptyState());
    const offCount = (html.match(/data-state="off"/g) || []).length;
    expect(offCount).toBe(3);
  });

  it('sets data-state="on" for tags in ss.on', () => {
    const ss = { on: ['alice'], not: [], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).toMatch(/data-state="on"[^>]*data-tag="alice"/);
  });

  it('sets data-state="not" for tags in ss.not', () => {
    const ss = { on: [], not: ['bob'], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).toMatch(/data-state="not"[^>]*data-tag="bob"/);
  });

  it('pins selected rows before unselected with .cb-pinned-sep separator', () => {
    const ss = { on: ['alice'], not: [], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).toContain('class="cb-pinned-sep"');
    const aliceIdx = html.indexOf('data-tag="alice"');
    const sepIdx   = html.indexOf('cb-pinned-sep');
    const bobIdx   = html.indexOf('data-tag="bob"');
    expect(aliceIdx).toBeLessThan(sepIdx);
    expect(sepIdx).toBeLessThan(bobIdx);
  });

  it('omits .cb-pinned-sep when nothing is selected', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).not.toContain('cb-pinned-sep');
  });

  it('omits .cb-pinned-sep when all tags are selected', () => {
    const ss = { on: ['alice', 'bob', 'carol'], not: [], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).not.toContain('cb-pinned-sep');
  });

  it('renders section status showing on count and total', () => {
    const ss = { on: ['alice', 'bob'], not: [], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).toContain('cb-section-status');
    expect(html).toContain('2');
    expect(html).toContain('3');
  });

  it('status shows not count when ss.not is non-empty', () => {
    const ss = { on: ['alice'], not: ['bob'], logic: 'any' };
    const html = renderSection('people', tags, ss);
    expect(html).toContain('cb-status-not');
  });

  it('renders logic toggle (any/all) for people section', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).toContain('cb-logic');
    expect(html).toContain('data-logic="any"');
    expect(html).toContain('data-logic="all"');
  });

  it('marks the active logic button', () => {
    const ss = { on: [], not: [], logic: 'all' };
    const html = renderSection('people', tags, ss);
    expect(html).toMatch(/class="cb-logic-btn active"[^>]*data-logic="all"/);
  });

  it('renders search input with placeholder', () => {
    const html = renderSection('people', tags, emptyState());
    expect(html).toContain('class="cb-search"');
    expect(html).toContain('placeholder="filter people…"');
  });

  it('renders clear link; adds visible class when selection exists', () => {
    const ssEmpty = emptyState();
    const ssSel   = { on: ['alice'], not: [], logic: 'any' };
    expect(renderSection('people', tags, ssEmpty)).not.toContain('cb-clear visible');
    expect(renderSection('people', tags, ssSel)).toContain('cb-clear visible');
  });

  it('escapes HTML in tag names', () => {
    const xssTags = [{ name: '<script>alert(1)</script>', count: 1 }];
    const html = renderSection('people', xssTags, emptyState());
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('unselected tags are sorted by count descending', () => {
    const html = renderSection('people', tags, emptyState());
    const aliceIdx = html.indexOf('data-tag="alice"');
    const bobIdx   = html.indexOf('data-tag="bob"');
    const carolIdx = html.indexOf('data-tag="carol"');
    expect(aliceIdx).toBeLessThan(bobIdx);
    expect(bobIdx).toBeLessThan(carolIdx);
  });
});

// ── renderSection — themes (no logic toggle) ──────────────────────────────────

describe('renderSection — themes', () => {
  const tags = [{ name: 'travel', count: 7 }];

  it('does not render logic toggle for themes', () => {
    const html = renderSection('themes', tags, emptyState());
    expect(html).not.toContain('cb-logic');
  });

  it('renders search input for themes', () => {
    const html = renderSection('themes', tags, emptyState());
    expect(html).toContain('class="cb-search"');
  });
});

// ── renderSection — years (chip-based) ───────────────────────────────────────

describe('renderSection — years', () => {
  const yearTags = [{ name: '2023', count: 10 }, { name: '2022', count: 5 }];

  it('renders .cb-chips container instead of .cb-tag-list', () => {
    const html = renderSection('years', yearTags, emptyState());
    expect(html).toContain('class="cb-chips"');
    expect(html).not.toContain('class="cb-tag-list"');
  });

  it('renders .cb-chip elements for each year', () => {
    const html = renderSection('years', yearTags, emptyState());
    expect(html).toContain('class="cb-chip"');
    expect(html).toContain('data-tag="2023"');
    expect(html).toContain('data-tag="2022"');
  });

  it('does not render search input for years', () => {
    const html = renderSection('years', yearTags, emptyState());
    expect(html).not.toContain('cb-search');
  });

  it('does not render logic toggle for years', () => {
    const html = renderSection('years', yearTags, emptyState());
    expect(html).not.toContain('cb-logic');
  });

  it('shows "included" status when years are in ss.on', () => {
    const ss = { on: ['2023'], not: [], logic: 'any' };
    const html = renderSection('years', yearTags, ss);
    expect(html).toContain('included');
  });

  it('shows "excluded" status when years are in ss.not', () => {
    const ss = { on: [], not: ['2022'], logic: 'any' };
    const html = renderSection('years', yearTags, ss);
    expect(html).toContain('excluded');
  });

  it('sets chip data-state="on" for ss.on years', () => {
    const ss = { on: ['2023'], not: [], logic: 'any' };
    const html = renderSection('years', yearTags, ss);
    expect(html).toMatch(/data-state="on"[^>]*data-tag="2023"/);
  });
});

// ── renderSection — other (hidden when empty) ─────────────────────────────────

describe('renderSection — other', () => {
  it('returns empty string when tags array is empty', () => {
    expect(renderSection('other', [], emptyState())).toBe('');
  });

  it('renders normally when tags are present', () => {
    const html = renderSection('other', [{ name: 'misc', count: 1 }], emptyState());
    expect(html).toContain('data-tag="misc"');
  });
});

// ── renderPills ───────────────────────────────────────────────────────────────

describe('renderPills', () => {
  const baseState = {
    sections: {
      people: { on: [], not: [], logic: 'any' },
      places: { on: [], not: [], logic: 'any' },
      years:  { on: [], not: [], logic: 'any' },
      themes: { on: [], not: [], logic: 'any' },
      other:  { on: [], not: [], logic: 'any' },
    },
  };

  it('shows empty hint when no filters are active', () => {
    const html = renderPills(baseState);
    expect(html).toContain('no filters yet');
    expect(html).not.toContain('cb-pill');
  });

  it('renders a pill for each on tag', () => {
    const state = { sections: { ...baseState.sections, people: { on: ['alice'], not: [], logic: 'any' } } };
    const html = renderPills(state);
    expect(html).toContain('class="cb-pill"');
    expect(html).toContain('data-tag="alice"');
  });

  it('renders not pills with AND NOT connector', () => {
    const state = {
      sections: {
        ...baseState.sections,
        people: { on: ['alice'], not: ['bob'], logic: 'any' },
      },
    };
    const html = renderPills(state);
    expect(html).toContain('AND NOT');
    expect(html).toContain('class="cb-pill not"');
    expect(html).toContain('data-tag="bob"');
  });

  it('first pill has no connector', () => {
    const state = { sections: { ...baseState.sections, people: { on: ['alice'], not: [], logic: 'any' } } };
    const html = renderPills(state);
    const pillIdx = html.indexOf('cb-pill');
    const andIdx  = html.indexOf('cb-pill-op');
    expect(andIdx).toBe(-1);
    expect(pillIdx).toBeGreaterThan(-1);
  });

  it('second and later pills have AND connector', () => {
    const state = {
      sections: {
        ...baseState.sections,
        people: { on: ['alice', 'bob'], not: [], logic: 'any' },
      },
    };
    const html = renderPills(state);
    expect(html).toContain('cb-pill-op');
    expect(html).toContain('>AND<');
  });

  it('includes × remove button in each pill', () => {
    const state = { sections: { ...baseState.sections, people: { on: ['alice'], not: [], logic: 'any' } } };
    const html = renderPills(state);
    expect(html).toContain('cb-pill-x');
  });
});

// ── renderGrid ────────────────────────────────────────────────────────────────

describe('renderGrid', () => {
  const photos = [
    { id: 1, filename: 'a.jpg', title: 'Alpha', uploader: 'Alice', taken_at: '2023-01-01' },
    { id: 2, filename: 'b.jpg', title: 'Beta',  uploader: 'Bob',   taken_at: null },
  ];

  it('shows no-filter message when hasFilters is false', () => {
    const html = renderGrid([], 'grid4', false);
    expect(html).toContain('cb-no-filter');
    expect(html).not.toContain('cb-tile');
  });

  it('shows no-results message when photos is empty and hasFilters is true', () => {
    const html = renderGrid([], 'grid4', true);
    expect(html).toContain('cb-no-results');
    expect(html).not.toContain('cb-tile');
  });

  it('renders a tile per photo in grid view', () => {
    const html = renderGrid(photos, 'grid4', true);
    expect(html).toContain('data-id="1"');
    expect(html).toContain('data-id="2"');
    expect(html).toContain('src="/uploads/a.jpg"');
    expect(html).toContain('cb-tile-overlay');
  });

  it('renders list metadata in list view', () => {
    const html = renderGrid(photos, 'list', true);
    expect(html).toContain('cb-list-meta');
    expect(html).toContain('Alpha');
    expect(html).toContain('by Alice');
  });

  it('applies view class to grid container', () => {
    expect(renderGrid(photos, 'grid6', true)).toContain('class="cb-grid view-grid6"');
    expect(renderGrid(photos, 'mosaic', true)).toContain('class="cb-grid view-mosaic"');
  });

  it('escapes HTML in photo titles', () => {
    const xss = [{ id: 9, filename: 'x.jpg', title: '<script>xss</script>', uploader: 'X', taken_at: null }];
    const html = renderGrid(xss, 'grid4', true);
    expect(html).not.toContain('<script>xss');
    expect(html).toContain('&lt;script&gt;');
  });
});
