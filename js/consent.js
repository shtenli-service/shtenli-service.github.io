/*
 * Яндекс Метрика (счётчик 114391986) и отказ от неё.
 * С 25.11.2026 по решению владельца сайта баннер сам не появляется: Метрика включается сразу, если посетитель
 * раньше не выбрал «Отклонить» (согласие продолжением пользования сайтом — политика, п. 2.8).
 * Выбор хранится в браузере (shkip_consent = yes|no:дата). Кнопка «Настройки cookie» (data-cookie-settings) в подвале
 * открывает выбор «Принять / Отклонить»; при «Отклонить» удаляем cookie Метрики и перезагружаем страницу без неё.
 * Наш собственный счётчик (js/stats.js) работает независимо и cookie не использует.
 */
(function () {
  'use strict';

  var YM_ID = 114391986;
  var KEY = 'shkip_consent';

  function get() { try { return window.localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function set(v) {
    try {
      var d = new Date();
      window.localStorage.setItem(KEY, v + ':' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate());
    } catch (e) { /* хранилище недоступно — спросим снова при следующем заходе */ }
  }
  function choice() { return get().split(':')[0]; }

  function loadMetrika() {
    if (window.SHKIP_YM) return;
    /* Стандартный код Яндекс Метрики */
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_ID, 'ym');
    window.ym(YM_ID, 'init', { ssr: true, webvisor: true, clickmap: true, accurateTrackBounce: true, trackLinks: true });
    window.SHKIP_YM = YM_ID;   // js/stats.js дублирует цели в Метрику, когда этот номер задан
  }

  function dropMetrikaCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); })
      .filter(function (n) { return n.indexOf('_ym') === 0; });
    var host = window.location.hostname;
    var domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    names.forEach(function (n) {
      domains.forEach(function (d) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  var bar = null;
  function hide() { if (bar) { bar.hidden = true; } }
  function show() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'cookie-bar';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-label', 'Согласие на файлы cookie');
      var policy = '/privacy.html#cookie';
      bar.innerHTML =
        '<p>Сайт использует файлы cookie, чтобы стать удобнее для вас. ' +
        '<a href="' + policy + '">Подробнее…</a></p>' +
        '<div class="cookie-btns">' +
        '<button type="button" class="btn btn-small" data-cookie="yes">Принять</button>' +
        '<button type="button" class="btn btn-small" data-cookie="no">Отклонить</button>' +
        '</div>';
      bar.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-cookie]') : null;
        if (!b) return;
        if (b.getAttribute('data-cookie') === 'yes') {
          set('yes'); hide(); loadMetrika();
        } else {
          set('no'); hide();
          if (window.SHKIP_YM) { dropMetrikaCookies(); window.location.reload(); }
        }
      });
      document.body.appendChild(bar);
    }
    bar.hidden = false;
  }

  function start() {
    document.addEventListener('click', function (e) {
      var s = e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
      if (!s) return;
      e.preventDefault();
      show();
    });
    if (choice() !== 'no') loadMetrika();   // баннер сам не показываем — только по кнопке «Настройки cookie»
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
