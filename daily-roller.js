/* Daily pack roller: a JS port of the game's BoosterPackRoller (single-pack path).
   Works in the browser (window.PackRoller) and in Node (module.exports).
   Rules mirror 90sMagic-dev-log-archive.md, Milestone 4:
   - Mythic counts as Rare. Basic lands are pulled out of every pool and only
     roll back in where the set really had them in packs (Alpha, Beta,
     Unlimited, Revised, and Arabian Nights' one accidental Mountain).
   - No duplicate card names in a pack (a basic can repeat only as a different print).
   - At most 3 basic lands per pack.
   - Result is stably sorted by tier (common incl. lands, uncommon, rare).
   Pulls are uniform within each pool. Box collation is not used (one pack a day). */
(function (root) {
  'use strict';

  // Chronological order of the 25 core sets (Alpha -> Urza's Destiny).
  var SET_ORDER = ['lea', 'leb', '2ed', 'arn', 'atq', '3ed', 'leg', 'drk', 'fem', '4ed', 'ice', 'chr', 'hml',
    'all', 'mir', 'vis', '5ed', 'wth', 'tmp', 'sth', 'exo', 'usg', 'ulg', '6ed', 'uds'];

  var SET_NAMES = {
    lea: 'Alpha', leb: 'Beta', '2ed': 'Unlimited', arn: 'Arabian Nights', atq: 'Antiquities', '3ed': 'Revised',
    leg: 'Legends', drk: 'The Dark', fem: 'Fallen Empires', '4ed': 'Fourth Edition', ice: 'Ice Age',
    chr: 'Chronicles', hml: 'Homelands', all: 'Alliances', mir: 'Mirage', vis: 'Visions', '5ed': 'Fifth Edition',
    wth: 'Weatherlight', tmp: 'Tempest', sth: 'Stronghold', exo: 'Exodus', usg: "Urza's Saga",
    ulg: "Urza's Legacy", '6ed': 'Sixth Edition', uds: "Urza's Destiny"
  };

  // c / u / r = slots per tier; combined = slots drawn from the merged uncommon+rare pool;
  // land = per-slot chance of a basic land (by slot tier).
  function std15() { return { size: 15, c: 11, u: 3, r: 1 }; }
  var DEFS = {};
  SET_ORDER.forEach(function (s) { DEFS[s] = std15(); });
  DEFS.lea.land = { c: 0.38, u: 0.215, r: 0.033 };
  DEFS.leb.land = { c: 0.38, u: 0.215, r: 0.041 };
  DEFS['2ed'].land = { c: 0.38, u: 0.215, r: 0.041 };
  DEFS['3ed'].land = { c: 0.38, u: 0.215, r: 0 };
  ['arn', 'atq', 'drk', 'fem', 'hml'].forEach(function (s) { DEFS[s] = { size: 8, c: 6, combined: 2, maxRares: 1 }; });
  DEFS.arn.land = { c: 1 / 246 };
  DEFS.all = { size: 12, c: 9, u: 2, r: 1 };
  DEFS.chr = { size: 12, c: 9, combined: 3, maxRares: 3 };

  var MAX_BASICS = 3;

  function isBasic(card) {
    var t = card.typeLine || '';
    return t.indexOf('Basic') !== -1 && t.indexOf('Land') !== -1;
  }
  function tierOf(card) {
    return card.rarity === 'common' ? 0 : card.rarity === 'uncommon' ? 1 : 2; // rare + mythic -> 2
  }
  function cardKey(card) { return card.set + '-' + card.collectorNumber; }

  // Scryfall id, recovered from the image URL (cards.json doesn't carry it separately).
  function scryfallId(card) {
    var m = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg/.exec(card.imgNormal || card.imgSmall || '');
    return m ? m[1] : null;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(allCards) {
    var bySet = {};
    allCards.forEach(function (c) { (bySet[c.set] = bySet[c.set] || []).push(c); });
    var poolCache = {};

    function pools(set) {
      if (poolCache[set]) return poolCache[set];
      var p = { c: [], u: [], r: [], lands: [], islands: [], combined: [] };
      (bySet[set] || []).forEach(function (card) {
        if (isBasic(card)) {
          p.lands.push(card);
          if (card.name === 'Island') p.islands.push(card);
          return;
        }
        if (card.rarity === 'common') p.c.push(card);
        else if (card.rarity === 'uncommon') p.u.push(card);
        else if (card.rarity === 'rare' || card.rarity === 'mythic') p.r.push(card);
      });
      p.combined = p.u.concat(p.r);
      poolCache[set] = p;
      return p;
    }

    function rollPack(set, rng) {
      rng = rng || Math.random;
      var def = DEFS[set];
      if (!def) throw new Error('No pack definition for set ' + set);
      var P = pools(set);
      var picked = [], names = {}, keys = {}, basics = 0, rares = 0;

      function valid(card, extra) {
        if (isBasic(card)) { if (basics >= MAX_BASICS || keys[cardKey(card)]) return false; }
        else if (names[card.name]) return false;
        return !extra || extra(card);
      }
      function draw(pool, extra) {
        if (!pool.length) return null;
        for (var i = 0; i < 40; i++) {
          var c = pool[Math.floor(rng() * pool.length)];
          if (valid(c, extra)) return c;
        }
        var ok = pool.filter(function (c) { return valid(c, extra); });
        return ok.length ? ok[Math.floor(rng() * ok.length)] : null;
      }
      function take(card) {
        picked.push(card);
        if (isBasic(card)) { basics++; keys[cardKey(card)] = true; } else names[card.name] = true;
        if (tierOf(card) === 2) rares++;
      }
      function roll(tierKey, count) {
        for (var i = 0; i < count; i++) {
          var card = null;
          var landChance = def.land && def.land[tierKey];
          if (landChance && basics < MAX_BASICS && rng() < landChance) {
            card = draw(tierKey === 'r' ? P.islands : P.lands);
          }
          if (!card) card = draw(P[tierKey]);
          if (card) take(card);
        }
      }

      roll('c', def.c || 0);
      roll('u', def.u || 0);
      roll('r', def.r || 0);
      for (var i = 0; i < (def.combined || 0); i++) {
        var card = draw(P.combined, function (c) { return tierOf(c) !== 2 || rares < def.maxRares; });
        if (card) take(card);
      }

      // Stable sort by tier so index 0 is always a common and the rare is last.
      return picked
        .map(function (c, i) { return { c: c, i: i }; })
        .sort(function (a, b) { return tierOf(a.c) - tierOf(b.c) || a.i - b.i; })
        .map(function (x) { return x.c; });
    }

    return { rollPack: rollPack, defs: DEFS };
  }

  // The set of the day: cycles Alpha -> Urza's Destiny every 25 days.
  // Day boundaries are America/New_York midnight. `startDate` is a 'YYYY-MM-DD' string
  // (the date Alpha is the daily set).
  function easternDate(now) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(now || new Date());
  }
  function dailySet(startDate, now) {
    var d = easternDate(now).split('-').map(Number);
    var s = startDate.split('-').map(Number);
    var days = Math.round((Date.UTC(d[0], d[1] - 1, d[2]) - Date.UTC(s[0], s[1] - 1, s[2])) / 86400000);
    var n = SET_ORDER.length;
    var idx = ((days % n) + n) % n;
    return { code: SET_ORDER[idx], index: idx, name: SET_NAMES[SET_ORDER[idx]], date: easternDate(now) };
  }

  var api = { SET_ORDER: SET_ORDER, SET_NAMES: SET_NAMES, DEFS: DEFS, create: create, isBasic: isBasic, tierOf: tierOf,
    scryfallId: scryfallId, mulberry32: mulberry32, dailySet: dailySet, easternDate: easternDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PackRoller = api;
})(typeof window !== 'undefined' ? window : this);
