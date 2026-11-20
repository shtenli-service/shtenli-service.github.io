/*
 * Анонимный счётчик визитов и целей. Никаких идентификаторов посетителя: в браузере хранятся только даты —
 * shkip_first (первый визит), shkip_last (когда этот браузер последний раз учтён), shkip_g_<цель> (когда цель последний
 * раз учтена) и источник сегодняшнего визита (shkip_src). Один визит и одна отметка каждой цели в день.
 * Сервер получает только источник, признак «впервые» и сколько дней прошло с прошлого учтённого раза (gap) —
 * по gap кабинет считает каждого посетителя один раз за неделю или месяц.
 *
 * Роботы не учитываются: браузеры, которыми управляет программа, и известные роботы по названию браузера.
 * Визит засчитывается, только если человек пробыл на странице 3 секунды или что-то сделал (прокрутка, касание, мышь,
 * клавиатура); если закрыл сразу — сервер получает только отметку «короткий заход», без визита.
 *
 * Цели: open — открыли запись, slot — выбрали время, booking — отправили заявку (эти две вызывает js/booking.js через
 * window.shkipGoal), call — нажали телефон, tg / viber — мессенджеры, route_y / route_g — маршрут в Яндекс / Google
 * Картах, email — нажали почту. Если на странице подключена Яндекс Метрика (window.SHKIP_YM — номер счётчика),
 * те же цели уходят и туда.
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
  function dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN;
  }
  // Дней с прошлой отметки; 0 — неизвестно (первый раз или стёртые данные).
  function gapSince(last) {
    var g = Math.round(dayNum(today) - dayNum(last));
    return g >= 1 ? g : 0;
  }

  var api = (window.SHKIP_API || '') + '/api/';
  function post(path, body) {
    try {
      return fetch(api + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).then(function (r) { return r.ok; }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

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
    if (L('bing')) return 'bing';
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

  // Явные имена роботов (не просто «bot»: есть телефоны Cubot). Встроенные браузеры Telegram и Viber — люди, их не трогаем.
  var BOT_UA = /googlebot|google-inspectiontool|adsbot|mediapartners|yandex(?:bot|metrika|direct|images|webmaster|accessibility|screenshot)|bingbot|bingpreview|telegrambot|twitterbot|applebot|duckduckbot|baiduspider|petalbot|ahrefsbot|semrushbot|mj12bot|dotbot|gptbot|claudebot|bytespider|crawler|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|vkshare|phantomjs|selenium|puppeteer|playwright/i;
  var isBot = false;
  try { isBot = navigator.webdriver === true || BOT_UA.test(navigator.userAgent || ''); } catch (e) { isBot = false; }

  // Источник сегодняшнего визита: цели на других страницах в тот же день относим к нему.
  var counted = store('shkip_last') === today;
  var src = sourceKey();
  if (counted) {
    var saved = store('shkip_src') || '';
    if (saved.slice(0, 11) === today + ':') src = saved.slice(11) || src;
  }

  var visitDone = counted;
  var sending = false;
  var engaged = false;
  var queue = [];

  function sendGoal(name) {
    var k = 'shkip_g_' + name;
    var last = store(k);
    if (last === today) return;
    post('goal', { goal: name, src: src, gap: last ? gapSince(last) : 0 }).then(function (ok) {
      if (ok) store(k, today);
    });
  }

  function sendVisit() {
    if (visitDone || sending || isBot) return;
    sending = true;
    var first = store('shkip_first');
    var isNew = !first;
    var last = store('shkip_last');
    post('visit', { src: src, 'new': isNew, gap: isNew ? 0 : gapSince(last) }).then(function (ok) {
      sending = false;
      if (!ok) return;   // повторим при следующей загрузке
      visitDone = true;
      store('shkip_last', today);
      store('shkip_src', today + ':' + src);
      if (isNew) store('shkip_first', today);
      var q = queue; queue = [];
      q.forEach(sendGoal);
    });
  }

  function engage() {
    if (engaged) return;
    engaged = true;
    sendVisit();
  }

  var seenGoals = {};
  function goal(name) {
    if (isBot) return;
    try {
      if (window.SHKIP_YM && typeof window.ym === 'function') window.ym(window.SHKIP_YM, 'reachGoal', name);
    } catch (e) { /* ignore */ }
    if (seenGoals[name]) return;
    seenGoals[name] = true;
    engage();
    if (visitDone) sendGoal(name); else queue.push(name);
  }
  window.shkipGoal = goal;

  if (isBot) {
    if (!counted) post('visit', { src: src, skip: 'bot' });
    return;
  }
  if (counted) return startGoals();

  // Засчитываем визит после 3 секунд на открытой странице или при первом действии.
  var timer = null;
  function startTimer() {
    if (timer || engaged) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    timer = setTimeout(engage, 3000);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') startTimer();
    else if (timer && !engaged) { clearTimeout(timer); timer = null; }
  });
  ['scroll', 'touchstart', 'mousemove', 'keydown', 'click'].forEach(function (ev) {
    window.addEventListener(ev, engage, { passive: true, once: true, capture: true });
  });
  window.addEventListener('pagehide', function () {
    if (!engaged) post('visit', { src: src, skip: 'short' });
  });
  startTimer();
  startGoals();

  // Цели по нажатиям на ссылки и по появлению блока записи на экране.
  function startGoals() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (h.indexOf('tel:+375296855600') === 0) goal('call');
      else if (h.indexOf('https://t.me/') === 0) goal('tg');
      else if (h.indexOf('viber:') === 0) goal('viber');
      else if (/^https:\/\/(?:yandex\.(?:by|ru)|ya\.ru)\/maps/.test(h)) goal('route_y');
      else if (/^https:\/\/(?:www\.)?google\.[a-z.]+\/maps/.test(h)) goal('route_g');
      else if (h.indexOf('mailto:') === 0) goal('email');
      else if (/#booking$/.test(h)) goal('open');
    }, true);

    var booking = document.getElementById('booking');
    if (booking && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { goal('open'); io.disconnect(); }
        });
      }, { threshold: 0.3 });
      io.observe(booking);
    }
  }
})();
