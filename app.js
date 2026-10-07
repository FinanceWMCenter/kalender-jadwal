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
  let REMINDER_DAYS = 30;          // pengingat aktif dari H-30 sampai Hari-H (bisa diatur dari Google Sheet)
  const URGENT_DAYS = 7;           // dihitung di badge lonceng
  const NOTIFY_MILESTONES = [30, 14, 7, 3, 1, 0];
  const CHIP_H = 22;
  const CHIP_GAP = 2;

  const CATEGORIES_KEY = 'calendar.categories.v1';

  // Empat kategori bawaan selalu ada. Kategori tambahan dibuat sendiri lewat "Tambah kategori".
  const BUILTIN_CATEGORIES = {
    sewa:    { label: 'Pembayaran Sewa Kantor', short: 'Sewa',    payment: true },
    rutin:   { label: 'Pembayaran Rutin',       short: 'Rutin',   payment: true },
    meeting: { label: 'Jadwal Meeting',         short: 'Meeting', payment: false },
    task:    { label: 'Task & Report',          short: 'Task',    payment: false },
  };
  const CATEGORIES = { ...BUILTIN_CATEGORIES };
  function catKeys() { return Object.keys(CATEGORIES); }
  function hasCat(k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, k); }

  // Pilihan warna pastel untuk kategori tambahan
  const PALETTE = {
    teal:   { name: 'Teal',   bg: '#D5F0EC', hover: '#C2E8E2', accent: '#3FA899', text: '#1E5C53' },
    pink:   { name: 'Pink',   bg: '#FADDEB', hover: '#F6CBE0', accent: '#D86A9D', text: '#7D2453' },
    orange: { name: 'Oranye', bg: '#FDE3CC', hover: '#FBD4B0', accent: '#E58C3A', text: '#7A3F0A' },
    indigo: { name: 'Indigo', bg: '#E0E3FA', hover: '#CFD3F6', accent: '#6A72D9', text: '#2E348A' },
    cyan:   { name: 'Biru muda', bg: '#D6EEF7', hover: '#C2E5F2', accent: '#3B9CC4', text: '#155470' },
    lime:   { name: 'Hijau muda', bg: '#E8F2CF', hover: '#DBEBB6', accent: '#8CB23A', text: '#44591A' },
    sand:   { name: 'Cokelat', bg: '#EFE5D8', hover: '#E6D7C4', accent: '#A98559', text: '#5A4024' },
    slate:  { name: 'Abu-abu', bg: '#E5E8ED', hover: '#D7DBE2', accent: '#7A8494', text: '#3A4150' },
    coral:  { name: 'Coral', bg: '#FCE1DC', hover: '#F9D1C9', accent: '#E4826F', text: '#7A2E22' },
    gold:   { name: 'Kuning', bg: '#FCEFC6', hover: '#F8E4A6', accent: '#D9A92E', text: '#684C00' },
    blue:   { name: 'Biru', bg: '#DCE8FC', hover: '#C9DBFA', accent: '#5C8DE8', text: '#1D4690' },
    purple: { name: 'Ungu', bg: '#E9E0F8', hover: '#DCCFF4', accent: '#9878D6', text: '#4B2F8A' },
  };
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

  // Header CSV yang dikenali (huruf kecil, spasi menjadi garis bawah).
  // Semua kolom opsional kecuali tanggal; kolom lain yang tidak dikenali tetap disimpan sebagai info tambahan.
  const HEADER_ALIASES = {
    no: ['no', 'nomor', 'no_urut'],
    kategori: ['kategori', 'category', 'jenis', 'tipe'],
    judul: ['judul', 'title', 'nama', 'nama_event', 'event', 'uraian'],
    tanggal: ['tanggal_jatuh_tempo', 'jatuh_tempo', 'tgl_jatuh_tempo', 'tanggal_bayar', 'tanggal', 'tgl', 'due_date', 'date'],
    nominal: ['nominal_idr', 'nominal', 'jumlah', 'amount', 'idr', 'nilai', 'dpp', 'harga_sewa', 'biaya'],
    periode: ['durasi_sewa', 'masa_sewa', 'periode_sewa', 'periode', 'masa_berlaku', 'jangka_waktu', 'periode_kontrak'],
    waktu: ['waktu', 'jam', 'durasi', 'duration'],
    cabang: ['cabang', 'lokasi', 'branch', 'outlet', 'site', 'klinik'],
    unit: ['sub_unit', 'subunit', 'unit', 'gedung', 'lantai', 'entitas', 'pt'],
    tahap: ['term_tahap', 'term', 'tahap', 'termin', 'pembayaran_ke'],
    ppn: ['ppn', 'ppn_idr', 'vat'],
    pph: ['pph', 'pph_idr', 'pph_4_2', 'pph42', 'pph_23', 'pph23'],
    catatan: ['catatan', 'keterangan', 'notes', 'note', 'deskripsi', 'memo'],
    status: ['status', 'status_bayar'],
  };
  const COL_LABELS = {
    no: 'No', kategori: 'Kategori', judul: 'Judul', tanggal: 'Jatuh tempo', nominal: 'Nominal', periode: 'Masa sewa',
    waktu: 'Waktu', cabang: 'Cabang', unit: 'Sub unit', tahap: 'Tahap', ppn: 'PPN', pph: 'PPh', catatan: 'Catatan', status: 'Status',
  };
  const EXPORT_HEADER = ['No', 'Kategori', 'Judul', 'Cabang', 'Sub_Unit', 'Term_Tahap', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'PPN', 'PPh', 'Masa_Sewa', 'Waktu', 'Catatan', 'Status'];

  const ICON = {
    chevL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    money: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 19h4"/></svg>',
    status: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    range: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M7 15h10"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
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
    filters: {},                      // kategori yang disembunyikan bernilai false
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

  function filterOn(k) { return state.filters[k] !== false; }

  /* -----------------------------------------------------------
     3b. KATEGORI TAMBAHAN
     ----------------------------------------------------------- */
  function loadCategories() {
    try {
      const arr = JSON.parse(storageGet(CATEGORIES_KEY) || '[]');
      if (!Array.isArray(arr)) return;
      arr.forEach((c) => {
        if (!c || !/^c[a-z0-9]+$/.test(c.key || '') || hasCat(c.key)) return;
        const label = String(c.label || '').trim().slice(0, 40);
        if (!label) return;
        CATEGORIES[c.key] = { label, short: label, payment: Boolean(c.payment), color: PALETTE[c.color] ? c.color : 'slate', custom: true };
      });
    } catch (err) { /* data kategori rusak diabaikan */ }
  }

  function saveCategories() {
    if (SYNC.on) return;   // mode sinkron: kategori disimpan sebagai tab di Google Sheet
    const custom = catKeys().filter((k) => CATEGORIES[k].custom)
      .map((k) => ({ key: k, label: CATEGORIES[k].label, payment: CATEGORIES[k].payment, color: CATEGORIES[k].color }));
    storageSet(CATEGORIES_KEY, JSON.stringify(custom));
  }

  // Warna kategori tambahan disuntikkan sebagai CSS; :not(.is-done) agar status selesai tetap sage green
  function renderCategoryStyles() {
    let tag = document.getElementById('categoryStyles');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'categoryStyles';
      document.head.appendChild(tag);
    }
    tag.textContent = catKeys().filter((k) => CATEGORIES[k].custom).map((k) => {
      const c = PALETTE[CATEGORIES[k].color] || PALETTE.slate;
      return `.cat-${k}:not(.is-done){--c-bg:${c.bg};--c-bg-hover:${c.hover};--c-accent:${c.accent};--c-text:${c.text};}`;
    }).join('\n');
  }

  function findCategoryByLabel(label, exceptKey) {
    const n = normalizeText(label);
    return catKeys().find((k) => k !== exceptKey && (normalizeText(CATEGORIES[k].label) === n || normalizeText(CATEGORIES[k].short) === n)) || null;
  }

  let editingCategory = null;
  let categoryCallback = null;

  function openCategoryModal(key, onSaved) {
    editingCategory = key || null;
    categoryCallback = onSaved || null;
    const c = key ? CATEGORIES[key] : null;
    const used = new Set(catKeys().map((k) => CATEGORIES[k].color).filter(Boolean));
    const color = c ? c.color : (Object.keys(PALETTE).find((x) => !used.has(x)) || 'teal');
    els.categoryModalTitle.textContent = c ? 'Edit kategori' : 'Kategori baru';
    els.cName.value = c ? c.label : '';
    els.cPayment.checked = Boolean(c && c.payment);
    els.cColors.innerHTML = Object.entries(PALETTE).map(([k, v]) => `<label class="swatch" title="${v.name}" style="--sw:${v.accent};--sw-bg:${v.bg}">`
      + `<input type="radio" name="catColor" value="${k}" ${k === color ? 'checked' : ''} aria-label="${v.name}"><span></span></label>`).join('');
    els.cDelete.hidden = !c;
    els.cDelete.textContent = SYNC.on ? 'Sembunyikan kategori' : 'Hapus kategori';
    els.cError.textContent = '';
    els.categoryModal.showModal();
    setTimeout(() => els.cName.focus(), 0);
  }

  function saveCategory(e) {
    e.preventDefault();
    const label = els.cName.value.trim().replace(/\s+/g, ' ');
    if (!label) { els.cError.textContent = 'Nama kategori wajib diisi.'; els.cName.focus(); return; }
    if (findCategoryByLabel(label, editingCategory)) { els.cError.textContent = 'Nama kategori sudah dipakai.'; els.cName.focus(); return; }
    const picked = els.cColors.querySelector('input[name="catColor"]:checked');
    const color = picked ? picked.value : 'slate';
    if (SYNC.on) { saveCategorySync(label, color, els.cPayment.checked); return; }
    const key = editingCategory || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    CATEGORIES[key] = { label: label.slice(0, 40), short: label.slice(0, 40), payment: els.cPayment.checked, color, custom: true };
    saveCategories();
    renderCategoryStyles();
    els.categoryModal.close();
    const cb = categoryCallback;
    categoryCallback = null;
    render();
    if (cb) cb(key);
    toast(editingCategory ? 'Kategori diperbarui' : `Kategori "${label}" ditambahkan`);
  }

  async function deleteCategory() {
    const key = editingCategory;
    if (!hasCat(key) || !CATEGORIES[key].custom) return;
    const cat = CATEGORIES[key];
    const related = state.events.filter((ev) => ev.kategori === key);
    els.categoryModal.close();
    if (SYNC.on) { hideCategorySync(cat); return; }
    const choice = await askConfirm({
      title: `Hapus kategori "${cat.label}"?`,
      message: related.length
        ? `${related.length} event di kategori ini ikut terhapus.`
        : 'Kategori ini belum punya event.',
      buttons: [{ label: 'Batal', value: null }, { label: 'Hapus kategori', value: 'delete', variant: 'danger' }],
    });
    if (choice !== 'delete') return;
    delete CATEGORIES[key];
    state.events = state.events.filter((ev) => ev.kategori !== key);
    if (related.some((ev) => ev.id === state.selectedId)) state.selectedId = null;
    if (state.lastKategori === key) state.lastKategori = 'meeting';
    saveCategories();
    saveEvents();
    renderCategoryStyles();
    render();
    toast('Kategori dihapus', {
      action: 'Urungkan',
      onAction: () => {
        CATEGORIES[key] = cat;
        state.events.push(...related);
        saveCategories(); saveEvents(); renderCategoryStyles(); render();
      },
    });
  }

  /* -----------------------------------------------------------
     4. MODEL EVENT & PENYIMPANAN
     ----------------------------------------------------------- */
  function toAmount(v) {
    const n = v === null || v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  function toISODate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }
  function cleanText(v, max) { return String(v ?? '').trim().slice(0, max); }

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const kategori = hasCat(raw.kategori) ? raw.kategori : null;
    const tanggal = toISODate(raw.tanggal) || null;
    const judul = String(raw.judul ?? '').trim();
    if (!kategori || !tanggal || !judul) return null;

    const mulai = /^\d{2}:\d{2}$/.test(raw.mulai || '') ? raw.mulai : '';
    let durasi = 0;
    if (mulai) {
      const maxDur = 1440 - timeToMin(mulai);
      durasi = clamp(Math.round(Number(raw.durasi) || 60), 15, Math.max(15, maxDur));
    }

    let periodeMulai = toISODate(raw.periodeMulai);
    let periodeSelesai = toISODate(raw.periodeSelesai);
    if (!periodeMulai || !periodeSelesai) { periodeMulai = ''; periodeSelesai = ''; }

    const extra = Array.isArray(raw.extra)
      ? raw.extra
        .filter((x) => x && String(x.label ?? '').trim() && String(x.value ?? '').trim())
        .map((x) => ({ label: cleanText(x.label, 60), value: cleanText(x.value, 300) }))
        .slice(0, 12)
      : [];

    return {
      id: String(raw.id || uid()),
      kategori,
      judul: judul.slice(0, 200),
      tanggal,
      mulai,
      durasi,
      nominal: toAmount(raw.nominal),
      catatan: String(raw.catatan ?? '').trim(),
      cabang: cleanText(raw.cabang, 80),
      unit: cleanText(raw.unit, 80),
      tahap: cleanText(raw.tahap, 80),
      periodeMulai,
      periodeSelesai,
      ppn: toAmount(raw.ppn),
      pph: toAmount(raw.pph),
      extra,
      selesai: Boolean(raw.selesai),
      selesaiPada: raw.selesai ? (raw.selesaiPada === undefined ? new Date().toISOString() : (raw.selesaiPada || null)) : null,
      selesaiOleh: raw.selesai ? cleanText(raw.selesaiOleh, 120).toLowerCase() : '',
      sumber: ['csv', 'contoh'].includes(raw.sumber) ? raw.sumber : 'manual',
      seriesId: raw.seriesId || null,
      dibuat: raw.dibuat || new Date().toISOString(),
      dibuatOleh: cleanText(raw.dibuatOleh, 120).toLowerCase(),
      dibuatPada: cleanText(raw.dibuatPada, 40),
      diubahOleh: cleanText(raw.diubahOleh, 120).toLowerCase(),
      diubahPada: cleanText(raw.diubahPada, 40),
    };
  }

  // Judul otomatis untuk data tanpa kolom judul, contoh: "Sewa Pemuda Gedung A – Tahap 1"
  function buildTitle({ kategori, cabang, unit, tahap }) {
    const loc = [cabang, unit].filter(Boolean).join(' ');
    if (!loc && !tahap) return '';
    const base = loc ? `${kategori === 'sewa' ? 'Sewa ' : ''}${loc}` : CATEGORIES[kategori].short;
    return tahap ? `${base} – ${tahap}` : base;
  }

  // Kunci "mirip": kategori + tanggal + nominal + kata pertama nama cabang
  function simKey(ev) {
    if (!ev.nominal) return null;
    const base = normalizeText(ev.cabang || ev.judul).replace(/^sewa\s+/, '');
    const token = base.split(/[\s,()–-]+/)[0];
    return token ? [ev.kategori, ev.tanggal, ev.nominal, token].join('|') : null;
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
    if (SYNC.on) { queuePush(); return; }
    if (!storageSet(STORAGE_KEY, JSON.stringify(state.events))) {
      toast('Penyimpanan browser penuh atau diblokir, jadi perubahan belum tersimpan. Ekspor ke CSV sebagai cadangan.', { timeout: 8000 });
    }
  }

  function loadPrefs() {
    try {
      const p = JSON.parse(storageGet(PREFS_KEY) || '{}');
      if (VIEWS.includes(p.view)) state.view = p.view;
      if (p.filters) Object.keys(p.filters).forEach((k) => { if (p.filters[k] === false) state.filters[k] = false; });
      if (typeof p.showDone === 'boolean') state.showDone = p.showDone;
      if (typeof p.leftOpen === 'boolean' && !isMobile()) state.leftOpen = p.leftOpen;
      if (hasCat(p.lastKategori)) state.lastKategori = p.lastKategori;
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

  function isVisible(ev) { return filterOn(ev.kategori) && (state.showDone || !ev.selesai); }

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
      { kategori: 'sewa', judul: 'Sewa Kantor Pusat Gedung A – Tahun 2', cabang: 'Kantor Pusat', unit: 'Gedung A', tahap: 'Tahun 2', tanggal: D(0, 5), nominal: 25000000, ppn: 2750000, periodeMulai: D(1, 1), periodeSelesai: toISO(addDays(parseISO(D(13, 1)), -1)), catatan: 'Minta kuitansi bermeterai.' },
      { kategori: 'sewa', judul: 'Sewa Cabang Selatan – Periode 3', cabang: 'Cabang Selatan', tahap: 'Periode 3', tanggal: D(0, 20), nominal: 18500000, pph: 1850000, periodeMulai: D(2, 1), periodeSelesai: toISO(addDays(parseISO(D(14, 1)), -1)), catatan: 'Kontrak berakhir tahun depan, siapkan negosiasi perpanjangan.' },
      { kategori: 'sewa', judul: 'Sewa Cabang Selatan – Periode 2', cabang: 'Cabang Selatan', tahap: 'Periode 2', tanggal: D(-1, 20), nominal: 18500000, pph: 1850000 },
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
      return normalizeEvent({ ...item, id: uid(), selesai, selesaiPada: selesai ? now : null, sumber: 'contoh', dibuat: now });
    }).filter(Boolean);
  }

  // Judul data contoh (versi lama & baru) untuk mengenali data contoh yang tersimpan sebelum ada penanda "contoh"
  const SAMPLE_TITLES = new Set([
    'Sewa Gedung Kantor Pusat', 'Sewa Ruko Cabang Selatan', 'Sewa Gudang Arsip', 'Tagihan Listrik & Air',
    'Internet & Telepon Kantor', 'Iuran BPJS Ketenagakerjaan', 'Langganan Software Akuntansi', 'Weekly Finance Sync',
    'Rapat Evaluasi Budget', 'Meeting Vendor Pengadaan', 'Rekonsiliasi Bank', 'Laporan Keuangan Bulanan',
    'Setor & Lapor PPh 21', 'Review Cash Flow Mingguan', 'Sewa Kantor Pusat Gedung A – Tahun 2',
    'Sewa Cabang Selatan – Periode 3', 'Sewa Cabang Selatan – Periode 2',
  ]);

  function findSampleEvents(list) {
    if (!list && SYNC.on) return [];
    const src = list || state.events;
    const tagged = src.filter((ev) => ev.sumber === 'contoh');
    // Data contoh versi lama: judul contoh yang dibuat bersamaan dalam satu waktu (minimal 8 event)
    const legacy = src.filter((ev) => ev.sumber === 'manual' && SAMPLE_TITLES.has(ev.judul));
    const batch = {};
    legacy.forEach((ev) => { batch[ev.dibuat] = (batch[ev.dibuat] || 0) + 1; });
    return [...tagged, ...legacy.filter((ev) => batch[ev.dibuat] >= 8)];
  }

  async function clearSamples() {
    if (SYNC.on) return;
    const samples = findSampleEvents();
    if (!samples.length) { toast('Tidak ada data contoh di kalender.'); return; }
    const ok = await askConfirm({
      title: 'Hapus data contoh?',
      message: `${samples.length} event contoh akan dihapus. Event yang Anda buat sendiri atau impor dari CSV tidak tersentuh.`,
      buttons: [{ label: 'Batal', value: null }, { label: 'Hapus data contoh', value: 'yes', variant: 'danger' }],
    });
    if (ok !== 'yes') return;
    const ids = new Set(samples.map((ev) => ev.id));
    state.events = state.events.filter((ev) => !ids.has(ev.id));
    if (ids.has(state.selectedId)) state.selectedId = null;
    saveEvents();
    render();
    toast(`${samples.length} event contoh dihapus.`, {
      action: 'Urungkan',
      onAction: () => { state.events.push(...samples); saveEvents(); render(); },
    });
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
    renderActivity();
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
    renderActivity();
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
    return `<div class="chip cat-${ev.kategori}${done}${isSel}" data-action="open" data-id="${id}" draggable="${canEdit(ev)}" tabindex="0" role="button" title="${escapeHTML(tip)}">`
      + `<input type="checkbox" class="chk" data-id="${id}" ${ev.selesai ? 'checked' : ''}${canToggle(ev) ? '' : ' disabled'} aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
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
    return `<div class="${cls}" data-action="open" data-id="${id}" draggable="${canEdit(ev)}" tabindex="0" role="button" title="${escapeHTML(tip)}" `
      + `style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px)">`
      + '<div class="tev__top">'
      + `<input type="checkbox" class="chk" data-id="${id}" ${ev.selesai ? 'checked' : ''}${canToggle(ev) ? '' : ' disabled'} aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
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
    catKeys().forEach((k) => { counts[k] = 0; });
    state.events.forEach((ev) => { if (ev.tanggal.startsWith(ym)) counts[ev.kategori] += 1; });

    els.calFilters.innerHTML = catKeys().map((k) => `<li class="cal-filter-item"><label class="cal-filter cat-${k}">`
      + `<input type="checkbox" class="chk chk--lg" data-filter="${k}" ${filterOn(k) ? 'checked' : ''}>`
      + `<span class="cal-filter__name">${escapeHTML(CATEGORIES[k].label)}</span>`
      + `<span class="cal-filter__count" title="Jumlah di ${MONTHS[state.cursor.getMonth()]}">${counts[k]}</span>`
      + '</label>'
      + (CATEGORIES[k].custom && isAdmin() ? `<button type="button" class="icon-btn icon-btn--xs cal-filter__edit" data-action="edit-category" data-cat="${k}" aria-label="Edit kategori ${escapeHTML(CATEGORIES[k].label)}">${ICON.pencil}</button>` : '')
      + '</li>').join('');
    els.chkShowDone.checked = state.showDone;
  }

  /* ---------- Ringkasan bulan berjalan ---------- */
  function renderSummary() {
    const c = state.cursor;
    const ym = toISO(c).slice(0, 7);
    const inMonth = state.events.filter((ev) => ev.tanggal.startsWith(ym) && filterOn(ev.kategori));
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
      + `<div class="sum-row"><span>Agenda lain selesai</span><strong>${workDone} dari ${work.length}</strong></div>`;
  }

  /* ---------- Pengingat H-30 sampai Hari-H ---------- */
  function computeReminders() {
    return state.events
      .filter((ev) => filterOn(ev.kategori) && !ev.selesai)
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
      + `<input type="checkbox" class="chk" data-id="${id}"${canToggle(ev) ? '' : ' disabled'} aria-label="${escapeHTML(`Tandai ${doneWord(ev).toLowerCase()}: ${ev.judul}`)}">`
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

  /* ---------- Detail event (hanya menampilkan isian yang ada) ---------- */
  function detailRow(icon, label, valueHTML) {
    return `<div class="drow"><dt class="ico">${icon}</dt><dd><span class="drow__label">${label}</span><div class="drow__value">${valueHTML}</div></dd></div>`;
  }

  function periodHTML(ev) {
    if (!ev.periodeMulai || !ev.periodeSelesai) return '';
    const a = parseISO(ev.periodeMulai);
    const b = parseISO(ev.periodeSelesai);
    const months = Math.round(diffDays(a, addDays(b, 1)) / 30.4375);
    let len = '';
    if (months > 0) len = months % 12 === 0 ? `${months / 12} tahun` : `${months} bulan`;
    return `${fmtDateMedium(a)} – ${fmtDateMedium(b)}${len ? ` <span class="muted">(${len})</span>` : ''}`;
  }

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
    const rows = [];

    const rel = ev.selesai ? '' : ` <span class="rel-badge tone-${toneFor(diff)}">${relativeLabel(diff)}</span>`;
    rows.push(detailRow(ICON.calendar, cat.payment ? 'Jatuh tempo' : 'Tanggal', `${fmtDateLong(d)}${rel}`));
    if (ev.mulai) rows.push(detailRow(ICON.clock, 'Waktu', `${fmtTimeRange(ev)} <span class="muted">(${fmtDuration(ev.durasi)})</span>`));

    const lokasi = [ev.cabang, ev.unit].filter(Boolean).map(escapeHTML).join(', ');
    if (lokasi) rows.push(detailRow(ICON.pin, 'Lokasi', lokasi));
    if (ev.tahap) rows.push(detailRow(ICON.layers, 'Tahap pembayaran', escapeHTML(ev.tahap)));
    const period = periodHTML(ev);
    if (period) rows.push(detailRow(ICON.range, ev.kategori === 'sewa' ? 'Masa sewa' : 'Periode', period));

    if (ev.nominal || ev.ppn || ev.pph) {
      const taxes = [];
      if (ev.ppn) taxes.push(`<div class="tax-line"><span>PPN</span><span>${fmtIDR(ev.ppn)}</span></div>`);
      if (ev.pph) taxes.push(`<div class="tax-line"><span>PPh</span><span>${fmtIDR(ev.pph)}</span></div>`);
      const main = ev.nominal ? `<span class="amount">${fmtIDR(ev.nominal)}</span>` : '<span class="muted">Belum diisi</span>';
      rows.push(detailRow(ICON.money, 'Nominal', main + (taxes.length ? `<div class="tax-lines">${taxes.join('')}</div>` : '')));
    }

    ev.extra.forEach((x) => rows.push(detailRow(ICON.info, escapeHTML(x.label), escapeHTML(x.value))));
    if (ev.catatan) rows.push(detailRow(ICON.note, 'Catatan', `<span class="pre">${escapeHTML(ev.catatan)}</span>`));

    const doneStamp = ev.selesai ? fmtStamp(ev.selesaiPada) : '';
    const doneAt = doneStamp ? ` <span class="muted small">pada ${doneStamp}</span>` : '';
    rows.push(detailRow(ICON.status, 'Status', `<span class="status-pill${ev.selesai ? ' is-done' : ''}">${statusText(ev)}</span>${doneAt}`));

    if (SYNC.on) {
      const who = (email) => (email ? escapeHTML(userLabel(email)) : 'Admin (langsung di Google Sheet)');
      const when = (stampText) => (fmtStamp(stampText) ? ` <span class="muted small">${fmtStamp(stampText)}</span>` : '');
      rows.push(detailRow(ICON.user, 'Dibuat oleh', `${who(ev.dibuatOleh)}${when(ev.dibuatPada)}`));
      if (ev.diubahOleh) rows.push(detailRow(ICON.pencil, 'Terakhir diubah', `${who(ev.diubahOleh)}${when(ev.diubahPada)}`));
      if (ev.selesai && ev.selesaiOleh) rows.push(detailRow(ICON.status, `${word} oleh`, who(ev.selesaiOleh)));
    }

    const series = ev.seriesId ? state.events.filter((e) => e.seriesId === ev.seriesId).sort((a, b) => a.tanggal.localeCompare(b.tanggal)) : [];
    if (series.length > 1) {
      const pos = series.findIndex((e) => e.id === ev.id) + 1;
      rows.push(detailRow(ICON.repeat, 'Pengulangan', `Kejadian ke-${pos} dari ${series.length}`));
    }

    els.panelDetail.innerHTML = `<article class="detail cat-${ev.kategori}${ev.selesai ? ' is-done' : ''}">`
      + `<div class="detail__band">${escapeHTML(cat.label)}</div>`
      + `<h3 class="detail__title">${escapeHTML(ev.judul)}</h3>`
      + `<dl class="detail__list">${rows.join('')}</dl>`
      + `<p class="detail__source">${{ csv: 'Diimpor dari CSV', contoh: 'Data contoh' }[ev.sumber] || 'Dibuat manual'}</p>`
      + '<div class="detail__actions">'
      + (canToggle(ev) ? `<button type="button" class="btn ${ev.selesai ? 'btn--outline' : 'btn--primary'} btn--block" data-action="toggle-status" data-id="${id}">${ev.selesai ? `Batalkan status ${word.toLowerCase()}` : `Tandai ${word.toLowerCase()}`}</button>` : '')
      + '<div class="detail__row-actions">'
      + (canEdit(ev) ? `<button type="button" class="btn btn--outline" data-action="edit" data-id="${id}">Edit</button>` : '')
      + `<button type="button" class="btn btn--outline" data-action="reveal" data-id="${id}">Lihat di kalender</button>`
      + (canEdit(ev) ? `<button type="button" class="btn btn--danger-text" data-action="delete" data-id="${id}">Hapus</button>` : '')
      + '</div>'
      + (SYNC.on && !canEdit(ev) ? '<p class="detail__lock">Jadwal ini milik pengguna lain, sehingga hanya bisa dilihat.</p>' : '')
      + '</div></article>';
  }

  function renderRightTabs() {
    if (state.rightTab === 'activity' && !SYNC.on) state.rightTab = 'reminders';
    const tabs = {
      reminders: [els.tabReminders, els.panelReminders],
      detail: [els.tabDetail, els.panelDetail],
      activity: [els.tabActivity, els.panelActivity],
    };
    Object.entries(tabs).forEach(([k, pair]) => {
      pair[0].setAttribute('aria-selected', String(state.rightTab === k));
      pair[1].hidden = state.rightTab !== k;
    });
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
  function anyPopoverOpen() { return !els.periodPicker.hidden || !els.dayPopover.hidden || !els.userPopover.hidden; }

  function closePopovers(except) {
    [els.periodPicker, els.dayPopover, els.userPopover].forEach((p) => { if (p !== except) p.hidden = true; });
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
    delete state.filters[ev.kategori];
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
    if (!canToggle(ev)) { render(); return; }
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
    if (!ev || !canEdit(ev)) return;
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
    if (!ev || !canEdit(ev)) return;
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
    if (SYNC.on) return;
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
    if (SYNC.on) return;
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
    els.fKategori.innerHTML = catKeys().map((k) => `<label class="cat-opt cat-${k}">`
      + `<input type="radio" name="kategori" value="${k}">`
      + '<span class="cat-opt__dot" aria-hidden="true"></span>'
      + `<span>${escapeHTML(CATEGORIES[k].label)}</span></label>`).join('')
      + '<button type="button" class="cat-opt cat-opt--add" data-action="new-category-from-form">+ Kategori baru</button>';
  }

  // Bangun ulang pilihan kategori di form tanpa menghapus isian lain
  function buildCategoryOptionsKeep(selectKey) {
    buildCategoryOptions();
    setRadio(selectKey);
    updateStatusLabel();
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
    updateCategoryFields();
  }

  // Isian khusus hanya muncul untuk kategori yang membutuhkannya
  function updateCategoryFields() {
    const k = getRadio();
    els.sewaFields.hidden = k !== 'sewa';
    els.taxRow.hidden = !CATEGORIES[k].payment;
    els.fJudul.placeholder = k === 'sewa' ? 'Judul (boleh kosong, dibuat dari cabang & tahap)' : 'Tambahkan judul';
  }

  function moneyValue(input) {
    const digits = input.value.replace(/\D/g, '');
    return digits ? Number(digits) : null;
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
    const ev = id ? getEvent(id) : null;
    if (ev ? !canEdit(ev) : !canCreate()) return;
    editingId = id;

    buildCategoryOptions();
    els.eventModalTitle.textContent = ev ? 'Edit event' : 'Event baru';
    els.fJudul.value = ev ? ev.judul : '';
    setRadio(ev ? ev.kategori : (hasCat(state.lastKategori) ? state.lastKategori : 'meeting'));
    els.fTanggal.value = ev ? ev.tanggal : (date || toISO(state.cursor));

    const start = ev ? ev.mulai : (mulai || '');
    formDuration = ev && ev.mulai ? ev.durasi : 60;
    els.fAllDay.checked = !start;
    els.fMulai.value = start || '09:00';
    els.fAkhir.value = minToTime(Math.min(timeToMin(start || '09:00') + formDuration, 1439));

    els.fNominal.value = ev && ev.nominal ? formatThousands(ev.nominal) : '';
    els.fPPN.value = ev && ev.ppn ? formatThousands(ev.ppn) : '';
    els.fPPh.value = ev && ev.pph ? formatThousands(ev.pph) : '';
    els.fCabang.value = ev ? ev.cabang : '';
    els.fUnit.value = ev ? ev.unit : '';
    els.fTahap.value = ev ? ev.tahap : '';
    els.fPeriodeMulai.value = ev ? ev.periodeMulai : '';
    els.fPeriodeSelesai.value = ev ? ev.periodeSelesai : '';
    const cabangList = [...new Set(state.events.map((x) => x.cabang).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
    els.cabangList.innerHTML = cabangList.map((c) => `<option value="${escapeHTML(c)}"></option>`).join('');
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
    const kategori = getRadio();
    const isSewa = kategori === 'sewa';
    const isPayment = CATEGORIES[kategori].payment;
    const cabang = isSewa ? els.fCabang.value.trim() : '';
    const unit = isSewa ? els.fUnit.value.trim() : '';
    const tahap = isSewa ? els.fTahap.value.trim() : '';
    const judul = els.fJudul.value.trim() || buildTitle({ kategori, cabang, unit, tahap });
    if (!judul) return { error: isSewa ? 'Isi judul atau cabang.' : 'Judul wajib diisi.', field: isSewa ? els.fCabang : els.fJudul };

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

    const periodeMulai = isSewa ? els.fPeriodeMulai.value : '';
    const periodeSelesai = isSewa ? els.fPeriodeSelesai.value : '';
    if (Boolean(periodeMulai) !== Boolean(periodeSelesai)) {
      return { error: 'Isi awal dan akhir masa sewa, atau kosongkan keduanya.', field: periodeMulai ? els.fPeriodeSelesai : els.fPeriodeMulai };
    }
    if (periodeMulai && periodeSelesai < periodeMulai) return { error: 'Akhir masa sewa harus setelah awal masa sewa.', field: els.fPeriodeSelesai };

    return {
      data: {
        kategori,
        judul,
        tanggal,
        mulai,
        durasi,
        nominal: moneyValue(els.fNominal),
        ppn: isPayment ? moneyValue(els.fPPN) : null,
        pph: isPayment ? moneyValue(els.fPPh) : null,
        cabang,
        unit,
        tahap,
        periodeMulai,
        periodeSelesai,
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
        ...data, tanggal: t, id: uid(), seriesId, sumber: 'manual', dibuat: now, selesaiPada: data.selesai ? now : null, dibuatOleh: currentEmail(),
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
    if (ev) delete state.filters[ev.kategori];
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
    if (hasCat(s)) return s;
    const exact = findCategoryByLabel(s);
    if (exact) return exact;
    const custom = catKeys().find((k) => CATEGORIES[k].custom && s.includes(normalizeText(CATEGORIES[k].label)));
    if (custom) return custom;
    if (/sewa|rent|lease/.test(s)) return 'sewa';
    if (/rutin|routine|recurring|tagihan|langganan|iuran|bulanan/.test(s)) return 'rutin';
    if (/meeting|rapat|pertemuan|meet/.test(s)) return 'meeting';
    if (/task|tugas|report|laporan|deadline/.test(s)) return 'task';
    if (/pembayaran|bayar|payment/.test(s)) return 'rutin';
    return null;
  }

  /* Menerima: 2026-10-15, 2026/10/15, 15/10/2026, 15-10-2026, 15.10.2026, 02/02 2027,
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
    } else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.\s]+(\d{2,4})$/))) {
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

  // Rentang tanggal seperti "01/03/2026 - 28/02/2027", "01/12/2024- 30/11/2025", "01/01/2026 - 02/02 2027"
  const DATE_IN_TEXT = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.\s]\d{4}|\d{1,2}[\s-]+[a-z]{3,9}\.?[\s-]+\d{4}/gi;

  function looksLikePeriod(raw) { return (String(raw || '').match(DATE_IN_TEXT) || []).length >= 2; }

  // null = kosong, false = tidak terbaca, objek = berhasil
  function parsePeriod(raw) {
    const s = String(raw || '').trim();
    if (!s || s === '-' || s === '—') return null;
    const found = s.match(DATE_IN_TEXT) || [];
    if (found.length < 2) return false;
    const a = parseDateTime(found[0]);
    const b = parseDateTime(found[1]);
    if (!a || !b) return false;
    return { mulai: a.date, selesai: b.date };
  }

  /* Waktu acara: kosong, "Sepanjang hari", "09:00-10:30", "09:00 (90 menit)",
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

  /* Angka rupiah fleksibel. Mengembalikan angka, null jika kosong, atau NaN jika tidak valid.
     Contoh: 134,000,000 / 134.000.000 / Rp 4.750.000,00 / 44444444.400000006 / 1,5jt */
  function parseAmount(raw) {
    let s = String(raw ?? '').toLowerCase().replace(/rp\.?|idr/g, '').replace(/\s+/g, '');
    if (!s || s === '-' || s === '—') return null;
    const unit = s.match(/(jt|juta|rb|ribu|k|miliar|milyar|m)$/);
    if (unit) {
      const u = unit[1];
      const mult = /^(jt|juta)$/.test(u) ? 1e6 : /^(rb|ribu|k)$/.test(u) ? 1e3 : 1e9;
      s = s.slice(0, -u.length);
      if (!/^\d+([.,]\d+)?$/.test(s)) return NaN;
      return Math.round(parseFloat(s.replace(',', '.')) * mult);
    }
    if (!/^\d[\d.,]*$/.test(s)) return NaN;
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (last !== -1) {
      const sep = s[last];
      const decimals = s.length - last - 1;
      const sepCount = s.split(sep).length - 1;
      const hasOther = s.includes(sep === '.' ? ',' : '.');
      // Pemisah terakhir adalah desimal jika diikuti selain 3 digit (mis. ",00" atau ".4000006")
      if (decimals !== 3 || (hasOther && sepCount === 1)) {
        return Math.round(parseFloat(`${s.slice(0, last).replace(/[.,]/g, '') || '0'}.${s.slice(last + 1) || '0'}`));
      }
    }
    return Number(s.replace(/[.,]/g, ''));
  }

  // Ambil "PPN: 14740000 | PPh: 0" dari teks catatan; sisanya tetap menjadi catatan
  function extractTaxes(text) {
    let ppn = null;
    let pph = null;
    let rest = String(text || '');
    rest = rest.replace(/\bppn\b\s*[:=]?\s*(?:rp\.?\s*)?([\d][\d.,]*)/i, (m, v) => { ppn = parseAmount(v); return ' '; });
    rest = rest.replace(/\bpph\b(?:\s*(?:pasal\s*)?(?:4\s*(?:ayat\s*)?\(?\s*2\s*\)?|23|21|26))?\s*[:=]?\s*(?:rp\.?\s*)?([\d][\d.,]*)/i, (m, v) => { pph = parseAmount(v); return ' '; });
    rest = rest.replace(/(\s*[|;]\s*)+/g, ' | ').replace(/^[\s|;,/-]+|[\s|;,/-]+$/g, '').trim();
    return {
      ppn: Number.isFinite(ppn) ? ppn : null,
      pph: Number.isFinite(pph) ? pph : null,
      rest,
    };
  }

  function parseStatus(raw) {
    const s = normalizeText(raw);
    if (!s) return false;
    if (/^(belum|tidak|no|false|0|pending|open|todo)/.test(s)) return false;
    return /(selesai|lunas|done|sudah|paid|complete|ya|yes|true|1)/.test(s);
  }

  function prettyHeader(h) {
    const s = String(h).replace(/^\uFEFF/, '').replace(/_+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Tebak kategori bawaan dari nama file & header bila file tidak punya kolom kategori
  function guessKategori(name, headerNorm) {
    const s = `${name} ${headerNorm.join(' ')}`.toLowerCase();
    if (/sewa|rent|lease/.test(s)) return 'sewa';
    // Kolom khas jadwal sewa: cabang, sub unit, term/tahap, masa sewa
    const sewaCols = [...HEADER_ALIASES.cabang, ...HEADER_ALIASES.unit, ...HEADER_ALIASES.tahap, ...HEADER_ALIASES.periode];
    if (headerNorm.some((h) => sewaCols.includes(h))) return 'sewa';
    if (/rapat|meeting/.test(s)) return 'meeting';
    if (/task|tugas|laporan|report/.test(s)) return 'task';
    return 'rutin';
  }

  // Kenali kolom berdasarkan nama header; kolom tanggal bisa dideteksi dari isinya
  function detectColumns(headerRow, dataRows) {
    const header = headerRow.map(normHeader);
    const used = new Set();
    const col = {};
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      for (const alias of aliases) {
        const i = header.findIndex((h, idx) => h === alias && !used.has(idx));
        if (i !== -1) { col[key] = i; used.add(i); break; }
      }
    });
    if (col.tanggal === undefined) {
      let best = -1;
      let bestScore = 0;
      header.forEach((h, idx) => {
        if (used.has(idx)) return;
        const vals = dataRows.map((r) => String(r[idx] ?? '').trim()).filter(Boolean);
        if (!vals.length) return;
        const score = vals.filter((v) => parseDateTime(v)).length / vals.length;
        if (score > bestScore) { bestScore = score; best = idx; }
      });
      if (best !== -1 && bestScore >= 0.6) { col.tanggal = best; used.add(best); }
    }
    const extras = [];
    headerRow.forEach((h, idx) => {
      if (!used.has(idx) && String(h).trim()) extras.push({ idx, label: prettyHeader(h) });
    });
    return { col, extras, header };
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
        toast('File CSV tidak bisa dibaca. Periksa isinya lalu coba lagi.');
      }
    };
    reader.onerror = () => toast('Gagal membaca file.');
    reader.readAsText(file, 'UTF-8');
  }

  function prepareImport(text, name) {
    const rows = parseCSV(text);
    if (rows.length < 2) { toast('File CSV kosong atau hanya berisi header.'); return; }
    const dataRows = rows.slice(1);
    const { col, extras, header } = detectColumns(rows[0], dataRows);
    if (col.tanggal === undefined) {
      toast('Kolom tanggal tidak ditemukan. Beri judul kolom seperti "Tanggal" atau "Tanggal_Jatuh_Tempo".', {
        timeout: 9000, action: 'Unduh template', onAction: downloadTemplate,
      });
      return;
    }
    state.pendingImport = {
      name,
      rows: dataRows,
      col,
      extras,
      hasKategoriCol: col.kategori !== undefined,
      kategori: guessKategori(name, header),
      includeSimilar: false,
      pastDone: col.status === undefined,   // file tanpa kolom status: jadwal lampau dianggap sudah dibayar
      mode: 'add',                          // 'add' = tambahkan, 'replace' = ganti data impor CSV sebelumnya
      removeSamples: findSampleEvents().length > 0,
      replaceIds: new Set(),
      results: [],
    };
    buildImportResults();
    renderImportModal();
    els.importModal.showModal();
  }

  // Kategori yang dipakai file ini (pilihan di pratinjau + isi kolom kategori, jika ada)
  function importCategories(p) {
    const cats = new Set([p.kategori]);
    if (p.col.kategori !== undefined) {
      p.rows.forEach((r) => { const k = mapCategory(String(r[p.col.kategori] ?? '')); if (k) cats.add(k); });
    }
    return cats;
  }

  function buildImportResults() {
    const p = state.pendingImport;
    const { rows, col, extras } = p;

    // Mode ganti: data CSV lama di kategori yang sama akan dilepas; data contoh juga bila dicentang
    if (SYNC.on && !isAdmin()) p.mode = 'add';
    const cats = importCategories(p);
    p.replaceable = state.events.filter((ev) => ev.sumber === 'csv' && cats.has(ev.kategori));
    p.samples = findSampleEvents();
    p.replaceIds = new Set([
      ...(p.mode === 'replace' ? p.replaceable.map((ev) => ev.id) : []),
      ...(p.removeSamples ? p.samples.map((ev) => ev.id) : []),
    ]);
    const base = state.events.filter((ev) => !p.replaceIds.has(ev.id));

    // Status lunas dari data lama dipertahankan untuk jadwal yang sama
    const oldStatus = new Map();
    if (p.mode === 'replace') {
      p.replaceable.forEach((ev) => {
        const st = { selesai: ev.selesai, selesaiPada: ev.selesaiPada };
        oldStatus.set(dupKey(ev), st);
        const sk = simKey(ev);
        if (sk && !oldStatus.has(sk)) oldStatus.set(sk, st);
      });
    }

    const exact = new Set(base.map(dupKey));
    const similar = new Map();
    base.forEach((ev) => { const k = simKey(ev); if (k && !similar.has(k)) similar.set(k, ev); });
    const seenExact = new Map();
    const seenSimilar = new Map();
    const seenDate = new Map();
    const now = new Date().toISOString();
    let last = { cabang: '', unit: '' };

    p.results = rows.map((r, i) => {
      const get = (k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
      const rowNo = get('no') || String(i + 1);
      const res = {
        rowNo, status: 'new', notes: [], warn: false, ev: null,
        raw: { judul: get('judul') || [get('cabang'), get('unit'), get('tahap')].filter(Boolean).join(' '), tanggal: get('tanggal'), nominal: get('nominal') },
      };
      const fail = (msg) => { res.status = 'error'; res.notes.push(msg); return res; };
      const warn = (msg) => { res.warn = true; res.notes.push(msg); };

      // Kategori: dari kolom jika ada, selain itu memakai pilihan di atas tabel
      let kategori = p.kategori;
      const katRaw = get('kategori');
      if (katRaw) {
        const k = mapCategory(katRaw);
        if (k) kategori = k;
        else warn(`Kategori "${katRaw}" tidak dikenali, memakai ${CATEGORIES[p.kategori].short}`);
      }

      // Sel cabang/sub unit yang kosong mengikuti baris di atasnya (seperti sel gabungan di Excel)
      let cabang = get('cabang');
      let unit = get('unit');
      if (!cabang && col.cabang !== undefined && last.cabang) cabang = last.cabang;
      if (!unit && cabang && cabang === last.cabang && last.unit) unit = last.unit;
      last = { cabang, unit };
      const tahap = get('tahap');

      const dt = parseDateTime(get('tanggal'));
      if (!dt) return fail(`Tanggal "${get('tanggal') || '(kosong)'}" tidak dikenali`);

      let periodeRaw = get('periode');
      let waktuRaw = get('waktu');
      if (!periodeRaw && looksLikePeriod(waktuRaw)) { periodeRaw = waktuRaw; waktuRaw = ''; }
      let periode = parsePeriod(periodeRaw);
      if (periode === false) { warn(`Masa sewa "${periodeRaw}" tidak terbaca`); periode = null; }
      else if (periode && periode.selesai < periode.mulai) warn('Akhir masa sewa lebih awal dari awal masa sewa');

      let dur = parseDuration(waktuRaw, dt.time);
      if (!dur) {
        dur = dt.time ? { mulai: dt.time, durasi: 60 } : { mulai: '', durasi: 0 };
        warn(`Waktu "${waktuRaw}" tidak terbaca, dianggap ${dur.mulai ? '60 menit' : 'sepanjang hari'}`);
      }

      const nominal = parseAmount(get('nominal'));
      if (Number.isNaN(nominal)) return fail(`Nominal "${get('nominal')}" tidak valid`);

      const taxes = extractTaxes(get('catatan'));
      let { ppn, pph } = taxes;
      if (col.ppn !== undefined) { const v = parseAmount(get('ppn')); if (Number.isFinite(v)) ppn = v; }
      if (col.pph !== undefined) { const v = parseAmount(get('pph')); if (Number.isFinite(v)) pph = v; }

      const extra = extras.map((x) => ({ label: x.label, value: String(r[x.idx] ?? '').trim() })).filter((x) => x.value);
      const judul = get('judul') || buildTitle({ kategori, cabang, unit, tahap }) || (extra[0] && extra[0].value) || `${CATEGORIES[kategori].short} ${rowNo}`;
      const statusRaw = get('status');
      const selesai = statusRaw ? parseStatus(statusRaw) : (p.pastDone && dt.date < todayISO());

      const ev = normalizeEvent({
        id: uid(), dibuatOleh: currentEmail(), kategori, judul, tanggal: dt.date, mulai: dur.mulai, durasi: dur.durasi, nominal,
        catatan: taxes.rest, cabang, unit, tahap, ppn, pph, extra,
        periodeMulai: periode ? periode.mulai : '', periodeSelesai: periode ? periode.selesai : '',
        selesai, selesaiPada: selesai ? now : null, sumber: 'csv', dibuat: now,
      });
      if (!ev) return fail('Data tidak lengkap');
      if (!statusRaw && oldStatus.size) {
        const prevSt = oldStatus.get(dupKey(ev)) || oldStatus.get(simKey(ev));
        if (prevSt) { ev.selesai = prevSt.selesai; ev.selesaiPada = prevSt.selesaiPada; }
      }
      res.ev = ev;

      // Lokasi, tahap, tanggal, dan masa sewa sama tetapi nominal beda: kemungkinan salah ketik.
      // Dua tagihan di tanggal yang sama untuk masa sewa berbeda (bayar di muka) dianggap wajar.
      if (cabang) {
        const dateKey = [kategori, normalizeText(cabang), normalizeText(unit), normalizeText(tahap), ev.tanggal, ev.periodeMulai, ev.periodeSelesai].join('|');
        const prev = seenDate.get(dateKey);
        if (prev && prev.nominal !== ev.nominal) warn(`Jatuh tempo dan masa sewa sama dengan baris No ${prev.rowNo} tetapi nominal berbeda. Cek kemungkinan data ganda atau salah ketik.`);
        else if (!prev) seenDate.set(dateKey, { rowNo, nominal: ev.nominal });
      }

      const key = dupKey(ev);
      const sk = simKey(ev);
      if (exact.has(key)) {
        res.status = 'dup';
        res.notes.unshift('Sudah ada di kalender');
      } else if (seenExact.has(key)) {
        res.status = 'dup';
        res.notes.unshift(`Sama persis dengan baris No ${seenExact.get(key)}`);
      } else if (sk && similar.has(sk)) {
        res.status = 'similar';
        res.notes.unshift(`Tanggal & nominal sama dengan "${similar.get(sk).judul}" yang sudah ada di kalender`);
        seenExact.set(key, rowNo);
      } else if (sk && seenSimilar.has(sk)) {
        const pr = seenSimilar.get(sk);
        res.status = 'similar';
        res.notes.unshift(`Tanggal & nominal sama dengan baris No ${pr.rowNo} (${pr.judul})`);
        seenExact.set(key, rowNo);
      } else {
        seenExact.set(key, rowNo);
        if (sk) seenSimilar.set(sk, { rowNo, judul: ev.judul });
      }
      return res;
    });
  }

  function renderImportModal() {
    const p = state.pendingImport;
    const counts = { new: 0, similar: 0, dup: 0, error: 0 };
    p.results.forEach((r) => { counts[r.status] += 1; });
    const warns = p.results.filter((r) => r.warn && r.status !== 'error').length;
    const toImport = counts.new + (p.includeSimilar ? counts.similar : 0);
    const badge = { new: 'Baru', similar: 'Mirip', dup: 'Duplikat', error: 'Error' };

    els.importFileName.textContent = `${p.name}: ${p.results.length} baris data dibaca.`;
    const known = Object.keys(p.col).filter((k) => k !== 'no').map((k) => COL_LABELS[k]);
    els.importColumns.textContent = `Kolom yang dikenali: ${known.join(', ')}.`
      + (p.extras.length ? ` Kolom lain disimpan sebagai info tambahan: ${p.extras.map((x) => x.label).join(', ')}.` : '');

    els.importKategori.innerHTML = catKeys().map((k) => `<option value="${k}">${escapeHTML(CATEGORIES[k].label)}</option>`).join('');
    els.importKategori.value = p.kategori;
    els.importKategoriHint.textContent = p.hasKategoriCol
      ? 'Dipakai untuk baris yang kolom kategorinya kosong.'
      : 'File tidak punya kolom kategori, jadi semua baris memakai kategori ini.';
    els.importSimilarWrap.hidden = counts.similar === 0;
    els.importSimilar.checked = p.includeSimilar;
    els.importSimilarLabel.textContent = `Impor juga ${counts.similar} baris yang mirip`;
    const pastCount = p.results.filter((r) => r.ev && r.ev.tanggal < todayISO()).length;
    els.importPastWrap.hidden = pastCount === 0;

    els.importModeWrap.hidden = p.replaceable.length === 0 || (SYNC.on && !isAdmin());
    els.importModeWrap.querySelectorAll('input[name="importMode"]').forEach((r) => { r.checked = r.value === p.mode; });
    els.importModeHint.textContent = p.mode === 'replace'
      ? `${p.replaceable.length} event hasil impor CSV sebelumnya akan diganti dengan isi file ini. Event yang dibuat manual tidak tersentuh, dan status lunas dipertahankan untuk jadwal yang sama.`
      : `Sudah ada ${p.replaceable.length} event dari impor CSV sebelumnya. Pilih "Ganti" jika file ini adalah versi terbaru yang sudah diperbaiki.`;
    els.importSamplesWrap.hidden = p.samples.length === 0;
    els.importSamples.checked = p.removeSamples;
    els.importSamplesLabel.textContent = `Hapus ${p.samples.length} event data contoh bawaan`;
    els.importPast.checked = p.pastDone;
    els.importPastLabel.textContent = `Tandai ${pastCount} jatuh tempo sebelum hari ini sebagai lunas/selesai`;

    const stats = [`<span class="stat stat--new">${counts.new} baru</span>`];
    if (counts.similar) stats.push(`<span class="stat stat--similar">${counts.similar} mirip data lain</span>`);
    if (counts.dup) stats.push(`<span class="stat stat--dup">${counts.dup} duplikat dilewati</span>`);
    if (counts.error) stats.push(`<span class="stat stat--error">${counts.error} perlu diperbaiki</span>`);
    if (warns) stats.push(`<span class="stat stat--warn">${warns} perlu dicek</span>`);
    els.importStats.innerHTML = stats.join('');

    els.importBody.innerHTML = p.results.map((r) => {
      const ev = r.ev;
      const cat = ev ? `<span class="cat-dot cat-${ev.kategori}"></span>${escapeHTML(CATEGORIES[ev.kategori].short)}` : '—';
      const judul = escapeHTML(ev ? ev.judul : r.raw.judul) || '—';
      const tanggal = ev ? fmtDateMedium(parseISO(ev.tanggal)) : escapeHTML(r.raw.tanggal || '—');
      let periode = '—';
      if (ev && ev.periodeMulai) periode = `${fmtDateMedium(parseISO(ev.periodeMulai))} – ${fmtDateMedium(parseISO(ev.periodeSelesai))}`;
      else if (ev && ev.mulai) periode = fmtTimeRange(ev);
      let nominal = escapeHTML(r.raw.nominal || '—');
      if (ev) {
        nominal = ev.nominal ? fmtIDR(ev.nominal) : '—';
        const tax = [ev.ppn ? `PPN ${formatThousands(ev.ppn)}` : '', ev.pph ? `PPh ${formatThousands(ev.pph)}` : ''].filter(Boolean).join('<br>');
        if (tax) nominal += `<div class="num-sub">${tax}</div>`;
      }
      const notes = escapeHTML(r.notes.join(' ')) || (ev && ev.selesai ? `<span class="muted">${doneWord(ev)}</span>` : '—');
      return `<tr class="is-${r.status}"><td>${escapeHTML(r.rowNo)}</td>`
        + `<td><span class="row-badge row-badge--${r.status}">${badge[r.status]}</span></td>`
        + `<td class="nowrap">${cat}</td><td>${judul}</td><td class="nowrap">${tanggal}</td><td class="nowrap">${periode}</td>`
        + `<td class="num">${nominal}</td><td class="${r.warn ? 'note-warn' : ''}">${notes}</td></tr>`;
    }).join('');

    const replacing = p.mode === 'replace' && p.replaceable.length;
    els.btnDoImport.disabled = toImport === 0 && !p.replaceIds.size;
    if (replacing) els.btnDoImport.textContent = `Ganti dengan ${toImport} event`;
    else els.btnDoImport.textContent = toImport ? `Impor ${toImport} event` : (p.replaceIds.size ? 'Hapus data contoh' : 'Tidak ada data baru');
  }

  function commitImport() {
    const p = state.pendingImport;
    if (!p) return;
    const allowed = p.includeSimilar ? ['new', 'similar'] : ['new'];
    const removed = state.events.filter((ev) => p.replaceIds.has(ev.id));
    state.events = state.events.filter((ev) => !p.replaceIds.has(ev.id));
    if (p.replaceIds.has(state.selectedId)) state.selectedId = null;
    const keys = new Set(state.events.map(dupKey));
    const add = p.results
      .filter((r) => allowed.includes(r.status))
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

    if (add.length && !add.some((ev) => isInView(parseISO(ev.tanggal)))) {
      const today = todayISO();
      const upcoming = add.map((ev) => ev.tanggal).filter((t) => t >= today).sort()[0];
      state.cursor = parseISO(upcoming || add.map((ev) => ev.tanggal).sort().pop());
      syncMini();
    }
    render();

    const skipped = p.results.length - add.length;
    const ids = new Set(add.map((ev) => ev.id));
    const replacedCount = removed.filter((ev) => ev.sumber === 'csv').length;
    const sampleCount = removed.length - replacedCount;
    const parts = [replacedCount ? `${replacedCount} event lama diganti dengan ${add.length} event baru` : `${add.length} event diimpor`];
    if (skipped) parts.push(`${skipped} baris dilewati`);
    if (sampleCount) parts.push(`${sampleCount} data contoh dihapus`);
    toast(`${parts.join(', ')}.`, {
      action: add.length || removed.length ? 'Urungkan' : null,
      timeout: 8000,
      onAction: () => {
        state.events = state.events.filter((ev) => !ids.has(ev.id));
        state.events.push(...removed);
        saveEvents();
        render();
      },
    });
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  // Pemisah titik koma agar langsung terbaca rapi di Excel berbahasa Indonesia
  function toCSV(rows) { return rows.map((r) => r.map(csvEscape).join(';')).join('\r\n'); }

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

  function dmy(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function exportCSV() {
    if (!state.events.length) { toast('Belum ada data untuk diekspor.'); return; }
    const sorted = [...state.events].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || sortEvents(a, b));
    const extraLabels = [...new Set(sorted.flatMap((ev) => ev.extra.map((x) => x.label)))];
    const rows = sorted.map((ev, i) => [
      i + 1,
      CATEGORIES[ev.kategori].label,
      ev.judul,
      ev.cabang,
      ev.unit,
      ev.tahap,
      dmy(ev.tanggal),
      ev.nominal ?? '',
      ev.ppn ?? '',
      ev.pph ?? '',
      ev.periodeMulai ? `${dmy(ev.periodeMulai)} - ${dmy(ev.periodeSelesai)}` : '',
      ev.mulai ? `${ev.mulai}-${minToTime(timeToMin(ev.mulai) + ev.durasi)}` : '',
      ev.catatan,
      ev.selesai ? doneWord(ev) : 'Belum',
      ...extraLabels.map((l) => (ev.extra.find((x) => x.label === l) || {}).value || ''),
    ]);
    downloadText(`kalender-${todayISO()}.csv`, toCSV([[...EXPORT_HEADER, ...extraLabels], ...rows]));
    toast(`${rows.length} event diekspor ke CSV.`);
  }

  function downloadTemplate() {
    const base = addMonthsClamped(startOfDay(new Date()), 1, 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    const day = (n) => `${pad2(n)}/${pad2(m + 1)}/${y}`;
    const rows = [
      ['No', 'Kategori', 'Judul', 'Cabang', 'Sub_Unit', 'Term_Tahap', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'Masa_Sewa', 'Waktu', 'Catatan'],
      ['1', 'Pembayaran Sewa Kantor', '', 'Kantor Pusat', 'Gedung A', 'Tahap 1', day(5), '120000000', `01/01/${y + 1} - 31/12/${y + 1}`, '', 'PPN: 13200000 | PPh: 0'],
      ['2', 'Pembayaran Sewa Kantor', '', 'Kantor Pusat', '', 'Tahap 2', day(20), '120000000', `01/01/${y + 2} - 31/12/${y + 2}`, '', 'PPN: 13200000 | PPh: 0'],
      ['3', 'Pembayaran Rutin', 'Tagihan Listrik & Air', '', '', '', day(10), 'Rp 4.750.000', '', '', 'Bayar via internet banking'],
      ['4', 'Jadwal Meeting', 'Rapat Evaluasi Budget', '', '', '', day(12), '', '', '10:00-11:30', 'Ruang rapat lantai 2'],
      ['5', 'Task & Report', 'Laporan Keuangan Bulanan', '', '', '', `${day(7)} 16:00`, '', '', '60 menit', 'Kirim ke direksi'],
    ];
    downloadText('template-kalender.csv', toCSV(rows));
    toast('Template diunduh. Semua kolom boleh dihapus atau ditambah, kecuali kolom tanggal.', { timeout: 7000 });
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
      case 'create-day': if (canCreate()) openEventModal({ date }); break;
      case 'create-time': {
        if (!canCreate()) break;
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
      case 'add-category': openCategoryModal(); break;
      case 'edit-category': openCategoryModal(el.dataset.cat); break;
      case 'sync-now': closePopovers(); reloadNow(); break;
      case 'logout': closePopovers(); logout(''); break;
      case 'new-category-from-form': {
        // Simpan isian form, buat kategori, lalu pilih kategori baru itu
        openCategoryModal(null, (key) => { buildCategoryOptionsKeep(key); });
        break;
      }
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
    els.btnClearSample.addEventListener('click', clearSamples);
    els.btnClear.addEventListener('click', clearAll);
    els.btnMigrate.addEventListener('click', migrateLocal);
    els.btnUser.addEventListener('click', toggleUserPopover);
    els.syncStatus.addEventListener('click', toggleUserPopover);
    els.categoryForm.addEventListener('submit', saveCategory);
    els.cDelete.addEventListener('click', deleteCategory);

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
    els.eventForm.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.classList || !t.classList.contains('money-input')) return;
      const digits = t.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      t.value = digits ? formatThousands(Number(digits)) : '';
    });
    els.fKategori.addEventListener('change', () => { setRadio(getRadio()); updateStatusLabel(); });
    els.fUlangi.addEventListener('change', updateRepeatRow);
    els.fJudul.addEventListener('input', () => { els.formError.textContent = ''; });

    // Impor
    els.btnDoImport.addEventListener('click', commitImport);
    els.importKategori.addEventListener('change', () => {
      if (!state.pendingImport) return;
      state.pendingImport.kategori = els.importKategori.value;
      buildImportResults();
      renderImportModal();
    });
    els.importModeWrap.addEventListener('change', (e) => {
      if (!state.pendingImport || e.target.name !== 'importMode') return;
      state.pendingImport.mode = e.target.value;
      buildImportResults();
      renderImportModal();
    });
    els.importSamples.addEventListener('change', () => {
      if (!state.pendingImport) return;
      state.pendingImport.removeSamples = els.importSamples.checked;
      buildImportResults();
      renderImportModal();
    });
    els.importPast.addEventListener('change', () => {
      if (!state.pendingImport) return;
      state.pendingImport.pastDone = els.importPast.checked;
      buildImportResults();
      renderImportModal();
    });
    els.importSimilar.addEventListener('change', () => {
      if (!state.pendingImport) return;
      state.pendingImport.includeSimilar = els.importSimilar.checked;
      renderImportModal();
    });
    els.importModal.addEventListener('close', () => { state.pendingImport = null; });

    // Tutup dialog saat klik di luar kartu
    [els.eventModal, els.importModal, els.confirmModal, els.categoryModal].forEach((dlg) => {
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
      if (t.matches('[data-filter]')) {
        if (t.checked) delete state.filters[t.dataset.filter]; else state.filters[t.dataset.filter] = false;
        render();
      }
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
        case 'c': e.preventDefault(); if (canCreate()) openEventModal(); break;
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
     13. SINKRON GOOGLE SHEET (aktif bila config.js diisi)
     ----------------------------------------------------------- */
  const SYNC_CFG = window.CALENDAR_CONFIG || {};
  const SESSION_KEY = 'calendar.sync.session.v1';
  const CACHE_KEY = 'calendar.sync.cache.v1';
  const MIGRATED_KEY = 'calendar.sync.migrated.v1';
  const SYNC = {
    on: Boolean(String(SYNC_CFG.appsScriptUrl || '').trim() && String(SYNC_CFG.googleClientId || '').trim()),
    url: String(SYNC_CFG.appsScriptUrl || '').trim(),
    clientId: String(SYNC_CFG.googleClientId || '').trim(),
    session: null,
    me: null,
    hash: null,
    tabs: {},
    map: new Map(),
    settings: {},
    users: {},
    history: [],
    invalid: [],
    chain: Promise.resolve(),
    busy: false,
    dirty: false,
    polling: false,
    timer: null,
    lastSync: null,
    status: 'idle',
    notesSent: '',
    gisReady: false,
  };
  let migratable = [];

  // Kolom default untuk tab baru (sama dengan Apps Script)
  const SYS_COLS = ['ID', 'Dibuat_Oleh', 'Dibuat_Pada', 'Diubah_Oleh', 'Diubah_Pada', 'Dihapus'];
  const TEMPLATE_HEADERS = {
    sewa: ['No', 'Cabang', 'Sub_Unit', 'Term_Tahap', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'Durasi_Sewa', 'Catatan', 'Lunas', ...SYS_COLS],
    pembayaran: ['Nama_Kegiatan', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'PPN', 'PPh', 'Catatan', 'Lunas', ...SYS_COLS],
    agenda: ['Nama_Kegiatan', 'Tanggal', 'Jam_Mulai', 'Jam_Selesai', 'Catatan', 'Selesai', ...SYS_COLS],
  };
  // Nama kolom yang dikenali di Google Sheet (huruf kecil, spasi menjadi _)
  const SHEET_FIELDS = {
    no: ['no', 'nomor', 'no_urut'],
    judul: ['nama_kegiatan', 'judul', 'nama', 'kegiatan', 'nama_event', 'event', 'title', 'uraian'],
    tanggal: ['tanggal_jatuh_tempo', 'jatuh_tempo', 'tgl_jatuh_tempo', 'tanggal_bayar', 'tanggal', 'tgl', 'due_date', 'date'],
    jamMulai: ['jam_mulai', 'mulai', 'jam', 'waktu', 'waktu_mulai'],
    jamSelesai: ['jam_selesai', 'waktu_selesai'],
    durasi: ['durasi', 'durasi_menit', 'duration'],
    nominal: HEADER_ALIASES.nominal,
    ppn: HEADER_ALIASES.ppn,
    pph: HEADER_ALIASES.pph,
    cabang: HEADER_ALIASES.cabang,
    unit: HEADER_ALIASES.unit,
    tahap: HEADER_ALIASES.tahap,
    periode: HEADER_ALIASES.periode,
    catatan: HEADER_ALIASES.catatan,
    status: ['lunas', 'selesai', 'status', 'status_bayar'],
  };
  const SHEET_SYS = {
    id: 'id', dibuatOleh: 'dibuat_oleh', dibuatPada: 'dibuat_pada', diubahOleh: 'diubah_oleh', diubahPada: 'diubah_pada',
    dihapus: 'dihapus', selesaiOleh: 'selesai_oleh', selesaiPada: 'selesai_pada', seriesId: 'seri_id', sumber: 'sumber',
    catatanSistem: 'catatan_sistem',
  };
  const SEM_FIELDS = ['kategori', 'judul', 'tanggal', 'mulai', 'durasi', 'nominal', 'ppn', 'pph', 'catatan', 'cabang', 'unit',
    'tahap', 'periodeMulai', 'periodeSelesai', 'selesai', 'extra', 'seriesId', 'sumber'];
  const STAMP_FIELDS = ['dibuatOleh', 'dibuatPada', 'diubahOleh', 'diubahPada', 'selesaiOleh', 'selesaiPada'];
  const AKSI_LABEL = {
    tambah: 'menambahkan', ubah: 'mengubah', hapus: 'menghapus', pulihkan: 'memulihkan', centang: 'menandai lunas/selesai',
    batal_centang: 'membatalkan status', pindah: 'memindahkan', kategori_baru: 'membuat kategori',
    kategori_ubah: 'mengubah kategori', kategori_sembunyi: 'menyembunyikan kategori',
  };

  /* ---------- Hak akses ---------- */
  function role() { return SYNC.on ? ((SYNC.me && SYNC.me.role) || 'Pembaca') : 'Admin'; }
  function isAdmin() { return role() === 'Admin'; }
  function canCreate() { return role() !== 'Pembaca'; }
  function currentEmail() { return SYNC.on && SYNC.me ? SYNC.me.email : ''; }
  function canEdit(ev) {
    if (!SYNC.on) return true;
    const r = role();
    if (r === 'Admin') return true;
    if (r !== 'Kontributor' || !ev) return false;
    return Boolean(ev.dibuatOleh) && ev.dibuatOleh === currentEmail();
  }
  function canToggle(ev) {
    if (canEdit(ev)) return true;
    return SYNC.on && role() === 'Kontributor' && SYNC.settings.kontributor_boleh_centang !== false;
  }

  /* ---------- Utilitas tampilan ---------- */
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (err) { /* abaikan */ } }
  function cloneEv(ev) { return JSON.parse(JSON.stringify(ev)); }
  function serializeEv(ev) { return JSON.stringify(SEM_FIELDS.map((f) => (ev[f] === undefined ? null : ev[f]))); }
  function userLabel(email) {
    if (!email) return '';
    if (SYNC.users[email]) return SYNC.users[email];
    if (SYNC.me && SYNC.me.email === email && SYNC.me.name) return SYNC.me.name;
    return email;
  }
  function initials(name) {
    const parts = String(name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }
  function parseStamp(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    if (/T.*(Z|[+-]\d{2}:\d{2})$/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)) : null;
  }
  function fmtStamp(text) {
    const d = parseStamp(text);
    return d ? `${fmtDateMedium(d)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
  }
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ---------- Kategori = tab di Google Sheet ---------- */
  function keyForTab(name) {
    const n = normalizeText(name);
    const builtin = Object.keys(BUILTIN_CATEGORIES).find((k) => normalizeText(BUILTIN_CATEGORIES[k].label) === n);
    return builtin || `c${hashStr(n)}`;
  }
  function tabNameFor(key) { return (CATEGORIES[key] && (CATEGORIES[key].tab || CATEGORIES[key].label)) || key; }
  function templateFor(key) {
    if (key === 'sewa') return 'sewa';
    return CATEGORIES[key] && CATEGORIES[key].payment ? 'pembayaran' : 'agenda';
  }

  function applyCategories(cats, tabs) {
    catKeys().forEach((k) => { if (!BUILTIN_CATEGORIES[k]) delete CATEGORIES[k]; });
    Object.keys(BUILTIN_CATEGORIES).forEach((k) => { CATEGORIES[k] = { ...BUILTIN_CATEGORIES[k], tab: BUILTIN_CATEGORIES[k].label }; });
    tabs.forEach((t) => {
      const key = keyForTab(t.name);
      const row = cats.find((c) => normalizeText(c.tab) === normalizeText(t.name));
      if (BUILTIN_CATEGORIES[key]) { CATEGORIES[key].tab = t.name; return; }
      if (row && row.tampilkan === false) return;
      const payment = row && row.jenis ? row.jenis === 'pembayaran' : mapHeaders(t.headers).fields.nominal !== undefined;
      const color = row && PALETTE[row.warna] ? row.warna : 'slate';
      CATEGORIES[key] = { label: t.name, short: t.name, payment, color, custom: true, tab: t.name };
    });
    renderCategoryStyles();
  }

  function mapHeaders(headers) {
    const normed = headers.map(normHeader);
    const used = new Set();
    const fields = {};
    const sys = {};
    Object.entries(SHEET_SYS).forEach(([k, n]) => {
      const i = normed.indexOf(n);
      if (i !== -1) { sys[k] = i; used.add(i); }
    });
    Object.entries(SHEET_FIELDS).forEach(([k, aliases]) => {
      for (const a of aliases) {
        const i = normed.findIndex((h, idx) => h === a && !used.has(idx));
        if (i !== -1) { fields[k] = i; used.add(i); break; }
      }
    });
    const extras = [];
    headers.forEach((h, i) => { if (!used.has(i) && String(h).trim()) extras.push({ idx: i, label: prettyHeader(h) }); });
    return { fields, sys, extras };
  }

  function cleanTime(v) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/);
    return m ? `${pad2(Number(m[1]))}:${m[2]}` : s;
  }

  // Satu baris Sheet -> event kalender (+ daftar masalah isian)
  function rowToEvent(tabName, key, headers, row, mapped) {
    const m = mapped || mapHeaders(headers);
    const cells = row.cells || [];
    const get = (f) => (m.fields[f] === undefined ? '' : String(cells[m.fields[f]] ?? '').trim());
    const sys = (f) => (m.sys[f] === undefined ? '' : String(cells[m.sys[f]] ?? '').trim());
    const res = { ev: null, problems: [], fatal: false, id: sys('id'), note: sys('catatanSistem'), deleted: /^(true|ya|yes|1)$/i.test(sys('dihapus')) };
    if (!res.id) { res.fatal = true; return res; }

    const cabang = get('cabang');
    const unit = get('unit');
    const tahap = get('tahap');
    const tRaw = get('tanggal');
    const dt = parseDateTime(tRaw);
    if (!tRaw) { res.problems.push('Tanggal kosong'); res.fatal = true; } else if (!dt) { res.problems.push(`Tanggal "${tRaw}" tidak terbaca`); res.fatal = true; }
    let judul = get('judul') || buildTitle({ kategori: key, cabang, unit, tahap });
    if (!judul) {
      if (key === 'sewa' || m.fields.cabang !== undefined) judul = `${CATEGORIES[key].short} – baris ${row.n}`;
      else { res.problems.push('Nama kegiatan kosong'); res.fatal = true; }
    }
    if (res.fatal) return res;

    let mulai = '';
    let durasi = 0;
    const jm = cleanTime(get('jamMulai'));
    const js = cleanTime(get('jamSelesai'));
    const du = get('durasi');
    if (jm) {
      const r = parseDuration(jm);
      if (r && r.mulai) { mulai = r.mulai; durasi = r.durasi; } else if (!r) res.problems.push(`Jam "${jm}" tidak terbaca, ditampilkan sepanjang hari`);
    } else if (dt.time) {
      mulai = dt.time; durasi = 60;
    }
    if (mulai && js) {
      const e = parseDuration(js);
      if (e && e.mulai) {
        const d = timeToMin(e.mulai) - timeToMin(mulai);
        if (d > 0) durasi = d; else res.problems.push('Jam selesai lebih awal dari jam mulai');
      } else res.problems.push(`Jam selesai "${js}" tidak terbaca`);
    } else if (mulai && du && !/[-–]/.test(jm)) {
      const d = parseDuration(du, mulai);
      if (d && d.durasi) durasi = d.durasi; else res.problems.push(`Durasi "${du}" tidak terbaca`);
    }

    const amount = (f, label) => {
      const raw = get(f);
      const v = parseAmount(raw);
      if (Number.isNaN(v)) { res.problems.push(`${label} "${raw}" tidak terbaca`); return null; }
      return v;
    };
    const nominal = amount('nominal', 'Nominal');
    const tx = extractTaxes(get('catatan'));
    let { ppn, pph } = tx;
    if (m.fields.ppn !== undefined && get('ppn')) { const v = amount('ppn', 'PPN'); if (v !== null) ppn = v; }
    if (m.fields.pph !== undefined && get('pph')) { const v = amount('pph', 'PPh'); if (v !== null) pph = v; }
    const pRaw = get('periode');
    let periode = parsePeriod(pRaw);
    if (periode === false) { res.problems.push(`Masa sewa "${pRaw}" tidak terbaca`); periode = null; }
    const extra = m.extras.map((x) => ({ label: x.label, value: String(cells[x.idx] ?? '').trim() })).filter((x) => x.value);
    const selesai = parseStatus(get('status'));

    res.ev = normalizeEvent({
      id: res.id, kategori: key, judul, tanggal: dt.date, mulai, durasi, nominal, ppn, pph, catatan: tx.rest, cabang, unit, tahap,
      periodeMulai: periode ? periode.mulai : '', periodeSelesai: periode ? periode.selesai : '', extra, selesai,
      selesaiPada: selesai ? (sys('selesaiPada') || null) : null, selesaiOleh: sys('selesaiOleh'),
      dibuatOleh: sys('dibuatOleh'), dibuatPada: sys('dibuatPada'), diubahOleh: sys('diubahOleh'), diubahPada: sys('diubahPada'),
      seriesId: sys('seriesId') || null, sumber: sys('sumber') || 'manual', dibuat: sys('dibuatPada') || '',
    });
    if (!res.ev) res.fatal = true;
    return res;
  }

  // Event -> sel yang perlu ditulis (hanya kolom yang berubah bila "prev" ada)
  function cellsFor(ev, prev, tab, template) {
    const headers = (SYNC.tabs[tab] && SYNC.tabs[tab].headers) || TEMPLATE_HEADERS[template];
    const m = mapHeaders(headers);
    const H = (f) => (m.fields[f] === undefined ? null : headers[m.fields[f]]);
    const changed = (keys) => !prev || keys.some((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(ev[k] ?? null));
    const out = {};
    const put = (header, fallback, value) => {
      const h = header || fallback;
      const empty = value === '' || value === null || value === undefined;
      if (!header && empty) return;     // jangan membuat kolom baru hanya untuk nilai kosong
      out[h] = empty ? '' : value;
    };

    if (changed(['judul', 'cabang', 'unit', 'tahap'])) {
      const auto = buildTitle(ev) || `${CATEGORIES[ev.kategori].short} – baris`;
      const isAuto = ev.judul === auto || ev.judul.startsWith(`${CATEGORIES[ev.kategori].short} – baris `);
      if (H('judul')) put(H('judul'), 'Nama_Kegiatan', isAuto && template === 'sewa' ? '' : ev.judul);
      else if (!isAuto || (template !== 'sewa' && m.fields.cabang === undefined)) put(null, 'Nama_Kegiatan', ev.judul);
      if (changed(['cabang'])) put(H('cabang'), 'Cabang', ev.cabang);
      if (changed(['unit'])) put(H('unit'), 'Sub_Unit', ev.unit);
      if (changed(['tahap'])) put(H('tahap'), 'Term_Tahap', ev.tahap);
    }
    if (changed(['tanggal'])) put(H('tanggal'), template === 'agenda' ? 'Tanggal' : 'Tanggal_Jatuh_Tempo', { d: ev.tanggal });
    if (changed(['mulai', 'durasi'])) {
      const end = ev.mulai ? minToTime(Math.min(timeToMin(ev.mulai) + ev.durasi, 1439)) : '';
      const hm = H('jamMulai');
      const hs = H('jamSelesai');
      const hd = H('durasi');
      if (hm && hs) { put(hm, '', ev.mulai); put(hs, '', end); if (hd) put(hd, '', ''); }
      else if (hm && hd) { put(hm, '', ev.mulai); put(hd, '', ev.mulai ? ev.durasi : ''); }
      else if (hm) put(hm, '', ev.mulai ? (ev.durasi === 60 ? ev.mulai : `${ev.mulai}-${end}`) : '');
      else if (ev.mulai) { put(null, 'Jam_Mulai', ev.mulai); put(hs, 'Jam_Selesai', end); }
    }
    if (changed(['nominal'])) put(H('nominal'), 'Nominal_IDR', ev.nominal);
    const taxCols = H('ppn') || H('pph');
    if (taxCols || template !== 'sewa') {
      if (changed(['ppn'])) put(H('ppn'), 'PPN', ev.ppn);
      if (changed(['pph'])) put(H('pph'), 'PPh', ev.pph);
      if (changed(['catatan'])) put(H('catatan'), 'Catatan', ev.catatan);
    } else if (changed(['catatan', 'ppn', 'pph'])) {
      // Tab sewa tanpa kolom PPN/PPh: pajak ditulis di Catatan, sama seperti format file sewa
      const text = [ev.catatan, ev.ppn != null ? `PPN: ${ev.ppn}` : '', ev.pph != null ? `PPh: ${ev.pph}` : ''].filter(Boolean).join(' | ');
      put(H('catatan'), 'Catatan', text);
    }
    if (changed(['periodeMulai', 'periodeSelesai'])) {
      const text = ev.periodeMulai && ev.periodeSelesai ? `${dmy(ev.periodeMulai)} - ${dmy(ev.periodeSelesai)}` : '';
      put(H('periode'), template === 'sewa' ? 'Durasi_Sewa' : 'Masa_Sewa', text);
    }
    if (changed(['selesai'])) put(H('status'), CATEGORIES[ev.kategori].payment ? 'Lunas' : 'Selesai', { b: Boolean(ev.selesai) });
    if (changed(['extra'])) {
      const labels = new Set([...(prev ? prev.extra : []), ...ev.extra].map((x) => x.label));
      labels.forEach((label) => {
        const now = ev.extra.find((x) => x.label === label);
        const before = prev ? prev.extra.find((x) => x.label === label) : null;
        if (prev && JSON.stringify(now || null) === JSON.stringify(before || null)) return;
        const header = headers.find((h) => prettyHeader(h) === label) || null;
        put(header, label, now ? now.value : '');
      });
    }
    if (changed(['seriesId']) && ev.seriesId) out.Seri_ID = ev.seriesId;
    if (changed(['sumber']) && ev.sumber && ev.sumber !== 'manual') out.Sumber = ev.sumber;
    return out;
  }

  /* ---------- Komunikasi dengan Apps Script ---------- */
  async function api(action, payload) {
    const body = JSON.stringify({ action, session: SYNC.session, ...(payload || {}) });
    let res;
    try {
      res = await fetch(SYNC.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    } catch (err) {
      const e = new Error('Tidak tersambung ke Google Sheet. Periksa koneksi internet.');
      e.code = 'network';
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (err) { data = null; }
    if (!data) {
      const e = new Error('Respons Apps Script tidak valid. Pastikan URL Web App benar dan aksesnya "Anyone".');
      e.code = 'server';
      throw e;
    }
    if (!data.ok) {
      const e = new Error(data.error || 'Permintaan ke Google Sheet gagal.');
      e.code = data.code || 'server';
      throw e;
    }
    return data;
  }

  function handleApiError(err, where) {
    if (err.code === 'auth' || (err.code === 'forbidden' && where === 'load')) { logout(err.message); return; }
    if (err.code === 'network') {
      setSyncStatus('offline');
      if (where === 'save') toast('Tidak tersambung ke Google Sheet, perubahan dibatalkan. Coba lagi saat koneksi kembali.', { timeout: 8000 });
      return;
    }
    if (err.code === 'conflict') {
      setSyncStatus('ok');
      toast(err.message, { timeout: 8000 });
      reloadNow();
      return;
    }
    setSyncStatus(err.code === 'busy' || err.code === 'forbidden' ? 'ok' : 'error');
    toast(err.message, { timeout: 8000 });
  }

  function setSyncStatus(status) {
    SYNC.status = status;
    if (!els.app) return;
    els.app.dataset.sync = status;
    const t = SYNC.lastSync ? `${pad2(SYNC.lastSync.getHours())}:${pad2(SYNC.lastSync.getMinutes())}` : '';
    const text = {
      idle: 'Belum tersambung', loading: 'Memuat…', saving: 'Menyimpan…', ok: t ? `Tersinkron ${t}` : 'Tersinkron',
      offline: 'Offline', error: 'Gagal sinkron',
    }[status] || '';
    els.syncText.textContent = text;
    const last = SYNC.history[0];
    els.syncStatus.title = last ? `Perubahan terakhir: ${userLabel(last.email)} ${AKSI_LABEL[last.aksi] || last.aksi} ${last.judul || ''} (${fmtStamp(last.waktu)})` : text;
  }

  /* ---------- Menyimpan perubahan ---------- */
  function queuePush() {
    SYNC.dirty = true;
    setSyncStatus('saving');
    SYNC.chain = SYNC.chain.then(pushChanges).catch((err) => { console.error(err); });
  }

  function computeOps() {
    const ops = [];
    const snaps = new Map();
    const seen = new Set();
    state.events.forEach((ev) => {
      seen.add(ev.id);
      const prev = SYNC.map.get(ev.id);
      const tab = tabNameFor(ev.kategori);
      const template = templateFor(ev.kategori);
      if (prev && prev.tab === tab && serializeEv(prev.ev) === serializeEv(ev)) return;
      const full = !prev || prev.tab !== tab;
      const cells = cellsFor(ev, full ? null : prev.ev, tab, template);
      if (!full && !Object.keys(cells).length) { prev.ev = { ...prev.ev, ...cloneEv(ev) }; return; }
      ops.push({ type: 'upsert', id: ev.id, tab, template, label: ev.judul, cells, expected: prev ? prev.rev : null });
      snaps.set(ev.id, cloneEv(ev));
    });
    SYNC.map.forEach((prev, id) => {
      if (!seen.has(id)) ops.push({ type: 'delete', id, tab: prev.tab, label: prev.ev.judul, expected: prev.rev });
    });
    return { ops, snaps };
  }

  async function pushChanges() {
    if (!SYNC.session) { SYNC.dirty = false; return; }
    const { ops, snaps } = computeOps();
    if (!ops.length) { SYNC.dirty = false; setSyncStatus('ok'); return; }
    SYNC.busy = true;
    setSyncStatus('saving');
    try {
      const res = await api('save', { ops });
      applySaveResult(res, snaps);
      ops.filter((o) => o.type === 'delete').forEach((o) => SYNC.map.delete(o.id));
      SYNC.dirty = computeOps().ops.length > 0;
      SYNC.lastSync = new Date();
      setSyncStatus(SYNC.dirty ? 'saving' : 'ok');
      renderDetail();
      renderReminders();
      if (role() === 'Kontributor') render();
      schedulePoll(1500);
    } catch (err) {
      revertToSynced();
      render();
      handleApiError(err, 'save');
    } finally {
      SYNC.busy = false;
    }
  }

  function applySaveResult(res, snaps) {
    Object.entries(res.tabs || {}).forEach(([name, headers]) => { SYNC.tabs[name] = { headers }; });
    (res.rows || []).forEach((row) => {
      const headers = (SYNC.tabs[row.tab] || {}).headers || [];
      const r = rowToEvent(row.tab, keyForTab(row.tab), headers, row);
      const base = snaps.get(row.id) || (r.ev ? cloneEv(r.ev) : null);
      if (!base) return;
      if (r.ev) STAMP_FIELDS.forEach((f) => { base[f] = r.ev[f]; });
      SYNC.map.set(row.id, { ev: base, tab: row.tab, rev: row.rev, n: row.n });
      const cur = getEvent(row.id);
      if (cur && r.ev) STAMP_FIELDS.forEach((f) => { cur[f] = r.ev[f]; });
    });
    (res.deleted || []).forEach((id) => SYNC.map.delete(id));
  }

  function revertToSynced() {
    const old = new Map(state.events.map((e) => [e.id, e]));
    state.events = [...SYNC.map.values()].map((x) => {
      const ev = cloneEv(x.ev);
      const cur = old.get(ev.id);
      return cur ? Object.assign(cur, ev) : ev;
    });
    SYNC.dirty = false;
  }

  /* ---------- Membaca data ---------- */
  function applyServerData(data, fromCache) {
    if (!fromCache && (SYNC.busy || SYNC.dirty)) { SYNC.hash = null; return false; }
    if (data.me) SYNC.me = { ...(SYNC.me || {}), ...data.me };
    SYNC.hash = data.hash || null;
    SYNC.settings = data.settings || {};
    SYNC.users = {};
    (data.users || []).forEach((u) => { if (u.name) SYNC.users[u.email] = u.name; });
    SYNC.history = data.history || [];
    REMINDER_DAYS = clamp(Number(SYNC.settings.hari_pengingat) || 30, 1, 365);
    applyCategories(data.categories || [], data.tabs || []);

    SYNC.tabs = {};
    const old = new Map(state.events.map((e) => [e.id, e]));
    const list = [];
    const notesList = [];
    SYNC.map = new Map();
    SYNC.invalid = [];
    (data.tabs || []).forEach((t) => {
      SYNC.tabs[t.name] = { headers: t.headers };
      const key = keyForTab(t.name);
      if (!hasCat(key)) return;
      const m = mapHeaders(t.headers);
      t.rows.forEach((row) => {
        const r = rowToEvent(t.name, key, t.headers, row, m);
        if (r.deleted) return;
        const note = r.problems.join('; ');
        if (r.id && note !== r.note) notesList.push({ tab: t.name, id: r.id, note });
        if (r.fatal || !r.ev) { SYNC.invalid.push({ tab: t.name, n: row.n, note: note || 'ID kosong' }); return; }
        const prev = old.get(r.ev.id);
        const ev = prev ? Object.assign(prev, r.ev) : r.ev;
        list.push(ev);
        SYNC.map.set(ev.id, { ev: cloneEv(ev), tab: t.name, rev: row.rev, n: row.n });
      });
    });
    state.events = list;
    if (state.selectedId && !getEvent(state.selectedId)) state.selectedId = null;
    if (!fromCache) {
      storageSet(CACHE_KEY, JSON.stringify({ url: SYNC.url, data }));
      if (isAdmin() && notesList.length) sendNotes(notesList);
    }
    applyRoleUI();
    render();
    return true;
  }

  function sendNotes(list) {
    const key = JSON.stringify(list);
    if (key === SYNC.notesSent) return;
    SYNC.notesSent = key;
    api('notes', { notes: list.slice(0, 300) }).catch(() => { SYNC.notesSent = ''; });
  }

  function pollInterval() { return clamp(Number(SYNC.settings.interval_sinkron_detik) || 20, 10, 300) * 1000; }

  function schedulePoll(ms) {
    clearTimeout(SYNC.timer);
    if (SYNC.session) SYNC.timer = setTimeout(() => { pollNow(false); }, ms);
  }

  async function pollNow(force) {
    clearTimeout(SYNC.timer);
    if (!SYNC.session) return;
    if (SYNC.polling || (!force && (document.hidden || SYNC.busy || SYNC.dirty))) { schedulePoll(pollInterval()); return; }
    SYNC.polling = true;
    if (force) setSyncStatus('loading');
    try {
      const data = await api('load', { hash: force ? null : SYNC.hash });
      if (data.unchanged) {
        if (data.me) { SYNC.me = { ...(SYNC.me || {}), ...data.me }; applyRoleUI(); }
      } else {
        applyServerData(data);
      }
      SYNC.lastSync = new Date();
      setSyncStatus('ok');
    } catch (err) {
      handleApiError(err, 'load');
    } finally {
      SYNC.polling = false;
      schedulePoll(pollInterval());
    }
  }

  async function reloadNow() {
    for (let i = 0; i < 50 && (SYNC.polling || SYNC.busy); i += 1) await new Promise((r) => setTimeout(r, 200));
    await pollNow(true);
  }

  /* ---------- Login ---------- */
  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.id) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google Sign-In gagal dimuat'));
      document.head.appendChild(s);
    });
  }

  async function showLogin(message) {
    els.loginScreen.hidden = false;
    els.loginError.textContent = message || '';
    els.loginStatus.textContent = '';
    try {
      await loadGis();
      if (!SYNC.gisReady) {
        window.google.accounts.id.initialize({ client_id: SYNC.clientId, callback: onGoogleCredential, auto_select: false, cancel_on_tap_outside: true });
        SYNC.gisReady = true;
      }
      els.loginButton.innerHTML = '';
      window.google.accounts.id.renderButton(els.loginButton, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'id', width: 280 });
    } catch (err) {
      els.loginError.textContent = 'Tombol login Google gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.';
    }
  }

  async function onGoogleCredential(resp) {
    els.loginError.textContent = '';
    els.loginStatus.textContent = 'Memeriksa akses…';
    try {
      const r = await api('login', { idToken: resp && resp.credential });
      SYNC.session = r.session;
      SYNC.me = r.me;
      storageSet(SESSION_KEY, JSON.stringify({ url: SYNC.url, session: r.session, me: r.me }));
      els.loginScreen.hidden = true;
      els.loginStatus.textContent = '';
      applyRoleUI();
      await firstLoad();
    } catch (err) {
      els.loginStatus.textContent = '';
      els.loginError.textContent = err.message;
    }
  }

  function logout(message) {
    if (SYNC.session) api('logout', {}).catch(() => {});
    clearTimeout(SYNC.timer);
    SYNC.session = null;
    SYNC.me = null;
    SYNC.hash = null;
    SYNC.map = new Map();
    SYNC.history = [];
    SYNC.invalid = [];
    storageRemove(SESSION_KEY);
    storageRemove(CACHE_KEY);
    state.events = [];
    state.selectedId = null;
    if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect();
    setSyncStatus('idle');
    applyRoleUI();
    render();
    showLogin(message || '');
  }

  async function firstLoad() {
    setSyncStatus('loading');
    try {
      const data = await api('load', {});
      SYNC.hash = null;
      applyServerData(data);
      SYNC.lastSync = new Date();
      setSyncStatus('ok');
      startupReminderToast();
    } catch (err) {
      handleApiError(err, 'load');
    } finally {
      schedulePoll(pollInterval());
    }
  }

  function syncInit() {
    migratable = computeMigratable();
    let saved = null;
    try { saved = JSON.parse(storageGet(SESSION_KEY) || 'null'); } catch (err) { saved = null; }
    if (saved && saved.session && saved.url === SYNC.url) {
      SYNC.session = saved.session;
      SYNC.me = saved.me || null;
      let cache = null;
      try { cache = JSON.parse(storageGet(CACHE_KEY) || 'null'); } catch (err) { cache = null; }
      if (cache && cache.url === SYNC.url && cache.data) applyServerData(cache.data, true);
      applyRoleUI();
      firstLoad();
    } else {
      setSyncStatus('idle');
      showLogin('');
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && SYNC.session) pollNow(false); });
    window.addEventListener('online', () => { if (SYNC.session) pollNow(true); });
  }

  /* ---------- Tampilan khusus mode sinkron ---------- */
  function applyRoleUI() {
    if (!els.app) return;
    const sync = SYNC.on;
    const logged = Boolean(SYNC.session);
    els.app.classList.toggle('is-sync', sync);
    els.btnCreate.hidden = !canCreate();
    els.btnUpload.hidden = !canCreate();
    els.btnAddCategory.hidden = !canCreate();
    els.btnSample.hidden = sync;
    els.btnClearSample.hidden = sync;
    els.btnClear.hidden = sync;
    els.btnMigrate.hidden = !(sync && logged && canCreate() && migratable.length > 0);
    if (!els.btnMigrate.hidden) els.btnMigrate.textContent = `Kirim ${migratable.length} jadwal dari browser ini ke Sheet`;
    els.syncStatus.hidden = !(sync && logged);
    els.btnUser.hidden = !(sync && logged);
    els.tabActivity.hidden = !sync;
    if (SYNC.me) els.userInitial.textContent = initials(SYNC.me.name || SYNC.me.email);
  }

  function renderActivity() {
    if (!SYNC.on || !els.panelActivity) return;
    let html = '';
    if (isAdmin() && SYNC.invalid.length) {
      html += '<div class="sync-warn">'
        + `<strong>${SYNC.invalid.length} baris di Google Sheet belum tampil</strong>`
        + '<span>Perbaiki isiannya; keterangan juga tertulis di kolom Catatan_Sistem.</span>'
        + `<ul>${SYNC.invalid.slice(0, 8).map((x) => `<li>${escapeHTML(x.tab)}, baris ${x.n}: ${escapeHTML(x.note)}</li>`).join('')}</ul></div>`;
    }
    if (!SYNC.history.length) {
      html += '<div class="empty"><p>Belum ada aktivitas.</p></div>';
    } else {
      html += `<ul class="act-list">${SYNC.history.map((h) => {
        const who = escapeHTML(userLabel(h.email) || 'Sistem');
        const what = escapeHTML(AKSI_LABEL[h.aksi] || h.aksi);
        const target = escapeHTML(h.judul || h.tab || '');
        const meta = [fmtStamp(h.waktu), h.tab && h.judul !== h.tab ? escapeHTML(h.tab) : ''].filter(Boolean).join(', ');
        const inner = `<span class="act__text"><strong>${who}</strong> ${what} <strong>${target}</strong></span>`
          + (h.perubahan ? `<span class="act__detail">${escapeHTML(h.perubahan)}</span>` : '')
          + `<span class="act__time">${meta}</span>`;
        return h.id && getEvent(h.id)
          ? `<li class="act"><button type="button" class="act__body" data-action="reveal" data-id="${escapeHTML(h.id)}">${inner}</button></li>`
          : `<li class="act"><div class="act__body">${inner}</div></li>`;
      }).join('')}</ul>`;
    }
    els.panelActivity.innerHTML = html;
  }

  function toggleUserPopover() {
    if (!els.userPopover.hidden) { closePopovers(); return; }
    const me = SYNC.me || {};
    const t = SYNC.lastSync ? `${pad2(SYNC.lastSync.getHours())}:${pad2(SYNC.lastSync.getMinutes())}` : '-';
    els.userPopover.innerHTML = '<div class="up__head">'
      + `<span class="up__avatar">${escapeHTML(initials(me.name || me.email))}</span>`
      + `<div class="up__who"><strong>${escapeHTML(me.name || me.email || '')}</strong><span>${escapeHTML(me.email || '')}</span></div></div>`
      + `<p class="up__row">Peran: <strong>${escapeHTML(me.role || '-')}</strong></p>`
      + `<p class="up__row">Sinkron terakhir: <strong>${t}</strong></p>`
      + '<div class="up__actions">'
      + '<button type="button" class="btn btn--tonal btn--block" data-action="sync-now">Muat ulang data</button>'
      + (me.sheetUrl ? `<a class="btn btn--outline btn--block" href="${escapeHTML(me.sheetUrl)}" target="_blank" rel="noopener">Buka Google Sheet</a>` : '')
      + '<button type="button" class="btn btn--text btn--block" data-action="logout">Keluar</button></div>';
    showPopover(els.userPopover, els.btnUser.hidden ? els.syncStatus : els.btnUser);
  }

  /* ---------- Kategori dari kalender ---------- */
  async function saveCategorySync(label, color, payment) {
    if (/[[\]*?/\\:]/.test(label) || label.startsWith('_')) {
      els.cError.textContent = 'Nama kategori tidak boleh diawali _ atau berisi : \\ / ? * [ ]';
      return;
    }
    const editing = editingCategory;
    const payload = editing
      ? { op: 'update', tab: tabNameFor(editing), name: label, jenis: payment ? 'pembayaran' : 'agenda', warna: color }
      : { op: 'create', name: label, jenis: payment ? 'pembayaran' : 'agenda', warna: color };
    els.cSave.disabled = true;
    els.cError.textContent = '';
    try {
      await api('category', payload);
    } catch (err) {
      els.cError.textContent = err.message;
      if (err.code === 'auth') logout(err.message);
      return;
    } finally {
      els.cSave.disabled = false;
    }
    els.categoryModal.close();
    const cb = categoryCallback;
    categoryCallback = null;
    await reloadNow();
    const key = keyForTab(label);
    if (editing && editing !== key && state.filters[editing] === false) { state.filters[key] = false; delete state.filters[editing]; }
    if (cb && hasCat(key)) cb(key);
    toast(editing ? 'Kategori diperbarui' : `Kategori "${label}" ditambahkan sebagai tab baru di Google Sheet`);
  }

  async function hideCategorySync(cat) {
    const choice = await askConfirm({
      title: `Sembunyikan kategori "${cat.label}"?`,
      message: 'Kategori dan jadwalnya disembunyikan dari kalender untuk semua pengguna. Tab dan datanya tetap ada di Google Sheet; tampilkan lagi lewat tab _Kategori (Tampilkan = TRUE).',
      buttons: [{ label: 'Batal', value: null }, { label: 'Sembunyikan', value: 'hide', variant: 'danger' }],
    });
    if (choice !== 'hide') return;
    try {
      await api('category', { op: 'hide', tab: cat.tab || cat.label });
    } catch (err) {
      handleApiError(err, 'save');
      return;
    }
    await reloadNow();
    toast('Kategori disembunyikan.');
  }

  /* ---------- Memindahkan data lama di browser ke Google Sheet ---------- */
  function computeMigratable() {
    if (storageGet(MIGRATED_KEY) === '1') return [];
    let raw = [];
    try { raw = JSON.parse(storageGet(STORAGE_KEY) || '[]'); } catch (err) { raw = []; }
    if (!Array.isArray(raw)) return [];
    const list = raw.filter((x) => x && typeof x === 'object' && x.tanggal && x.judul);
    const samples = new Set(findSampleEvents(list.map((x) => ({ ...x, sumber: x.sumber || 'manual' }))).map((x) => x.id));
    return list.filter((x) => !samples.has(x.id) && x.sumber !== 'contoh');
  }

  async function migrateLocal() {
    if (!migratable.length) { toast('Tidak ada jadwal di browser ini yang perlu dikirim.'); return; }
    let localCats = [];
    try { localCats = JSON.parse(storageGet(CATEGORIES_KEY) || '[]'); } catch (err) { localCats = []; }
    const catByKey = {};
    (Array.isArray(localCats) ? localCats : []).forEach((c) => { if (c && c.key) catByKey[c.key] = c; });
    const missing = new Map();
    migratable.forEach((x) => {
      if (BUILTIN_CATEGORIES[x.kategori]) return;
      const c = catByKey[x.kategori];
      if (c && !findCategoryByLabel(c.label)) missing.set(normalizeText(c.label), c);
    });
    const ok = await askConfirm({
      title: 'Kirim jadwal dari browser ini ke Google Sheet?',
      message: `${migratable.length} jadwal yang tersimpan di browser ini akan ditambahkan ke Google Sheet${missing.size ? ` beserta ${missing.size} kategori baru` : ''}. Jadwal yang sama persis tidak akan digandakan.`,
      buttons: [{ label: 'Batal', value: null }, { label: 'Kirim', value: 'go', variant: 'primary' }],
    });
    if (ok !== 'go') return;
    try {
      for (const c of missing.values()) {
        await api('category', { op: 'create', name: c.label, jenis: c.payment ? 'pembayaran' : 'agenda', warna: c.color || 'slate' });
      }
      if (missing.size) await reloadNow();
    } catch (err) {
      handleApiError(err, 'save');
      return;
    }
    const keys = new Set(state.events.map(dupKey));
    const add = [];
    migratable.forEach((x) => {
      let k = x.kategori;
      if (!BUILTIN_CATEGORIES[k]) { const c = catByKey[k]; k = c ? findCategoryByLabel(c.label) : null; }
      if (!k || !hasCat(k)) return;
      const ev = normalizeEvent({ ...x, kategori: k, id: uid(), dibuatOleh: currentEmail(), sumber: x.sumber === 'csv' ? 'csv' : 'manual' });
      if (!ev || keys.has(dupKey(ev))) return;
      keys.add(dupKey(ev));
      add.push(ev);
    });
    const finish = (msg) => { storageSet(MIGRATED_KEY, '1'); migratable = []; applyRoleUI(); toast(msg); };
    if (!add.length) { finish('Semua jadwal di browser ini sudah ada di Google Sheet.'); return; }
    state.events.push(...add);
    saveEvents();
    render();
    await SYNC.chain;
    if (add.every((ev) => SYNC.map.has(ev.id))) finish(`${add.length} jadwal dikirim ke Google Sheet.`);
  }

  /* -----------------------------------------------------------
     14. INISIALISASI
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
      'periodPicker', 'dayPopover', 'toasts', 'userPopover', 'syncStatus', 'syncText', 'btnUser', 'userInitial',
      'loginScreen', 'loginButton', 'loginStatus', 'loginError', 'tabActivity', 'panelActivity', 'btnAddCategory',
      'btnMigrate', 'cSave', 'sewaFields', 'taxRow', 'fCabang', 'fUnit', 'fTahap', 'fPeriodeMulai',
      'fPeriodeSelesai', 'fPPN', 'fPPh', 'cabangList', 'importColumns', 'importKategori', 'importKategoriHint',
      'importSimilarWrap', 'importSimilar', 'importSimilarLabel', 'importPastWrap', 'importPast', 'importPastLabel',
      'importModeWrap', 'importModeHint', 'importSamplesWrap', 'importSamples', 'importSamplesLabel', 'btnClearSample',
      'categoryModal', 'categoryForm', 'categoryModalTitle', 'cName', 'cColors', 'cPayment', 'cDelete', 'cError',
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function init() {
    cacheEls();
    if (isMobile()) state.leftOpen = false;
    if (!SYNC.on) loadCategories();
    renderCategoryStyles();
    loadPrefs();

    let firstVisit = false;
    if (SYNC.on) {
      state.events = [];
    } else {
      const stored = loadEvents();
      firstVisit = stored === null;
      state.events = firstVisit ? sampleEvents() : stored;
      if (firstVisit) saveEvents();
    }

    syncMini();
    buildCategoryOptions();
    bindEvents();
    setFavicon();
    applyRoleUI();
    render();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (state.view === 'month') fillMonthCells(buildIndex()); });
    }

    if (SYNC.on) {
      syncInit();
    } else if (firstVisit) {
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
    parseCSV, parseDateTime, parseDuration, parseAmount, parsePeriod, extractTaxes, mapCategory,
    importCSVText: prepareImport, exportCSV, downloadTemplate,
    syncNow: () => reloadNow(),
    get sync() { return { on: SYNC.on, me: SYNC.me, status: SYNC.status, invalid: SYNC.invalid.slice() }; },
    get events() { return state.events.slice(); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
