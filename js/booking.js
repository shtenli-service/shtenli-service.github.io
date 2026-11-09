/*
 * Онлайн-запись.
 * Вся работа с данными — в двух функциях: getSchedule() и submitBooking().
 * Данные берутся с сервера: GET /api/schedule и POST /api/booking (адрес можно задать через window.SHKIP_API).
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

  /* ---------- ЕДИНАЯ ТОЧКА ПОЛУЧЕНИЯ ДАННЫХ ---------- */
  var API = (window.SHKIP_API || '') + '/api';

  // Сервер на бесплатном хостинге «засыпает» и просыпается до минуты, поэтому загрузку расписания
  // повторяем (только GET — он безопасен) примерно 75 секунд. POST /api/booking автоматически НЕ повторяется.
  var RETRY_TOTAL_MS = 75000;
  var RETRY_GAP_MS = 5000;
  var ATTEMPT_TIMEOUT_MS = 20000;

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function fetchScheduleOnce(url, timeoutMs) {
    var opts = { cache: 'no-store' };
    var timer = null;
    if (typeof AbortController !== 'undefined') {
      var ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();   // не-JSON ответ (например, страница «сервер просыпается») даст ошибку и повтор
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      if (!data || !Array.isArray(data.days)) throw new Error('bad_data');
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  // isCancelled — необязательная функция: если вернула true, повторы прекращаются.
  function getSchedule(weekStartISO, isCancelled) {
    var url = API + '/schedule?week=' + encodeURIComponent(weekStartISO);
    var started = Date.now();
    function attempt() {
      var left = RETRY_TOTAL_MS - (Date.now() - started);
      return fetchScheduleOnce(url, Math.max(5000, Math.min(ATTEMPT_TIMEOUT_MS, left))).catch(function (err) {
        var elapsed = Date.now() - started;
        if ((isCancelled && isCancelled()) || elapsed + RETRY_GAP_MS >= RETRY_TOTAL_MS) throw err;
        return delay(RETRY_GAP_MS).then(function () {
          if (isCancelled && isCancelled()) throw err;
          return attempt();
        });
      });
    }
    return attempt().then(function (data) {
      // Сервер отдаёт код 'all_closed', если на неделю всё закрыто; текст показываем здесь.
      if (data.closedMessage === 'all_closed') {
        data.closedMessage = 'На эту неделю свободных окон нет. Загляните на следующую или позвоните нам.';
      }
      return data;
    });
  }

  // Успех — только если сервер ответил 201 с ok:true. Иначе отказ; у ошибки есть поле status.
  function submitBooking(payload) {
    return fetch(API + '/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (data) {
        if (!r.ok || !data || data.ok !== true) {
          var err = new Error('http_' + r.status);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
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
  if (form) form.elements.purchaseDate.max = iso(new Date());

  var thisMonday = mondayOf(new Date());
  var weekOffset = 0;
  var selected = null;   // { date, time, btn }
  var requestId = 0;
  var slowTimer = null;

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

  function loadWeek(keepForm) {
    var monday = addDays(thisMonday, weekOffset * 7);
    var id = ++requestId;
    if (!keepForm) closeForm();
    elCal.setAttribute('aria-busy', 'true');
    if (slowTimer) clearTimeout(slowTimer);
    // Если ответ задерживается (сервер просыпается), объясняем, что происходит.
    slowTimer = setTimeout(function () {
      if (id !== requestId) return;
      elNote.textContent = 'Загружаем расписание, это может занять до минуты…';
      elNote.hidden = false;
    }, 2500);
    getSchedule(iso(monday), function () { return id !== requestId; }).then(function (data) {
      if (id !== requestId) return;
      clearTimeout(slowTimer);
      render(data, monday);
      elCal.removeAttribute('aria-busy');
    }).catch(function () {
      if (id !== requestId) return;
      clearTimeout(slowTimer);
      elCal.textContent = '';
      elNote.textContent = 'Онлайн-запись временно недоступна. Для записи позвоните нам: +375 29 685-56-00.';
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
    if (!selected) {
      elError.textContent = 'Выберите время в календаре.';
      elError.hidden = false;
      return;
    }
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

    var purchase = f.purchaseDate.value;
    var isWarranty = f.warranty.value === 'yes';
    var purchaseProblem = '';
    if (isWarranty && !purchase) {
      purchaseProblem = 'Для гарантийного ремонта укажите дату покупки.';
    } else if (purchase && (!/^\d{4}-\d{2}-\d{2}$/.test(purchase) || purchase > iso(new Date()) || purchase < '2000-01-01')) {
      purchaseProblem = 'Проверьте дату покупки: она не может быть в будущем.';
    }
    f.purchaseDate.setAttribute('aria-invalid', purchaseProblem ? 'true' : 'false');
    if (purchaseProblem) {
      elError.textContent = purchaseProblem;
      elError.hidden = false;
      f.purchaseDate.focus();
      return;
    }

    var payload = {
      date: selected.date,
      time: selected.time,
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      equipment: f.equipment.value,
      brand: f.brand.value,
      problem: f.problem.value.trim(),
      warranty: isWarranty,
      purchaseDate: purchase || null
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
    }).catch(function (err) {
      if (err && err.status === 409) {
        // Форму не закрываем (loadWeek(true)), иначе ошибка скроется вместе с ней.
        if (selected && selected.btn) selected.btn.setAttribute('aria-pressed', 'false');
        selected = null;
        elSlotLabel.textContent = 'выберите другое время';
        elError.textContent = 'Это время только что заняли. Выберите другое.';
        elError.hidden = false;
        loadWeek(true);
      } else {
        elError.textContent = 'Не получилось отправить. Позвоните нам: +375 29 685-56-00.';
        elError.hidden = false;
      }
    }).then(function () { submitBtn.disabled = false; });
  });

  loadWeek();
})();
