/* '90s Magic - standalone web deckbuilder
   Loads Assets/Deckbuilder/cards.json (a slimmed export of the game's own
   90s_cards_eng_25sets_ath_wc.json plus the game's itp and ptc sets) and lets a visitor build a deck from the
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
    'ice', 'chr', 'hml', 'all', 'itp', 'ptc',
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

  // The 6th Edition rules update (April 1999) errata'd every Interrupt to Instant, so
  // current type lines never say "Interrupt". Same hardcoded name list as the game's
  // CardGridUiKit.InterruptCardNames; an Interrupt also still matches Instant.
  const INTERRUPT_NAMES = new Set([
    'Abjure', 'Annul', 'Arcane Denial', 'Artifact Blast', 'Avoid Fate', 'Blue Elemental Blast',
    'Burnout', 'Burnt Offering', 'Chaoslace', 'Counterspell', 'Dark Ritual', 'Deathlace',
    'Deflection', 'Denied!', 'Desertion', 'Dismiss', 'Disrupt', 'Dissipate', "Ertai's Meddling",
    'Flash Counter', 'Forbid', 'Force of Will', 'Force Spike', 'Force Void', 'Fork', 'Hydroblast',
    'Illumination', 'Interdict', 'Intervene', 'Lifelace', 'Magical Hack', 'Mana Drain', 'Mana Leak',
    'Meddle', 'Memory Lapse', 'Miscalculation', 'Power Sink', 'Purelace', 'Pyroblast', 'Rebound',
    'Red Elemental Blast', 'Remove Soul', 'Reset', 'Rewind', 'Rust', 'Sacrifice', 'Sleight of Mind',
    'Songs of the Damned', 'Spell Blast', 'Spoils of Evil', 'Thoughtlace', 'Withering Boon'
  ].map((n) => n.toLowerCase()));

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

  // Alpha's print run had noticeably rounder physical corners than every
  // set since - the scan art needs a bigger corner clip to hide the white
  // bleed around them than any other printing does.
  function isAlphaPrinting(card) {
    return card.set === 'lea';
  }

  // Deck-list grouping categories, in the fixed display order the panel
  // uses. No "Other" bucket - every type line in this card pool (1993-1999)
  // already lands in one of these five, so it would always show empty.
  const DECK_CATEGORIES = ['Land', 'Creature', 'Spell', 'Enchantment', 'Artifact'];
  const DECK_CATEGORY_LABELS = { Land: 'Lands', Creature: 'Creatures', Spell: 'Spells', Enchantment: 'Enchantments', Artifact: 'Artifacts' };

  function deckCategory(card) {
    const t = primaryType(card.typeLine);
    if (t === 'Instant' || t === 'Sorcery') return 'Spell';
    if (DECK_CATEGORIES.includes(t)) return t;
    return 'Other';
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
  let draggedCard = null; // grid card currently being dragged toward the deck panel
  let focusedCard = null; // card currently shown in the inspector panel

  const filters = { search: '', set: '', colors: new Set(), rarity: '', type: '', sort: 'name' };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const el = {
    grid: document.getElementById('db-grid'),
    gridEmpty: document.getElementById('db-grid-empty'),
    gridCount: document.getElementById('db-grid-count'),
    search: document.getElementById('db-search'),
    filterSet: document.getElementById('db-filter-set'),
    colorFilterBtn: document.getElementById('db-colorfilter-btn'),
    colorFilterMenu: document.getElementById('db-colorfilter-menu'),
    filterRarity: document.getElementById('db-filter-rarity'),
    filterType: document.getElementById('db-filter-type'),
    sort: document.getElementById('db-sort'),
    deckList: document.getElementById('db-deck-list'),
    curve: document.getElementById('db-curve'),
    deckName: document.getElementById('db-deck-name'),
    tabMain: document.getElementById('db-tab-main'),
    tabSide: document.getElementById('db-tab-side'),
    clearBtn: document.getElementById('db-clear-deck'),
    status: document.getElementById('db-status'),
    exportBtn: document.getElementById('db-export-btn'),
    exportMenu: document.getElementById('db-export-menu'),
    focusStage: document.getElementById('db-focus-stage'),
    focusImg: document.getElementById('db-focus-img'),
    focusPlaceholder: document.getElementById('db-focus-placeholder'),
    focusInfo: document.getElementById('db-focus-info'),
    focusName: document.getElementById('db-focus-name'),
    focusTypeline: document.getElementById('db-focus-typeline'),
    focusManacost: document.getElementById('db-focus-manacost'),
    focusPt: document.getElementById('db-focus-pt'),
    focusOracle: document.getElementById('db-focus-oracle'),
    focusMeta: document.getElementById('db-focus-meta'),
    deck: document.getElementById('db-deck'),
    rowPreview: document.getElementById('db-row-preview'),
    rowPreviewImg: document.getElementById('db-row-preview-img')
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
  fetch('Assets/Deckbuilder/cards.json?v=20261112h')
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

    const types = ['Land', 'Creature', 'Wall', 'Instant', 'Interrupt', 'Sorcery', 'Artifact', 'Enchantment', 'Legend'];
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
      if (filters.type) {
        // "Legend" is a supertype, so it matches any card whose type line is Legendary (a Legendary Creature shows under both Creature and Legend).
        const typeOk = filters.type === 'Legend' ? (c.typeLine || '').includes('Legendary')
          : filters.type === 'Wall' ? (c.typeLine || '').includes('Wall')
          : filters.type === 'Interrupt' ? INTERRUPT_NAMES.has((c.name || '').toLowerCase())
          : primaryType(c.typeLine) === filters.type;
        if (!typeOk) return false;
      }
      if (filters.rarity && displayRarity(c) !== filters.rarity) return false;
      if (filters.colors.size) {
        // Scryfall's "colors" field only reflects colored mana symbols in the
        // cost, so every land comes back colorless there even though Island
        // is plainly blue. "colorIdentity" is what actually captures a land's
        // (or any card's) color for filtering purposes, so use that instead.
        // Multiple checked colors are OR'd together (matches any one of them).
        const identity = c.colorIdentity || [];
        const matchesAny = [...filters.colors].some((sel) => {
          if (sel === 'C') return identity.length === 0;
          if (sel === 'M') return identity.length >= 2;
          return identity.includes(sel);
        });
        if (!matchesAny) return false;
      }
      if (q && !c.name.toLowerCase().includes(q) && !(c.oracleText || '').toLowerCase().includes(q)) return false;
      return true;
    });

    // Every sort ties ultimately down to name, then printing age (oldest
    // first) - so when the same card shows up from several sets, its
    // printings stay grouped together in release order instead of whatever
    // order they happened to sit in the source data.
    list.sort((a, b) => {
      switch (filters.sort) {
        case 'cmc': return (a.cmc - b.cmc) || a.name.localeCompare(b.name) || (setRank(a.set) - setRank(b.set));
        case 'set': return (setRank(a.set) - setRank(b.set)) || a.name.localeCompare(b.name);
        case 'rarity': return (RARITY_RANK[displayRarity(b)] - RARITY_RANK[displayRarity(a)]) || a.name.localeCompare(b.name) || (setRank(a.set) - setRank(b.set));
        default: return a.name.localeCompare(b.name) || (setRank(a.set) - setRank(b.set));
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
    tile.className = 'db-card' +
      (focusedCard && cardKey(focusedCard) === key ? ' db-card--focused' : '') +
      (isAlphaPrinting(card) ? ' db-card--alpha' : '');
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

    // Clicking a grid card only inspects it now - adding happens by hovering
    // the big image in the inspector panel (see setFocusedCard / stage click).
    tile.addEventListener('click', () => toggleFocus(card));

    // Second way to add: drag the tile onto the deck panel (see the drop
    // wiring near the inspector's stage click). The img itself is not
    // draggable so the whole tile is the drag source.
    img.draggable = false;
    tile.draggable = true;
    tile.addEventListener('dragstart', (e) => {
      draggedCard = card;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', card.name); // Firefox won't start a drag without data
    });
    tile.addEventListener('dragend', () => {
      draggedCard = null;
      el.deck.classList.remove('db-deck--dropping');
    });

    return tile;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Scryfall's own symbol CDN - the same real artwork the game pulls for
  // mana/tap/generic-cost icons (see CollectionScreen.uss .cs-mana-symbol).
  function symbolSvgUrl(code) {
    return 'https://svgs.scryfall.io/card-symbols/' + encodeURIComponent(code) + '.svg';
  }

  // Turns a Scryfall-style string ("{2}{U}{U}", "{T}: Add {G}.") into HTML,
  // replacing each {CODE} token with an <img> placeholder (wired up to the
  // real symbol image, with a text-badge fallback, by wireSymbolImages).
  function renderWithSymbols(text, cls) {
    if (!text) return '';
    const re = /\{([^}]+)\}/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += escapeHtml(text.slice(last, m.index));
      const code = m[1];
      out += '<img class="' + cls + '" data-symbol-code="' + escapeHtml(code) + '" alt="{' + escapeHtml(code) + '}" loading="lazy">';
      last = re.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  // Actually points each placeholder <img> at Scryfall's CDN, and swaps in a
  // plain-text badge instead of a broken-image icon if that fetch fails.
  function wireSymbolImages(container) {
    container.querySelectorAll('img[data-symbol-code]').forEach((img) => {
      const code = img.getAttribute('data-symbol-code');
      img.addEventListener('error', () => {
        const span = document.createElement('span');
        span.className = 'db-symbol-fallback';
        span.textContent = '{' + code + '}';
        img.replaceWith(span);
      }, { once: true });
      img.src = symbolSvgUrl(code);
    });
  }

  function setFocusedCard(card) {
    const previousKey = focusedCard ? cardKey(focusedCard) : null;
    focusedCard = card;

    // Re-stamp the focus highlight on currently-rendered tiles without a
    // full regrid (cheap - at most two tiles change).
    if (previousKey) {
      const prevTile = el.grid.querySelector('[data-key="' + CSS.escape(previousKey) + '"]');
      if (prevTile) prevTile.classList.remove('db-card--focused');
    }
    const newTile = el.grid.querySelector('[data-key="' + CSS.escape(cardKey(card)) + '"]');
    if (newTile) newTile.classList.add('db-card--focused');

    el.focusImg.src = card.imgNormal || card.imgSmall || '';
    el.focusImg.alt = card.name;
    el.focusImg.hidden = false;
    el.focusPlaceholder.hidden = true;
    el.focusStage.classList.add('db-focus__stage--active');
    el.focusStage.classList.toggle('db-focus__stage--alpha', isAlphaPrinting(card));

    el.focusInfo.hidden = false;
    el.focusName.textContent = card.name;
    el.focusTypeline.textContent = card.typeLine || '';

    if (card.manaCost) {
      el.focusManacost.innerHTML = renderWithSymbols(card.manaCost, 'db-symbol');
      wireSymbolImages(el.focusManacost);
    } else {
      el.focusManacost.textContent = '';
    }

    el.focusOracle.innerHTML = renderWithSymbols(card.oracleText || '', 'db-symbol');
    wireSymbolImages(el.focusOracle);

    if (card.power != null || card.toughness != null) {
      el.focusPt.textContent = (card.power || '0') + ' / ' + (card.toughness || '0');
      el.focusPt.hidden = false;
    } else if (card.loyalty != null) {
      el.focusPt.textContent = 'Loyalty: ' + card.loyalty;
      el.focusPt.hidden = false;
    } else {
      el.focusPt.hidden = true;
    }

    const rarity = displayRarity(card);
    const rarityLabel = rarity.charAt(0).toUpperCase() + rarity.slice(1);
    const setCode = (card.set || '').toLowerCase();
    const setLabel = card.setName || card.set.toUpperCase();
    el.focusMeta.innerHTML =
      '<img class="db-focus__set-symbol" data-set-code="' + escapeHtml(setCode) + '" alt="" loading="lazy">' +
      escapeHtml(setLabel) +
      (card.collectorNumber ? ' #' + escapeHtml(String(card.collectorNumber)) : '') +
      ' · ' + escapeHtml(rarityLabel);

    // Scryfall's own set-symbol SVG - if a given set code has none (or the
    // fetch fails), just drop the icon rather than leave anything broken.
    const setSymbolImg = el.focusMeta.querySelector('img[data-set-code]');
    if (setSymbolImg) {
      setSymbolImg.addEventListener('error', () => setSymbolImg.remove(), { once: true });
      setSymbolImg.src = 'https://svgs.scryfall.io/sets/' + encodeURIComponent(setCode) + '.svg';
    }
  }

  function clearFocus() {
    if (!focusedCard) return;
    const prevTile = el.grid.querySelector('[data-key="' + CSS.escape(cardKey(focusedCard)) + '"]');
    if (prevTile) prevTile.classList.remove('db-card--focused');

    focusedCard = null;
    el.focusImg.hidden = true;
    el.focusPlaceholder.hidden = false;
    el.focusStage.classList.remove('db-focus__stage--active');
    el.focusStage.classList.remove('db-focus__stage--alpha');
    el.focusInfo.hidden = true;
  }

  // Clicking the already-focused card again releases focus instead of
  // re-focusing it.
  function toggleFocus(card) {
    if (focusedCard && cardKey(focusedCard) === cardKey(card)) clearFocus();
    else setFocusedCard(card);
  }

  // Hovering the big preview is the actual "add to deck" action now.
  // Drop target: the whole deck panel. Drops add one copy to whichever zone
  // (Main/Sideboard) is active, same as clicking the inspector's image.
  el.deck.addEventListener('dragover', (e) => {
    if (!draggedCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.deck.classList.add('db-deck--dropping');
  });
  el.deck.addEventListener('dragleave', (e) => {
    if (!el.deck.contains(e.relatedTarget)) el.deck.classList.remove('db-deck--dropping');
  });
  el.deck.addEventListener('drop', (e) => {
    if (!draggedCard) return;
    e.preventDefault();
    const card = draggedCard;
    draggedCard = null;
    el.deck.classList.remove('db-deck--dropping');
    addToDeck(card, activeZone);
  });

  el.focusStage.addEventListener('click', () => {
    if (!focusedCard) return;
    addToDeck(focusedCard, activeZone);
  });

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

  // ---------------------------------------------------------------------
  // Status line (header, pink italic) - same behavior as the game's
  // StatusLabelUiKit: full opacity for 2.2s, then a 1s CSS fade.
  // ---------------------------------------------------------------------
  const DECK_MAX = 60;
  const SIDE_MAX = 15;
  const STATUS_HOLD_MS = 2200;
  const STATUS_FADE_MS = 1000;
  let statusTimer = null;
  // Running "x2, x3..." tally for repeated adds/removes of the same card
  // while its message is still on screen.
  const statusTally = { kind: null, name: null, count: 0, until: 0 };

  function showStatus(text) {
    clearTimeout(statusTimer);
    el.status.textContent = text;
    if (!text) { el.status.style.opacity = 0; return; }
    el.status.style.opacity = 1;
    statusTimer = setTimeout(() => { el.status.style.opacity = 0; }, STATUS_HOLD_MS);
  }

  // Any non-card message ("Limit reached", "Deck list exported", ...) also
  // ends the running tally.
  function setStatus(text) {
    statusTally.kind = null;
    showStatus(text);
  }

  function announceCardChange(kind, card) {
    const now = Date.now();
    const same = statusTally.kind === kind && statusTally.name === card.name && now < statusTally.until;
    statusTally.kind = kind;
    statusTally.name = card.name;
    statusTally.count = same ? statusTally.count + 1 : 1;
    statusTally.until = now + STATUS_HOLD_MS + STATUS_FADE_MS; // while any of the text is still visible
    showStatus((kind === 'add' ? 'Added ' : 'Removed ') + card.name + ' x' + statusTally.count);
  }

  // Max 4 copies of a card across all printings, main + sideboard combined
  // (same as the game); only basic lands are exempt.
  function copiesInDeckByName(name) {
    return nameTotalInZone(name, 'main') + nameTotalInZone(name, 'side');
  }

  function zoneFullMessage(zone) {
    return zone === 'main' ? 'Limit reached' : 'Sideboard full';
  }

  function addToDeck(card, zone) {
    const key = cardKey(card);
    const map = zoneMap(zone);
    const existing = map.get(key);
    const currentQty = existing ? existing.qty : 0;

    if (zoneTotal(zone) >= (zone === 'main' ? DECK_MAX : SIDE_MAX)) {
      setStatus(zoneFullMessage(zone));
      return;
    }
    if (!isBasicLand(card) && copiesInDeckByName(card.name) >= 4) {
      setStatus('Limit reached');
      return;
    }

    map.set(key, { card, qty: currentQty + 1 });
    afterDeckChange();
    announceCardChange('add', card);
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
    announceCardChange('remove', card);
  }

  function moveZone(card, fromZone) {
    const toZone = fromZone === 'main' ? 'side' : 'main';
    const fromMap = zoneMap(fromZone);
    const key = cardKey(card);
    const entry = fromMap.get(key);
    if (!entry) return;
    if (zoneTotal(toZone) + entry.qty > (toZone === 'main' ? DECK_MAX : SIDE_MAX)) {
      setStatus(zoneFullMessage(toZone));
      return;
    }
    fromMap.delete(key);
    const toMap = zoneMap(toZone);
    const existing = toMap.get(key);
    toMap.set(key, { card, qty: (existing ? existing.qty : 0) + entry.qty });
    afterDeckChange();
    setStatus('Moved ' + card.name + ' to ' + (toZone === 'main' ? 'Main' : 'Sideboard'));
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

  // Positions the floating row-preview to the left of the whole deck panel
  // (.db-deck), vertically following the cursor - never over the list or
  // the inspector above it, both of which live inside that same panel.
  function positionRowPreview(clientY) {
    const deckRect = el.deck.getBoundingClientRect();
    const rect = el.rowPreview.getBoundingClientRect();
    const width = rect.width || 250;
    const height = rect.height || (width * 7 / 5);

    let left = deckRect.left - width - 14;
    if (left < 8) left = 8;

    let top = clientY - height / 2;
    const maxTop = window.innerHeight - height - 8;
    top = Math.max(8, Math.min(top, maxTop));

    el.rowPreview.style.left = left + 'px';
    el.rowPreview.style.top = top + 'px';
  }

  function showRowPreview(card, clientY) {
    el.rowPreviewImg.src = card.imgNormal || card.imgSmall || '';
    el.rowPreviewImg.alt = card.name;
    el.rowPreview.classList.toggle('db-row-preview--alpha', isAlphaPrinting(card));
    el.rowPreview.hidden = false;
    positionRowPreview(clientY);
  }

  function hideRowPreview() {
    el.rowPreview.hidden = true;
  }

  function renderDeckList() {
    // The list is about to be torn down and rebuilt - if the cursor was
    // mid-hover over a row, its mouseleave won't fire once that row is
    // gone, so drop the preview explicitly instead of leaving it stuck.
    hideRowPreview();

    const map = zoneMap(activeZone);
    el.deckList.innerHTML = '';

    const entries = [...map.values()];
    const frag = document.createDocumentFragment();

    DECK_CATEGORIES.forEach((cat) => {
      const inCat = entries.filter((e) => deckCategory(e.card) === cat);
      // Categories always show, even empty (0 total, no rows underneath),
      // so the deck's whole shape is visible at a glance.

      inCat.sort((a, b) => a.card.name.localeCompare(b.card.name));
      const total = inCat.reduce((sum, e) => sum + e.qty, 0);

      const header = document.createElement('div');
      header.className = 'db-deck-category';
      const countEl = document.createElement('span');
      countEl.className = 'db-deck-category__count';
      countEl.textContent = total;
      header.appendChild(countEl);
      const labelEl = document.createElement('span');
      labelEl.textContent = DECK_CATEGORY_LABELS[cat];
      header.appendChild(labelEl);
      frag.appendChild(header);

      inCat.forEach(({ card, qty }) => {
        const row = document.createElement('div');
        row.className = 'db-deck-row';
        row.title = 'Click to remove one copy';

        const qtyEl = document.createElement('span');
        qtyEl.className = 'db-deck-row__qty';
        qtyEl.textContent = qty;
        row.appendChild(qtyEl);

        const nameEl = document.createElement('span');
        nameEl.className = 'db-deck-row__name';
        nameEl.textContent = card.name;
        row.appendChild(nameEl);

        const setEl = document.createElement('span');
        setEl.className = 'db-deck-row__set';
        // Symbol first, then the code. If the set has no symbol (or it
        // fails to load) the icon is dropped and only the code remains.
        const symEl = document.createElement('img');
        symEl.className = 'db-deck-row__set-symbol';
        symEl.alt = '';
        symEl.addEventListener('error', () => symEl.remove(), { once: true });
        symEl.src = 'https://svgs.scryfall.io/sets/' + encodeURIComponent((card.set || '').toLowerCase()) + '.svg';
        setEl.appendChild(symEl);
        setEl.appendChild(document.createTextNode(card.set));
        row.appendChild(setEl);

        const moveBtn = document.createElement('button');
        moveBtn.className = 'db-deck-row__btn';
        moveBtn.title = activeZone === 'main' ? 'Move to sideboard' : 'Move to main deck';
        moveBtn.textContent = '⇄';
        moveBtn.addEventListener('click', (e) => { e.stopPropagation(); moveZone(card, activeZone); });
        row.appendChild(moveBtn);

        // The whole row removes one copy now - no separate minus button.
        row.addEventListener('click', () => removeFromDeck(card, activeZone, false));

        row.addEventListener('mouseenter', (e) => showRowPreview(card, e.clientY));
        row.addEventListener('mousemove', (e) => positionRowPreview(e.clientY));
        row.addEventListener('mouseleave', hideRowPreview);

        frag.appendChild(row);
      });
    });

    el.deckList.appendChild(frag);
    renderCurve();
  }

  function renderCurve() {
    const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0,1,2,3,4,5,6+
    let max = 0;
    deckMain.forEach(({ card, qty }) => {
      if (primaryType(card.typeLine) === 'Land') return; // lands aren't part of a curve
      const cmc = Math.max(0, Math.round(card.cmc || 0));
      const idx = Math.min(cmc, 6);
      buckets[idx] += qty;
    });
    max = Math.max(1, ...buckets);

    el.curve.innerHTML = '';
    buckets.forEach((count, i) => {
      const bar = document.createElement('div');
      bar.className = 'db-curve__bar';
      const track = document.createElement('div');
      track.className = 'db-curve__track';
      track.title = count + ' card' + (count === 1 ? '' : 's');
      const fill = document.createElement('div');
      fill.className = 'db-curve__fill';
      fill.style.height = Math.round((count / max) * 100) + '%';
      track.appendChild(fill);
      const label = document.createElement('div');
      label.className = 'db-curve__label';
      label.textContent = i === 6 ? '6+' : String(i);
      bar.appendChild(track);
      bar.appendChild(label);
      el.curve.appendChild(bar);
    });
  }

  // ---------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------
  el.search.addEventListener('input', () => { filters.search = el.search.value; renderGrid(); });
  el.filterSet.addEventListener('change', () => { filters.set = el.filterSet.value; renderGrid(); });
  const COLOR_LABELS = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless', M: 'Multicolor' };

  function updateColorFilterButtonLabel() {
    const n = filters.colors.size;
    if (n === 0) el.colorFilterBtn.textContent = 'All colors';
    else if (n <= 2) el.colorFilterBtn.textContent = [...filters.colors].map((c) => COLOR_LABELS[c]).join(', ');
    else el.colorFilterBtn.textContent = n + ' colors';
  }

  el.colorFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.colorFilterMenu.hidden = !el.colorFilterMenu.hidden;
  });
  el.colorFilterMenu.addEventListener('click', (e) => e.stopPropagation());
  el.colorFilterMenu.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) filters.colors.add(box.value);
      else filters.colors.delete(box.value);
      updateColorFilterButtonLabel();
      renderGrid();
    });
  });
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
    setStatus(activeZone === 'main' ? 'Deck cleared' : 'Sideboard cleared');
  });

  el.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.exportMenu.hidden = !el.exportMenu.hidden;
  });
  document.addEventListener('click', () => { el.exportMenu.hidden = true; el.colorFilterMenu.hidden = true; });
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
    setStatus('Deck list exported');
  }

  function runExport(format) {
    const name = deckName();
    const base = slug(name);
    const main = sortedEntries('main');
    const side = sortedEntries('side');

    if (main.length === 0 && side.length === 0) {
      setStatus('Add some cards before exporting.');
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
