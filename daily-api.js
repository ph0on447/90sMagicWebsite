/* Daily pack back end client (Supabase). Exposes window.DailyAPI.
   The publishable key below is meant to be public; row-level security and the server function protect the data. */
(function () {
  'use strict';
  var URL = 'https://umsyxuvztomcqremqkte.supabase.co';
  var KEY = 'sb_publishable_TG0bGVkXJtHTmn2-OJsgfQ_x7ot9-i2';
  var client = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

  async function call(body) {
    var r = await client.functions.invoke('daily', { body: body });
    if (r.error) {
      var msg = r.error.message;
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* keep default */ }
      throw new Error(msg);
    }
    return r.data;
  }

  window.DailyAPI = {
    client: client,
    info: function () { return call({ action: 'info' }); },
    status: function () { return call({ action: 'status' }); },
    open: function () { return call({ action: 'open' }); },
    getSession: async function () { return (await client.auth.getSession()).data.session; },
    signIn: function () {
      return client.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
    },
    signOut: function () { return client.auth.signOut(); },
    onAuth: function (cb) { return client.auth.onAuthStateChange(cb); }
  };
})();
