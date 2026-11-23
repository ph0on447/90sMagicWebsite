(function () {
  'use strict';
  var API = window.DailyAPI;
  var R = window.PackRoller;
  var $ = function (id) { return document.getElementById(id); };
  var viewer = $('pack'), openBtn = $('openBtn');
  var setInfo = null, serverInfo = null, pack = [], idx = 0, opened = false, displayName = null, alreadyOpened = false;
  var boardData = null, mine = null;

  var fmt = function (v) { return v == null ? 'no price' : '$' + v.toFixed(2); };
  // Values come from the server (Scryfall's USD price snapshot); 0 means no price.
  function priceOf(card) { return card.value > 0 ? card.value : null; }

  function setMsg(html) { var m = $('dailyMsg'); m.innerHTML = html || ''; m.hidden = !html; }

  // ---------------------------------------------------------------- reveal layout (ported from the game's PackCardReveal)
  // Slot layouts are authored in a 1627 x 914 viewport and scaled to the stage; slot i is where the i-th revealed card parks.
  var REF_W = 1627, REF_H = 914, CARD_ASPECT = 63 / 88;
  var HOP_MS = 420, HOP_HEIGHT = 0.16, HOP_ROLL = 6;
  var focusFrac = 0.778;          // focus card height as a fraction of the stage (set from the 3D card in placeCard)
  var slots = [], parkedEls = [];

  function buildSlots(n, W, H) {
    var out = [];
    function add(cx, cy, h) { out.push({ x: cx / REF_W * W, y: cy / REF_H * H, h: h / REF_H * H }); }
    if (W / H < 1.5) {
      // Narrow screens: park cards in two rows along the top and bottom edges instead.
      var k = n - 1, per = Math.ceil(k / 2), h = H * 0.10, w = h * CARD_ASPECT, gap = 4;
      for (var i = 0; i < k; i++) {
        var row = i < per ? 0 : 1, col = row ? i - per : i, items = row ? k - per : per;
        var x0 = (W - (items * w + (items - 1) * gap)) / 2 + w / 2;
        out.push({ x: x0 + col * (w + gap), y: row ? H * 0.935 : H * 0.065, h: h });
      }
      return out;
    }
    var sx = [104.5, 279.5, 454.5], sy = [215, 456, 697], small = 232, med = 348, r, c;
    if (n <= 9) {
      var mx = [149, 413], my = [273, 636];
      for (r = 0; r < 2; r++) for (c = 0; c < 2; c++) add(mx[c], my[r], med);
      add(1218.5, 273, med); add(1218.5, 636, med); add(1483.5, 636, med);
    } else {
      for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) add(sx[c], sy[r], small);
      if (n >= 14) for (r = 0; r < 3; r++) add(1449.5, sy[r], small);
      add(1218.5, 273, med); add(1218.5, 636, med);
    }
    return out.slice(0, n - 1);
  }

  // Same markers and Power Nine cosmetic-Mythic override as the deckbuilder (and the game's RarityIconSet).
  var POWER_NINE = ['black lotus', 'ancestral recall', 'time walk', 'timetwister', 'mox emerald', 'mox jet', 'mox pearl', 'mox ruby', 'mox sapphire'];
  var RARITY = { common: ['C', 'r-c'], uncommon: ['UC', 'r-u'], rare: ['R', 'r-r'], mythic: ['M', 'r-m'] };
  function displayRarity(card) { return POWER_NINE.indexOf(card.name.toLowerCase()) !== -1 ? 'mythic' : (card.rarity || 'common'); }
  // Glow tier for the card: uncommon blue, rare purple, mythic (Power Nine) gold + purple beams. Commons get none.
  function glowClass(card) { return { uncommon: 'g-u', rare: 'g-r', mythic: 'g-m' }[displayRarity(card)] || ''; }
  function badgeHTML(card) {
    var rar = displayRarity(card), r = RARITY[rar] || RARITY.common;
    return '<span class="daily__badge ' + r[1] + '" title="' + rar + '">' + r[0] + '</span>';
  }
  function markerSize(h) { return (h * CARD_ASPECT * 14 / 185) + 'px'; }

  function placeParked(el, x, y, h, roll) {
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.height = h + 'px';
    el.style.fontSize = Math.max(9, h * 0.075) + 'px';
    el.style.setProperty('--mk', markerSize(h));
    el.style.transform = 'translate(-50%, -50%) rotate(' + (roll || 0) + 'deg)';
  }

  function layout() {
    var rv = $('reveal'), W = rv.clientWidth, H = rv.clientHeight;
    if (!W || !pack.length) return;
    var wrap = $('cardWrap');
    wrap.style.left = '50%'; wrap.style.top = '50%';
    wrap.style.setProperty('--card-h', focusFrac * H + 'px');
    wrap.style.setProperty('--mk', markerSize(focusFrac * H));
    slots = buildSlots(pack.length, W, H);
    parkedEls.forEach(function (el, i) { if (el && !el._hopping && slots[i]) placeParked(el, slots[i].x, slots[i].y, slots[i].h, 0); });
  }

  // Click the focused card a second time: it hops in an eased arc to its slot while the next card takes its place.
  function hopCard(i) {
    var rv = $('reveal'), W = rv.clientWidth, H = rv.clientHeight, slot = slots[i];
    var card = pack[i];
    var el = document.createElement('div');
    el.className = 'daily__parked' + (card.set === 'lea' ? ' is-alpha' : '') + (glowClass(card) ? ' has-glow glow-on ' + glowClass(card) : '');
    el.innerHTML = '<img src="' + card.imgNormal + '" alt="">' + badgeHTML(card) +
      '<span class="daily__ptag"><small>' + card.name + '</small><b>' + fmt(priceOf(card)) + '</b></span>';
    el.addEventListener('mousemove', function (e) { showPreview(card, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', hidePreview);
    $('parked').appendChild(el);
    parkedEls[i] = el;
    var fx = W / 2, fy = H / 2, fh = focusFrac * H;
    if (!slot) { placeParked(el, fx, fy, fh, 0); return; }
    var leftward = slot.x < fx, t0 = null;
    el._hopping = true; el.classList.add('is-hopping');
    placeParked(el, fx, fy, fh, 0);
    requestAnimationFrame(function step(now) {
      if (t0 === null) t0 = now;
      var u = Math.min(1, (now - t0) / HOP_MS), e = u * u * (3 - 2 * u), arc = Math.sin(Math.PI * u);
      var s = slots[i] || slot;   // follow window resizes mid-hop
      placeParked(el, fx + (s.x - fx) * e, fy + (s.y - fy) * e - HOP_HEIGHT * H * arc, fh + (s.h - fh) * e, (leftward ? -HOP_ROLL : HOP_ROLL) * arc);
      if (u < 1) requestAnimationFrame(step);
      else { el._hopping = false; el.classList.remove('is-hopping'); placeParked(el, s.x, s.y, s.h, 0); }
    });
  }

  function showCard() {
    var card = pack[idx], btn = $('cardBtn'), inner = btn.firstElementChild;
    inner.style.transition = 'none';             // snap back to the card back without a flip animation
    btn.classList.remove('is-flipped');
    void inner.offsetWidth;
    inner.style.transition = '';
    btn.classList.toggle('is-alpha', card.set === 'lea');
    btn.classList.remove('is-done');
    var wrap = $('cardWrap');
    wrap.classList.remove('has-glow', 'glow-on', 'g-u', 'g-r', 'g-m');
    if (glowClass(card)) wrap.classList.add('has-glow', glowClass(card));
    $('cardBadge').hidden = true;
    $('cardImg').src = card.imgNormal; $('cardImg').alt = card.name;
    $('cardPrice').innerHTML = '';
    updateCounter();
  }

  // "Card 3 / 15 \u00b7 Total $12.34": the total only counts cards already flipped face-up.
  function updateCounter() {
    var upto = idx + ($('cardBtn').classList.contains('is-flipped') ? 1 : 0), sum = 0;
    for (var k = 0; k < upto; k++) sum += pack[k].value > 0 ? pack[k].value : 0;
    $('counter').textContent = 'Card ' + (idx + 1) + ' / ' + pack.length + ' \u00b7 Total $' + sum.toFixed(2);
  }

  function onCardClick() {
    var btn = $('cardBtn');
    if (btn.classList.contains('is-done')) return;
    if (!btn.classList.contains('is-flipped')) {
      var i = idx, card = pack[i];
      btn.classList.add('is-flipped');
      updateCounter();
      $('cardWrap').classList.add('glow-on');
      var b = $('cardBadge'); b.outerHTML = badgeHTML(card).replace('class="daily__badge', 'id="cardBadge" class="daily__badge');
      if (i === pack.length - 1) { var r0 = run; setTimeout(function () { if (r0 === run) showSummary(); }, 1000); }   // last card: move on by itself
      if (idx === i) $('cardPrice').innerHTML = card.name + '<br><b>' + fmt(priceOf(card)) + '</b>';
      return;
    }
    if (idx >= pack.length - 1) return showSummary();   // last card is already out: one more click moves on
    hopCard(idx);
    idx++;
    showCard();
  }

  // ---------------------------------------------------------------- summary + leaderboards
  var preview = $('preview'), previewImg = preview.querySelector('img');
  function showPreview(card, x, y) {
    previewImg.src = card.imgNormal;
    preview._key = card.imgNormal;
    preview.classList.toggle('is-alpha', card.set === 'lea');
    preview.hidden = false;
    var w = 300, h = w * 88 / 63;
    var left = x + 24 + w > window.innerWidth ? x - 24 - w : x + 24;
    preview.style.left = Math.max(8, left) + 'px';
    preview.style.top = Math.min(Math.max(8, y - h / 2), window.innerHeight - h - 8) + 'px';
  }
  function hidePreview() { preview.hidden = true; preview._i = null; preview._key = null; }

  // Touch screens have no hover: a tap shows the preview (via the synthesized mouse events), and tapping the same
  // card again hides it. Scrolling also dismisses it.
  var lastTouch = false, openKeyAtTouch = null;
  document.addEventListener('pointerdown', function (e) {
    lastTouch = e.pointerType === 'touch';
    openKeyAtTouch = lastTouch && !preview.hidden ? preview._key : null;
  }, true);
  document.addEventListener('click', function () {
    if (lastTouch && openKeyAtTouch && !preview.hidden && preview._key === openKeyAtTouch) hidePreview();
    openKeyAtTouch = null;
  }, true);
  window.addEventListener('scroll', function () { if (lastTouch && !preview.hidden) hidePreview(); }, { passive: true });

  function showSummary() {
    if ($('cardBtn').classList.contains('is-done')) return;
    var total = 0, best = null;
    pack.forEach(function (c) {
      var v = priceOf(c); total += v || 0;
      if (v != null && (!best || v > best.v)) best = { c: c, v: v };
    });
    $('cardBtn').classList.add('is-done');
    $('counter').textContent = '';
    $('total').textContent = '$' + total.toFixed(2);
    $('best').textContent = best ? 'Best pull: ' + best.c.name + ' (' + fmt(best.v) + ')' : '';
    mine = { total: total, best: best };
    $('summary').hidden = false;
    renderBoards();
    loadBoards();
    $('summary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Share: native share sheet where available (phones), otherwise copy the text to the clipboard.
  async function shareResult() {
    var btn = $('shareBtn'), setName = setInfo ? setInfo.name : '';
    var total = $('total').textContent;
    var lines = ["Radicle! | '90s MtG Pack Opener \u2013 " + (setName ? setName + ' booster' : 'Daily booster') + ': ' + total + ' value'];
    var pr = $('rankPack').textContent.replace(/^Your pack: /, '').trim();
    if (pr) lines.push('Pack ' + pr.replace(' today', ''));
    var best = $('best').textContent.replace(/^Best pull: /, '').trim();
    if (best) lines.push('Best pull: ' + best);
    lines.push('Think you can do better? Open yours at wrongwaygames.com/radicle');
    var text = lines.join('\n');
    if (navigator.share) {
      try { await navigator.share({ text: text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    var ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) {}
      document.body.removeChild(ta);
    }
    var old = btn.textContent;
    btn.textContent = ok ? 'Copied!' : 'Copy failed';
    setTimeout(function () { btn.textContent = old; }, 2000);
  }

  function rankOf(list, key, mineVal) {
    var higher = list.filter(function (e) { return e[key] > mineVal; }).length;
    return higher + 1;
  }

  // Live boards already contain the player's own row once the pack is saved; we only mark it, and append it
  // below the top 25 when it ranks lower. Placeholder boards (no backend) insert a "You" row instead.
  // Click a pack on the "top packs" board to focus it: green outline + that player's cards and values.
  var focusId = null;
  function markFocus() {
    document.querySelectorAll('#boardPacks li').forEach(function (li) { li.classList.toggle('is-focus', !!focusId && li._pid === focusId); });
  }
  function closeFocus() { focusId = null; $('focusPanel').hidden = true; hidePreview(); markFocus(); }
  async function toggleFocus(pid, player, total) {
    if (focusId === pid) return closeFocus();
    focusId = pid; markFocus();
    var cards;
    if (pid === 'mine') {
      cards = pack.map(function (c) { return { name: c.name, set: c.set, imgSmall: c.imgSmall, imgNormal: c.imgNormal, value: c.value }; });
    } else {
      var res = await API.client.rpc('pack_contents', { p_pack_id: pid });
      if (focusId !== pid) return;
      if (res.error) { focusId = null; markFocus(); return; }
      cards = res.data.map(function (c) { return { name: c.card_name, set: c.set_code, imgSmall: c.img_small, imgNormal: c.img_normal, value: Number(c.value) }; });
    }
    $('focusTitle').textContent = player + "'s pack";
    var sm = document.createElement('small'); sm.textContent = fmt(total) + ' \u00b7 ' + cards.length + ' cards'; $('focusTitle').appendChild(sm);
    var ul = $('focusCards'); ul.innerHTML = '';
    cards.forEach(function (c) {
      var li = document.createElement('li');
      if (c.set === 'lea') li.className = 'is-alpha';   // Alpha corners are rounder
      var img = document.createElement('img'); img.src = c.imgSmall; img.alt = c.name;
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.name;
      var v = document.createElement('b'); v.textContent = fmt(c.value > 0 ? c.value : null);
      li.append(img, nm, v);
      li.addEventListener('mousemove', function (ev) { showPreview(c, ev.clientX, ev.clientY); });
      li.addEventListener('mouseleave', hidePreview);
      ul.appendChild(li);
    });
    $('focusPanel').hidden = false;
    var rect = $('focusPanel').getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) $('focusPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderBoard(ol, rows, key, kind, mineEntry, count, live, youRank) {
    ol.innerHTML = '';
    var list = (rows || []).slice().sort(function (a, b) { return b[key] - a[key]; }).map(function (r) { return { r: r, you: false }; });
    var shownRank = null;
    if (mineEntry && live) {
      for (var k = 0; k < list.length; k++) {
        if (list[k].r.player === displayName && Math.abs(list[k].r[key] - mineEntry[key]) < 0.005) { list[k].you = true; shownRank = k + 1; break; }
      }
      if (!shownRank) shownRank = youRank || null;
    } else if (mineEntry) {
      shownRank = list.filter(function (e) { return e.r[key] > mineEntry[key]; }).length + 1;
      list.splice(shownRank - 1, 0, { r: mineEntry, you: true });
    }
    function li(rank, e) {
      var el = document.createElement('li');
      if (!e) { el.className = 'is-empty'; el.innerHTML = '<span class="rk">' + rank + '</span><span class="who">&mdash;</span><span class="val"></span>'; return el; }
      var r = e.r, name = e.you ? 'You' : r.player;
      var who = kind === 'cards'
        ? (r.imgSmall ? '<img src="' + r.imgSmall + '" alt="">' : '') + '<span>' + (r.cardName || '') + ' <small>' + name + '</small></span>'
        : '<span>' + name + '</span>';
      if (e.you) el.className = 'is-you';
      var big = r.imgNormal || (r.imgSmall ? r.imgSmall.replace('/small/', '/normal/') : '');
      if (kind === 'cards' && big) {
        var pv = { imgNormal: big, set: r.set };
        el.classList.add('has-preview');
        el.addEventListener('mousemove', function (ev) { showPreview(pv, ev.clientX, ev.clientY); });
        el.addEventListener('mouseleave', hidePreview);
      }
      el.innerHTML = '<span class="rk">' + rank + '</span><span class="who">' + who + '</span><span class="val">' + fmt(r[key]) + '</span>';
      if (kind === 'packs' && (r.packId || e.you)) {
        var pid = r.packId || 'mine';
        el._pid = pid; el.classList.add('is-clickable');
        el.addEventListener('click', function () { toggleFocus(pid, r.player, r.total); });
      }
      return el;
    }
    for (var i = 0; i < 25; i++) ol.appendChild(li(i + 1, list[i]));
    if (shownRank && shownRank > 25 && mineEntry) {
      var sep = document.createElement('li'); sep.className = 'sep'; sep.textContent = '…'; ol.appendChild(sep);
      ol.appendChild(li(shownRank, { r: mineEntry, you: true }));
    }
    if (kind === 'packs') markFocus();
    var note = ol.parentNode.querySelector('.daily__board-note');
    if (note) note.remove();
    if (!live) {
      note = document.createElement('p'); note.className = 'daily__board-note';
      note.textContent = 'Leaderboards are unavailable right now.';
      ol.parentNode.appendChild(note);
    }
    return { rank: shownRank, of: count != null ? count : (rows || []).length + (live ? 0 : (mineEntry ? 1 : 0)) };
  }

  // "(Top 8%)" or "(Bottom 12%)" depending on which half of today's entries the player falls in.
  function percentile(rank, of) {
    if (!rank || !of || of < 2) return '';
    var top = rank / of * 100;
    if (top <= 50) return ' (Top ' + Math.max(1, Math.ceil(top)) + '%)';
    return ' (Bottom ' + Math.max(1, Math.ceil((of - rank + 1) / of * 100)) + '%)';
  }

  function renderBoards() {
    var live = !!(boardData && boardData.live);
    var packs = boardData && boardData.packs, cards = boardData && boardData.cards;
    var mp = mine ? { player: displayName || 'You', total: mine.total } : null;
    var mc = mine && mine.best ? { player: displayName || 'You', value: mine.best.v, cardName: mine.best.c.name, imgSmall: mine.best.c.imgSmall, imgNormal: mine.best.c.imgNormal, set: mine.best.c.set } : null;
    var ranks = boardData && boardData.ranks;
    var rp = renderBoard($('boardPacks'), packs, 'total', 'packs', mp, boardData && boardData.packCount, live, ranks && ranks.packRank);
    var rc = renderBoard($('boardCards'), cards, 'value', 'cards', mc, boardData && boardData.cardCount, live, ranks && ranks.cardRank);
    if (!mine) return;
    if (!live) {
      $('rankPack').textContent = 'Daily ranks will appear when the leaderboards are reachable.';
      $('rankCard').textContent = '';
    } else {
      $('rankPack').innerHTML = rp.rank ? 'Your pack: rank <b>#' + rp.rank + '</b> of ' + rp.of + ' today' + percentile(rp.rank, rp.of) : '';
      $('rankCard').innerHTML = mc && rc.rank ? 'Your best card: rank <b>#' + rc.rank + '</b> of ' + rc.of + ' today' + percentile(rc.rank, rc.of) : '';
    }
  }

  function loadBoards() {
    return window.DailyBoards.load(serverInfo ? serverInfo.day : R.easternDate(), {}).then(function (b) { boardData = b; renderBoards(); });
  }

  // ---------------------------------------------------------------- pack camera + open sequence
  // Camera/scene constants shared with the GLB (pack-15.glb is authored in mm, read as "m").
  var CAM_R = 316;              // camera distance to the pack centre
  var CARD_APPROACH = 94.8;     // how far the card ends up toward the camera
  var CARD_END_SCALE = 1.048;   // card scale at the end of the clip
  var CARD_H = 88;              // card height in mm
  var HOME_ORBIT = '0deg 80deg ' + CAM_R + 'm';

  // Let go of the pack and it eases back to the front-facing pose.
  var dragging = false;
  viewer.addEventListener('pointerdown', function () { if (!opened) dragging = true; });
  window.addEventListener('pointerup', snapBack);
  window.addEventListener('pointercancel', snapBack);
  function snapBack() {
    if (!dragging) return;
    dragging = false;
    if (!opened) viewer.cameraOrbit = HOME_ORBIT;
  }

  // Spin the pack around to its back while the open clip plays.
  function spinToBack(ms) {
    viewer.removeAttribute('camera-controls');
    viewer.minCameraOrbit = '-Infinity 0deg ' + CAM_R + 'm';
    viewer.maxCameraOrbit = 'Infinity 180deg ' + CAM_R + 'm';
    // Start from wherever the pack is facing now, and finish on the back (-180 and 180 are the same view).
    var o = viewer.getCameraOrbit(), from = o.theta * 180 / Math.PI, p0 = o.phi * 180 / Math.PI, p1 = 90;
    var to = from < 0 ? -180 : 180, t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      viewer.cameraOrbit = (from + (to - from) * e) + 'deg ' + (p0 + (p1 - p0) * e) + 'deg ' + CAM_R + 'm';
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // The DOM card must land exactly over the 3D card's final pose: centred, sized from the camera's FOV.
  function measureFocus() {
    var r = viewer.getBoundingClientRect();
    var fov = (viewer.getFieldOfView ? viewer.getFieldOfView() : 30) * Math.PI / 180;
    var dist = CAM_R - CARD_APPROACH;
    focusFrac = (CARD_H * CARD_END_SCALE) / (2 * Math.tan(fov / 2) * dist);
    return r;
  }

  var revealed = false, run = 0;
  function enterReveal() {
    if (revealed) return; revealed = true;
    viewer.pause();
    measureFocus();
    idx = 0; parkedEls = [];
    $('parked').innerHTML = '';
    showCard();
    $('reveal').hidden = false;
    layout();
    $('packView').hidden = true;   // the DOM card takes over from the 3D one in the same frame
  }

  // A tab left open past midnight (Eastern) would still show the old day's set: reload once the day changes.
  function checkDay() {
    if (!serverInfo || (opened && !revealed)) return false;
    if (R.easternDate() !== serverInfo.day) { location.reload(); return true; }
    return false;
  }
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });

  // Countdown to the next midnight in Eastern time (the daily reset).
  var etClock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  function tickReset() {
    var el = $('resetTimer'); if (!el) return;
    var p = {}; etClock.formatToParts(new Date()).forEach(function (x) { p[x.type] = +x.value; });
    var left = 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
    var h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
    el.textContent = h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    if (left >= 86399) checkDay();
  }
  tickReset(); setInterval(tickReset, 1000);

  async function openPack() {
    if (opened) return;
    if (checkDay()) return;
    var session = await API.getSession();
    if (!session) return API.signIn();
    opened = true; revealed = false; openBtn.disabled = true;
    setMsg('');
    var myRun = ++run;
    dragging = false;
    viewer.interpolationDecay = 0;
    var req = API.open();
    spinToBack(1000);
    var res;
    try { res = await req; }
    catch (e) {
      if (myRun !== run) return;
      reset();
      setMsg('Could not open your pack: ' + e.message + '. Please try again.');
      return;
    }
    if (myRun !== run) return;
    pack = res.cards; displayName = res.displayName; alreadyOpened = true;
    pack.forEach(function (c) { new Image().src = c.imgNormal; new Image().src = c.imgSmall; });
    viewer.animationName = 'Animation';
    viewer.currentTime = 0;
    viewer.addEventListener('finished', enterReveal, { once: true });
    viewer.play({ repetitions: 1 });
    // Switch a hair before the clip ends so the pack can never snap back to its start pose.
    (function watch() {
      if (revealed || !opened) return;
      var d = viewer.duration;
      if (d > 0 && viewer.currentTime >= d - 0.03) return enterReveal();
      requestAnimationFrame(watch);
    })();
    setTimeout(function () { if (myRun === run) enterReveal(); }, ((viewer.duration || 4.5) + 1.5) * 1000);
  }

  function reset() {
    run++; opened = false; revealed = false; openBtn.disabled = false; mine = null;
    if (alreadyOpened) openBtn.textContent = "View today's pack";
    hidePreview();
    $('summary').hidden = true; $('reveal').hidden = true; $('packView').hidden = false;
    $('parked').innerHTML = ''; parkedEls = [];
    viewer.pause(); viewer.currentTime = 0;
    viewer.setAttribute('camera-controls', '');
    viewer.minCameraOrbit = '-180deg 55deg ' + CAM_R + 'm';
    viewer.maxCameraOrbit = '180deg 110deg ' + CAM_R + 'm';
    viewer.interpolationDecay = 100;
    viewer.cameraOrbit = HOME_ORBIT;
    renderBoards();
  }

  // Button + account line reflect sign-in state and whether today's pack has been opened.
  async function refreshAuth() {
    var session = await API.getSession();
    if (!session) {
      displayName = null; alreadyOpened = false;
      openBtn.textContent = 'Sign in with Discord';
      setMsg('Sign in with Discord to open your free pack. Discord shares your username and email with this site\'s sign-in only; only your Discord display name appears on the leaderboards.');
      return;
    }
    try {
      var st = await API.status();
      displayName = st.displayName; alreadyOpened = !!st.alreadyOpened;
    } catch (e) { setMsg('Could not reach the server: ' + e.message); return; }
    openBtn.textContent = alreadyOpened ? "View today's pack" : 'Open pack';
    setMsg('Signed in as <b></b> &middot; <a href="#" id="signOut">Sign out</a>');
    $('dailyMsg').querySelector('b').textContent = displayName;
    $('signOut').addEventListener('click', function (e) { e.preventDefault(); API.signOut(); });
    loadBoards();
  }

  // ---------------------------------------------------------------- pack model + skin for today's set
  // Three pack models (8 / 12 / 15 cards) share one open/swing/card clip; each set's skin image and crimp/fin
  // metal colours are applied at runtime from Assets/Packs/packs.json. Sets with several box-art variants
  // rotate through them each time the 25-day cycle repeats.
  function daysBetween(a, b) {
    var x = a.split('-').map(Number), y = b.split('-').map(Number);
    return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
  }
  async function setupPack() {
    var cfg = await fetch('Assets/Packs/packs.json').then(function (r) { return r.json(); });
    var set = cfg.sets[setInfo.code];
    if (!set) return;
    var n = set.variants.length, cycle = Math.floor(daysBetween(serverInfo.cycleStart, serverInfo.day) / 25);
    var v = set.variants[((cycle % n) + n) % n];
    viewer.style.opacity = '0';
    await new Promise(function (res) {
      viewer.addEventListener('load', res, { once: true });
      viewer.src = 'Assets/Packs/pack-' + set.size + '.glb';
    });
    var mats = viewer.model.materials;
    var byName = function (nm) { return mats.filter(function (m) { return m.name === nm; })[0]; };
    function paint(m, c) {
      if (!m || !c) return;
      m.pbrMetallicRoughness.setBaseColorFactor([c.color[0], c.color[1], c.color[2], 1]);
      m.pbrMetallicRoughness.setMetallicFactor(c.metallic);
      m.pbrMetallicRoughness.setRoughnessFactor(c.rough);
    }
    paint(byName('Pack_Crimp'), v.crimp);
    paint(byName('Pack_FinMat'), v.fin);
    var skin = byName('Pack_Skin_Daily');
    if (skin) {
      var tex = await viewer.createTexture('Assets/Packs/' + v.skin);
      skin.pbrMetallicRoughness.baseColorTexture.setTexture(tex);
    }
    viewer.pause();
    viewer.style.opacity = '';
  }

  async function init() {
    // model-viewer is a module script and may not have registered yet.
    await customElements.whenDefined('model-viewer');
    renderBoards();   // placeholder rows straight away
    try { serverInfo = await API.info(); }
    catch (e) { setMsg('Could not reach the server: ' + e.message); return; }
    setInfo = serverInfo.today;
    $('dailySetName').textContent = setInfo.name;
    $('tomorrowSetName').textContent = serverInfo.tomorrow.name;
    API.onAuth(function (ev) { if ((ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') && !opened) refreshAuth(); });
    try { await setupPack(); } catch (e) { console.warn('Pack model failed to load', e); viewer.style.opacity = ''; }
    openBtn.disabled = false;
    await refreshAuth();
    loadBoards();
  }

  window.addEventListener('resize', function () { if (revealed && !$('reveal').hidden) layout(); });
  openBtn.addEventListener('click', openPack);
  $('cardBtn').addEventListener('click', onCardClick);
  $('againBtn').addEventListener('click', reset);
  $('shareBtn').addEventListener('click', shareResult);
  init();
})();
