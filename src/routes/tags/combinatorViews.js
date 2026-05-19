const { esc } = require('../../layout');
const { SECTIONS } = require('../../combinator');

const SEC_LABEL = { people: 'PEOPLE', places: 'PLACES', years: 'YEARS', themes: 'THEMES', other: 'OTHER' };
const SEC_PH    = { people: 'filter people…', places: 'filter places…', years: null, themes: 'filter themes…', other: 'filter tags…' };
// Only people and places show a logic toggle (any/all); NONE replaced by per-tag not state
const HAS_LOGIC = new Set(['people', 'places']);

function renderSection(sec, tags, ss) {
  if (tags.length === 0 && sec === 'other') return '';
  const onSet  = new Set(ss.on);
  const notSet = new Set(ss.not);
  const isYears = sec === 'years';
  const hasSel  = ss.on.length > 0 || ss.not.length > 0;

  // Section header status string
  const onCount  = ss.on.length;
  const notCount = ss.not.length;
  const total    = tags.length;
  let statusHtml;
  if (isYears) {
    statusHtml = notCount > 0 ? `<span class="cb-status-on">${notCount}</span> excluded`
               : onCount  > 0 ? `<span class="cb-status-on">${onCount}</span> included`
               : 'all years';
  } else {
    const notPart = notCount > 0 ? ` · <span class="cb-status-not">${notCount}</span> off` : '';
    statusHtml = hasSel
      ? `<span class="cb-status-on">${onCount}</span> of ${total} on${notPart}`
      : `0 of ${total}`;
  }

  const secHead = `<div class="cb-section-head">
    <h4 class="cb-section-h">${SEC_LABEL[sec]}</h4>
    <span class="cb-section-status" data-section="${sec}">${statusHtml}</span>
    <a class="cb-clear${hasSel ? ' visible' : ''}" data-section="${sec}" href="#">clear</a>
  </div>`;

  const search = (!isYears && SEC_PH[sec])
    ? `<input class="cb-search" type="text" placeholder="${esc(SEC_PH[sec])}" autocomplete="off" data-section="${sec}">`
    : '';

  let items;
  if (isYears) {
    items = `<div class="cb-chips" data-list="${sec}">${tags.map(t => {
      const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
      return `<span class="cb-chip" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}">${esc(t.name)}</span>`;
    }).join('')}</div>`;
  } else {
    // Selected (on then not) pinned first; unselected sorted by count desc
    const selOrder   = [...ss.on, ...ss.not];
    const selSet     = new Set(selOrder);
    const selected   = selOrder.map(name => tags.find(t => t.name === name)).filter(Boolean);
    const unselected = tags.filter(t => !selSet.has(t.name)).sort((a, b) => b.count - a.count);

    const row = t => {
      const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
      return `<div class="cb-row" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}" data-count="${t.count}">` +
        `<span class="cb-box"></span>` +
        `<span class="cb-name">${esc(t.name)}</span>` +
        `<span class="cb-dots"></span>` +
        `<span class="cb-count" data-tag="${esc(t.name)}" data-section="${sec}">${t.count}</span>` +
        `</div>`;
    };

    const sep = (selected.length > 0 && unselected.length > 0) ? '<hr class="cb-pinned-sep">' : '';
    items = `<div class="cb-tag-list" data-list="${sec}">${selected.map(row).join('')}${sep}${unselected.map(row).join('')}</div>`;
  }

  const logicHtml = HAS_LOGIC.has(sec)
    ? `<div class="cb-logic" data-section="${sec}">
        <button class="cb-logic-btn${ss.logic === 'any' ? ' active' : ''}" data-logic="any">any</button>
        <button class="cb-logic-btn${ss.logic === 'all' ? ' active' : ''}" data-logic="all">all</button>
      </div>`
    : '';

  return `<div class="cb-section" data-section="${sec}">
    ${secHead}${search}${items}${logicHtml}
  </div>`;
}

function renderPills(state) {
  const pills = [];
  for (const sec of SECTIONS) {
    for (const tag of state.sections[sec].on)  pills.push({ tag, sec, st: 'on' });
    for (const tag of state.sections[sec].not) pills.push({ tag, sec, st: 'not' });
  }
  if (!pills.length) return `<span class="cb-empty-hint">no filters yet — tick a tag on the left to begin.</span>`;
  return pills.map((pill, i) => {
    const op  = i > 0 ? `<span class="cb-pill-op">${pill.st === 'not' ? 'AND NOT' : 'AND'}</span> ` : '';
    const cls = pill.st === 'not' ? 'cb-pill not' : 'cb-pill';
    return `${op}<span class="${cls}" data-tag="${esc(pill.tag)}" data-section="${esc(pill.sec)}" data-state="${pill.st}">${esc(pill.tag)}<button class="cb-pill-x" aria-label="Remove">\xd7</button></span>`;
  }).join(' ');
}

function renderGrid(photos, view, hasFilters) {
  if (!hasFilters) return `<div id="cb-grid"><div class="cb-no-filter">no filters yet — tick a tag on the left to begin.</div></div>`;
  if (!photos.length) return `<div id="cb-grid"><div class="cb-no-results">nothing matches this recipe yet. loosen a filter?</div></div>`;
  const tiles = photos.map(p => {
    if (view === 'list') {
      return `<div class="cb-tile" data-id="${p.id}">` +
        `<a href="/photos/${p.id}"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}" loading="lazy"></a>` +
        `<div class="cb-list-meta"><strong>${esc(p.title)}</strong>` +
        `<small>by ${esc(p.uploader)}${p.taken_at ? ' \xb7 ' + new Date(p.taken_at).getFullYear() : ''}</small></div></div>`;
    }
    return `<div class="cb-tile" data-id="${p.id}">` +
      `<a href="/photos/${p.id}"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}" loading="lazy">` +
      `<div class="cb-tile-overlay">${esc(p.title)}</div></a></div>`;
  }).join('');
  return `<div class="cb-grid view-${view}" id="cb-grid">${tiles}</div>`;
}

module.exports = { renderSection, renderPills, renderGrid };
