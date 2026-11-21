/* Daily leaderboard data layer (Supabase).

   DailyBoards.load(dateKey) -> Promise<{ packs, cards, packCount, cardCount, ranks, live:true } | null>
     packs: [{ player, total }]  cards: [{ player, value, cardName, imgSmall, imgNormal, set }]  (top 25 each)
     ranks: { packRank, cardRank } for the signed-in player once they have opened today's pack, else null.
     Returns null if the server can't be reached (the page shows placeholder boards).

   Add ?demo=1 to the page URL to preview the boards with made-up data. */
(function () {
  'use strict';

  var NAMES = ['Jace_Fan92', 'ShivanDragon', 'BirdsOfParadise', 'DeckMaster', 'Serra_Angel', 'BlackBorder', 'MoxEmerald',
    'TimeWalker', 'LordOfAtlantis', 'WrathOfGod', 'ForceOfWill', 'Counterspell', 'LlanowarElf', 'Hypnotic', 'SwordsToPlow',
    'JuzamDjinn', 'SengirVamp', 'PrimalOrder', 'FireballFan', 'Ankh_of_Mishra', 'TinkerTime', 'Mahamoti', 'SerendibEfreet',
    'Gaeas_Cradle', 'IceAgeKid', 'WeatherLight', 'MirageMan', 'Tempest93', 'UrzaFan', 'Zuran_Orb'];

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function demo(dateKey, ctx) {
    var r = rng(parseInt(dateKey.replace(/-/g, ''), 10));
    var pool = (ctx && ctx.cards) || [];
    var packs = [], cards = [];
    for (var i = 0; i < 40; i++) {
      var p = NAMES[Math.floor(r() * NAMES.length)] + (i > 29 ? i : '');
      packs.push({ player: p, total: Math.round(Math.pow(r(), 3.2) * 900 * 100) / 100 + 2 });
      var c = pool.length ? pool[Math.floor(r() * pool.length)] : null;
      cards.push({ player: NAMES[Math.floor(r() * NAMES.length)], value: Math.round(Math.pow(r(), 4) * 700 * 100) / 100 + 1,
        cardName: c ? c.name : 'Mystery Card', imgSmall: c ? c.imgSmall : '', imgNormal: c ? c.imgNormal : '', set: c ? c.set : '' });
    }
    return { packs: packs, cards: cards };
  }

  window.DailyBoards = {
    load: async function (dateKey, ctx) {
      if (new URLSearchParams(location.search).get('demo')) return demo(dateKey, ctx);
      try {
        var api = window.DailyAPI, c = api.client, session = await api.getSession();
        var res = await Promise.all([
          c.rpc('top_packs', { p_day: dateKey, p_limit: 25 }),
          c.rpc('top_pulls', { p_day: dateKey, p_limit: 25 }),
          session ? c.rpc('my_ranks', { p_day: dateKey }) : Promise.resolve({ data: [] })
        ]);
        if (res[0].error || res[1].error) return null;
        var r = (res[2].data || [])[0] || null;
        return {
          live: true,
          packs: res[0].data.map(function (x) { return { player: x.player, total: Number(x.total), packId: x.pack_id }; }),
          cards: res[1].data.map(function (x) {
            return { player: x.player, value: Number(x.value), cardName: x.card_name, imgSmall: x.img_small, imgNormal: x.img_normal, set: x.set_code };
          }),
          packCount: r ? Number(r.pack_count) : null,
          cardCount: r ? Number(r.card_count) : null,
          ranks: r ? { packRank: Number(r.pack_rank), cardRank: Number(r.card_rank) } : null
        };
      } catch (e) { console.warn('Leaderboards unavailable', e); return null; }
    }
  };
})();
