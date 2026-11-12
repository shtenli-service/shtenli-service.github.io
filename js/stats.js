/*
 * Анонимный счётчик визитов. Никаких идентификаторов посетителя: в браузере хранятся только две даты —
 * shkip_first (первый визит) и shkip_last (когда этот браузер последний раз учтён). Один визит в день.
 */
(function () {
  'use strict';

  function store(k, v) {
    try {
      if (v === undefined) return window.localStorage.getItem(k);
      window.localStorage.setItem(k, v);
    } catch (e) { /* хранилище недоступно */ }
    return null;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  var now = new Date();
  var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

  var last = store('shkip_last');
  if (last === today) return;
  var first = store('shkip_first');
  var isNew = !first;

  // Определяет ключ источника по имени (utm_source) или имени хоста (referrer).
  function classify(s) {
    var labels = s.split('.');
    function L(x) { return labels.indexOf(x) !== -1; }
    function tail(x) { return s === x || s.slice(-(x.length + 1)) === '.' + x; }
    if (L('gemini')) return 'gemini';
    if (L('chatgpt') || L('openai')) return 'chatgpt';
    if (L('perplexity')) return 'perplexity';
    if (L('copilot')) return 'copilot';
    if (L('deepseek')) return 'deepseek';
    if (L('claude')) return 'claude';
    if (L('grok') || tail('x.ai')) return 'grok';
    if (L('google')) return 'google';
    if (L('yandex') || tail('ya.ru') || L('dzen')) return 'yandex';
    if (L('kufar')) return 'kufar';
    if (L('vk') || L('vkontakte')) return 'vk';
    if (tail('ok.ru') || s === 'ok' || L('odnoklassniki')) return 'ok';
    if (L('tiktok')) return 'tiktok';
    if (L('instagram')) return 'instagram';
    if (tail('t.me') || L('telegram') || L('viber') || L('whatsapp')) return 'messengers';
    if (L('onliner')) return 'onliner';
    if (L('2gis')) return '2gis';
    if (s === 'direct') return 'direct';
    return 'other';
  }

  function sourceKey() {
    var utm = '';
    try {
      var m = /[?&]utm_source=([^&#]*)/.exec(window.location.search);
      if (m) utm = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim().toLowerCase();
    } catch (e) { utm = ''; }
    if (utm) return classify(utm);

    var ref = document.referrer;
    if (!ref) return 'direct';
    var host = '';
    try {
      var u = new URL(ref);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'direct';
      host = u.hostname.toLowerCase();
    } catch (e) { return 'direct'; }
    if (!host || host === window.location.hostname.toLowerCase()) return 'direct';
    return classify(host);
  }

  var url = (window.SHKIP_API || '') + '/api/visit';
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src: sourceKey(), 'new': isNew }),
      keepalive: true
    }).then(function (r) {
      if (!r.ok) return;
      store('shkip_last', today);
      if (isNew) store('shkip_first', today);
    }).catch(function () { /* тихо: повторим при следующей загрузке */ });
  } catch (e) { /* ignore */ }
})();
