const { esc } = require('../../layout');
const { SECTIONS, LOGIC_OPTS } = require('../../combinator');

const SEC_LABEL = { people: 'PEOPLE', places: 'PLACES', years: 'YEARS', themes: 'THEMES', other: 'OTHER' };
const SEC_PH    = { people: 'filter people…', places: 'filter places…', years: null, themes: 'filter themes…', other: 'filter tags…' };

function renderSection(sec, tags, ss) {
  // Always show the 4 core sections; only hide OTHER when empty
  if (tags.length === 0 && sec === 'other') return '';
  const onSet  = new Set(ss.on);
  const notSet = new Set(ss.not);
  const hasSel = ss.on.length > 0 || ss.not.length > 0;
  const isYears = sec === 'years';

  const search = (!isYears && SEC_PH[sec])
    ? `<input class="cb-search" type="text" placeholder="${esc(SEC_PH[sec])}" autocomplete="off" data-section="${sec}">`
    : '';

  const items = isYears
    ? `<div class="cb-chips" data-list="${sec}">${tags.map(t => {
        const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
        return `<span class="cb-chip" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}">${esc(t.name)}</span>`;
      }).join('')}</div>`
    : `<div class="cb-tag-list" data-list="${sec}">${tags.map(t => {
        const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
        return `<label class="cb-tag-item" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}">` +
          `<span class="cb-box"></span><span class="cb-name">${esc(t.name)}</span>` +
          `<span class="cb-count" data-tag="${esc(t.name)}" data-section="${sec}">${t.count}</span></label>`;
      }).join('')}</div>`;

  const logicBtns = LOGIC_OPTS[sec].map(opt =>
    `<button class="cb-logic-btn${ss.logic === opt ? ' active' : ''}" data-logic="${opt}">${opt.toUpperCase()}</button>`
  ).join('');

  return `<div class="cb-section" data-section="${sec}">
    <div class="cb-section-head">
      <h4 class="cb-section-h">${SEC_LABEL[sec]}</h4>
      <a class="cb-clear${hasSel ? ' visible' : ''}" data-section="${sec}" href="#">clear</a>
    </div>
    ${search}${items}
    <div class="cb-logic" data-section="${sec}">${logicBtns}</div>
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
