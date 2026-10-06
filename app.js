/* =============================================================
   Calendar — app.js
   Kalender interaktif bergaya Google Calendar untuk:
   Pembayaran Sewa Kantor, Pembayaran Rutin, Jadwal Meeting,
   serta Task & Report.

   Tanpa framework dan tanpa build step. Semua data tersimpan
   di localStorage browser masing-masing pengguna.
   ============================================================= */
(function () {
  'use strict';

  /* -----------------------------------------------------------
     1. KONFIGURASI
     ----------------------------------------------------------- */
  const STORAGE_KEY = 'calendar.events.v1';
  const PREFS_KEY = 'calendar.prefs.v1';
  const NOTIFIED_KEY = 'calendar.notified.v1';

  const WEEK_START = 1;            // 0 = Minggu, 1 = Senin
  const HOUR_PX = 48;              // tinggi 1 jam di tampilan Week/Day
  const REMINDER_DAYS = 30;        // pengingat aktif dari H-30 sampai Hari-H
  const URGENT_DAYS = 7;           // dihitung di badge lonceng
  const NOTIFY_MILESTONES = [30, 14, 7, 3, 1, 0];
  const CHIP_H = 22;
  const CHIP_GAP = 2;

  const CATEGORIES = {
    sewa:    { label: 'Pembayaran Sewa Kantor', short: 'Sewa',    payment: true },
    rutin:   { label: 'Pembayaran Rutin',       short: 'Rutin',   payment: true },
    meeting: { label: 'Jadwal Meeting',         short: 'Meeting', payment: false },
    task:    { label: 'Task & Report',          short: 'Task',    payment: false },
  };
  const CAT_KEYS = Object.keys(CATEGORIES);
  const VIEWS = ['month', 'week', 'day'];

  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  // Nama bulan (Indonesia & Inggris) untuk membaca tanggal seperti "15 Okt 2026"
  const MONTH_LOOKUP = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, pebruari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    agu: 7, agt: 7, agus: 7, agustus: 7, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    okt: 9, oktober: 9, oct: 9, october: 9,
    nov: 10, nop: 10, nopember: 10, november: 10,
    des: 11, desember: 11, dec: 11, december: 11,
  };

  // Header CSV yang dikenali (huruf kecil, spasi menjadi garis bawah)
  const HEADER_ALIASES = {
    no: ['no', 'nomor', 'no_urut'],
    kategori: ['kategori', 'category', 'jenis', 'tipe'],
    judul: ['judul', 'title', 'nama', 'nama_event', 'event'],
    tanggal: ['tanggal_jatuh_tempo', 'jatuh_tempo', 'tanggal', 'tgl', 'due_date', 'date'],
    nominal: ['nominal_idr', 'nominal', 'jumlah', 'amount', 'idr'],
    durasi: ['durasi', 'duration', 'waktu', 'jam'],
    catatan: ['catatan', 'keterangan', 'notes', 'note', 'deskripsi'],
    status: ['status'],
  };
  const REQUIRED_HEADERS = { kategori: 'Kategori', judul: 'Judul', tanggal: 'Tanggal_Jatuh_Tempo' };
  const CSV_HEADER = ['No', 'Kategori', 'Judul', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'Durasi', 'Catatan'];

  const ICON = {
    chevL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    money: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 19h4"/></svg>',
    status: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  };

  /* -----------------------------------------------------------
     2. STATE
     ----------------------------------------------------------- */
  const state = {
    events: [],
    view: 'month',
    cursor: startOfDay(new Date()),   // tanggal yang sedang difokuskan
    miniCursor: null,                 // bulan yang tampil di kalender kecil
    filters: { sewa: true, rutin: true, meeting: true, task: true },
    showDone: true,
    leftOpen: true,
    rightOpen: false,
    rightTab: 'reminders',
    selectedId: null,
    lastKategori: 'meeting',
    pickerYear: new Date().getFullYear(),
    pendingImport: null,
    forceScroll: false,
  };

  const els = {};
  let editingId = null;
  let formDuration = 60;
  let drag = null;
  let fileDragDepth = 0;
  let lastDay = todayISO();
  let uidCounter = 0;

  /* -----------------------------------------------------------
     3. UTILITAS TANGGAL & FORMAT
     ----------------------------------------------------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function todayISO() { return toISO(new Date()); }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  // Tambah bulan tanpa "meluber": 31 Jan + 1 bulan = 28/29 Feb
  function addMonthsClamped(d, n, day) {
    const target = day === undefined ? d.getDate() : day;
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(target, daysInMonth(t.getFullYear(), t.getMonth())));
    return t;
  }

  function startOfWeek(d) {
    const diff = (d.getDay() - WEEK_START + 7) % 7;
    return addDays(d, -diff);
  }

  // Selisih hari kalender dari a ke b (b - a)
  function diffDays(a, b) {
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86400000);
  }

  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function minToTime(m) {
    if (m >= 1440) return '24:00';
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }

  function uid() {
    uidCounter += 1;
    return Date.now().toString(36) + uidCounter.toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function normalizeText(s) {
    return String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function formatThousands(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtIDR(n) { return `Rp ${formatThousands(n)}`; }

  function fmtDuration(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return [h ? `${h} jam` : '', m ? `${m} menit` : ''].filter(Boolean).join(' ');
  }

  function fmtTimeRange(ev) {
    if (!ev.mulai) return 'Sepanjang hari';
    return `${ev.mulai} – ${minToTime(timeToMin(ev.mulai) + ev.durasi)}`;
  }

  function fmtDateLong(d) { return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
  function fmtDateShort(d) { return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; }
  function fmtDateMedium(d) { return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; }

  function daysUntil(iso) { return diffDays(startOfDay(new Date()), parseISO(iso)); }

  function relativeLabel(d) {
    if (d === 0) return 'Hari-H';
    if (d > 0) return `H-${d}`;
    return `Terlambat ${-d} hari`;
  }

  function toneFor(d) {
    if (d < 0) return 'late';
    if (d === 0) return 'today';
    if (d <= URGENT_DAYS) return 'soon';
    return 'later';
  }

  function doneWord(ev) { return CATEGORIES[ev.kategori].payment ? 'Lunas' : 'Selesai'; }
  function statusText(ev) { return ev.selesai ? doneWord(ev) : `Belum ${doneWord(ev).toLowerCase()}`; }

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  function sel(id) { return CSS.escape(String(id)); }

  /* -----------------------------------------------------------
     4. MODEL EVENT & PENYIMPANAN
     ----------------------------------------------------------- */
  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const kategori = CAT_KEYS.includes(raw.kategori) ? raw.kategori : null;
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(raw.tanggal || '') ? raw.tanggal : null;
    const judul = String(raw.judul ?? '').trim();
    if (!kategori || !tanggal || !judul) return null;

    const mulai = /^\d{2}:\d{2}$/.test(raw.mulai || '') ? raw.mulai : '';
    let durasi = 0;
    if (mulai) {
      const maxDur = 1440 - timeToMin(mulai);
      durasi = clamp(Math.round(Number(raw.durasi) || 60), 15, Math.max(15, maxDur));
    }

    const nomNum = raw.nominal === null || raw.nominal === undefined || raw.nominal === '' ? NaN : Number(raw.nominal);
    const nominal = Number.isFinite(nomNum) && nomNum > 0 ? Math.round(nomNum) : null;

    return {
      id: String(raw.id || uid()),
      kategori,
      judul: judul.slice(0, 200),
      tanggal,
      mulai,
      durasi,
      nominal,
      catatan: String(raw.catatan ?? '').trim(),
      selesai: Boolean(raw.selesai),
      selesaiPada: raw.selesai ? (raw.selesaiPada || new Date().toISOString()) : null,
      sumber: raw.sumber === 'csv' ? 'csv' : 'manual',
      seriesId: raw.seriesId || null,
      dibuat: raw.dibuat || new Date().toISOString(),
    };
  }

  // Kunci anti-duplikasi: kategori + judul + tanggal + jam mulai + nominal
  function dupKey(ev) {
    return [ev.kategori, normalizeText(ev.judul), ev.tanggal, ev.mulai || '-', ev.nominal || 0].join('|');
  }

  function getEvent(id) { return state.events.find((e) => e.id === id) || null; }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (err) { return false; }
  }

  function loadEvents() {
    const raw = storageGet(STORAGE_KEY);
    if (raw === null) return null;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(normalizeEvent).filter(Boolean) : [];
    } catch (err) {
      return [];
    }
  }

  function saveEvents() {
    if (!storageSet(STORAGE_KEY, JSON.stringify(state.events))) {
      toast('Penyimpanan browser penuh atau diblokir, jadi perubahan belum tersimpan. Ekspor ke CSV sebagai cadangan.', { timeout: 8000 });
    }
  }

  function loadPrefs() {
    try {
      const p = JSON.parse(storageGet(PREFS_KEY) || '{}');
      if (VIEWS.includes(p.view)) state.view = p.view;
      if (p.filters) CAT_KEYS.forEach((k) => { if (typeof p.filters[k] === 'boolean') state.filters[k] = p.filters[k]; });
      if (typeof p.showDone === 'boolean') state.showDone = p.showDone;
      if (typeof p.leftOpen === 'boolean' && !isMobile()) state.leftOpen = p.leftOpen;
      if (CAT_KEYS.includes(p.lastKategori)) state.lastKategori = p.lastKategori;
    } catch (err) { /* preferensi rusak diabaikan */ }
  }

  function savePrefs() {
    storageSet(PREFS_KEY, JSON.stringify({
      view: state.view,
      filters: state.filters,
      showDone: state.showDone,
      leftOpen: state.leftOpen,
      lastKategori: state.lastKategori,
    }));
  }

  function isVisible(ev) { return state.filters[ev.kategori] && (state.showDone || !ev.selesai); }

  // Urutan dalam satu hari: event sepanjang hari dulu, lalu berdasarkan jam
  function sortEvents(a, b) {
    if (!a.mulai !== !b.mulai) return a.mulai ? 1 : -1;
    return (a.mulai || '').localeCompare(b.mulai || '') || a.judul.localeCompare(b.judul, 'id');
  }

  function buildIndex() {
    const map = new Map();
    state.events.forEach((ev) => {
      if (!isVisible(ev)) return;
      if (!map.has(ev.tanggal)) map.set(ev.tanggal, []);
      map.get(ev.tanggal).push(ev);
    });
    map.forEach((list) => list.sort(sortEvents));
    return map;
  }

  function expandDates(iso, freq, count) {
    if (freq === 'none') return [iso];
    const base = parseISO(iso);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      let d = base;
      if (freq === 'weekly') d = addDays(base, 7 * i);
      if (freq === 'monthly') d = addMonthsClamped(base, i, base.getDate());
      if (freq === 'yearly') d = addMonthsClamped(base, 12 * i, base.getDate());
      out.push(toISO(d));
    }
    return out;
  }

  /* Data contoh agar kalender langsung terlihat hidup saat pertama dibuka */
  function sampleEvents() {
    const t = startOfDay(new Date());
    const first = new Date(t.getFullYear(), t.getMonth(), 1);
    const D = (monthOffset, day) => toISO(addMonthsClamped(first, monthOffset, day));
    const wk = startOfWeek(t);
    const syncSeries = uid();
    const now = new Date().toISOString();

    const list = [
      { kategori: 'sewa', judul: 'Sewa Gedung Kantor Pusat', tanggal: D(0, 5), nominal: 25000000, catatan: 'Transfer ke rekening pemilik gedung. Minta kuitansi bermeterai.' },
      { kategori: 'sewa', judul: 'Sewa Ruko Cabang Selatan', tanggal: D(0, 20), nominal: 18500000, catatan: 'Kontrak berakhir Desember, siapkan negosiasi perpanjangan.' },
      { kategori: 'sewa', judul: 'Sewa Ruko Cabang Selatan', tanggal: D(-1, 20), nominal: 18500000 },
      { kategori: 'sewa', judul: 'Sewa Gudang Arsip', tanggal: D(1, 1), nominal: 6000000 },
      { kategori: 'rutin', judul: 'Tagihan Listrik & Air', tanggal: D(0, 10), nominal: 4750000, catatan: 'Bayar via internet banking, simpan bukti di folder keuangan.' },
      { kategori: 'rutin', judul: 'Tagihan Listrik & Air', tanggal: D(-1, 10), nominal: 4600000 },
      { kategori: 'rutin', judul: 'Internet & Telepon Kantor', tanggal: D(0, 15), nominal: 1250000 },
      { kategori: 'rutin', judul: 'Iuran BPJS Ketenagakerjaan', tanggal: D(0, 15), nominal: 12300000 },
      { kategori: 'rutin', judul: 'Langganan Software Akuntansi', tanggal: D(0, 25), nominal: 850000 },
      { kategori: 'meeting', judul: 'Weekly Finance Sync', tanggal: toISO(wk), mulai: '09:00', durasi: 60, seriesId: syncSeries },
      { kategori: 'meeting', judul: 'Weekly Finance Sync', tanggal: toISO(addDays(wk, 7)), mulai: '09:00', durasi: 60, seriesId: syncSeries },
      { kategori: 'meeting', judul: 'Weekly Finance Sync', tanggal: toISO(addDays(wk, 14)), mulai: '09:00', durasi: 60, seriesId: syncSeries },
      { kategori: 'meeting', judul: 'Rapat Evaluasi Budget', tanggal: toISO(addDays(t, 2)), mulai: '13:30', durasi: 90, catatan: 'Bahas realisasi vs anggaran per cabang.' },
      { kategori: 'meeting', judul: 'Meeting Vendor Pengadaan', tanggal: toISO(addDays(t, 2)), mulai: '14:00', durasi: 60 },
      { kategori: 'task', judul: 'Rekonsiliasi Bank', tanggal: D(0, 3) },
      { kategori: 'task', judul: 'Laporan Keuangan Bulanan', tanggal: D(0, 7), catatan: 'Kirim ke direksi paling lambat pukul 17.00.' },
      { kategori: 'task', judul: 'Setor & Lapor PPh 21', tanggal: D(0, 15) },
      { kategori: 'task', judul: 'Review Cash Flow Mingguan', tanggal: toISO(addDays(t, 1)), mulai: '16:00', durasi: 45 },
    ];

    const tISO = toISO(t);
    return list.map((item) => {
      // Yang sudah lewat dianggap selesai, kecuali satu contoh keterlambatan
      const selesai = item.tanggal < tISO && item.judul !== 'Rekonsiliasi Bank';
      return normalizeEvent({ ...item, id: uid(), selesai, selesaiPada: selesai ? now : null, sumber: 'manual', dibuat: now });
    }).filter(Boolean);
  }

  /* -----------------------------------------------------------
     5. RENDER UTAMA
     ----------------------------------------------------------- */
  function render() {
    const focusedFilter = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.filter : null;
    const idx = buildIndex();
    renderTopbar();
    renderView(idx);
    renderMiniCal(idx);
    renderFilters();
    renderSummary();
    renderReminders();
    renderRightTabs();
    renderDetail();
    applyLayout();
    savePrefs();
    if (focusedFilter) {
      const el = document.querySelector(`[data-filter="${focusedFilter}"]`);
      if (el) el.focus();
    }
  }

  // Render panel samping saja (dipakai saat status dicentang agar terasa instan)
  function renderSide() {
    renderMiniCal(buildIndex());
    renderFilters();
    renderSummary();
    renderReminders();
    renderDetail();
  }

  function periodLabel() {
    const c = state.cursor;
    if (state.view === 'month') return `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    if (state.view === 'day') return `${c.getDate()} ${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    const s = startOfWeek(c);
    const e = addDays(s, 6);
    if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear()) return `${MONTHS_SHORT[s.getMonth()]} – ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
    return `${MONTHS_SHORT[s.getMonth()]} ${s.getFullYear()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
  }

  function renderTopbar() {
    const label = periodLabel();
    els.periodLabel.textContent = label;
    document.title = `${label} – Calendar`;
    els.viewSwitch.querySelectorAll('[data-view]').forEach((b) => {
      const on = b.dataset.view === state.view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const unit = { month: 'bulan', week: 'minggu', day: 'hari' }[state.view];
    els.btnPrev.setAttribute('aria-label', `${unit[0].toUpperCase()}${unit.slice(1)} sebelumnya`);
    els.btnNext.setAttribute('aria-label', `${unit[0].toUpperCase()}${unit.slice(1)} berikutnya`);
    els.logoDay.textContent = String(new Date().getDate());
  }

  function renderView(idx) {
    els.view.dataset.view = state.view;
    closePopovers();
    if (state.view === 'month') {
      renderMonth(idx);
    } else if (state.view === 'week') {
      const s = startOfWeek(state.cursor);
      renderTimeGrid(Array.from({ length: 7 }, (_, i) => addDays(s, i)), idx);
    } else {
      renderTimeGrid([state.cursor], idx);
    }
  }

  /* ---------- Tampilan bulanan ---------- */
  function renderMonth(idx) {
    const c = state.cursor;
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const totalDays = diffDays(start, addDays(startOfWeek(last), 7));
    const weeks = totalDays / 7;
    const tISO = todayISO();

    let head = '';
    for (let i = 0; i < 7; i += 1) head += `<div class="month__dow">${DAYS_SHORT[(WEEK_START + i) % 7]}</div>`;

    let cells = '';
    for (let i = 0; i < totalDays; i += 1) {
      const d = addDays(start, i);
      const iso = toISO(d);
      const cls = ['cell'];
      if (d.getMonth() !== c.getMonth()) cls.push('is-other');
      if (iso === tISO) cls.push('is-today');
      if (d.getDay() === 0 || d.getDay() === 6) cls.push('is-weekend');
      const label = d.getDate() === 1 ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` : String(d.getDate());
      cells += `<div class="${cls.join(' ')}" data-date="${iso}" data-action="create-day" data-drop="day">`
        + `<button type="button" class="cell__date" data-action="goto-day" data-date="${iso}" aria-label="Buka ${fmtDateLong(d)}">${label}</button>`
        + '<div class="cell__events"></div></div>';
    }

    els.view.innerHTML = `<div class="month" style="--weeks:${weeks}">`
      + `<div class="month__head">${head}</div>`
      + `<div class="month__grid">${cells}</div></div>`;
    fillMonthCells(idx);
  }

  // Isi chip sesuai kapasitas tinggi sel, sisanya jadi "+N lainnya"
  function fillMonthCells(idx) {
    const cellEls = els.view.querySelectorAll('.cell');
    if (!cellEls.length) return;
    const h = cellEls[0].querySelector('.cell__events').clientHeight;
    const cap = Math.max(1, Math.floor((h + CHIP_GAP) / (CHIP_H + CHIP_GAP)));
    cellEls.forEach((cell) => {
      const list = idx.get(cell.dataset.date) || [];
      const box = cell.querySelector('.cell__events');
      if (!list.length) { box.innerHTML = ''; return; }
      if (list.length <= cap) {
        box.innerHTML = list.map(chipHTML).join('');
      } else {
        const show = Math.max(0, cap - 1);
        box.innerHTML = list.slice(0, show).map(chipHTML).join('')
          + `<button type="button" class="more-btn" data-action="more" data-date="${cell.dataset.date}">+${list.length - show} lainnya</button>`;
      }
    });
  }

  function chipHTML(ev) {
    const isSel = state.selectedId === ev.id ? ' is-selected' : '';
    const done = ev.selesai ? ' is-done' : '';
    const time = ev.mulai ? `<span class="chip__time">${ev.mulai}</span>` : '';
    const tip = [
      ev.judul,
      CATEGORIES[ev.kategori].label,
      fmtTimeRange(ev),
      ev.nominal ? fmtIDR(ev.nominal) : '',
      statusText(ev),
    ].filter(Boolean).join('\n');
    const id = escapeHTML(ev.id);
    return `<div class="chip cat-${ev.kategori}${done}${isSel}" data-action="open" data-id="${id}" draggable="true" tabindex="0" role="button" title="${escapeHTML(tip)}">`
      + `<input type="checkbox" class="chk" data-id="${id}" ${ev.selesai ? 'checked' : ''} aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
      + `${time}<span class="chip__title">${escapeHTML(ev.judul)}</span></div>`;
  }

  /* ---------- Tampilan mingguan & harian ---------- */
  function nowTop() {
    const n = new Date();
    return ((n.getHours() * 60) + n.getMinutes()) / 60 * HOUR_PX;
  }

  function renderTimeGrid(days, idx) {
    const tISO = todayISO();
    const prevScrollEl = els.view.querySelector('.tg__scroll');
    const prevScroll = prevScrollEl ? prevScrollEl.scrollTop : null;
    const maxAll = days.length === 1 ? 6 : 3;

    let head = '<div class="tg__corner"></div>';
    let allday = '<div class="tg__gutter-label">Seharian</div>';
    let body = '';
    let hours = '';
    for (let h = 1; h < 24; h += 1) hours += `<div class="tg__hour" style="top:${h * HOUR_PX}px">${pad2(h)}:00</div>`;

    days.forEach((d) => {
      const iso = toISO(d);
      const isToday = iso === tISO;
      head += `<button type="button" class="tg__day${isToday ? ' is-today' : ''}" data-action="goto-day" data-date="${iso}" aria-label="Buka ${fmtDateLong(d)}">`
        + `<span class="tg__dname">${DAYS_SHORT[d.getDay()]}</span><span class="tg__dnum">${d.getDate()}</span></button>`;

      const list = idx.get(iso) || [];
      const alls = list.filter((e) => !e.mulai);
      const timed = list.filter((e) => e.mulai);

      let a = '';
      if (alls.length > maxAll) {
        a = alls.slice(0, maxAll - 1).map(chipHTML).join('')
          + `<button type="button" class="more-btn" data-action="more" data-date="${iso}">+${alls.length - (maxAll - 1)} lainnya</button>`;
      } else {
        a = alls.map(chipHTML).join('');
      }
      allday += `<div class="tg__allday-cell" data-action="create-day" data-date="${iso}" data-drop="allday">${a}</div>`;

      const laid = layoutDay(timed).map(tevHTML).join('');
      const now = isToday ? `<div class="now-line" id="nowLine" style="top:${nowTop()}px"></div>` : '';
      body += `<div class="tg__col${isToday ? ' is-today' : ''}" data-action="create-time" data-date="${iso}" data-drop="time">${laid}${now}</div>`;
    });

    els.view.innerHTML = `<div class="tg" style="--days:${days.length};--hour:${HOUR_PX}px">`
      + `<div class="tg__header"><div class="tg__row tg__row--head">${head}</div><div class="tg__row tg__row--allday">${allday}</div></div>`
      + `<div class="tg__scroll"><div class="tg__body"><div class="tg__hours">${hours}</div>${body}</div></div></div>`;

    const sc = els.view.querySelector('.tg__scroll');
    if (prevScroll !== null && !state.forceScroll) {
      sc.scrollTop = prevScroll;
    } else {
      const hasToday = days.some((d) => toISO(d) === tISO);
      const hour = hasToday ? Math.max(0, new Date().getHours() - 2) : 7;
      sc.scrollTop = hour * HOUR_PX;
    }
    state.forceScroll = false;
    syncTgHeader();
  }

  // Samakan lebar header dengan area yang punya scrollbar
  function syncTgHeader() {
    const sc = els.view.querySelector('.tg__scroll');
    const header = els.view.querySelector('.tg__header');
    if (!sc || !header) return;
    header.style.paddingRight = `${sc.offsetWidth - sc.clientWidth}px`;
  }

  // Susun event yang bertumpuk menjadi kolom berdampingan
  function layoutDay(evs) {
    const items = evs.map((ev) => {
      const s = timeToMin(ev.mulai);
      const e = Math.min(s + Math.max(ev.durasi, 15), 1440);
      return { ev, s, e, col: 0, cols: 1 };
    }).sort((a, b) => a.s - b.s || b.e - a.e);

    const out = [];
    let cluster = [];
    let clusterEnd = -1;

    const flush = () => {
      const colEnds = [];
      cluster.forEach((it) => {
        let c = colEnds.findIndex((end) => end <= it.s);
        if (c === -1) { c = colEnds.length; colEnds.push(it.e); } else { colEnds[c] = it.e; }
        it.col = c;
      });
      cluster.forEach((it) => { it.cols = colEnds.length; out.push(it); });
      cluster = [];
    };

    items.forEach((it) => {
      if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    });
    if (cluster.length) flush();
    return out;
  }

  function tevHTML(item) {
    const { ev, s, e, col, cols } = item;
    const top = s / 60 * HOUR_PX;
    const height = Math.max(((e - s) / 60 * HOUR_PX) - 2, 20);
    const w = 100 / cols;
    const left = col * w;
    const compact = height < 40;
    const id = escapeHTML(ev.id);
    const cls = `tev cat-${ev.kategori}${ev.selesai ? ' is-done' : ''}${state.selectedId === ev.id ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`;
    const tip = [ev.judul, fmtTimeRange(ev), ev.nominal ? fmtIDR(ev.nominal) : '', statusText(ev)].filter(Boolean).join('\n');
    return `<div class="${cls}" data-action="open" data-id="${id}" draggable="true" tabindex="0" role="button" title="${escapeHTML(tip)}" `
      + `style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px)">`
      + '<div class="tev__top">'
      + `<input type="checkbox" class="chk" data-id="${id}" ${ev.selesai ? 'checked' : ''} aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
      + `<span class="tev__title">${escapeHTML(ev.judul)}</span>`
      + (compact ? `<span class="tev__time">${ev.mulai}</span>` : '')
      + '</div>'
      + (compact ? '' : `<div class="tev__time">${fmtTimeRange(ev)}</div>`)
      + (!compact && ev.nominal && height > 64 ? `<div class="tev__amount">${fmtIDR(ev.nominal)}</div>` : '')
      + '</div>';
  }

  /* ---------- Kalender kecil ---------- */
  function renderMiniCal(idx) {
    const m = state.miniCursor;
    const y = m.getFullYear();
    const mo = m.getMonth();
    const start = startOfWeek(new Date(y, mo, 1));
    const tISO = todayISO();
    const cISO = toISO(state.cursor);

    let html = '<div class="mini__head">'
      + `<span class="mini__label">${MONTHS[mo]} ${y}</span>`
      + '<div class="mini__nav">'
      + `<button type="button" class="icon-btn icon-btn--sm" data-action="mini-nav" data-dir="-1" aria-label="Bulan sebelumnya">${ICON.chevL}</button>`
      + `<button type="button" class="icon-btn icon-btn--sm" data-action="mini-nav" data-dir="1" aria-label="Bulan berikutnya">${ICON.chevR}</button>`
      + '</div></div><div class="mini__grid">';

    for (let i = 0; i < 7; i += 1) html += `<span class="mini__dow" aria-hidden="true">${DAYS_SHORT[(WEEK_START + i) % 7].charAt(0)}</span>`;

    for (let i = 0; i < 42; i += 1) {
      const d = addDays(start, i);
      const iso = toISO(d);
      const cls = ['mini__day'];
      if (d.getMonth() !== mo) cls.push('is-other');
      if (iso === cISO) cls.push('is-selected');
      if (iso === tISO) cls.push('is-today');
      const list = idx.get(iso);
      if (list && list.some((ev) => !ev.selesai)) cls.push('has-events');
      html += `<button type="button" class="${cls.join(' ')}" data-action="mini-date" data-date="${iso}" aria-label="${fmtDateLong(d)}">${d.getDate()}</button>`;
    }
    html += '</div>';
    els.miniCal.innerHTML = html;
  }

  /* ---------- Filter kategori (My Calendars) ---------- */
  function renderFilters() {
    const ym = toISO(state.cursor).slice(0, 7);
    const counts = {};
    CAT_KEYS.forEach((k) => { counts[k] = 0; });
    state.events.forEach((ev) => { if (ev.tanggal.startsWith(ym)) counts[ev.kategori] += 1; });

    els.calFilters.innerHTML = CAT_KEYS.map((k) => `<li><label class="cal-filter cat-${k}">`
      + `<input type="checkbox" class="chk chk--lg" data-filter="${k}" ${state.filters[k] ? 'checked' : ''}>`
      + `<span class="cal-filter__name">${CATEGORIES[k].label}</span>`
      + `<span class="cal-filter__count" title="Jumlah di ${MONTHS[state.cursor.getMonth()]}">${counts[k]}</span>`
      + '</label></li>').join('');
    els.chkShowDone.checked = state.showDone;
  }

  /* ---------- Ringkasan bulan berjalan ---------- */
  function renderSummary() {
    const c = state.cursor;
    const ym = toISO(c).slice(0, 7);
    const inMonth = state.events.filter((ev) => ev.tanggal.startsWith(ym) && state.filters[ev.kategori]);
    const pay = inMonth.filter((ev) => CATEGORIES[ev.kategori].payment);
    const work = inMonth.filter((ev) => !CATEGORIES[ev.kategori].payment);
    const total = pay.reduce((s, ev) => s + (ev.nominal || 0), 0);
    const paid = pay.filter((ev) => ev.selesai).reduce((s, ev) => s + (ev.nominal || 0), 0);
    const paidCount = pay.filter((ev) => ev.selesai).length;
    const workDone = work.filter((ev) => ev.selesai).length;
    const pct = total ? Math.round((paid / total) * 100) : 0;

    els.monthSummary.innerHTML = `<h2 class="summary__title">Ringkasan ${MONTHS[c.getMonth()]} ${c.getFullYear()}</h2>`
      + '<p class="summary__label">Total tagihan</p>'
      + `<p class="summary__total">${fmtIDR(total)}</p>`
      + `<div class="progress" role="progressbar" aria-label="Persentase tagihan lunas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`
      + `<div class="sum-row"><span>Lunas (${paidCount} dari ${pay.length})</span><strong>${fmtIDR(paid)}</strong></div>`
      + `<div class="sum-row"><span>Belum lunas</span><strong>${fmtIDR(total - paid)}</strong></div>`
      + `<div class="sum-row"><span>Meeting &amp; task selesai</span><strong>${workDone} dari ${work.length}</strong></div>`;
  }

  /* ---------- Pengingat H-30 sampai Hari-H ---------- */
  function computeReminders() {
    return state.events
      .filter((ev) => state.filters[ev.kategori] && !ev.selesai)
      .map((ev) => ({ ev, d: daysUntil(ev.tanggal) }))
      .filter((x) => x.d <= REMINDER_DAYS)
      .sort((a, b) => a.d - b.d || sortEvents(a.ev, b.ev));
  }

  function notifBlockHTML() {
    if (!('Notification' in window)) return '';
    if (Notification.permission === 'granted') {
      return '<p class="notif-note">Notifikasi browser aktif untuk H-30, H-14, H-7, H-3, H-1, dan Hari-H.</p>';
    }
    if (Notification.permission === 'denied') {
      return '<p class="notif-note">Notifikasi browser diblokir. Izinkan lewat pengaturan situs di browser jika ingin mendapat pemberitahuan.</p>';
    }
    return '<div class="notif-cta"><button type="button" class="btn btn--tonal btn--block" data-action="enable-notif">Aktifkan notifikasi browser</button></div>';
  }

  function reminderItemHTML({ ev, d }) {
    const id = escapeHTML(ev.id);
    const date = parseISO(ev.tanggal);
    return `<li class="rem cat-${ev.kategori}">`
      + `<input type="checkbox" class="chk" data-id="${id}" aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
      + `<button type="button" class="rem__body" data-action="reveal" data-id="${id}">`
      + `<span class="rem__title">${escapeHTML(ev.judul)}</span>`
      + `<span class="rem__meta">${fmtDateShort(date)} ${date.getFullYear()}${ev.mulai ? `, ${ev.mulai}` : ''}</span>`
      + (ev.nominal ? `<span class="rem__amount">${fmtIDR(ev.nominal)}</span>` : '')
      + '</button>'
      + `<span class="rem__badge tone-${toneFor(d)}">${relativeLabel(d)}</span>`
      + '</li>';
  }

  function renderReminders() {
    const list = computeReminders();
    const urgent = list.filter((x) => x.d <= URGENT_DAYS).length;

    els.bellBadge.hidden = urgent === 0;
    els.bellBadge.textContent = urgent > 9 ? '9+' : String(urgent);
    els.btnToggleRight.title = urgent ? `${urgent} jadwal jatuh tempo dalam 7 hari atau terlambat` : 'Pengingat';
    els.tabRemindersCount.textContent = list.length ? String(list.length) : '';

    const groups = [
      { title: 'Terlambat', test: (d) => d < 0 },
      { title: 'Hari ini', test: (d) => d === 0 },
      { title: '7 hari ke depan', test: (d) => d >= 1 && d <= 7 },
      { title: '8–30 hari ke depan', test: (d) => d > 7 },
    ];

    let html = notifBlockHTML();
    if (!list.length) {
      html += '<div class="empty"><p>Tidak ada jadwal yang jatuh tempo dalam 30 hari ke depan.</p>'
        + '<button type="button" class="btn btn--tonal" data-action="create-first">Buat event</button></div>';
    } else {
      groups.forEach((g) => {
        const items = list.filter((x) => g.test(x.d));
        if (!items.length) return;
        const total = items.reduce((s, x) => s + (x.ev.nominal || 0), 0);
        html += '<section class="rem-group">'
          + `<h3 class="rem-group__title"><span>${g.title} (${items.length})</span>${total ? `<span>${fmtIDR(total)}</span>` : ''}</h3>`
          + `<ul class="rem-list">${items.map(reminderItemHTML).join('')}</ul></section>`;
      });
    }
    els.panelReminders.innerHTML = html;
  }

  /* ---------- Detail event ---------- */
  function renderDetail() {
    const ev = getEvent(state.selectedId);
    if (!ev) {
      els.panelDetail.innerHTML = '<div class="empty"><p>Klik salah satu jadwal di kalender untuk melihat detailnya di sini.</p></div>';
      return;
    }
    const cat = CATEGORIES[ev.kategori];
    const d = parseISO(ev.tanggal);
    const diff = daysUntil(ev.tanggal);
    const id = escapeHTML(ev.id);
    const word = doneWord(ev);

    let rel = '';
    if (!ev.selesai) rel = `<span class="rel-badge tone-${toneFor(diff)}">${relativeLabel(diff)}</span>`;

    const series = ev.seriesId ? state.events.filter((e) => e.seriesId === ev.seriesId).sort((a, b) => a.tanggal.localeCompare(b.tanggal)) : [];
    const pos = series.findIndex((e) => e.id === ev.id) + 1;

    let doneAt = '';
    if (ev.selesai && ev.selesaiPada) {
      const t = new Date(ev.selesaiPada);
      if (!Number.isNaN(t.getTime())) doneAt = `<span class="muted small">pada ${fmtDateMedium(t)}, ${pad2(t.getHours())}:${pad2(t.getMinutes())}</span>`;
    }

    els.panelDetail.innerHTML = `<article class="detail cat-${ev.kategori}${ev.selesai ? ' is-done' : ''}">`
      + `<div class="detail__band">${cat.label}</div>`
      + `<h3 class="detail__title">${escapeHTML(ev.judul)}</h3>`
      + '<dl class="detail__list">'
      + `<div class="drow"><dt class="ico">${ICON.calendar}<span class="sr-only">Tanggal</span></dt><dd>${fmtDateLong(d)} ${rel}</dd></div>`
      + `<div class="drow"><dt class="ico">${ICON.clock}<span class="sr-only">Waktu</span></dt><dd>${ev.mulai ? `${fmtTimeRange(ev)} <span class="muted">(${fmtDuration(ev.durasi)})</span>` : 'Sepanjang hari'}</dd></div>`
      + (ev.nominal ? `<div class="drow"><dt class="ico">${ICON.money}<span class="sr-only">Nominal</span></dt><dd><span class="amount">${fmtIDR(ev.nominal)}</span></dd></div>` : '')
      + `<div class="drow"><dt class="ico">${ICON.note}<span class="sr-only">Catatan</span></dt><dd class="pre${ev.catatan ? '' : ' muted'}">${ev.catatan ? escapeHTML(ev.catatan) : 'Tidak ada catatan'}</dd></div>`
      + `<div class="drow"><dt class="ico">${ICON.status}<span class="sr-only">Status</span></dt><dd><span class="status-pill${ev.selesai ? ' is-done' : ''}">${statusText(ev)}</span>${doneAt}</dd></div>`
      + (series.length > 1 ? `<div class="drow"><dt class="ico">${ICON.repeat}<span class="sr-only">Pengulangan</span></dt><dd>Seri berulang, kejadian ke-${pos} dari ${series.length}</dd></div>` : '')
      + '</dl>'
      + `<p class="detail__source">${ev.sumber === 'csv' ? 'Diimpor dari CSV' : 'Dibuat manual'}</p>`
      + '<div class="detail__actions">'
      + `<button type="button" class="btn ${ev.selesai ? 'btn--outline' : 'btn--primary'} btn--block" data-action="toggle-status" data-id="${id}">${ev.selesai ? `Batalkan status ${word.toLowerCase()}` : `Tandai ${word.toLowerCase()}`}</button>`
      + '<div class="detail__row-actions">'
      + `<button type="button" class="btn btn--outline" data-action="edit" data-id="${id}">Edit</button>`
      + `<button type="button" class="btn btn--outline" data-action="reveal" data-id="${id}">Lihat di kalender</button>`
      + `<button type="button" class="btn btn--danger-text" data-action="delete" data-id="${id}">Hapus</button>`
      + '</div></div></article>';
  }

  function renderRightTabs() {
    const isRem = state.rightTab === 'reminders';
    els.tabReminders.setAttribute('aria-selected', String(isRem));
    els.tabDetail.setAttribute('aria-selected', String(!isRem));
    els.panelReminders.hidden = !isRem;
    els.panelDetail.hidden = isRem;
  }

  function applyLayout() {
    els.app.classList.toggle('left-open', state.leftOpen);
    els.app.classList.toggle('right-open', state.rightOpen);
    els.btnToggleLeft.setAttribute('aria-expanded', String(state.leftOpen));
    els.btnToggleRight.setAttribute('aria-expanded', String(state.rightOpen));
    els.sidebarLeft.inert = !state.leftOpen;
    els.sidebarRight.inert = !state.rightOpen;
    els.backdrop.hidden = !(isMobile() && (state.leftOpen || state.rightOpen));
  }

  function setFavicon() {
    const day = new Date().getDate();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
      + '<defs><clipPath id="c"><rect x="2" y="2" width="28" height="28" rx="7"/></clipPath></defs>'
      + '<g clip-path="url(#c)"><rect x="2" y="2" width="28" height="28" fill="#fff"/>'
      + '<rect x="2" y="2" width="7" height="8" fill="#E4826F"/><rect x="9" y="2" width="7" height="8" fill="#D9A92E"/>'
      + '<rect x="16" y="2" width="7" height="8" fill="#5C8DE8"/><rect x="23" y="2" width="7" height="8" fill="#9878D6"/></g>'
      + '<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="none" stroke="#C9CFDB"/>'
      + `<text x="16" y="25.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#1E2430">${day}</text></svg>`;
    els.favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  /* -----------------------------------------------------------
     6. POPOVER
     ----------------------------------------------------------- */
  function anyPopoverOpen() { return !els.periodPicker.hidden || !els.dayPopover.hidden; }

  function closePopovers(except) {
    [els.periodPicker, els.dayPopover].forEach((p) => { if (p !== except) p.hidden = true; });
    els.btnPeriod.setAttribute('aria-expanded', String(!els.periodPicker.hidden));
  }

  function showPopover(pop, anchor) {
    closePopovers(pop);
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = clamp(r.left, 8, window.innerWidth - pw - 8);
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    if (pop === els.periodPicker) els.btnPeriod.setAttribute('aria-expanded', 'true');
  }

  function renderPeriodPicker() {
    const y = state.pickerYear;
    const cm = state.cursor.getMonth();
    const cy = state.cursor.getFullYear();
    const now = new Date();
    els.periodPicker.innerHTML = '<div class="pp__head">'
      + `<button type="button" class="icon-btn icon-btn--sm" data-action="pp-year" data-dir="-1" aria-label="Tahun sebelumnya">${ICON.chevL}</button>`
      + `<strong>${y}</strong>`
      + `<button type="button" class="icon-btn icon-btn--sm" data-action="pp-year" data-dir="1" aria-label="Tahun berikutnya">${ICON.chevR}</button>`
      + '</div><div class="pp__grid">'
      + MONTHS_SHORT.map((m, i) => {
        const cls = ['pp__month'];
        if (i === cm && y === cy) cls.push('is-active');
        if (i === now.getMonth() && y === now.getFullYear()) cls.push('is-now');
        return `<button type="button" class="${cls.join(' ')}" data-action="pp-month" data-month="${i}" aria-label="${MONTHS[i]} ${y}">${m}</button>`;
      }).join('')
      + '</div>';
  }

  function togglePeriodPicker() {
    if (!els.periodPicker.hidden) { closePopovers(); return; }
    state.pickerYear = state.cursor.getFullYear();
    renderPeriodPicker();
    showPopover(els.periodPicker, els.btnPeriod);
  }

  function openDayPopover(iso, anchor) {
    const d = parseISO(iso);
    const list = buildIndex().get(iso) || [];
    els.dayPopover.innerHTML = '<div class="dp__head"><div class="dp__date">'
      + `<span class="dp__dow">${DAYS[d.getDay()]}</span>`
      + `<button type="button" class="dp__num" data-action="goto-day" data-date="${iso}" aria-label="Buka ${fmtDateLong(d)}">${d.getDate()}</button></div>`
      + `<button type="button" class="icon-btn icon-btn--sm" data-action="close-popover" aria-label="Tutup">${ICON.close}</button></div>`
      + `<div class="dp__list">${list.map(chipHTML).join('')}</div>`;
    showPopover(els.dayPopover, anchor);
  }

  /* -----------------------------------------------------------
     7. NAVIGASI & AKSI
     ----------------------------------------------------------- */
  function syncMini() { state.miniCursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1); }

  function goToday() {
    state.cursor = startOfDay(new Date());
    state.forceScroll = true;
    syncMini();
    render();
  }

  function setView(v) {
    if (!VIEWS.includes(v) || v === state.view) return;
    state.view = v;
    render();
  }

  function shift(dir) {
    if (state.view === 'month') state.cursor = addMonthsClamped(state.cursor, dir, 1);
    else if (state.view === 'week') state.cursor = addDays(state.cursor, 7 * dir);
    else state.cursor = addDays(state.cursor, dir);
    syncMini();
    render();
  }

  function isInView(d) {
    const c = state.cursor;
    if (state.view === 'month') return d.getMonth() === c.getMonth() && d.getFullYear() === c.getFullYear();
    if (state.view === 'week') {
      const s = startOfWeek(c);
      return d >= s && d < addDays(s, 7);
    }
    return toISO(d) === toISO(c);
  }

  function openRight(tab) {
    state.rightOpen = true;
    state.rightTab = tab;
    if (isMobile()) state.leftOpen = false;
    renderRightTabs();
    renderDetail();
    applyLayout();
  }

  function selectEvent(id) {
    if (!getEvent(id)) return;
    state.selectedId = id;
    document.querySelectorAll('.chip.is-selected, .tev.is-selected').forEach((x) => x.classList.remove('is-selected'));
    document.querySelectorAll(`.chip[data-id="${sel(id)}"], .tev[data-id="${sel(id)}"]`).forEach((x) => x.classList.add('is-selected'));
    openRight('detail');
  }

  function revealEvent(id) {
    const ev = getEvent(id);
    if (!ev) return;
    const d = parseISO(ev.tanggal);
    if (!isInView(d)) { state.cursor = d; syncMini(); }
    state.filters[ev.kategori] = true;
    if (ev.selesai) state.showDone = true;
    state.selectedId = id;
    state.rightOpen = true;
    state.rightTab = 'detail';
    if (isMobile()) state.leftOpen = false;
    render();
  }

  function toggleDone(id, force, silent) {
    const ev = getEvent(id);
    if (!ev) return;
    const next = typeof force === 'boolean' ? force : !ev.selesai;
    if (next === ev.selesai) return;
    ev.selesai = next;
    ev.selesaiPada = next ? new Date().toISOString() : null;
    saveEvents();

    // Perbarui chip di tempat agar perubahan warna & coretan terasa instan
    document.querySelectorAll(`.chip[data-id="${sel(id)}"], .tev[data-id="${sel(id)}"]`).forEach((el) => {
      el.classList.toggle('is-done', next);
      const cb = el.querySelector('.chk');
      if (cb) cb.checked = next;
    });
    renderSide();
    if (!state.showDone && next) setTimeout(() => render(), 450);

    if (!silent) {
      const msg = next ? `Ditandai ${doneWord(ev).toLowerCase()}: ${ev.judul}` : `Status dibatalkan: ${ev.judul}`;
      toast(msg, { action: 'Urungkan', onAction: () => toggleDone(id, !next, true) });
    }
  }

  async function deleteEvent(id) {
    const ev = getEvent(id);
    if (!ev) return;
    const series = ev.seriesId ? state.events.filter((e) => e.seriesId === ev.seriesId) : [ev];
    let choice;
    if (series.length > 1) {
      choice = await askConfirm({
        title: 'Hapus event berulang?',
        message: `"${ev.judul}" adalah bagian dari seri berisi ${series.length} event.`,
        buttons: [
          { label: 'Batal', value: null },
          { label: `Hapus seluruh seri (${series.length})`, value: 'series', variant: 'outline' },
          { label: 'Hapus event ini', value: 'one', variant: 'danger' },
        ],
      });
    } else {
      choice = await askConfirm({
        title: 'Hapus event ini?',
        message: `"${ev.judul}" pada ${fmtDateLong(parseISO(ev.tanggal))} akan dihapus.`,
        buttons: [
          { label: 'Batal', value: null },
          { label: 'Hapus', value: 'one', variant: 'danger' },
        ],
      });
    }
    if (!choice) return;

    const removeIds = new Set(choice === 'series' ? series.map((e) => e.id) : [id]);
    const removed = state.events.filter((e) => removeIds.has(e.id));
    state.events = state.events.filter((e) => !removeIds.has(e.id));
    if (removeIds.has(state.selectedId)) { state.selectedId = null; state.rightTab = 'reminders'; }
    saveEvents();
    render();
    toast(removed.length > 1 ? `${removed.length} event dihapus` : 'Event dihapus', {
      action: 'Urungkan',
      onAction: () => { state.events.push(...removed); saveEvents(); render(); },
    });
  }

  function moveEvent(id, target, clientY, grabMin) {
    const ev = getEvent(id);
    if (!ev) return;
    const before = { tanggal: ev.tanggal, mulai: ev.mulai, durasi: ev.durasi };
    const date = target.dataset.date;
    const kind = target.dataset.drop;

    if (kind === 'day') {
      ev.tanggal = date;
    } else if (kind === 'allday') {
      ev.tanggal = date; ev.mulai = ''; ev.durasi = 0;
    } else if (kind === 'time') {
      const r = target.getBoundingClientRect();
      const dur = ev.mulai ? ev.durasi : 60;
      let min = Math.round((((clientY - r.top) / HOUR_PX) * 60 - grabMin) / 15) * 15;
      min = clamp(min, 0, 1440 - 15);
      ev.tanggal = date;
      ev.mulai = minToTime(min);
      ev.durasi = clamp(dur, 15, 1440 - min);
    }

    if (before.tanggal === ev.tanggal && before.mulai === ev.mulai && before.durasi === ev.durasi) return;
    saveEvents();
    render();
    toast(`Dipindahkan ke ${fmtDateShort(parseISO(ev.tanggal))}${ev.mulai ? `, ${ev.mulai}` : ''}`, {
      action: 'Urungkan',
      onAction: () => { Object.assign(ev, before); saveEvents(); render(); },
    });
  }

  async function clearAll() {
    if (!state.events.length) { toast('Kalender sudah kosong.'); return; }
    const choice = await askConfirm({
      title: 'Hapus semua data?',
      message: `Semua ${state.events.length} event di browser ini akan dihapus. Ekspor ke CSV lebih dulu jika ingin menyimpan cadangan.`,
      buttons: [
        { label: 'Batal', value: null },
        { label: 'Ekspor dulu', value: 'export', variant: 'outline' },
        { label: 'Hapus semua', value: 'clear', variant: 'danger' },
      ],
    });
    if (choice === 'export') { exportCSV(); return; }
    if (choice !== 'clear') return;
    const backup = state.events;
    state.events = [];
    state.selectedId = null;
    saveEvents();
    render();
    toast('Semua data dihapus.', {
      action: 'Urungkan',
      timeout: 9000,
      onAction: () => { state.events = backup; saveEvents(); render(); },
    });
  }

  function loadSample() {
    const keys = new Set(state.events.map(dupKey));
    const add = sampleEvents().filter((ev) => !keys.has(dupKey(ev)));
    if (!add.length) { toast('Data contoh sudah ada di kalender.'); return; }
    state.events.push(...add);
    saveEvents();
    state.cursor = startOfDay(new Date());
    syncMini();
    render();
    const ids = new Set(add.map((e) => e.id));
    toast(`${add.length} event contoh ditambahkan.`, {
      action: 'Urungkan',
      onAction: () => { state.events = state.events.filter((e) => !ids.has(e.id)); saveEvents(); render(); },
    });
  }

  /* -----------------------------------------------------------
     8. MODAL FORM EVENT
     ----------------------------------------------------------- */
  function buildCategoryOptions() {
    els.fKategori.innerHTML = CAT_KEYS.map((k) => `<label class="cat-opt cat-${k}">`
      + `<input type="radio" name="kategori" value="${k}">`
      + '<span class="cat-opt__dot" aria-hidden="true"></span>'
      + `<span>${CATEGORIES[k].label}</span></label>`).join('');
  }

  function getRadio() {
    const r = els.fKategori.querySelector('input[name="kategori"]:checked');
    return r ? r.value : 'meeting';
  }

  function setRadio(value) {
    els.fKategori.querySelectorAll('input[name="kategori"]').forEach((r) => {
      r.checked = r.value === value;
      r.closest('.cat-opt').classList.toggle('is-checked', r.checked);
    });
  }

  function updateTimeRow() {
    els.timeRow.hidden = els.fAllDay.checked;
    updateDurHint();
  }

  function updateDurHint() {
    if (els.fAllDay.checked) { els.durHint.textContent = ''; return; }
    const s = timeToMin(els.fMulai.value);
    const e = timeToMin(els.fAkhir.value);
    if (!els.fMulai.value || !els.fAkhir.value) { els.durHint.textContent = ''; return; }
    if (e <= s) {
      els.durHint.textContent = 'Jam selesai harus setelah jam mulai';
      els.durHint.classList.add('is-error');
    } else {
      els.durHint.textContent = fmtDuration(e - s);
      els.durHint.classList.remove('is-error');
    }
  }

  function updateStatusLabel() {
    const payment = CATEGORIES[getRadio()].payment;
    els.fStatusLabel.textContent = payment ? 'Tandai sudah lunas' : 'Tandai sudah selesai';
  }

  function updateRepeatRow() {
    els.jumlahWrap.hidden = els.fUlangi.value === 'none';
  }

  function openEventModal(opts) {
    const { id = null, date = null, mulai = null } = opts || {};
    closePopovers();
    editingId = id;
    const ev = id ? getEvent(id) : null;

    els.eventModalTitle.textContent = ev ? 'Edit event' : 'Event baru';
    els.fJudul.value = ev ? ev.judul : '';
    setRadio(ev ? ev.kategori : state.lastKategori);
    els.fTanggal.value = ev ? ev.tanggal : (date || toISO(state.cursor));

    const start = ev ? ev.mulai : (mulai || '');
    formDuration = ev && ev.mulai ? ev.durasi : 60;
    els.fAllDay.checked = !start;
    els.fMulai.value = start || '09:00';
    els.fAkhir.value = minToTime(Math.min(timeToMin(start || '09:00') + formDuration, 1439));

    els.fNominal.value = ev && ev.nominal ? formatThousands(ev.nominal) : '';
    els.fCatatan.value = ev ? ev.catatan : '';
    els.fUlangi.value = 'none';
    els.fJumlah.value = 12;
    els.repeatRow.hidden = Boolean(ev);
    els.fStatus.checked = Boolean(ev && ev.selesai);
    els.formError.textContent = '';

    updateStatusLabel();
    updateTimeRow();
    updateRepeatRow();
    els.eventModal.showModal();
    setTimeout(() => els.fJudul.focus(), 0);
  }

  function readForm() {
    const judul = els.fJudul.value.trim();
    if (!judul) return { error: 'Judul wajib diisi.', field: els.fJudul };
    const tanggal = els.fTanggal.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'Tanggal belum valid.', field: els.fTanggal };

    let mulai = '';
    let durasi = 0;
    if (!els.fAllDay.checked) {
      mulai = els.fMulai.value;
      if (!mulai) return { error: 'Isi jam mulai atau centang "Sepanjang hari".', field: els.fMulai };
      const s = timeToMin(mulai);
      const e = els.fAkhir.value ? timeToMin(els.fAkhir.value) : s + 60;
      if (e <= s) return { error: 'Jam selesai harus setelah jam mulai.', field: els.fAkhir };
      durasi = e - s;
    }

    const digits = els.fNominal.value.replace(/\D/g, '');
    return {
      data: {
        kategori: getRadio(),
        judul,
        tanggal,
        mulai,
        durasi,
        nominal: digits ? Number(digits) : null,
        catatan: els.fCatatan.value.trim(),
        selesai: els.fStatus.checked,
      },
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    const r = readForm();
    if (r.error) {
      els.formError.textContent = r.error;
      if (r.field) r.field.focus();
      return;
    }
    const data = r.data;
    state.lastKategori = data.kategori;
    let focusId = null;
    let message = '';

    if (editingId) {
      const ev = getEvent(editingId);
      if (!ev) { els.eventModal.close(); return; }
      const updated = normalizeEvent({
        ...ev,
        ...data,
        selesaiPada: data.selesai ? (ev.selesai ? ev.selesaiPada : new Date().toISOString()) : null,
      });
      const key = dupKey(updated);
      if (state.events.some((x) => x.id !== ev.id && dupKey(x) === key)) {
        const ok = await askConfirm({
          title: 'Event serupa sudah ada',
          message: 'Sudah ada event dengan kategori, judul, tanggal, jam, dan nominal yang sama. Tetap simpan perubahan?',
          buttons: [{ label: 'Batal', value: null }, { label: 'Tetap simpan', value: 'save', variant: 'primary' }],
        });
        if (ok !== 'save') return;
      }
      Object.assign(ev, updated);
      focusId = ev.id;
      message = 'Perubahan disimpan';
    } else {
      const freq = els.fUlangi.value;
      const count = freq === 'none' ? 1 : clamp(parseInt(els.fJumlah.value, 10) || 1, 1, 120);
      const dates = expandDates(data.tanggal, freq, count);
      const seriesId = dates.length > 1 ? uid() : null;
      const now = new Date().toISOString();
      let created = dates.map((t) => normalizeEvent({
        ...data, tanggal: t, id: uid(), seriesId, sumber: 'manual', dibuat: now, selesaiPada: data.selesai ? now : null,
      })).filter(Boolean);

      const existing = new Set(state.events.map(dupKey));
      const dups = created.filter((ev) => existing.has(dupKey(ev)));
      if (dups.length) {
        const all = dups.length === created.length;
        const choice = await askConfirm({
          title: 'Event serupa sudah ada',
          message: all
            ? 'Event dengan kategori, judul, tanggal, jam, dan nominal yang sama sudah tercatat di kalender.'
            : `${dups.length} dari ${created.length} tanggal di seri ini sudah punya event yang sama.`,
          buttons: all
            ? [{ label: 'Batal', value: null }, { label: 'Tetap simpan', value: 'all', variant: 'primary' }]
            : [{ label: 'Batal', value: null }, { label: 'Simpan semua', value: 'all', variant: 'outline' }, { label: 'Lewati duplikat', value: 'skip', variant: 'primary' }],
        });
        if (!choice) return;
        if (choice === 'skip') created = created.filter((ev) => !existing.has(dupKey(ev)));
      }
      if (!created.length) { els.eventModal.close(); toast('Tidak ada event baru yang ditambahkan.'); return; }
      state.events.push(...created);
      focusId = created[0].id;
      message = created.length > 1 ? `${created.length} event dibuat` : 'Event dibuat';
    }

    saveEvents();
    savePrefs();
    els.eventModal.close();
    const ev = getEvent(focusId);
    if (ev && !isInView(parseISO(ev.tanggal))) { state.cursor = parseISO(ev.tanggal); syncMini(); }
    if (ev && !state.filters[ev.kategori]) state.filters[ev.kategori] = true;
    state.selectedId = focusId;
    render();
    toast(message);
  }

  /* Dialog konfirmasi berbasis Promise */
  function askConfirm({ title, message, buttons }) {
    return new Promise((resolve) => {
      let settled = false;
      const dlg = els.confirmModal;
      const done = (value) => {
        if (settled) return;
        settled = true;
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(value);
      };
      const onClose = () => done(null);

      els.confirmTitle.textContent = title;
      els.confirmMsg.textContent = message;
      els.confirmActions.innerHTML = '';
      let lastBtn = null;
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn--${b.variant || 'text'}`;
        btn.textContent = b.label;
        btn.addEventListener('click', () => done(b.value === undefined ? null : b.value));
        els.confirmActions.appendChild(btn);
        lastBtn = btn;
      });
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      if (lastBtn) lastBtn.focus();
    });
  }

  /* -----------------------------------------------------------
     9. CSV: PARSER, IMPOR, EKSPOR
     ----------------------------------------------------------- */
  function detectDelimiter(line) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch in counts) counts[ch] += 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : ',';
  }

  // Parser CSV sesuai RFC 4180: mendukung tanda kutip, koma di dalam kutip, dan baris baru
  function parseCSV(input) {
    let text = String(input).replace(/^\uFEFF/, '');
    let delim = null;
    const sepLine = text.match(/^sep=(.)\r?\n/i);
    if (sepLine) { delim = sepLine[1]; text = text.slice(sepLine[0].length); }
    if (!delim) delim = detectDelimiter(text.split(/\r?\n/, 1)[0] || '');

    const rows = [];
    let row = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQ = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ''));
  }

  function normHeader(h) {
    return String(h).replace(/^\uFEFF/, '').trim().toLowerCase()
      .replace(/[\s\-.]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function mapCategory(raw) {
    const s = normalizeText(raw);
    if (!s) return null;
    if (CAT_KEYS.includes(s)) return s;
    if (/sewa|rent|lease/.test(s)) return 'sewa';
    if (/rutin|routine|recurring|tagihan|langganan|iuran|bulanan/.test(s)) return 'rutin';
    if (/meeting|rapat|pertemuan|meet/.test(s)) return 'meeting';
    if (/task|tugas|report|laporan|deadline/.test(s)) return 'task';
    if (/pembayaran|bayar|payment/.test(s)) return 'rutin';
    return null;
  }

  /* Menerima: 2026-10-15, 2026/10/15, 15/10/2026, 15-10-2026, 15.10.2026,
     15 Okt 2026, 15 Oktober 2026, "Senin, 15 Oktober 2026", dan opsional jam "09:00" */
  function parseDateTime(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    s = s.replace(/^[a-z]+,\s*/i, '');

    let time = '';
    const tm = s.match(/(?:[T\s]+|^)(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:wib|wita|wit)?$/i);
    if (tm && tm.index > 0) {
      const h = Number(tm[1]);
      const m = Number(tm[2]);
      if (h < 24 && m < 60) {
        time = `${pad2(h)}:${pad2(m)}`;
        s = s.slice(0, tm.index).trim();
      }
    }

    let y; let mo; let d; let mt;
    if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
      y = Number(mt[1]); mo = Number(mt[2]) - 1; d = Number(mt[3]);
    } else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
      d = Number(mt[1]); mo = Number(mt[2]) - 1; y = Number(mt[3]);
      if (y < 100) y += 2000;
    } else if ((mt = s.match(/^(\d{1,2})[\s-]+([a-z]+)\.?[\s-]+(\d{4})$/i))) {
      d = Number(mt[1]); mo = MONTH_LOOKUP[mt[2].toLowerCase()]; y = Number(mt[3]);
    } else {
      return null;
    }
    if (mo === undefined) return null;
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return { date: toISO(dt), time };
  }

  /* Durasi: kosong, "Sepanjang hari", "09:00-10:30", "09:00 (90 menit)",
     "90", "90 menit", "1 jam", "1,5 jam", "1 jam 30 menit", "2j", "30m" */
  function parseDuration(raw, timeFromDate) {
    const s = normalizeText(raw).replace(',', '.');
    if (!s || s === '-' || s === '—') {
      return timeFromDate ? { mulai: timeFromDate, durasi: 60 } : { mulai: '', durasi: 0 };
    }
    if (/^(sepanjang hari|seharian|all ?day|full ?day|1 hari|satu hari|0)$/.test(s)) return { mulai: '', durasi: 0 };

    let m = s.match(/^(\d{1,2})[:.](\d{2})\s*(?:-|–|—|s\/d|sd|sampai|to)\s*(\d{1,2})[:.](\d{2})$/);
    if (m) {
      const start = Number(m[1]) * 60 + Number(m[2]);
      const end = Number(m[3]) * 60 + Number(m[4]);
      if (start >= 1440 || end > 1440 || end <= start) return null;
      return { mulai: minToTime(start), durasi: end - start };
    }

    m = s.match(/^(\d{1,2})[:.](\d{2})$/);
    if (m) {
      const start = Number(m[1]) * 60 + Number(m[2]);
      if (start >= 1440) return null;
      return { mulai: minToTime(start), durasi: 60 };
    }

    m = s.match(/^(\d{1,2})[:.](\d{2})\s*[,(]?\s*(.+?)\)?$/);
    if (m) {
      const start = Number(m[1]) * 60 + Number(m[2]);
      if (start < 1440) {
        const rest = parseDuration(m[3], minToTime(start));
        if (rest && rest.durasi) return { mulai: minToTime(start), durasi: rest.durasi };
      }
    }

    let total = 0;
    let matched = false;
    const re = /(\d+(?:\.\d+)?)\s*(jam|j|hours?|hrs?|h|menit|mnt|minutes?|mins?|m)\b/g;
    let part;
    while ((part = re.exec(s)) !== null) {
      matched = true;
      const v = parseFloat(part[1]);
      total += /^(jam|j|hours?|hrs?|h)$/.test(part[2]) ? v * 60 : v;
    }
    if (!matched && /^\d+(\.\d+)?$/.test(s)) { total = parseFloat(s); matched = true; }
    if (matched && total > 0) return { mulai: timeFromDate || '09:00', durasi: Math.round(total) };
    return null;
  }

  // Mengembalikan angka, null jika kosong, atau NaN jika tidak valid
  function parseNominal(raw) {
    let s = String(raw || '').toLowerCase().replace(/rp\.?|idr/g, '').replace(/\s+/g, '');
    if (!s || s === '-' || s === '—') return null;
    const unit = s.match(/(jt|juta|rb|ribu|k|miliar|milyar|m)$/);
    if (unit) {
      const u = unit[1];
      const mult = /^(jt|juta)$/.test(u) ? 1e6 : /^(rb|ribu|k)$/.test(u) ? 1e3 : 1e9;
      s = s.slice(0, -u.length);
      if (!/^\d+([.,]\d+)?$/.test(s)) return NaN;
      return Math.round(parseFloat(s.replace(',', '.')) * mult);
    }
    if (!/^[\d.,]+$/.test(s)) return NaN;
    s = s.replace(/[.,]\d{1,2}$/, '');          // buang desimal ",00" / ".50"
    const digits = s.replace(/[.,]/g, '');
    if (!digits) return NaN;
    return Number(digits);
  }

  function parseStatus(raw) {
    const s = normalizeText(raw);
    if (!s) return false;
    if (/^(belum|tidak|no|false|0|pending|open|todo)/.test(s)) return false;
    return /(selesai|lunas|done|sudah|paid|complete|ya|yes|true|1)/.test(s);
  }

  function handleCSVFile(file) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name) && !/csv/.test(file.type)) {
      toast('Pilih file berformat .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        prepareImport(String(reader.result), file.name);
      } catch (err) {
        console.error(err);
        toast('File CSV tidak bisa dibaca. Periksa format dan header-nya.');
      }
    };
    reader.onerror = () => toast('Gagal membaca file.');
    reader.readAsText(file, 'UTF-8');
  }

  function prepareImport(text, name) {
    const rows = parseCSV(text);
    if (rows.length < 2) { toast('File CSV kosong atau hanya berisi header.'); return; }

    const header = rows[0].map(normHeader);
    const col = {};
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      for (const alias of aliases) {
        const i = header.indexOf(alias);
        if (i !== -1) { col[key] = i; break; }
      }
    });

    const missing = Object.keys(REQUIRED_HEADERS).filter((k) => col[k] === undefined);
    if (missing.length) {
      toast(`Kolom wajib tidak ditemukan: ${missing.map((k) => REQUIRED_HEADERS[k]).join(', ')}.`, {
        timeout: 9000, action: 'Unduh template', onAction: downloadTemplate,
      });
      return;
    }

    const existing = new Set(state.events.map(dupKey));
    const seen = new Map();
    const now = new Date().toISOString();

    const results = rows.slice(1).map((r, i) => {
      const get = (k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
      const res = {
        rowNo: get('no') || String(i + 1),
        status: 'new',
        notes: [],
        ev: null,
        raw: { kategori: get('kategori'), judul: get('judul'), tanggal: get('tanggal'), nominal: get('nominal'), durasi: get('durasi') },
      };
      const fail = (msg) => { res.status = 'error'; res.notes.push(msg); return res; };

      const kategori = mapCategory(get('kategori'));
      if (!kategori) return fail(`Kategori "${get('kategori') || '(kosong)'}" tidak dikenali`);
      const judul = get('judul');
      if (!judul) return fail('Judul kosong');
      const dt = parseDateTime(get('tanggal'));
      if (!dt) return fail(`Tanggal "${get('tanggal') || '(kosong)'}" tidak dikenali`);

      let dur = parseDuration(get('durasi'), dt.time);
      if (!dur) {
        dur = dt.time ? { mulai: dt.time, durasi: 60 } : { mulai: '', durasi: 0 };
        res.notes.push(`Durasi "${get('durasi')}" tidak terbaca, dianggap ${dur.mulai ? '60 menit' : 'sepanjang hari'}`);
      }

      const nominal = parseNominal(get('nominal'));
      if (Number.isNaN(nominal)) return fail(`Nominal "${get('nominal')}" tidak valid`);

      const selesai = parseStatus(get('status'));
      const ev = normalizeEvent({
        id: uid(), kategori, judul, tanggal: dt.date, mulai: dur.mulai, durasi: dur.durasi,
        nominal, catatan: get('catatan'), selesai, selesaiPada: selesai ? now : null, sumber: 'csv', dibuat: now,
      });
      if (!ev) return fail('Data tidak lengkap');

      const key = dupKey(ev);
      if (existing.has(key)) {
        res.status = 'dup';
        res.notes.push('Sudah ada di kalender');
      } else if (seen.has(key)) {
        res.status = 'dup';
        res.notes.push(`Sama dengan baris No ${seen.get(key)} di file ini`);
      } else {
        seen.set(key, res.rowNo);
      }
      res.ev = ev;
      return res;
    });

    state.pendingImport = { name, results };
    renderImportModal();
    els.importModal.showModal();
  }

  function renderImportModal() {
    const { name, results } = state.pendingImport;
    const n = results.filter((r) => r.status === 'new').length;
    const d = results.filter((r) => r.status === 'dup').length;
    const x = results.filter((r) => r.status === 'error').length;
    const badge = { new: 'Baru', dup: 'Duplikat', error: 'Error' };

    els.importFileName.textContent = `${name}: ${results.length} baris data dibaca. Baris duplikat dan bermasalah tidak akan diimpor.`;
    els.importStats.innerHTML = `<span class="stat stat--new">${n} siap diimpor</span>`
      + `<span class="stat stat--dup">${d} duplikat dilewati</span>`
      + `<span class="stat stat--error">${x} perlu diperbaiki</span>`;

    els.importBody.innerHTML = results.map((r) => {
      const ev = r.ev;
      const cat = ev ? `<span class="cat-dot cat-${ev.kategori}"></span>${CATEGORIES[ev.kategori].short}` : escapeHTML(r.raw.kategori || '—');
      const tanggal = ev ? fmtDateMedium(parseISO(ev.tanggal)) : escapeHTML(r.raw.tanggal || '—');
      const waktu = ev ? fmtTimeRange(ev) : escapeHTML(r.raw.durasi || '—');
      const nominal = ev ? (ev.nominal ? fmtIDR(ev.nominal) : '—') : escapeHTML(r.raw.nominal || '—');
      const judul = escapeHTML(ev ? ev.judul : r.raw.judul) || '—';
      return `<tr class="is-${r.status}"><td>${escapeHTML(r.rowNo)}</td>`
        + `<td><span class="row-badge row-badge--${r.status}">${badge[r.status]}</span></td>`
        + `<td>${cat}</td><td>${judul}</td><td>${tanggal}</td><td>${waktu}</td>`
        + `<td class="num">${nominal}</td><td>${escapeHTML(r.notes.join('; ')) || '—'}</td></tr>`;
    }).join('');

    els.btnDoImport.disabled = n === 0;
    els.btnDoImport.textContent = n ? `Impor ${n} event` : 'Tidak ada data baru';
  }

  function commitImport() {
    const p = state.pendingImport;
    if (!p) return;
    const keys = new Set(state.events.map(dupKey));
    const add = p.results
      .filter((r) => r.status === 'new')
      .map((r) => r.ev)
      .filter((ev) => {
        const k = dupKey(ev);
        if (keys.has(k)) return false;
        keys.add(k);
        return true;
      });

    state.events.push(...add);
    saveEvents();
    els.importModal.close();
    state.pendingImport = null;

    if (add.length && !add.some((ev) => isInView(parseISO(ev.tanggal)))) {
      const first = add.map((ev) => ev.tanggal).sort()[0];
      state.cursor = parseISO(first);
      syncMini();
    }
    render();

    const dup = p.results.filter((r) => r.status === 'dup').length;
    const errs = p.results.filter((r) => r.status === 'error').length;
    const ids = new Set(add.map((ev) => ev.id));
    toast(`${add.length} event diimpor${dup ? `, ${dup} duplikat dilewati` : ''}${errs ? `, ${errs} baris bermasalah` : ''}.`, {
      action: add.length ? 'Urungkan' : null,
      timeout: 7000,
      onAction: () => { state.events = state.events.filter((ev) => !ids.has(ev.id)); saveEvents(); render(); },
    });
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(rows) { return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n'); }

  function downloadText(filename, text) {
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function durationText(ev) {
    return ev.mulai ? `${ev.mulai}-${minToTime(timeToMin(ev.mulai) + ev.durasi)}` : 'Sepanjang hari';
  }

  function exportCSV() {
    if (!state.events.length) { toast('Belum ada data untuk diekspor.'); return; }
    const sorted = [...state.events].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || sortEvents(a, b));
    const rows = sorted.map((ev, i) => [
      i + 1,
      CATEGORIES[ev.kategori].label,
      ev.judul,
      ev.tanggal,
      ev.nominal ?? '',
      durationText(ev),
      ev.catatan,
      ev.selesai ? doneWord(ev) : 'Belum',
    ]);
    downloadText(`kalender-${todayISO()}.csv`, toCSV([[...CSV_HEADER, 'Status'], ...rows]));
    toast(`${rows.length} event diekspor ke CSV.`);
  }

  function downloadTemplate() {
    const base = addMonthsClamped(startOfDay(new Date()), 1, 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    const iso = (day) => toISO(new Date(y, m, day));
    const dmy = (day) => `${pad2(day)}/${pad2(m + 1)}/${y}`;
    const rows = [
      CSV_HEADER,
      ['1', 'Pembayaran Sewa Kantor', 'Sewa Gedung Kantor Pusat', iso(5), '25000000', 'Sepanjang hari', 'Transfer ke rekening pemilik gedung'],
      ['2', 'Pembayaran Rutin', 'Tagihan Listrik & Air', dmy(10), 'Rp 4.750.000', '', 'Bayar via internet banking'],
      ['3', 'Jadwal Meeting', 'Rapat Evaluasi Budget', iso(12), '', '10:00-11:30', 'Ruang rapat lantai 2'],
      ['4', 'Task & Report', 'Laporan Keuangan Bulanan', `${iso(7)} 16:00`, '', '60 menit', 'Kirim ke direksi'],
    ];
    downloadText('template-kalender.csv', toCSV(rows));
  }

  /* -----------------------------------------------------------
     10. NOTIFIKASI
     ----------------------------------------------------------- */
  function runBrowserNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    let log = {};
    try { log = JSON.parse(storageGet(NOTIFIED_KEY) || '{}'); } catch (err) { log = {}; }
    const today = startOfDay(new Date());
    const tISO = toISO(today);

    const due = computeReminders().filter(({ ev, d }) => {
      if (d >= 0 && !NOTIFY_MILESTONES.includes(d)) return false;
      return !log[`${ev.id}|${d < 0 ? 'late' : d}`];
    });

    due.slice(0, 5).forEach(({ ev, d }) => {
      try {
        // eslint-disable-next-line no-new
        new Notification(`${relativeLabel(d)}: ${ev.judul}`, {
          body: `${CATEGORIES[ev.kategori].label}, ${fmtDateLong(parseISO(ev.tanggal))}${ev.nominal ? `\n${fmtIDR(ev.nominal)}` : ''}`,
          tag: `${ev.id}|${d}`,
        });
      } catch (err) { /* sebagian browser seluler mewajibkan service worker */ }
    });
    if (due.length > 5) {
      try { new Notification('Calendar', { body: `Ada ${due.length - 5} pengingat lain. Buka panel lonceng untuk melihat semuanya.` }); } catch (err) { /* abaikan */ }
    }
    due.forEach(({ ev, d }) => { log[`${ev.id}|${d < 0 ? 'late' : d}`] = tISO; });

    Object.keys(log).forEach((k) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(log[k]) || diffDays(parseISO(log[k]), today) > 60) delete log[k];
    });
    storageSet(NOTIFIED_KEY, JSON.stringify(log));
  }

  function enableNotifications() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((perm) => {
      renderReminders();
      if (perm === 'granted') {
        toast('Notifikasi browser aktif.');
        runBrowserNotifications();
      } else {
        toast('Izin notifikasi tidak diberikan.');
      }
    });
  }

  function startupReminderToast() {
    const rem = computeReminders();
    const late = rem.filter((x) => x.d < 0).length;
    const today = rem.filter((x) => x.d === 0).length;
    const parts = [];
    if (today) parts.push(`${today} jatuh tempo hari ini`);
    if (late) parts.push(`${late} terlambat`);
    if (!parts.length) return;
    toast(`Pengingat: ${parts.join(' dan ')}.`, { action: 'Lihat', timeout: 8000, onAction: () => openRight('reminders') });
  }

  /* -----------------------------------------------------------
     11. TOAST
     ----------------------------------------------------------- */
  function toast(message, opts) {
    const { action = null, onAction = null, timeout = 4500 } = opts || {};
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');

    const msg = document.createElement('span');
    msg.className = 'toast__msg';
    msg.textContent = message;
    el.appendChild(msg);

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 220);
    };

    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast__action';
      b.textContent = action;
      b.addEventListener('click', () => { if (onAction) onAction(); dismiss(); });
      el.appendChild(b);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast__close';
    x.setAttribute('aria-label', 'Tutup pemberitahuan');
    x.innerHTML = ICON.close;
    x.addEventListener('click', dismiss);
    el.appendChild(x);

    els.toasts.appendChild(el);
    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('is-in'));
    timer = setTimeout(dismiss, timeout);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });
  }

  /* -----------------------------------------------------------
     12. EVENT LISTENER
     ----------------------------------------------------------- */
  function handleAction(action, el, e) {
    const id = el.dataset.id;
    const date = el.dataset.date;
    switch (action) {
      case 'open': selectEvent(id); break;
      case 'reveal': revealEvent(id); break;
      case 'create-day': openEventModal({ date }); break;
      case 'create-time': {
        const r = el.getBoundingClientRect();
        const min = Math.floor(((e.clientY - r.top) / HOUR_PX) * 2) * 30;
        openEventModal({ date, mulai: minToTime(clamp(min, 0, 1410)) });
        break;
      }
      case 'goto-day':
        state.cursor = parseISO(date);
        state.view = 'day';
        state.forceScroll = true;
        syncMini();
        render();
        break;
      case 'more': openDayPopover(date, el); break;
      case 'close-popover': closePopovers(); break;
      case 'mini-date':
        state.cursor = parseISO(date);
        syncMini();
        if (isMobile()) state.leftOpen = false;
        render();
        break;
      case 'mini-nav':
        state.miniCursor = addMonthsClamped(state.miniCursor, Number(el.dataset.dir), 1);
        renderMiniCal(buildIndex());
        break;
      case 'pp-year':
        state.pickerYear += Number(el.dataset.dir);
        renderPeriodPicker();
        break;
      case 'pp-month': {
        const m = Number(el.dataset.month);
        const day = Math.min(state.cursor.getDate(), daysInMonth(state.pickerYear, m));
        state.cursor = new Date(state.pickerYear, m, state.view === 'month' ? 1 : day);
        syncMini();
        closePopovers();
        render();
        break;
      }
      case 'tab': state.rightTab = el.dataset.tab; renderRightTabs(); break;
      case 'toggle-status': toggleDone(id); break;
      case 'edit': openEventModal({ id }); break;
      case 'delete': deleteEvent(id); break;
      case 'enable-notif': enableNotifications(); break;
      case 'create-first': openEventModal(); break;
      default: break;
    }
  }

  function hasFiles(e) {
    return Boolean(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
  }

  function bindEvents() {
    // Navbar
    els.btnToggleLeft.addEventListener('click', () => {
      state.leftOpen = !state.leftOpen;
      if (state.leftOpen && isMobile()) state.rightOpen = false;
      applyLayout();
      savePrefs();
      setTimeout(() => { if (state.view === 'month') fillMonthCells(buildIndex()); else syncTgHeader(); }, 260);
    });
    els.btnToggleRight.addEventListener('click', () => {
      if (state.rightOpen && state.rightTab === 'reminders') { state.rightOpen = false; applyLayout(); return; }
      openRight('reminders');
    });
    els.btnCloseRight.addEventListener('click', () => { state.rightOpen = false; applyLayout(); });
    els.backdrop.addEventListener('click', () => { state.leftOpen = false; state.rightOpen = false; applyLayout(); });
    els.btnToday.addEventListener('click', goToday);
    els.btnPrev.addEventListener('click', () => shift(-1));
    els.btnNext.addEventListener('click', () => shift(1));
    els.btnPeriod.addEventListener('click', togglePeriodPicker);
    els.viewSwitch.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) setView(b.dataset.view);
    });

    // Sidebar kiri
    els.btnCreate.addEventListener('click', () => openEventModal());
    els.btnUpload.addEventListener('click', () => els.csvInput.click());
    els.csvInput.addEventListener('change', () => {
      handleCSVFile(els.csvInput.files[0]);
      els.csvInput.value = '';
    });
    els.chkShowDone.addEventListener('change', () => { state.showDone = els.chkShowDone.checked; render(); });
    els.btnTemplate.addEventListener('click', downloadTemplate);
    els.btnExport.addEventListener('click', exportCSV);
    els.btnSample.addEventListener('click', loadSample);
    els.btnClear.addEventListener('click', clearAll);

    // Form event
    els.eventForm.addEventListener('submit', handleSave);
    els.fAllDay.addEventListener('change', updateTimeRow);
    els.fMulai.addEventListener('change', () => {
      if (!els.fMulai.value) return;
      const s = timeToMin(els.fMulai.value);
      els.fAkhir.value = minToTime(Math.min(s + formDuration, 1439));
      updateDurHint();
    });
    els.fAkhir.addEventListener('change', () => {
      const d = timeToMin(els.fAkhir.value) - timeToMin(els.fMulai.value);
      if (d > 0) formDuration = d;
      updateDurHint();
    });
    els.fNominal.addEventListener('input', () => {
      const digits = els.fNominal.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      els.fNominal.value = digits ? formatThousands(Number(digits)) : '';
    });
    els.fKategori.addEventListener('change', () => { setRadio(getRadio()); updateStatusLabel(); });
    els.fUlangi.addEventListener('change', updateRepeatRow);
    els.fJudul.addEventListener('input', () => { els.formError.textContent = ''; });

    // Impor
    els.btnDoImport.addEventListener('click', commitImport);
    els.importModal.addEventListener('close', () => { state.pendingImport = null; });

    // Tutup dialog saat klik di luar kartu
    [els.eventModal, els.importModal, els.confirmModal].forEach((dlg) => {
      let downOnBackdrop = false;
      dlg.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === dlg; });
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg && downOnBackdrop) dlg.close();
        downOnBackdrop = false;
      });
    });

    // Klik global (delegasi)
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const insidePopover = t.closest('.popover');
      if (anyPopoverOpen() && !insidePopover && !t.closest('[data-popover-trigger]')) {
        closePopovers();
        if (!t.closest('[data-action="more"]')) return;
      }
      if (t.closest('.chk')) return;                     // checkbox ditangani lewat event "change"

      const closer = t.closest('[data-close]');
      if (closer) { const dlg = closer.closest('dialog'); if (dlg) dlg.close(); return; }

      const actionEl = t.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, actionEl, e);
    });

    // Checkbox status & filter kategori
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.matches('.chk[data-id]')) { toggleDone(t.dataset.id, t.checked); return; }
      if (t.matches('[data-filter]')) { state.filters[t.dataset.filter] = t.checked; render(); }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && anyPopoverOpen()) { closePopovers(); return; }
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const t = e.target;
      const tag = t.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      if (tag === 'INPUT' && !['checkbox', 'radio'].includes(t.type)) return;

      if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('[data-action="open"]')) {
        e.preventDefault();
        selectEvent(t.dataset.id);
        return;
      }
      if (e.key === 'Escape' && isMobile() && (state.leftOpen || state.rightOpen)) {
        state.leftOpen = false; state.rightOpen = false; applyLayout(); return;
      }
      switch (e.key.toLowerCase()) {
        case 't': goToday(); break;
        case 'm': setView('month'); break;
        case 'w': setView('week'); break;
        case 'd': setView('day'); break;
        case 'arrowleft': case 'p': case 'k': shift(-1); break;
        case 'arrowright': case 'n': case 'j': shift(1); break;
        case 'c': e.preventDefault(); openEventModal(); break;
        default: break;
      }
    });

    // Drag & drop: pindahkan event, atau jatuhkan file CSV
    document.addEventListener('dragstart', (e) => {
      const el = e.target instanceof Element ? e.target.closest('.chip[data-id], .tev[data-id]') : null;
      if (!el) return;
      let grabMin = 0;
      if (el.classList.contains('tev')) {
        const r = el.getBoundingClientRect();
        grabMin = ((e.clientY - r.top) / HOUR_PX) * 60;
      }
      drag = { id: el.dataset.id, grabMin };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.id);
      requestAnimationFrame(() => el.classList.add('is-dragging'));
    });
    document.addEventListener('dragend', () => {
      document.querySelectorAll('.is-dragging, .is-drop-target').forEach((x) => x.classList.remove('is-dragging', 'is-drop-target'));
      drag = null;
    });
    document.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      fileDragDepth += 1;
      document.body.classList.add('is-file-drag');
    });
    document.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      fileDragDepth = Math.max(0, fileDragDepth - 1);
      if (!fileDragDepth) document.body.classList.remove('is-file-drag');
    });
    document.addEventListener('dragover', (e) => {
      if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
      if (!drag) return;
      const target = e.target instanceof Element ? e.target.closest('[data-drop]') : null;
      document.querySelectorAll('.is-drop-target').forEach((x) => { if (x !== target) x.classList.remove('is-drop-target'); });
      if (!target) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('is-drop-target');
    });
    document.addEventListener('drop', (e) => {
      if (hasFiles(e)) {
        e.preventDefault();
        fileDragDepth = 0;
        document.body.classList.remove('is-file-drag');
        handleCSVFile(e.dataTransfer.files[0]);
        return;
      }
      if (!drag) return;
      const target = e.target instanceof Element ? e.target.closest('[data-drop]') : null;
      if (!target) return;
      e.preventDefault();
      const { id, grabMin } = drag;
      drag = null;
      closePopovers();
      moveEvent(id, target, e.clientY, grabMin);
    });

    // Ukuran layar
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.view === 'month') fillMonthCells(buildIndex());
        else syncTgHeader();
        closePopovers();
        applyLayout();
      }, 120);
    });
    window.matchMedia('(max-width: 900px)').addEventListener('change', (mq) => {
      if (mq.matches) { state.leftOpen = false; state.rightOpen = false; } else { state.leftOpen = true; }
      applyLayout();
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  // Dijalankan tiap menit: geser garis "sekarang" dan ganti hari saat tengah malam
  function tick() {
    const t = todayISO();
    if (t !== lastDay) {
      lastDay = t;
      setFavicon();
      render();
      runBrowserNotifications();
      return;
    }
    const line = document.getElementById('nowLine');
    if (line) line.style.top = `${nowTop()}px`;
  }

  /* -----------------------------------------------------------
     13. INISIALISASI
     ----------------------------------------------------------- */
  function cacheEls() {
    [
      'app', 'favicon', 'logoDay', 'btnToggleLeft', 'btnToday', 'btnPrev', 'btnNext', 'btnPeriod', 'periodLabel',
      'viewSwitch', 'btnToggleRight', 'bellBadge', 'sidebarLeft', 'btnCreate', 'btnUpload', 'csvInput', 'miniCal',
      'calFilters', 'chkShowDone', 'monthSummary', 'btnTemplate', 'btnExport', 'btnSample', 'btnClear', 'view',
      'sidebarRight', 'tabReminders', 'tabRemindersCount', 'tabDetail', 'btnCloseRight', 'panelReminders',
      'panelDetail', 'backdrop', 'eventModal', 'eventForm', 'eventModalTitle', 'fJudul', 'fKategori', 'fTanggal',
      'fAllDay', 'timeRow', 'fMulai', 'fAkhir', 'durHint', 'fNominal', 'fCatatan', 'repeatRow', 'fUlangi',
      'jumlahWrap', 'fJumlah', 'fStatus', 'fStatusLabel', 'formError', 'importModal', 'importFileName',
      'importStats', 'importBody', 'btnDoImport', 'confirmModal', 'confirmTitle', 'confirmMsg', 'confirmActions',
      'periodPicker', 'dayPopover', 'toasts',
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function init() {
    cacheEls();
    if (isMobile()) state.leftOpen = false;
    loadPrefs();

    const stored = loadEvents();
    const firstVisit = stored === null;
    state.events = firstVisit ? sampleEvents() : stored;
    if (firstVisit) saveEvents();

    syncMini();
    buildCategoryOptions();
    bindEvents();
    setFavicon();
    render();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (state.view === 'month') fillMonthCells(buildIndex()); });
    }

    if (firstVisit) {
      toast('Data contoh sudah dimuat supaya kalender langsung bisa dicoba. Hapus lewat "Hapus semua data" kapan saja.', { timeout: 9000 });
    } else {
      startupReminderToast();
    }
    runBrowserNotifications();
    setInterval(tick, 60 * 1000);
    setInterval(runBrowserNotifications, 60 * 60 * 1000);
  }

  // API kecil untuk debugging dari console browser
  window.CalendarApp = {
    parseCSV, parseDateTime, parseDuration, parseNominal, mapCategory,
    importCSVText: prepareImport, exportCSV, downloadTemplate,
    get events() { return state.events.slice(); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
