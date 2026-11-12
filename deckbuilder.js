/* '90s Magic - standalone web deckbuilder
   Loads Assets/Deckbuilder/cards.json (a slimmed export of the game's own
   90s_cards_eng_25sets_ath_wc.json) and lets a visitor build a deck from the
   same card pool used in-game, with no collection/progress gating. No
   accounts, no server: everything lives in page memory for the session.

   Deck-building rule enforced: standard "max 4 non-basic-land copies" (the
   one universal Magic rule, not a banned-list/format legality check - none
   of those are enforced here yet, matching the game itself). */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Power Nine cosmetic-Mythic override - mirrors RarityIconSet.cs exactly.
  // Real printed rarity for all of these is "rare"; this is display-only,
  // matched by name across every printing, same as the game.
  // ---------------------------------------------------------------------
  const POWER_NINE = new Set([
    'black lotus', 'ancestral recall', 'time walk', 'timetwister',
    'mox emerald', 'mox jet', 'mox pearl', 'mox ruby', 'mox sapphire'
  ]);

  function displayRarity(card) {
    return POWER_NINE.has(card.name.toLowerCase()) ? 'mythic' : (card.rarity || 'common');
  }

  // Best-effort chronological ordering for the set dropdown / "Sort: Set".
  // Cosmetic only - doesn't affect exports or deck legality.
  const SET_ORDER = [
    'lea', 'leb', '2ed', 'arn', 'atq',
    'leg', '3ed', 'drk', 'fem',
    'ice', 'chr', 'hml', 'all',
    'mir', 'vis', '4ed',
    'wth', '5ed', 'tmp', 'wc97',
    'sth', 'exo', 'usg', 'wc98',
    'uds', 'ulg', '6ed', 'wc99',
    'ath'
  ];
  function setRank(code) {
    const i = SET_ORDER.indexOf(code);
    return i === -1 ? 999 : i;
  }

  const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

  function primaryType(typeLine) {
    const t = typeLine || '';
    if (t.includes('Land')) return 'Land';
    if (t.includes('Creature')) return 'Creature';
    if (t.includes('Artifact')) return 'Artifact';
    if (t.includes('Enchantment')) return 'Enchantment';
    if (t.includes('Instant')) return 'Instant';
    if (t.includes('Sorcery')) return 'Sorcery';
    return 'Other';
  }

  function isBasicLand(card) {
    return (card.typeLine || '').startsWith('Basic Land');
  }

  function cardKey(card) {
    return card.name + '__' + card.set + '__' + (card.collectorNumber || '');
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let allCards = [];
  const deckMain = new Map(); // key -> { card, qty }
  const deckSide = new Map();
  let activeZone = 'main';

  const filters = { search: '', set: '', color: '', rarity: '', type: '', sort: 'name' };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const el = {
    grid: document.getElementById('db-grid'),
    gridEmpty: document.getElementById('db-grid-empty'),
    gridCount: document.getElementById('db-grid-count'),
    search: document.getElementById('db-search'),
    filterSet: document.getElementById('db-filter-set'),
    filterColor: document.getElementById('db-filter-color'),
    filterRarity: document.getElementById('db-filter-rarity'),
    filterType: document.getElementById('db-filter-type'),
    sort: document.getElementById('db-sort'),
    deckList: document.getElementById('db-deck-list'),
    deckEmpty: document.getElementById('db-deck-empty'),
    curve: document.getElementById('db-curve'),
    deckName: document.getElementById('db-deck-name'),
    tabMain: document.getElementById('db-tab-main'),
    tabSide: document.getElementById('db-tab-side'),
    clearBtn: document.getElementById('db-clear-deck'),
    exportBtn: document.getElementById('db-export-btn'),
    exportMenu: document.getElementById('db-export-menu'),
    preview: document.getElementById('db-preview'),
    previewImg: document.getElementById('db-preview-img')
  };

  const statEls = {
    deckCount: document.querySelectorAll('[data-stat="deck-count"], [data-stat="deck-count-tab"]'),
    sideCount: document.querySelectorAll('[data-stat="side-count"], [data-stat="side-count-tab"]')
  };

  function zoneMap(zone) { return zone === 'side' ? deckSide : deckMain; }
  function zoneTotal(zone) {
    let total = 0;
    zoneMap(zone).forEach((e) => { total += e.qty; });
    return total;
  }

  // ---------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------
  fetch('Assets/Deckbuilder/cards.json')
    .then((r) => r.json())
    .then((data) => {
      allCards = data;
      populateFilterOptions();
      renderGrid();
      updateStats();
    })
    .catch((err) => {
      el.grid.innerHTML = '<p style="color:#fff;padding:20px;">Could not load the card database. Try refreshing the page.</p>';
      console.error('Failed to load cards.json', err);
    });

  function populateFilterOptions() {
    const sets = [...new Set(allCards.map((c) => c.set))].sort((a, b) => setRank(a) - setRank(b));
    const setNameByCode = {};
    allCards.forEach((c) => { setNameByCode[c.set] = c.setName; });
    sets.forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = setNameByCode[code] || code.toUpperCase();
      el.filterSet.appendChild(opt);
    });

    const types = ['Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Other'];
    types.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      el.filterType.appendChild(opt);
    });
  }

  // ---------------------------------------------------------------------
  // Filtering / sorting / rendering the browse grid
  // ---------------------------------------------------------------------
  function getFiltered() {
    const q = filters.search.trim().toLowerCase();
    let list = allCards.filter((c) => {
      if (filters.set && c.set !== filters.set) return false;
      if (filters.type && primaryType(c.typeLine) !== filters.type) return false;
      if (filters.rarity && displayRarity(c) !== filters.rarity) return false;
      if (filters.color) {
        // Scryfall's "colors" field only reflects colored mana symbols in the
        // cost, so every land comes back colorless there even though Island
        // is plainly blue. "colorIdentity" is what actually captures a land's
        // (or any card's) color for filtering purposes, so use that instead.
        const colors = c.colorIdentity || [];
        if (filters.color === 'C' && colors.length !== 0) return false;
        if (filters.color === 'M' && colors.length < 2) return false;
        if (filters.color !== 'C' && filters.color !== 'M' && !colors.includes(filters.color)) return false;
      }
      if (q && !c.name.toLowerCase().includes(q) && !(c.oracleText || '').toLowerCase().includes(q)) return false;
      return true;
    });

    list.sort((a, b) => {
      switch (filters.sort) {
        case 'cmc': return (a.cmc - b.cmc) || a.name.localeCompare(b.name);
        case 'set': return (setRank(a.set) - setRank(b.set)) || a.name.localeCompare(b.name);
        case 'rarity': return (RARITY_RANK[displayRarity(b)] - RARITY_RANK[displayRarity(a)]) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name);
      }
    });

    return list;
  }

  let renderToken = 0;
  function renderGrid() {
    const list = getFiltered();
    const token = ++renderToken;

    el.gridCount.textContent = list.length.toLocaleString() + ' card' + (list.length === 1 ? '' : 's');
    el.gridEmpty.hidden = list.length !== 0;
    el.grid.innerHTML = '';

    // Render in chunks so a huge filtered set (e.g. "All sets") doesn't
    // block the main thread building thousands of tiles at once.
    const CHUNK = 150;
    let i = 0;
    function renderChunk() {
      if (token !== renderToken) return; // filters changed again, abandon
      const frag = document.createDocumentFragment();
      const end = Math.min(i + CHUNK, list.length);
      for (; i < end; i++) frag.appendChild(buildCardTile(list[i]));
      el.grid.appendChild(frag);
      if (i < list.length) requestAnimationFrame(renderChunk);
    }
    renderChunk();
  }

  function buildCardTile(card) {
    const key = cardKey(card);
    const tile = document.createElement('div');
    tile.className = 'db-card';
    tile.dataset.key = key;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = card.imgSmall || card.imgNormal || '';
    img.alt = card.name;
    tile.appendChild(img);

    const marker = document.createElement('span');
    const rarity = displayRarity(card);
    marker.className = 'db-marker db-marker--' + rarity;
    marker.textContent = rarity === 'uncommon' ? 'UC' : rarity.charAt(0).toUpperCase();
    tile.appendChild(marker);

    const qtyInZone = zoneMap(activeZone).get(key);
    if (qtyInZone) {
      const qty = document.createElement('span');
      qty.className = 'db-card__qty';
      qty.textContent = qtyInZone.qty;
      tile.appendChild(qty);
    }

    tile.addEventListener('click', () => addToDeck(card, activeZone));
    tile.addEventListener('mouseenter', (e) => showPreview(card, e));
    tile.addEventListener('mousemove', positionPreview);
    tile.addEventListener('mouseleave', hidePreview);

    return tile;
  }

  function showPreview(card, e) {
    el.previewImg.src = card.imgNormal || card.imgSmall || '';
    el.preview.hidden = false;
    positionPreview(e);
  }
  function positionPreview(e) {
    if (el.preview.hidden) return;
    const margin = 16;
    let x = e.clientX + 20;
    let y = e.clientY + 20;
    if (x + 240 > window.innerWidth) x = e.clientX - 260;
    if (y + 340 > window.innerHeight) y = Math.max(margin, window.innerHeight - 340 - margin);
    el.preview.style.left = x + 'px';
    el.preview.style.top = y + 'px';
  }
  function hidePreview() { el.preview.hidden = true; }

  // ---------------------------------------------------------------------
  // Deck mutation
  // ---------------------------------------------------------------------
  // Sums quantity across every printing of this name in the zone - the real
  // 4-copy rule applies per card name, not per printing (otherwise 4 of one
  // printing + 4 of a reprint would wrongly pass as 8 legal copies).
  function nameTotalInZone(name, zone) {
    let total = 0;
    zoneMap(zone).forEach((e) => { if (e.card.name === name) total += e.qty; });
    return total;
  }

  function addToDeck(card, zone) {
    const key = cardKey(card);
    const map = zoneMap(zone);
    const existing = map.get(key);
    const currentQty = existing ? existing.qty : 0;

    if (!isBasicLand(card) && nameTotalInZone(card.name, zone) >= 4) return; // standard 4-copy limit

    map.set(key, { card, qty: currentQty + 1 });
    afterDeckChange();
  }

  function removeFromDeck(card, zone, all) {
    const key = cardKey(card);
    const map = zoneMap(zone);
    const existing = map.get(key);
    if (!existing) return;
    if (all || existing.qty <= 1) {
      map.delete(key);
    } else {
      existing.qty -= 1;
    }
    afterDeckChange();
  }

  function moveZone(card, fromZone) {
    const toZone = fromZone === 'main' ? 'side' : 'main';
    const fromMap = zoneMap(fromZone);
    const key = cardKey(card);
    const entry = fromMap.get(key);
    if (!entry) return;
    fromMap.delete(key);
    const toMap = zoneMap(toZone);
    const existing = toMap.get(key);
    toMap.set(key, { card, qty: (existing ? existing.qty : 0) + entry.qty });
    afterDeckChange();
  }

  function afterDeckChange() {
    updateStats();
    renderDeckList();
    renderGrid(); // refresh qty badges on tiles
  }

  function updateStats() {
    const mainTotal = zoneTotal('main');
    const sideTotal = zoneTotal('side');
    document.querySelectorAll('[data-stat="deck-count"], [data-stat="deck-count-tab"]').forEach((n) => { n.textContent = mainTotal; });
    document.querySelectorAll('[data-stat="side-count"], [data-stat="side-count-tab"]').forEach((n) => { n.textContent = sideTotal; });
  }

  function renderDeckList() {
    const map = zoneMap(activeZone);
    el.deckList.innerHTML = '';
    el.deckEmpty.hidden = map.size !== 0;

    const rows = [...map.values()].sort((a, b) => a.card.name.localeCompare(b.card.name));
    const frag = document.createDocumentFragment();

    rows.forEach(({ card, qty }) => {
      const row = document.createElement('div');
      row.className = 'db-deck-row';

      const qtyEl = document.createElement('span');
      qtyEl.className = 'db-deck-row__qty';
      qtyEl.textContent = qty + 'x';
      row.appendChild(qtyEl);

      const nameEl = document.createElement('span');
      nameEl.className = 'db-deck-row__name';
      nameEl.textContent = card.name;
      nameEl.title = card.name;
      row.appendChild(nameEl);

      const setEl = document.createElement('span');
      setEl.className = 'db-deck-row__set';
      setEl.textContent = card.set;
      row.appendChild(setEl);

      const moveBtn = document.createElement('button');
      moveBtn.className = 'db-deck-row__btn';
      moveBtn.title = activeZone === 'main' ? 'Move to sideboard' : 'Move to main deck';
      moveBtn.textContent = '⇄';
      moveBtn.addEventListener('click', (e) => { e.stopPropagation(); moveZone(card, activeZone); });
      row.appendChild(moveBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'db-deck-row__btn';
      removeBtn.title = 'Remove one copy';
      removeBtn.textContent = '−';
      removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromDeck(card, activeZone, false); });
      row.appendChild(removeBtn);

      row.addEventListener('mouseenter', (e) => showPreview(card, e));
      row.addEventListener('mousemove', positionPreview);
      row.addEventListener('mouseleave', hidePreview);

      frag.appendChild(row);
    });

    el.deckList.appendChild(frag);
    renderCurve();
  }

  function renderCurve() {
    const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0,1,2,3,4,5,6+
    let max = 0;
    deckMain.forEach(({ card, qty }) => {
      if (isBasicLand(card)) return;
      const cmc = Math.max(0, Math.round(card.cmc || 0));
      const idx = Math.min(cmc, 6);
      buckets[idx] += qty;
    });
    max = Math.max(1, ...buckets);

    el.curve.innerHTML = '';
    buckets.forEach((count, i) => {
      const bar = document.createElement('div');
      bar.className = 'db-curve__bar';
      const fill = document.createElement('div');
      fill.className = 'db-curve__fill';
      fill.style.height = Math.round((count / max) * 100) + '%';
      fill.title = count + ' card' + (count === 1 ? '' : 's');
      const label = document.createElement('div');
      label.className = 'db-curve__label';
      label.textContent = i === 6 ? '6+' : String(i);
      bar.appendChild(fill);
      bar.appendChild(label);
      el.curve.appendChild(bar);
    });
  }

  // ---------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------
  el.search.addEventListener('input', () => { filters.search = el.search.value; renderGrid(); });
  el.filterSet.addEventListener('change', () => { filters.set = el.filterSet.value; renderGrid(); });
  el.filterColor.addEventListener('change', () => { filters.color = el.filterColor.value; renderGrid(); });
  el.filterRarity.addEventListener('change', () => { filters.rarity = el.filterRarity.value; renderGrid(); });
  el.filterType.addEventListener('change', () => { filters.type = el.filterType.value; renderGrid(); });
  el.sort.addEventListener('change', () => { filters.sort = el.sort.value; renderGrid(); });

  el.tabMain.addEventListener('click', () => switchZone('main'));
  el.tabSide.addEventListener('click', () => switchZone('side'));

  function switchZone(zone) {
    activeZone = zone;
    el.tabMain.classList.toggle('db-deck__tab--active', zone === 'main');
    el.tabSide.classList.toggle('db-deck__tab--active', zone === 'side');
    renderDeckList();
    renderGrid();
  }

  el.clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the ' + (activeZone === 'main' ? 'main deck' : 'sideboard') + '?')) return;
    zoneMap(activeZone).clear();
    afterDeckChange();
  });

  el.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.exportMenu.hidden = !el.exportMenu.hidden;
  });
  document.addEventListener('click', () => { el.exportMenu.hidden = true; });
  el.exportMenu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => runExport(btn.dataset.format));
  });

  // ---------------------------------------------------------------------
  // Export formats
  // ---------------------------------------------------------------------
  function deckName() { return (el.deckName.value || 'New Deck').trim() || 'New Deck'; }

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'deck';
  }

  function sortedEntries(zone) {
    return [...zoneMap(zone).values()].sort((a, b) => a.card.name.localeCompare(b.card.name));
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function runExport(format) {
    const name = deckName();
    const base = slug(name);
    const main = sortedEntries('main');
    const side = sortedEntries('side');

    if (main.length === 0 && side.length === 0) {
      alert('Add some cards to your deck before exporting.');
      return;
    }

    switch (format) {
      case 'game': return exportGameJson(name, base, main, side);
      case 'standard': return exportStandardText(name, base, main, side);
      case 'mtga': return exportMtgaText(name, base, main, side);
      case 'mtgo': return exportMtgoText(base, main, side);
      case 'csv': return exportCsv(base, main, side);
    }
  }

  // 90s Magic game import format - CardName + SetCode + Quantity, same shape
  // as the game's own TemplateDeckEntry/TemplateDeckDefinition. Rarity is
  // carried for the web tool's own display only; the game resolves real
  // rarity (and the Power Nine override) from its own CardDatabase on import.
  function exportGameJson(name, base, main, side) {
    const toEntries = (list) => list.map(({ card, qty }) => ({
      name: card.name,
      set: card.set,
      quantity: qty,
      rarity: displayRarity(card)
    }));

    const payload = {
      deckName: name,
      format: '90sMagic-deckbuilder-v1',
      main: toEntries(main),
      sideboard: toEntries(side)
    };

    download(base + '.90smagic.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function lineFor(entry, includeSetAndCollector) {
    const { card, qty } = entry;
    if (!includeSetAndCollector) return qty + ' ' + card.name;
    const setTag = card.set ? ' (' + card.set.toUpperCase() + ')' : '';
    const cn = card.collectorNumber ? ' ' + card.collectorNumber : '';
    return qty + ' ' + card.name + setTag + cn;
  }

  // Standard / MTGGoldfish-style plain text - reads into Moxfield, MTGGoldfish, EDHREC, etc.
  function exportStandardText(name, base, main, side) {
    let out = 'Main Deck:\n';
    out += main.map((e) => lineFor(e, true)).join('\n');
    if (side.length) {
      out += '\n\nSideboard:\n';
      out += side.map((e) => lineFor(e, true)).join('\n');
    }
    download(base + '.txt', out, 'text/plain');
  }

  // MTG Arena plain-text import format.
  function exportMtgaText(name, base, main, side) {
    let out = 'About\nName ' + name + '\n\nDeck\n';
    out += main.map((e) => lineFor(e, true)).join('\n');
    if (side.length) {
      out += '\n\nSideboard\n';
      out += side.map((e) => lineFor(e, true)).join('\n');
    }
    download(base + '.arena.txt', out, 'text/plain');
  }

  // MTGO plain text - name + quantity only; MTGO doesn't key import by
  // set/printing for cards this old, so set/collector number is dropped.
  function exportMtgoText(base, main, side) {
    let out = main.map((e) => lineFor(e, false)).join('\n');
    if (side.length) {
      out += '\nSideboard:\n';
      out += side.map((e) => lineFor(e, false)).join('\n');
    }
    download(base + '.mtgo.txt', out, 'text/plain');
  }

  // CSV - quantity, name, set, collector number, rarity, board. No price,
  // no owned/collection-quantity columns (per spec - this isn't a collection tracker).
  function exportCsv(base, main, side) {
    const rows = [['Quantity', 'Name', 'Set', 'Collector Number', 'Rarity', 'Board']];
    const csvEscape = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const pushRows = (list, board) => {
      list.forEach(({ card, qty }) => {
        rows.push([qty, card.name, card.set.toUpperCase(), card.collectorNumber || '', displayRarity(card), board]);
      });
    };
    pushRows(main, 'Main');
    pushRows(side, 'Sideboard');
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    download(base + '.csv', csv, 'text/csv');
  }

  // Initial render (deck list / curve render once on load even though empty)
  renderDeckList();
})();
