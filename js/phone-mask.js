/*
 * Подсказка формата телефона в форме записи: номер сам приводится к виду +375 (29) 123-45-67.
 * Понимает ввод «8029…», «29…», «375…», «+375…» и вставку номера целиком. Если номер начинается
 * с «+» и другого кода страны (например +7), оставляет его как есть — маску не навязываем.
 */
(function () {
  'use strict';

  function formatBy(value) {
    var raw = String(value || '');
    var d = raw.replace(/\D/g, '');
    if (!d) return raw.trim() === '+' ? '+' : '';
    if (/^\+\s*[0-24-9]/.test(raw.trim())) return raw;          // другой код страны — не трогаем
    if ('375'.indexOf(d) === 0 || d === '8') return raw;          // начали набирать 375 или 80 — ждём следующих цифр
    if (d.indexOf('80') === 0) d = '375' + d.slice(2);            // 8 029 … → 375 29 …
    else if (d.indexOf('375') !== 0 && d.length <= 9) d = '375' + d; // 29 … → 375 29 …
    d = d.slice(0, 12);
    var c = d.slice(3, 5), a = d.slice(5, 8), b = d.slice(8, 10), e = d.slice(10, 12);
    var out = '+375';
    if (c) out += ' (' + c + (c.length === 2 ? ')' : '');
    if (a) out += ' ' + a;
    if (b) out += '-' + b;
    if (e) out += '-' + e;
    return out;
  }

  function attach(input) {
    if (!input) return;
    input.setAttribute('placeholder', '+375 (29) 123-45-67');
    input.addEventListener('focus', function () { if (!input.value) input.value = '+375 ('; });
    input.addEventListener('blur', function () { if (input.value.replace(/\D/g, '') === '375') input.value = ''; });
    input.addEventListener('input', function (ev) {
      if (ev.inputType && ev.inputType.indexOf('delete') === 0) return;   // стирание не мешаем
      var f = formatBy(input.value);
      if (f !== input.value) { input.value = f; try { input.setSelectionRange(f.length, f.length); } catch (e) { /* ignore */ } }
    });
  }

  window.shkipFormatPhone = formatBy;
  attach(document.querySelector('#booking-form input[name="phone"]'));
})();
