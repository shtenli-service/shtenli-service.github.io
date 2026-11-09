/* Общая логика сайта: мобильное меню, счётчик. */
(function () {
  'use strict';

  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      setMenu(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        burger.focus();
      }
    });
  }

  // Viber: если приложение не открылось (окно браузера не потеряло фокус) — показываем номер и кнопку копирования
  var viberLink = document.getElementById('viber-link');
  var viberHint = document.getElementById('viber-hint');
  var viberCopy = document.getElementById('viber-copy');
  if (viberLink && viberHint) {
    viberLink.addEventListener('click', function () {
      var left = false;
      var onBlur = function () { left = true; };
      window.addEventListener('blur', onBlur, { once: true });
      document.addEventListener('visibilitychange', onBlur, { once: true });
      setTimeout(function () {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onBlur);
        if (!left) viberHint.hidden = false;
      }, 1500);
    });
  }
  if (viberCopy) {
    viberCopy.addEventListener('click', function () {
      var done = function () { viberCopy.textContent = 'Номер скопирован'; };
      try {
        navigator.clipboard.writeText('+375296855600').then(done, function () { viberCopy.textContent = '+375296855600'; });
      } catch (e) { viberCopy.textContent = '+375296855600'; }
    });
  }

  // TODO: счётчик посещений — fetch к Cloudflare Worker (D1), затем показать число
  // в #visit-counter и убрать атрибут hidden. Пока скрыт.
})();
