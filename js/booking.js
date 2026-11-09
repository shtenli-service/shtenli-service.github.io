/*
 * Онлайн-запись.
 * Вся работа с данными — в двух функциях: getSchedule() и submitBooking().
 * Позже заменить тело на fetch к Cloudflare Worker (D1).
 *
 * Формат ответа getSchedule(weekStartISO):
 * {
 *   banner: null | { text: "Сегодня технический перерыв" },   // показывается, если в неделе есть сегодня
 *   closedMessage: null | "текст",                              // если вся неделя недоступна
 *   days: [ { date: "2026-11-09", slots: [ { time: "09:00", status: "free" | "busy" } ] } ]
 * }
 */
(function () {
  'use strict';

  // Часы работы: пн–пт, 9:00–17:00
  var DAY_START = 9;
  var DAY_END = 17;           // последний слот начинается в 16:00
  var WORK_DAYS = 5;          // пн–пт
  var DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MAX_WEEKS_AHEAD = 8;

  /* ---------- Работа с датами ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function fromISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  /* ---------- ДЕМО-ДАННЫЕ (удалить при подключении API) ---------- */
  function demoSchedule(weekStartISO) {
    var monday = fromISO(weekStartISO);
    var now = new Date();
    var todayISO = iso(now);
    var weekIdx = Math.round((monday - mondayOf(now)) / (7 * 864e5));
    var allClosed = weekIdx === 2;                     // демо: неделя целиком недоступна
    var banner = null;

    // TODO: баннер приходит из админки. Для проверки: ?banner=break или ?banner=morning
    var q = new URLSearchParams(location.search).get('banner');
    if (q === 'break') banner = { text: 'Сегодня технический перерыв' };
    if (q === 'morning') banner = { text: 'Сегодня до 13:00 приём не ведём' };

    var days = [];
    for (var i = 0; i < WORK_DAYS; i++) {
      var d = addDays(monday, i);
      var ds = iso(d);
      var slots = [];
      for (var h = DAY_START; h < DAY_END; h++) {
        var status = 'free';
        var seed = (d.getDate() * 7 + h * 3 + d.getMonth()) % 5;   // псевдослучайно, но стабильно
        if (seed === 0 || seed === 3 && h % 2 === 0) status = 'busy';
        if (allClosed) status = 'busy';
        if (ds < todayISO) status = 'busy';
        if (ds === todayISO) {
          if (h <= now.getHours()) status = 'busy';
          if (banner && banner.text.indexOf('перерыв') !== -1) status = 'busy';
          if (banner && banner.text.indexOf('13:00') !== -1 && h < 13) status = 'busy';
        }
        slots.push({ time: pad(h) + ':00', status: status });
      }
      days.push({ date: ds, slots: slots });
    }
    return {
      banner: banner,
      closedMessage: allClosed ? 'На эту неделю свободных окон нет. Загляните на следующую или позвоните нам.' : null,
      days: days
    };
  }

  /* ---------- ЕДИНАЯ ТОЧКА ПОЛУЧЕНИЯ ДАННЫХ ---------- */
  function getSchedule(weekStartISO) {
    // TODO: заменить на
    //   return fetch('/api/schedule?week=' + weekStartISO).then(function (r) { return r.json(); });
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(demoSchedule(weekStartISO)); }, 120);
    });
  }

  function submitBooking(payload) {
    // TODO: заменить на
    //   return fetch('/api/booking', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(...)
    return new Promise(function (resolve) { setTimeout(function () { resolve({ ok: true }); }, 250); });
  }

  /* ---------- UI ---------- */
  var elCal = document.getElementById('calendar');
  if (!elCal) return;
  var elTitle = document.getElementById('cal-title');
  var elBanner = document.getElementById('booking-banner');
  var elNote = document.getElementById('cal-note');
  var btnPrev = document.getElementById('cal-prev');
  var btnNext = document.getElementById('cal-next');
  var form = document.getElementById('booking-form');
  var elSlotLabel = document.getElementById('form-slot');
  var elError = document.getElementById('form-error');
  var elSuccess = document.getElementById('form-success');
  var elSuccessDetail = document.getElementById('form-success-detail');

  var thisMonday = mondayOf(new Date());
  var weekOffset = 0;
  var selected = null;   // { date, time, btn }
  var requestId = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtDay(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function render(data, monday) {
    var sun = addDays(monday, WORK_DAYS - 1);
    elTitle.textContent = fmtDay(monday) + ' — ' + fmtDay(sun);
    btnPrev.disabled = weekOffset <= 0;
    btnNext.disabled = weekOffset >= MAX_WEEKS_AHEAD;

    var todayISO = iso(new Date());
    var hasToday = data.days.some(function (d) { return d.date === todayISO; });
    if (data.banner && hasToday) {
      elBanner.textContent = data.banner.text;
      elBanner.hidden = false;
    } else {
      elBanner.hidden = true;
    }

    if (data.closedMessage) { elNote.textContent = data.closedMessage; elNote.hidden = false; }
    else elNote.hidden = true;

    elCal.textContent = '';
    data.days.forEach(function (day) {
      var d = fromISO(day.date);
      var col = el('div', 'cal-day' + (day.date === todayISO ? ' is-today' : ''));
      var head = el('div', 'cal-day-head', DAY_NAMES[d.getDay()]);
      head.appendChild(el('small', '', fmtDay(d)));
      col.appendChild(head);
      day.slots.forEach(function (s) {
        var b = el('button', 'slot ' + (s.status === 'free' ? 'slot-free' : 'slot-busy'), s.time);
        b.type = 'button';
        if (s.status === 'free') {
          b.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-label', fmtDay(d) + ', ' + s.time + ', свободно');
          b.addEventListener('click', function () { selectSlot(day.date, s.time, b); });
        } else {
          b.disabled = true;
          b.setAttribute('aria-label', fmtDay(d) + ', ' + s.time + ', недоступно');
        }
        col.appendChild(b);
      });
      elCal.appendChild(col);
    });
  }

  function loadWeek() {
    var monday = addDays(thisMonday, weekOffset * 7);
    var id = ++requestId;
    closeForm();
    elCal.setAttribute('aria-busy', 'true');
    getSchedule(iso(monday)).then(function (data) {
      if (id !== requestId) return;
      render(data, monday);
      elCal.removeAttribute('aria-busy');
    }).catch(function () {
      elCal.textContent = '';
      elNote.textContent = 'Не удалось загрузить расписание. Позвоните нам: +375 29 685-56-00.';
      elNote.hidden = false;
      elCal.removeAttribute('aria-busy');
    });
  }

  function selectSlot(dateISO, time, btn) {
    if (selected && selected.btn) selected.btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-pressed', 'true');
    selected = { date: dateISO, time: time, btn: btn };
    var d = fromISO(dateISO);
    elSlotLabel.textContent = fmtDay(d) + ' в ' + time;
    elSuccess.hidden = true;
    elError.hidden = true;
    form.hidden = false;
    form.querySelector('[name="name"]').focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeForm() {
    form.hidden = true;
    if (selected && selected.btn) selected.btn.setAttribute('aria-pressed', 'false');
    selected = null;
  }

  btnPrev.addEventListener('click', function () { if (weekOffset > 0) { weekOffset--; loadWeek(); } });
  btnNext.addEventListener('click', function () { if (weekOffset < MAX_WEEKS_AHEAD) { weekOffset++; loadWeek(); } });
  document.getElementById('form-cancel').addEventListener('click', closeForm);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!selected) return;
    var f = form.elements;
    var phoneDigits = f.phone.value.replace(/\D/g, '');
    var bad = [];
    if (!f.name.value.trim()) bad.push(f.name);
    if (phoneDigits.length < 9) bad.push(f.phone);
    if (!f.equipment.value) bad.push(f.equipment);
    if (!f.brand.value) bad.push(f.brand);
    [f.name, f.phone, f.equipment, f.brand].forEach(function (x) {
      x.setAttribute('aria-invalid', bad.indexOf(x) !== -1 ? 'true' : 'false');
    });
    if (bad.length) {
      elError.textContent = 'Заполните имя, телефон, технику и бренд.';
      elError.hidden = false;
      bad[0].focus();
      return;
    }
    elError.hidden = true;

    var payload = {
      date: selected.date,
      time: selected.time,
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      equipment: f.equipment.value,
      brand: f.brand.value,
      problem: f.problem.value.trim(),
      warranty: f.warranty.value === 'yes'
    };
    var submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBooking(payload).then(function () {
      var when = fmtDay(fromISO(payload.date)) + ' в ' + payload.time;
      elSuccessDetail.textContent = ' Время: ' + when + '.';
      closeForm();
      form.reset();
      elSuccess.hidden = false;
      elSuccess.focus();
      loadWeek();
    }).catch(function () {
      elError.textContent = 'Не получилось отправить. Позвоните нам: +375 29 685-56-00.';
      elError.hidden = false;
    }).then(function () { submitBtn.disabled = false; });
  });

  loadWeek();
})();
