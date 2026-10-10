/* =============================================================
   Calendar — Google Apps Script
   Penghubung Google Sheet <-> aplikasi kalender (GitHub Pages).

   Cara pasang (ringkas, panduan lengkap ada di README):
   1. Buka Google Sheet kalender > Extensions > Apps Script.
   2. Hapus isi Code.gs bawaan, tempel SELURUH isi file ini.
   3. Isi CONFIG.GOOGLE_CLIENT_ID di bawah, lalu klik Save.
   4. Pilih fungsi siapkanSheet > Run, lalu izinkan semua akses yang diminta
      (Sheet, Drive untuk bukti bayar, Gmail untuk email pengingat, pemicu terjadwal).
   5. Deploy > New deployment > Web app
      Execute as: Me | Who has access: Anyone > Deploy.
      (Memperbarui skrip: Deploy > Manage deployments > pensil > New version > Deploy.)
   6. Salin URL Web App (berakhiran /exec) ke config.js aplikasi.
   ============================================================= */

const CONFIG = {
  // OAuth Client ID dari Google Cloud Console (berakhiran .apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '174841001822-mvoga9p4jmlmuiar3rfd7suh6vb0uh1e.apps.googleusercontent.com',
  SESSION_DAYS: 30,       // lama login tersimpan di perangkat
  HISTORY_LIMIT: 60,      // jumlah aktivitas terbaru yang dikirim ke kalender
  CALENDAR_URL: 'https://financewmcenter.github.io/kalender-jadwal/',  // tautan di email pengingat
  BUKTI_FOLDER: 'Bukti Bayar Kalender',   // folder Google Drive untuk file bukti bayar
  BUKTI_MAX_MB: 10,                       // ukuran maksimal satu file bukti bayar
  CABANG_AWAL: ['Sunter'],                // cabang yang ditambahkan sekali saat pembaruan ini dipasang
};

/* ---------- Struktur ---------- */
const API_VERSION = 2;   // 2 = cabang, bukti bayar, email pengingat, pengaturan
const BASE_SYS = ['ID', 'Dibuat_Oleh', 'Dibuat_Pada', 'Diubah_Oleh', 'Diubah_Pada', 'Dihapus'];
const EXTRA_SYS = ['Selesai_Oleh', 'Selesai_Pada', 'Seri_ID', 'Sumber', 'Catatan_Sistem'];
const SYS_NORM = BASE_SYS.concat(EXTRA_SYS).map(norm);
const REV_EXCLUDE = ['catatan_sistem'];
const STAMP_COLS = ['dibuat_pada', 'diubah_pada', 'selesai_pada'];

const TEMPLATES = {
  sewa: ['No', 'Cabang', 'Sub_Unit', 'Term_Tahap', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'Durasi_Sewa', 'Catatan', 'Lunas'],
  pembayaran: ['Nama_Kegiatan', 'Tanggal_Jatuh_Tempo', 'Nominal_IDR', 'PPN', 'PPh', 'Catatan', 'Lunas'],
  agenda: ['Nama_Kegiatan', 'Tanggal', 'Jam_Mulai', 'Jam_Selesai', 'Catatan', 'Selesai'],
};
const BUILTIN = {
  'pembayaran sewa kantor': { name: 'Pembayaran Sewa Kantor', jenis: 'pembayaran', warna: 'coral', template: 'sewa' },
  'pembayaran rutin': { name: 'Pembayaran Rutin', jenis: 'pembayaran', warna: 'gold', template: 'pembayaran' },
  'jadwal meeting': { name: 'Jadwal Meeting', jenis: 'agenda', warna: 'blue', template: 'agenda' },
  'task & report': { name: 'Task & Report', jenis: 'agenda', warna: 'purple', template: 'agenda' },
};
const PALETTE = ['teal', 'pink', 'orange', 'indigo', 'cyan', 'lime', 'sand', 'slate'];
const ALL_COLORS = PALETTE.concat(['coral', 'gold', 'blue', 'purple']);
const STATUS_ALIASES = ['lunas', 'selesai', 'status', 'status_bayar'];
const NOMINAL_ALIASES = ['nominal_idr', 'nominal', 'jumlah', 'amount', 'idr', 'nilai', 'dpp', 'harga_sewa', 'biaya'];
// Nama kolom yang dikenali (sama dengan app.js)
const FIELD_ALIASES = {
  judul: ['nama_kegiatan', 'judul', 'nama', 'kegiatan', 'nama_event', 'event', 'title', 'uraian'],
  tanggal: ['tanggal_jatuh_tempo', 'jatuh_tempo', 'tgl_jatuh_tempo', 'tanggal_bayar', 'tanggal', 'tgl', 'due_date', 'date'],
  cabang: ['cabang', 'lokasi', 'branch', 'outlet', 'site', 'klinik'],
  unit: ['sub_unit', 'subunit', 'unit', 'gedung', 'lantai', 'entitas', 'pt'],
  tahap: ['term_tahap', 'term', 'tahap', 'termin', 'pembayaran_ke'],
  jam: ['jam_mulai', 'mulai', 'jam', 'waktu', 'waktu_mulai'],
  tglBayar: ['tgl_bayar', 'tanggal_dibayar', 'tgl_dibayar', 'paid_date', 'tanggal_pembayaran'],
  bukti: ['bukti_bayar', 'bukti', 'link_bukti', 'bukti_pembayaran', 'link_bayar'],
  ketBayar: ['keterangan_bayar', 'ket_bayar', 'catatan_bayar'],
};
// Kolom bukti bayar boleh diisi oleh siapa pun yang boleh mencentang Lunas
const PROOF_ALIASES = FIELD_ALIASES.tglBayar.concat(FIELD_ALIASES.bukti, FIELD_ALIASES.ketBayar);
const SYS_TABS = {
  _Kategori: ['Nama_Tab', 'Jenis', 'Warna', 'Tampilkan'],
  _Cabang: ['Nama_Cabang', 'Entitas', 'Aktif', 'Keterangan'],
  _Pengguna: ['Email', 'Nama', 'Peran', 'Aktif'],
  _Riwayat: ['Waktu', 'Email', 'Aksi', 'Tab', 'ID', 'Nama_Kegiatan', 'Perubahan'],
  _Pengaturan: ['Kunci', 'Nilai', 'Keterangan'],
};
// Isi awal tab _Pengaturan (baris yang belum ada ditambahkan otomatis, nilai yang sudah ada tidak diubah)
const SETTING_ROWS = [
  ['mode_akses', 'daftar_email', 'daftar_email = hanya email di tab _Pengguna; domain = semua email domain_kantor'],
  ['domain_kantor', '', 'Domain email kantor untuk mode_akses = domain, mis. wmcenter.id'],
  ['peran_default_domain', 'Kontributor', 'Peran untuk email domain yang tidak tercantum di _Pengguna'],
  ['kontributor_boleh_centang', true, 'TRUE = Kontributor boleh mencentang Lunas/Selesai dan mencatat bukti bayar jadwal milik orang lain'],
  ['interval_sinkron_detik', 20, 'Seberapa sering kalender membaca perubahan dari Sheet (10–300 detik)'],
  ['hari_pengingat', 30, 'Pengingat di kalender mulai H-berapa (semua kategori)'],
  ['hari_pengingat_sewa', 90, 'Pengingat awal khusus Pembayaran Sewa Kantor, mulai H-berapa'],
  ['email_pengingat', false, 'TRUE = kirim email ringkasan pengingat setiap hari'],
  ['email_penerima', '', 'Alamat email penerima, pisahkan dengan koma. Kosong = pemilik spreadsheet'],
  ['jam_email', 7, 'Jam kirim email pengingat (0–23, zona waktu spreadsheet)'],
];

/* =============================================================
   ENDPOINT
   ============================================================= */
/* Jalankan sekali dari editor Apps Script (pilih siapkanSheet > Run) untuk menyiapkan
   tab-tab di spreadsheet kosong sekaligus memberi izin akses. Aman dijalankan berulang. */
function siapkanSheet() {
  let ctx = context();
  withLock(function () { ensureStructure(ctx); });
  ctx = context();
  const pemicu = installReminderTrigger(ctx);
  const msg = 'Spreadsheet siap: ' + ctx.ss.getSheets().map(function (sh) { return sh.getName(); }).join(', ') + '. ' + pemicu;
  Logger.log(msg);
  return msg;
}

/* Jalankan dari editor bila ingin mengatur ulang jadwal email pengingat sesuai tab _Pengaturan. */
function aturPengingatEmail() {
  const msg = installReminderTrigger(context());
  Logger.log(msg);
  return msg;
}

function doGet() {
  return json({ ok: true, app: 'calendar', message: 'Apps Script kalender aktif. Gunakan URL ini di config.js.' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ ok: false, code: 'invalid', error: 'Permintaan tidak valid.' });
  }
  try {
    const action = String(body.action || '');
    if (action === 'login') return json(login(body));
    const user = requireSession(body.session);
    if (action === 'logout') {
      PropertiesService.getScriptProperties().deleteProperty('sess_' + body.session);
      return json({ ok: true });
    }
    if (action === 'load') return json(load(user, body.hash));
    if (action === 'save') return json(save(user, body.ops));
    if (action === 'category') return json(category(user, body));
    if (action === 'notes') return json(notes(user, body.notes));
    if (action === 'branch') return json(branch(user, body));
    if (action === 'settings') return json(saveSettings(user, body.settings));
    if (action === 'test_email') return json(testEmail(user));
    if (action === 'upload') return json(uploadProof(user, body));
    return json({ ok: false, code: 'invalid', error: 'Aksi tidak dikenal.' });
  } catch (err) {
    if (err && err.code) return json({ ok: false, code: err.code, error: err.message });
    const msg = String((err && err.message) || err);
    if (/lock|timeout/i.test(msg)) return json({ ok: false, code: 'busy', error: 'Sistem sedang sibuk menyimpan perubahan lain. Coba lagi sebentar.' });
    return json({ ok: false, code: 'server', error: 'Terjadi kesalahan di Apps Script: ' + msg });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}

/* =============================================================
   LOGIN & HAK AKSES
   ============================================================= */
function login(body) {
  const token = String(body.idToken || '');
  if (!token) fail('auth', 'Token login kosong.');
  if (CONFIG.GOOGLE_CLIENT_ID.indexOf('TEMPEL_') === 0) fail('auth', 'CONFIG.GOOGLE_CLIENT_ID di Apps Script belum diisi.');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail('auth', 'Login Google tidak valid atau kedaluwarsa. Silakan coba lagi.');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID) fail('auth', 'Client ID tidak cocok. Samakan CONFIG.GOOGLE_CLIENT_ID di Apps Script dengan googleClientId di config.js.');
  if (String(info.email_verified) !== 'true') fail('auth', 'Email Google belum terverifikasi.');
  const email = String(info.email || '').trim().toLowerCase();
  const ctx = context();
  const access = roleFor(ctx, email);
  if (!access) fail('forbidden', 'Email ' + email + ' belum diberi akses. Minta Admin menambahkannya di tab _Pengguna.');
  const sid = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('sess_' + sid, JSON.stringify({ email: email, name: info.name || '', exp: Date.now() + CONFIG.SESSION_DAYS * 86400000 }));
  pruneSessions(props);
  return { ok: true, session: sid, me: { email: email, name: access.name || info.name || email, role: access.role } };
}

function requireSession(sid) {
  if (!sid) fail('auth', 'Silakan masuk terlebih dahulu.');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sess_' + sid);
  if (!raw) fail('auth', 'Sesi berakhir. Silakan masuk lagi.');
  let s;
  try { s = JSON.parse(raw); } catch (err) { s = null; }
  if (!s || s.exp < Date.now()) {
    props.deleteProperty('sess_' + sid);
    fail('auth', 'Sesi berakhir. Silakan masuk lagi.');
  }
  const ctx = context();
  const access = roleFor(ctx, s.email);
  if (!access) {
    props.deleteProperty('sess_' + sid);
    fail('forbidden', 'Akses email ' + s.email + ' sudah dicabut.');
  }
  return { email: s.email, name: access.name || s.name || s.email, role: access.role, ctx: ctx };
}

function pruneSessions(props) {
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (err) { props.deleteProperty(k); }
  });
}

function context() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return { ss: ss, tz: tz, owner: owner, settings: readSettings(ss, tz), users: readUsers(ss, tz) };
}

function roleFor(ctx, email) {
  email = String(email || '').toLowerCase();
  if (!email) return null;
  const u = ctx.users.filter(function (x) { return x.email === email; })[0];
  if (email === ctx.owner) return { role: 'Admin', name: u ? u.name : '' };
  if (u) return u.active ? { role: u.role, name: u.name } : null;
  if (String(ctx.settings.mode_akses).toLowerCase() === 'domain') {
    const dom = String(ctx.settings.domain_kantor || '').toLowerCase().replace(/^@/, '').trim();
    if (dom && email.slice(-(dom.length + 1)) === '@' + dom) return { role: normRole(ctx.settings.peran_default_domain || 'Kontributor'), name: '' };
  }
  return null;
}

function normRole(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.indexOf('admin') === 0) return 'Admin';
  if (s.indexOf('baca') >= 0 || s === 'viewer') return 'Pembaca';
  return 'Kontributor';
}

function readSettings(ss, tz) {
  const out = {};
  SETTING_ROWS.forEach(function (r) { out[r[0]] = r[1]; });
  const sh = ss.getSheetByName('_Pengaturan');
  if (!sh) return out;
  const t = readSheet(sh, tz);
  const ki = findCol(t.headers, ['kunci', 'key']);
  const vi = findCol(t.headers, ['nilai', 'value']);
  if (ki < 0 || vi < 0) return out;
  t.values.forEach(function (r) {
    const k = String(r[ki]).trim();
    if (k) out[k] = r[vi];
  });
  out.kontributor_boleh_centang = toBool(out.kontributor_boleh_centang, true);
  out.interval_sinkron_detik = Math.min(300, Math.max(10, Number(out.interval_sinkron_detik) || 20));
  out.hari_pengingat = Math.min(365, Math.max(1, Number(out.hari_pengingat) || 30));
  out.hari_pengingat_sewa = Math.min(365, Math.max(1, Number(out.hari_pengingat_sewa) || 90));
  out.email_pengingat = toBool(out.email_pengingat, false);
  out.email_penerima = parseEmails(out.email_penerima).join(', ');
  const jam = Number(out.jam_email);
  out.jam_email = isFinite(jam) && String(out.jam_email).trim() !== '' ? Math.min(23, Math.max(0, Math.round(jam))) : 7;
  return out;
}

function parseEmails(v) {
  const seen = {};
  return String(v == null ? '' : v).split(/[\s,;]+/).map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) || seen[s]) return false;
      seen[s] = true;
      return true;
    });
}

/* Daftar cabang dari tab _Cabang */
function readBranches(ss, tz) {
  const sh = ss.getSheetByName('_Cabang');
  if (!sh) return [];
  const t = readSheet(sh, tz);
  const ni = findCol(t.headers, ['nama_cabang', 'cabang', 'nama']);
  const ei = findCol(t.headers, ['entitas', 'pt']);
  const ai = findCol(t.headers, ['aktif', 'active']);
  const ki = findCol(t.headers, ['keterangan', 'catatan']);
  if (ni < 0) return [];
  const out = [];
  t.values.forEach(function (r, i) {
    const nama = String(r[ni] == null ? '' : r[ni]).trim();
    if (!nama) return;
    out.push({
      nama: nama,
      entitas: ei >= 0 ? String(r[ei] == null ? '' : r[ei]).trim() : '',
      aktif: ai >= 0 ? toBool(r[ai], true) : true,
      keterangan: ki >= 0 ? String(r[ki] == null ? '' : r[ki]).trim() : '',
      n: i + 2,
    });
  });
  return out;
}

function readUsers(ss, tz) {
  const sh = ss.getSheetByName('_Pengguna');
  if (!sh) return [];
  const t = readSheet(sh, tz);
  const ei = findCol(t.headers, ['email']);
  const ni = findCol(t.headers, ['nama', 'name']);
  const pi = findCol(t.headers, ['peran', 'role']);
  const ai = findCol(t.headers, ['aktif', 'active']);
  if (ei < 0) return [];
  const list = [];
  t.values.forEach(function (r) {
    const email = String(r[ei]).trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return;
    list.push({ email: email, name: ni >= 0 ? String(r[ni]).trim() : '', role: normRole(pi >= 0 ? r[pi] : ''), active: ai >= 0 ? toBool(r[ai], true) : true });
  });
  return list;
}

/* =============================================================
   MEMBACA DATA
   ============================================================= */
function load(user, clientHash) {
  withLock(function () { ensureStructure(user.ctx); });
  const data = readAll(user.ctx);
  const hash = digest(JSON.stringify(data));
  const me = { email: user.email, name: user.name, role: user.role, sheetUrl: user.role === 'Admin' ? user.ctx.ss.getUrl() : '' };
  if (clientHash && clientHash === hash) return { ok: true, unchanged: true, hash: hash, me: me };
  data.ok = true;
  data.hash = hash;
  data.me = me;
  return data;
}

function readAll(ctx) {
  const ss = ctx.ss;
  const tz = ctx.tz;
  const kat = readSheet(ss.getSheetByName('_Kategori'), tz);
  const ni = findCol(kat.headers, ['nama_tab', 'nama', 'tab']);
  const ji = findCol(kat.headers, ['jenis']);
  const wi = findCol(kat.headers, ['warna', 'color']);
  const ti = findCol(kat.headers, ['tampilkan', 'tampil', 'aktif']);
  const categories = kat.values.map(function (r) {
    return {
      tab: ni >= 0 ? String(r[ni]).trim() : '',
      jenis: ji >= 0 ? String(r[ji]).trim().toLowerCase() : '',
      warna: wi >= 0 ? String(r[wi]).trim().toLowerCase() : '',
      tampilkan: ti >= 0 ? toBool(r[ti], true) : true,
    };
  }).filter(function (c) { return c.tab; });

  const used = {};
  const tabs = categorySheets(ss).map(function (sh) {
    const t = readSheet(sh, tz);
    const rows = [];
    const ci = findCol(t.headers, FIELD_ALIASES.cabang);
    const di = colOf(t.headers, 'Dihapus');
    t.values.forEach(function (r, i) {
      const cells = rowCells(t, i, tz);
      if (isBlankRow(cells, t.headers)) return;
      rows.push({ n: i + 2, cells: cells, rev: rowRev(cells, t.headers) });
      if (ci >= 0 && cells[ci] && !(di >= 0 && toBool(cells[di], false)) && !used[normName(cells[ci])]) used[normName(cells[ci])] = cells[ci];
    });
    return { name: sh.getName(), headers: t.headers, rows: rows };
  });

  // Cabang yang dipakai di data tetapi belum ada di _Cabang otomatis didaftarkan
  let branches = readBranches(ss, tz);
  const known = {};
  branches.forEach(function (b) { known[normName(b.nama)] = true; });
  const missing = Object.keys(used).filter(function (k) { return !known[k]; }).map(function (k) { return used[k]; });
  if (missing.length) {
    withLock(function () { registerBranches(ss, tz, missing); });
    branches = readBranches(ss, tz);
  }

  const h = readSheet(ss.getSheetByName('_Riwayat'), tz);
  const col = function (name) { return colOf(h.headers, name); };
  const pick = function (c, name) { const i = col(name); return i >= 0 ? (c[i] || '') : ''; };
  const history = [];
  for (let i = h.values.length - 1; i >= 0 && history.length < CONFIG.HISTORY_LIMIT; i--) {
    const c = rowCells(h, i, tz);
    if (!c.join('')) continue;
    history.push({ waktu: pick(c, 'Waktu'), email: pick(c, 'Email'), aksi: pick(c, 'Aksi'), tab: pick(c, 'Tab'), id: pick(c, 'ID'), judul: pick(c, 'Nama_Kegiatan'), perubahan: pick(c, 'Perubahan') });
  }

  const st = ctx.settings;
  return {
    apiVersion: API_VERSION,
    tz: tz,
    settings: {
      kontributor_boleh_centang: st.kontributor_boleh_centang, interval_sinkron_detik: st.interval_sinkron_detik,
      hari_pengingat: st.hari_pengingat, hari_pengingat_sewa: st.hari_pengingat_sewa,
      email_pengingat: st.email_pengingat, email_penerima: st.email_penerima, jam_email: st.jam_email,
    },
    categories: categories,
    branches: branches.map(function (b) { return { nama: b.nama, entitas: b.entitas, aktif: b.aktif, keterangan: b.keterangan }; }),
    tabs: tabs,
    history: history,
    users: ctx.users.filter(function (u) { return u.active; }).map(function (u) { return { email: u.email, name: u.name }; }),
    owner: ctx.owner,
  };
}

/* Membuat tab sistem bila belum ada, melengkapi kolom sistem, ID baris, dan daftar _Kategori */
function ensureStructure(ctx) {
  const ss = ctx.ss;
  Object.keys(SYS_TABS).forEach(function (name) { ensureSheet(ss, name, SYS_TABS[name]); });
  firstSetup(ss);
  ensureSettingRows(ss, ctx.tz);
  seedBranches(ss, ctx.tz);
  const katSh = ss.getSheetByName('_Kategori');
  const kat = readSheet(katSh, ctx.tz);
  const ni = findCol(kat.headers, ['nama_tab', 'nama', 'tab']);
  const ji = findCol(kat.headers, ['jenis']);
  const wi = findCol(kat.headers, ['warna', 'color']);
  const known = {};
  const used = {};
  kat.values.forEach(function (r) {
    if (ni >= 0 && String(r[ni]).trim()) known[normName(r[ni])] = ji >= 0 ? String(r[ji]).trim().toLowerCase() : '';
    if (wi >= 0) used[String(r[wi]).trim().toLowerCase()] = true;
  });
  const newRows = [];
  categorySheets(ss).forEach(function (sh) {
    const name = sh.getName();
    let headers = headerRow(sh);
    if (!headers.filter(String).length) {
      const tpl = TEMPLATES[templateOf(name, known[normName(name)] || '')];
      writeHeaderRow(sh, tpl.concat(BASE_SYS));
      headers = headerRow(sh);
    }
    const b = BUILTIN[normName(name)];
    let jenis = known[normName(name)] || (b ? b.jenis : '');
    if (!jenis) jenis = findCol(headers, NOMINAL_ALIASES) >= 0 ? 'pembayaran' : 'agenda';
    if (findCol(headers, STATUS_ALIASES) < 0) addHeaders(sh, [jenis === 'pembayaran' ? 'Lunas' : 'Selesai'], false);
    addHeaders(sh, BASE_SYS, true);
    assignIds(sh, ctx.tz);
    if (!(normName(name) in known)) {
      let warna = b ? b.warna : PALETTE.filter(function (p) { return !used[p]; })[0] || 'slate';
      used[warna] = true;
      newRows.push([name, jenis, warna, true]);
      known[normName(name)] = jenis;
    }
  });
  if (newRows.length) appendRows(katSh, newRows, ctx.tz);
}

/* Penyiapan pertama pada spreadsheet baru: buat 4 tab kategori bawaan dan
   hapus lembar kosong bawaan ("Sheet1" / "Lembar1"). Hanya berjalan sekali. */
function firstSetup(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('setup_done') === '1') return;
  Object.keys(BUILTIN).forEach(function (key) {
    const exists = categorySheets(ss).some(function (sh) { return normName(sh.getName()) === key; });
    if (!exists) createCategorySheet(ss, BUILTIN[key].name, BUILTIN[key].template);
  });
  ss.getSheets().forEach(function (sh) {
    const blank = sh.getLastRow() === 0 && sh.getLastColumn() === 0;
    if (blank && /^(sheet|lembar)\s*\d*$/i.test(sh.getName()) && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  props.setProperty('setup_done', '1');
}

/* Lengkapi baris pengaturan yang belum ada di tab _Pengaturan (nilai yang sudah diisi tidak diubah) */
function ensureSettingRows(ss, tz) {
  const sh = ss.getSheetByName('_Pengaturan');
  if (!sh) return;
  const t = readSheet(sh, tz);
  const ki = findCol(t.headers, ['kunci', 'key']);
  if (ki < 0) return;
  const have = {};
  t.values.forEach(function (r) { have[String(r[ki]).trim()] = true; });
  const add = SETTING_ROWS.filter(function (r) { return !have[r[0]]; });
  if (!add.length) return;
  const width = Math.max(3, t.headers.length);
  appendRows(sh, add.map(function (r) {
    const row = t.headers.map(function () { return ''; });
    while (row.length < width) row.push('');
    row[ki] = r[0];
    const vi = findCol(t.headers, ['nilai', 'value']);
    const di = findCol(t.headers, ['keterangan', 'description']);
    row[vi >= 0 ? vi : 1] = r[1];
    row[di >= 0 ? di : 2] = r[2];
    return row;
  }), tz);
}

/* Cabang awal (CONFIG.CABANG_AWAL) ditambahkan sekali saja */
function seedBranches(ss, tz) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('cabang_awal_done') === '1') return;
  registerBranches(ss, tz, CONFIG.CABANG_AWAL || []);
  props.setProperty('cabang_awal_done', '1');
}

/* Menambahkan nama cabang yang belum terdaftar ke tab _Cabang (dipanggil di dalam withLock) */
function registerBranches(ss, tz, names) {
  const sh = ensureSheet(ss, '_Cabang', SYS_TABS._Cabang);
  const have = {};
  readBranches(ss, tz).forEach(function (b) { have[normName(b.nama)] = true; });
  const headers = headerRow(sh);
  const ni = findCol(headers, ['nama_cabang', 'cabang', 'nama']);
  const ai = findCol(headers, ['aktif', 'active']);
  const rows = [];
  (names || []).forEach(function (n) {
    const nama = String(n == null ? '' : n).trim().replace(/\s+/g, ' ');
    if (!nama || have[normName(nama)]) return;
    have[normName(nama)] = true;
    const row = headers.map(function () { return ''; });
    row[ni >= 0 ? ni : 0] = nama;
    if (ai >= 0) row[ai] = true;
    rows.push(row);
  });
  if (rows.length) appendRows(sh, rows, tz);
  return rows.length;
}

/* ID untuk baris yang ditambah langsung di Sheet (dan pengganti ID ganda karena salin-tempel) */
function assignIds(sh, tz) {
  const t = readSheet(sh, tz);
  const idc = colOf(t.headers, 'ID');
  const dpc = colOf(t.headers, 'Dibuat_Pada');
  if (idc < 0 || !t.values.length) return;
  const seen = {};
  let changed = false;
  const now = new Date();
  const ids = [];
  const dps = [];
  t.values.forEach(function (row, i) {
    let id = String(row[idc] == null ? '' : row[idc]).trim();
    let dp = dpc >= 0 ? row[dpc] : '';
    const blank = isBlankRow(rowCells(t, i, tz), t.headers);
    if (!blank && (!id || seen[id])) {
      id = newId();
      changed = true;
      if (dpc >= 0 && !dp) dp = now;
    }
    if (id) seen[id] = true;
    ids.push([id]);
    dps.push([dp]);
  });
  if (!changed) return;
  sh.getRange(2, idc + 1, ids.length, 1).setValues(ids);
  if (dpc >= 0) sh.getRange(2, dpc + 1, dps.length, 1).setValues(dps).setNumberFormat('dd/mm/yyyy hh:mm');
}

/* =============================================================
   MENYIMPAN PERUBAHAN DARI KALENDER
   ============================================================= */
function save(user, ops) {
  if (user.role === 'Pembaca') fail('forbidden', 'Peran Pembaca hanya dapat melihat kalender.');
  if (!Array.isArray(ops)) fail('invalid', 'Data perubahan tidak valid.');
  if (ops.length > 500) fail('invalid', 'Terlalu banyak perubahan sekaligus (maksimal 500).');
  if (!ops.length) return { ok: true, rows: [], tabs: {}, deleted: [] };

  return withLock(function () {
    const ctx = user.ctx;
    const ss = ctx.ss;
    const tz = ctx.tz;
    const now = new Date();
    let index = buildIndex(ss, tz);

    // 1) Validasi semua perubahan dulu; bila ada yang ditolak, tidak ada yang ditulis
    ops.forEach(function (op) {
      if (!op || !op.id || !op.tab || String(op.tab).charAt(0) === '_') fail('invalid', 'Perubahan tidak valid.');
      if (op.type !== 'upsert' && op.type !== 'delete') fail('invalid', 'Jenis perubahan tidak dikenal.');
      if (op.type === 'upsert' && (typeof op.cells !== 'object' || op.cells === null)) fail('invalid', 'Isi perubahan tidak valid.');
      const ex = index.byId[op.id];
      if (!ex) return;
      checkPermission(user, ex, op);
      if (op.expected && op.expected !== ex.rev) conflict(ex, op);
    });

    const logs = [];
    const touched = {};
    const deleted = [];
    const appends = {};
    const statusChange = {};

    // 2) Ubah / hapus / pindahkan baris yang sudah ada
    ops.forEach(function (op) {
      const ex = index.byId[op.id];
      if (op.type === 'delete') {
        if (!ex) return;
        const sh = ss.getSheetByName(ex.tab);
        addHeaders(sh, BASE_SYS, true);
        const headers = headerRow(sh);
        setCell(sh, ex.n, headers, 'Dihapus', true, tz);
        stamp(sh, ex.n, headers, user.email, now);
        logs.push([now, user.email, 'hapus', ex.tab, op.id, op.label || '', '']);
        deleted.push(op.id);
        return;
      }
      if (ex && ex.tab !== op.tab) {
        // pindah kategori: salin data sistem, hapus baris lama, tambahkan di tab baru
        const carry = {};
        ['Dibuat_Oleh', 'Dibuat_Pada', 'Selesai_Oleh', 'Selesai_Pada', 'Seri_ID', 'Sumber'].forEach(function (h) {
          const c = colOf(ex.headers, h);
          if (c >= 0) carry[h] = ex.raw[c];
        });
        ss.getSheetByName(ex.tab).deleteRow(ex.n);
        index = buildIndex(ss, tz);
        (appends[op.tab] = appends[op.tab] || []).push({ op: op, carry: carry, aksi: 'pindah', from: ex.tab });
        return;
      }
      if (!ex) {
        (appends[op.tab] = appends[op.tab] || []).push({ op: op, carry: null, aksi: 'tambah' });
        return;
      }
      // perbarui baris di tab yang sama
      const sh = ss.getSheetByName(ex.tab);
      const keys = Object.keys(op.cells);
      addHeaders(sh, keys.filter(function (k) { return !isSysHeader(k); }), false);
      addHeaders(sh, keys.filter(isSysHeader).concat(BASE_SYS), true);
      const headers = headerRow(sh);
      const before = readRowCells(sh, ex.n, headers.length, tz);
      const changes = [];
      let statusTo = null;
      let onlyStatus = true;
      keys.forEach(function (k) {
        const c = colOf(headers, k);
        if (c < 0) return;
        const val = toCellValue(op.cells[k], tz);
        const oldText = before[c] || '';
        const newText = valueText(val, tz);
        if (oldText === newText) return;
        writeCell(sh, ex.n, c, val, headers[c]);
        changes.push(headers[c] + ': ' + short(oldText) + ' → ' + short(newText));
        if (STATUS_ALIASES.indexOf(norm(k)) >= 0) statusTo = val === true || /^(true|ya|yes|1|lunas|selesai)$/i.test(newText);
        else onlyStatus = false;
      });
      const wasDeleted = /^(true|ya|yes|1)$/i.test(before[colOf(headers, 'Dihapus')] || '');
      if (!changes.length && !wasDeleted) return;
      if (wasDeleted) setCell(sh, ex.n, headers, 'Dihapus', false, tz);
      if (statusTo !== null) statusChange[op.id] = statusTo;
      stamp(sh, ex.n, headers, user.email, now);
      if (statusTo !== null) stampStatus(sh, ex.n, statusTo, user.email, now, tz);
      let aksi = 'ubah';
      if (wasDeleted) aksi = 'pulihkan';
      else if (onlyStatus && statusTo !== null) aksi = statusTo ? 'centang' : 'batal_centang';
      logs.push([now, user.email, aksi, ex.tab, op.id, op.label || '', changes.slice(0, 8).join('; ')]);
      touched[op.id] = true;
    });

    // 3) Tambahkan baris baru (sekaligus per tab)
    Object.keys(appends).forEach(function (tab) {
      const items = appends[tab];
      let sh = ss.getSheetByName(tab);
      if (!sh) {
        sh = createCategorySheet(ss, tab, items[0].op.template || 'agenda');
        const b = BUILTIN[normName(tab)];
        upsertKategori(ss, tab, { Jenis: b ? b.jenis : (items[0].op.template === 'agenda' ? 'agenda' : 'pembayaran'), Warna: b ? b.warna : 'slate', Tampilkan: true }, tz);
      }
      const dataKeys = {};
      const sysKeys = {};
      items.forEach(function (it) {
        Object.keys(it.op.cells).forEach(function (k) { (isSysHeader(k) ? sysKeys : dataKeys)[k] = true; });
      });
      addHeaders(sh, Object.keys(dataKeys), false);
      addHeaders(sh, Object.keys(sysKeys).concat(BASE_SYS), true);
      const needStatusStamp = items.some(function (it) { return statusOf(it.op.cells) === true || (it.carry && it.carry.Selesai_Oleh); });
      if (needStatusStamp) addHeaders(sh, ['Selesai_Oleh', 'Selesai_Pada'], true);
      const headers = headerRow(sh);
      const rows = items.map(function (it) {
        const arr = headers.map(function () { return ''; });
        Object.keys(it.op.cells).forEach(function (k) {
          const c = colOf(headers, k);
          if (c >= 0) arr[c] = toCellValue(it.op.cells[k], tz);
        });
        const put = function (h, v) { const c = colOf(headers, h); if (c >= 0) arr[c] = v; };
        const carry = it.carry || {};
        put('ID', it.op.id);
        put('Dibuat_Oleh', carry.Dibuat_Oleh !== undefined ? carry.Dibuat_Oleh : user.email);
        put('Dibuat_Pada', carry.Dibuat_Pada ? carry.Dibuat_Pada : now);
        put('Diubah_Oleh', user.email);
        put('Diubah_Pada', now);
        put('Dihapus', false);
        if (carry.Seri_ID && colOf(headers, 'Seri_ID') >= 0 && !arr[colOf(headers, 'Seri_ID')]) put('Seri_ID', carry.Seri_ID);
        if (carry.Sumber && colOf(headers, 'Sumber') >= 0 && !arr[colOf(headers, 'Sumber')]) put('Sumber', carry.Sumber);
        if (statusOf(it.op.cells) === true) {
          put('Selesai_Oleh', carry.Selesai_Oleh || user.email);
          put('Selesai_Pada', carry.Selesai_Pada || now);
        }
        return arr;
      });
      const start = lastDataRow(sh, tz) + 1;
      ensureRows(sh, start + rows.length - 1);
      sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
      headers.forEach(function (h, c) {
        if (rows.some(function (r) { return r[c] instanceof Date; })) {
          sh.getRange(start, c + 1, rows.length, 1).setNumberFormat(STAMP_COLS.indexOf(norm(h)) >= 0 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
        }
      });
      items.forEach(function (it) {
        logs.push([now, user.email, it.aksi, tab, it.op.id, it.op.label || '', it.aksi === 'pindah' ? 'Kategori: ' + it.from + ' → ' + tab : '']);
        touched[it.op.id] = true;
      });
    });

    if (logs.length) appendRows(ss.getSheetByName('_Riwayat'), logs, tz, true);

    // 4) Kirim kembali baris yang berubah agar kalender memakai data terbaru
    index = buildIndex(ss, tz);
    const rowsOut = [];
    const tabsOut = {};
    Object.keys(touched).forEach(function (id) {
      const x = index.byId[id];
      if (!x) return;
      rowsOut.push({ tab: x.tab, id: id, n: x.n, cells: x.cells, rev: x.rev });
      tabsOut[x.tab] = index.headers[x.tab];
    });
    return { ok: true, rows: rowsOut, tabs: tabsOut, deleted: deleted };
  });
}

function checkPermission(user, ex, op) {
  if (user.role === 'Admin') return;
  const oc = colOf(ex.headers, 'Dibuat_Oleh');
  const owner = String(oc >= 0 ? ex.cells[oc] : '').trim().toLowerCase() || user.ctx.owner;
  if (owner === user.email) return;
  if (op.type === 'upsert' && op.tab === ex.tab && user.ctx.settings.kontributor_boleh_centang) {
    // Status Lunas/Selesai dan bukti bayar boleh diisi untuk jadwal milik orang lain
    const keys = Object.keys(op.cells || {});
    const allowed = function (k) { return STATUS_ALIASES.indexOf(norm(k)) >= 0 || PROOF_ALIASES.indexOf(norm(k)) >= 0; };
    if (keys.length && keys.every(allowed)) return;
  }
  fail('forbidden', 'Anda hanya dapat mengubah atau menghapus jadwal yang Anda buat sendiri.');
}

function conflict(ex, op) {
  const c = colOf(ex.headers, 'Diubah_Oleh');
  const who = c >= 0 && ex.cells[c] ? ' oleh ' + ex.cells[c] : '';
  fail('conflict', '"' + (op.label || 'Jadwal ini') + '" baru saja diubah' + who + '. Data dimuat ulang, silakan ulangi perubahan Anda.');
}

function stamp(sh, n, headers, email, now) {
  const tz = '';
  setCell(sh, n, headers, 'Diubah_Oleh', email, tz);
  setCell(sh, n, headers, 'Diubah_Pada', now, tz);
}

function stampStatus(sh, n, done, email, now, tz) {
  addHeaders(sh, ['Selesai_Oleh', 'Selesai_Pada'], true);
  const headers = headerRow(sh);
  setCell(sh, n, headers, 'Selesai_Oleh', done ? email : '', tz);
  setCell(sh, n, headers, 'Selesai_Pada', done ? now : '', tz);
}

function setCell(sh, n, headers, name, value) {
  const c = colOf(headers, name);
  if (c < 0) return;
  writeCell(sh, n, c, value, headers[c]);
}

function writeCell(sh, n, c, value, header) {
  const rng = sh.getRange(n, c + 1);
  rng.setValue(value);
  if (value instanceof Date) rng.setNumberFormat(STAMP_COLS.indexOf(norm(header)) >= 0 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
}

function statusOf(cells) {
  let out = null;
  Object.keys(cells || {}).forEach(function (k) {
    if (STATUS_ALIASES.indexOf(norm(k)) < 0) return;
    const v = cells[k];
    out = v && typeof v === 'object' ? v.b === true : /^(true|ya|yes|1|lunas|selesai)$/i.test(String(v));
  });
  return out;
}

/* =============================================================
   KATEGORI (TAB)
   ============================================================= */
function category(user, body) {
  const op = String(body.op || '');
  const name = String(body.name || '').trim();
  const jenis = body.jenis === 'pembayaran' ? 'pembayaran' : 'agenda';
  const warna = ALL_COLORS.indexOf(String(body.warna)) >= 0 ? String(body.warna) : 'slate';
  return withLock(function () {
    const ss = user.ctx.ss;
    const tz = user.ctx.tz;
    const now = new Date();
    const exists = function (n) { return categorySheets(ss).some(function (sh) { return normName(sh.getName()) === normName(n); }); };
    if (op === 'create') {
      if (user.role === 'Pembaca') fail('forbidden', 'Peran Pembaca tidak dapat membuat kategori.');
      validateName(name);
      if (exists(name)) fail('invalid', 'Kategori "' + name + '" sudah ada.');
      createCategorySheet(ss, name, jenis === 'pembayaran' ? 'pembayaran' : 'agenda');
      upsertKategori(ss, name, { Jenis: jenis, Warna: warna, Tampilkan: true }, tz);
      appendRows(ss.getSheetByName('_Riwayat'), [[now, user.email, 'kategori_baru', name, '', name, '']], tz, true);
      return { ok: true, tab: name };
    }
    if (user.role !== 'Admin') fail('forbidden', 'Hanya Admin yang dapat mengubah atau menyembunyikan kategori.');
    const tab = String(body.tab || '');
    const sh = ss.getSheetByName(tab);
    if (!sh || tab.charAt(0) === '_') fail('invalid', 'Tab kategori "' + tab + '" tidak ditemukan.');
    if (op === 'update') {
      validateName(name);
      if (normName(name) !== normName(tab) && exists(name)) fail('invalid', 'Kategori "' + name + '" sudah ada.');
      if (name !== tab) sh.setName(name);
      upsertKategori(ss, tab, { Nama_Tab: name, Jenis: jenis, Warna: warna }, tz);
      appendRows(ss.getSheetByName('_Riwayat'), [[now, user.email, 'kategori_ubah', name, '', name, tab !== name ? 'Nama: ' + tab + ' → ' + name : '']], tz, true);
      return { ok: true, tab: name };
    }
    if (op === 'hide') {
      upsertKategori(ss, tab, { Tampilkan: false }, tz);
      appendRows(ss.getSheetByName('_Riwayat'), [[now, user.email, 'kategori_sembunyi', tab, '', tab, '']], tz, true);
      return { ok: true };
    }
    fail('invalid', 'Aksi kategori tidak dikenal.');
  });
}

function validateName(name) {
  if (!name) fail('invalid', 'Nama kategori wajib diisi.');
  if (name.charAt(0) === '_') fail('invalid', 'Nama kategori tidak boleh diawali garis bawah.');
  if (/[\[\]\*\?\/\\:]/.test(name)) fail('invalid', 'Nama kategori tidak boleh berisi tanda : \\ / ? * [ ]');
  if (name.length > 60) fail('invalid', 'Nama kategori maksimal 60 karakter.');
}

function createCategorySheet(ss, name, template) {
  const sh = ss.insertSheet(name);
  writeHeaderRow(sh, (TEMPLATES[template] || TEMPLATES.agenda).concat(BASE_SYS));
  return sh;
}

function upsertKategori(ss, tabName, fields, tz) {
  const sh = ensureSheet(ss, '_Kategori', SYS_TABS._Kategori);
  addHeaders(sh, SYS_TABS._Kategori, true);
  const headers = headerRow(sh);
  const t = readSheet(sh, tz);
  const ni = colOf(headers, 'Nama_Tab');
  let n = -1;
  t.values.forEach(function (r, i) { if (n < 0 && normName(r[ni]) === normName(tabName)) n = i + 2; });
  if (n < 0) {
    const b = BUILTIN[normName(tabName)];
    appendRows(sh, [[tabName, b ? b.jenis : 'agenda', b ? b.warna : 'slate', true]], tz);
    n = lastDataRow(sh, tz);
  }
  Object.keys(fields).forEach(function (k) { setCell(sh, n, headers, k, fields[k]); });
}

/* =============================================================
   CABANG (tab _Cabang)
   ============================================================= */
function branch(user, body) {
  if (user.role !== 'Admin') fail('forbidden', 'Hanya Admin yang dapat menambah atau mengubah cabang.');
  const op = String(body.op || '');
  return withLock(function () {
    const ss = user.ctx.ss;
    const tz = user.ctx.tz;
    const now = new Date();
    const sh = ensureSheet(ss, '_Cabang', SYS_TABS._Cabang);
    addHeaders(sh, SYS_TABS._Cabang, true);
    const headers = headerRow(sh);
    const list = readBranches(ss, tz);
    const find = function (n) { return list.filter(function (b) { return normName(b.nama) === normName(n); })[0] || null; };
    const log = function (aksi, nama, detail) { appendRows(ss.getSheetByName('_Riwayat'), [[now, user.email, aksi, '_Cabang', '', nama, detail || '']], tz, true); };
    const entitas = String(body.entitas == null ? '' : body.entitas).trim().slice(0, 60);

    if (op === 'create') {
      const nama = validateBranchName(body.nama);
      if (find(nama)) fail('invalid', 'Cabang "' + nama + '" sudah ada di daftar.');
      const row = headers.map(function () { return ''; });
      row[colOf(headers, 'Nama_Cabang')] = nama;
      row[colOf(headers, 'Entitas')] = entitas;
      row[colOf(headers, 'Aktif')] = true;
      appendRows(sh, [row], tz);
      log('cabang_baru', nama, entitas ? 'Entitas: ' + entitas : '');
      return { ok: true, nama: nama };
    }

    if (op === 'update') {
      const b = find(body.nama);
      if (!b) fail('invalid', 'Cabang "' + body.nama + '" tidak ditemukan. Muat ulang data lalu coba lagi.');
      const namaBaru = validateBranchName(body.namaBaru == null ? b.nama : body.namaBaru);
      const other = find(namaBaru);
      if (other && other.n !== b.n) fail('invalid', 'Cabang "' + namaBaru + '" sudah ada di daftar.');
      const aktif = body.aktif === undefined ? b.aktif : Boolean(body.aktif);
      const changes = [];
      if (namaBaru !== b.nama) { setCell(sh, b.n, headers, 'Nama_Cabang', namaBaru); changes.push('Nama: ' + b.nama + ' → ' + namaBaru); }
      if (entitas !== b.entitas) { setCell(sh, b.n, headers, 'Entitas', entitas); changes.push('Entitas: ' + short(b.entitas) + ' → ' + short(entitas)); }
      if (aktif !== b.aktif) { setCell(sh, b.n, headers, 'Aktif', aktif); changes.push(aktif ? 'Diaktifkan' : 'Dinonaktifkan'); }
      let renamed = 0;
      if (namaBaru !== b.nama) renamed = renameBranchInData(ss, tz, b.nama, namaBaru, user.email, now);
      if (renamed) changes.push(renamed + ' jadwal ikut diperbarui');
      if (changes.length) {
        const aksi = namaBaru !== b.nama || entitas !== b.entitas ? 'cabang_ubah' : (aktif ? 'cabang_aktif' : 'cabang_nonaktif');
        log(aksi, namaBaru, changes.join('; '));
      }
      return { ok: true, nama: namaBaru, renamed: renamed };
    }
    fail('invalid', 'Aksi cabang tidak dikenal.');
  });
}

function validateBranchName(v) {
  const nama = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  if (!nama) fail('invalid', 'Nama cabang wajib diisi.');
  if (nama.length > 60) fail('invalid', 'Nama cabang maksimal 60 karakter.');
  if (/^[=+\-@]/.test(nama)) fail('invalid', 'Nama cabang tidak boleh diawali tanda = + - @');
  return nama;
}

/* Ganti nama cabang di semua tab kategori; mengembalikan jumlah baris yang berubah */
function renameBranchInData(ss, tz, oldName, newName, email, now) {
  let count = 0;
  categorySheets(ss).forEach(function (sh) {
    const t = readSheet(sh, tz);
    const ci = findCol(t.headers, FIELD_ALIASES.cabang);
    if (ci < 0 || !t.values.length) return;
    const hit = [];
    t.values.forEach(function (r, i) { if (normName(r[ci]) === normName(oldName)) hit.push(i + 2); });
    if (!hit.length) return;
    addHeaders(sh, BASE_SYS, true);
    const headers = headerRow(sh);
    hit.forEach(function (n) {
      sh.getRange(n, ci + 1).setValue(newName);
      stamp(sh, n, headers, email, now);
    });
    count += hit.length;
  });
  return count;
}

/* =============================================================
   PENGATURAN PENGINGAT & EMAIL
   ============================================================= */
function saveSettings(user, input) {
  if (user.role !== 'Admin') fail('forbidden', 'Hanya Admin yang dapat mengubah pengaturan.');
  const s = input || {};
  const out = {};
  if (s.hari_pengingat !== undefined) {
    const v = Math.round(Number(s.hari_pengingat));
    if (!(v >= 1 && v <= 365)) fail('invalid', 'Hari pengingat harus antara 1 dan 365.');
    out.hari_pengingat = v;
  }
  if (s.hari_pengingat_sewa !== undefined) {
    const v = Math.round(Number(s.hari_pengingat_sewa));
    if (!(v >= 1 && v <= 365)) fail('invalid', 'Pengingat awal sewa harus antara 1 dan 365 hari.');
    out.hari_pengingat_sewa = v;
  }
  if (s.email_pengingat !== undefined) out.email_pengingat = Boolean(s.email_pengingat);
  if (s.email_penerima !== undefined) {
    const bad = String(s.email_penerima || '').split(/[\s,;]+/).filter(function (x) { return x && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (bad.length) fail('invalid', 'Alamat email penerima tidak valid: ' + bad.slice(0, 3).join(', ') + '. Pisahkan beberapa alamat dengan koma.');
    out.email_penerima = parseEmails(s.email_penerima).join(', ');
  }
  if (s.jam_email !== undefined) {
    const v = Math.round(Number(s.jam_email));
    if (!(v >= 0 && v <= 23)) fail('invalid', 'Jam kirim email harus antara 0 dan 23.');
    out.jam_email = v;
  }
  const result = withLock(function () {
    const ss = user.ctx.ss;
    const tz = user.ctx.tz;
    ensureSettingRows(ss, tz);
    const sh = ss.getSheetByName('_Pengaturan');
    const t = readSheet(sh, tz);
    const ki = findCol(t.headers, ['kunci', 'key']);
    const vi = findCol(t.headers, ['nilai', 'value']);
    const changes = [];
    Object.keys(out).forEach(function (k) {
      t.values.forEach(function (r, i) {
        if (String(r[ki]).trim() !== k) return;
        if (valueText(r[vi], tz) === valueText(out[k], tz)) return;
        sh.getRange(i + 2, vi + 1).setValue(out[k]);
        changes.push(k + ': ' + short(valueText(r[vi], tz)) + ' → ' + short(valueText(out[k], tz)));
      });
    });
    if (changes.length) appendRows(ss.getSheetByName('_Riwayat'), [[new Date(), user.email, 'pengaturan', '_Pengaturan', '', 'Pengaturan pengingat', changes.join('; ')]], tz, true);
    return changes.length;
  });
  const ctx = context();
  let trigger = '';
  try {
    trigger = installReminderTrigger(ctx);
  } catch (err) {
    fail('server', 'Pengaturan tersimpan, tetapi jadwal email belum bisa dipasang: ' + String((err && err.message) || err)
      + '. Buka editor Apps Script, jalankan fungsi siapkanSheet sekali, lalu izinkan aksesnya.');
  }
  return { ok: true, changed: result, trigger: trigger };
}

/* Memasang / memperbarui / mematikan pemicu harian sesuai pengaturan */
function installReminderTrigger(ctx) {
  const st = ctx.settings;
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'kirimPengingatHarian') ScriptApp.deleteTrigger(tr);
  });
  if (!st.email_pengingat) return 'Email pengingat harian nonaktif.';
  ScriptApp.newTrigger('kirimPengingatHarian').timeBased().atHour(st.jam_email).everyDays(1).inTimezone(ctx.tz).create();
  return 'Email pengingat dikirim setiap hari sekitar pukul ' + ('0' + st.jam_email).slice(-2) + '.00 ke ' + recipientsOf(ctx).join(', ') + '.';
}

function recipientsOf(ctx) {
  const list = parseEmails(ctx.settings.email_penerima);
  return list.length ? list : [ctx.owner];
}

/* Dijalankan oleh pemicu harian */
function kirimPengingatHarian() {
  const ctx = context();
  if (!ctx.settings.email_pengingat) return 'Email pengingat nonaktif.';
  try { syncProofFolderAccess(ctx); } catch (err) { /* akses folder bukti tidak menghalangi email */ }
  const digest = buildDigest(ctx, new Date());
  if (!digest.total) return 'Tidak ada jadwal yang perlu diingatkan hari ini.';
  const to = recipientsOf(ctx);
  MailApp.sendEmail({ to: to.join(','), subject: digest.subject, htmlBody: digest.html, body: digest.text, name: 'Kalender WM Center' });
  return 'Email terkirim ke ' + to.join(', ') + '.';
}

function testEmail(user) {
  if (user.role !== 'Admin') fail('forbidden', 'Hanya Admin yang dapat mengirim email uji.');
  const ctx = user.ctx;
  const digest = buildDigest(ctx, new Date());
  const subject = '[Uji] ' + digest.subject;
  const note = '<p style="margin:0 0 16px;padding:10px 12px;border-radius:10px;background:#E3EBFB;color:#1F4396;font-size:13px">'
    + 'Ini email uji dari Kalender. Email harian yang sebenarnya dikirim ke: ' + esc(recipientsOf(ctx).join(', '))
    + (ctx.settings.email_pengingat ? ', setiap hari sekitar pukul ' + ('0' + ctx.settings.jam_email).slice(-2) + '.00.' : ' (email harian saat ini nonaktif).') + '</p>';
  const html = digest.total ? digest.html.replace('<!--NOTE-->', note) : digest.emptyHtml.replace('<!--NOTE-->', note);
  MailApp.sendEmail({ to: user.email, subject: subject, htmlBody: html, body: digest.text, name: 'Kalender WM Center' });
  return { ok: true, sentTo: user.email, count: digest.total };
}

/* Menyusun isi email: terlambat, hari ini, 7 hari ke depan, dan pengingat awal (H-14/H-30, sewa H-60/H-90) */
function buildDigest(ctx, now) {
  const ss = ctx.ss;
  const tz = ctx.tz;
  const st = ctx.settings;
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const today = isoDays(todayStr);
  const sewaDays = st.hari_pengingat_sewa;
  const early = [14, 30];
  const earlySewa = [sewaDays, 60, 30, 14].filter(function (d, i, a) { return d > 7 && a.indexOf(d) === i; });

  const kat = readSheet(ss.getSheetByName('_Kategori'), tz);
  const kni = findCol(kat.headers, ['nama_tab', 'nama', 'tab']);
  const kji = findCol(kat.headers, ['jenis']);
  const kti = findCol(kat.headers, ['tampilkan', 'tampil', 'aktif']);
  const meta = {};
  kat.values.forEach(function (r) {
    if (kni < 0) return;
    meta[normName(r[kni])] = { jenis: kji >= 0 ? String(r[kji]).trim().toLowerCase() : '', tampil: kti >= 0 ? toBool(r[kti], true) : true };
  });

  const items = [];
  categorySheets(ss).forEach(function (sh) {
    const name = sh.getName();
    const m = meta[normName(name)] || {};
    if (m.tampil === false) return;
    const t = readSheet(sh, tz);
    const H = function (aliases) { return findCol(t.headers, aliases); };
    const ti = H(FIELD_ALIASES.tanggal);
    if (ti < 0) return;
    const ji = H(FIELD_ALIASES.judul);
    const ci = H(FIELD_ALIASES.cabang);
    const ui = H(FIELD_ALIASES.unit);
    const pi = H(FIELD_ALIASES.tahap);
    const hi = H(FIELD_ALIASES.jam);
    const ni = H(NOMINAL_ALIASES);
    const si = H(STATUS_ALIASES);
    const di = colOf(t.headers, 'Dihapus');
    const isSewa = normName(name) === 'pembayaran sewa kantor';
    const b = BUILTIN[normName(name)];
    const payment = (m.jenis || (b && b.jenis) || (ni >= 0 ? 'pembayaran' : 'agenda')) === 'pembayaran';
    t.values.forEach(function (r, i) {
      const cells = rowCells(t, i, tz);
      if (isBlankRow(cells, t.headers)) return;
      if (di >= 0 && toBool(r[di], false)) return;
      if (si >= 0 && isDoneValue(r[si])) return;
      const iso = dateIso(r[ti], cells[ti], tz);
      if (!iso) return;
      const d = isoDays(iso) - today;
      const milestone = (isSewa ? earlySewa : early).indexOf(d) >= 0;
      if (!(d <= 7 || milestone)) return;
      const cabang = ci >= 0 ? cells[ci] : '';
      const unit = ui >= 0 ? cells[ui] : '';
      const tahap = pi >= 0 ? cells[pi] : '';
      let judul = ji >= 0 ? cells[ji] : '';
      if (!judul) {
        const loc = [cabang, unit].filter(String).join(' ');
        judul = loc ? (isSewa ? 'Sewa ' : '') + loc : '';
        if (tahap) judul = (judul || name) + ' – ' + tahap;
      }
      if (!judul) judul = name + ' (baris ' + (i + 2) + ')';
      items.push({
        d: d, iso: iso, judul: judul, kategori: name, payment: payment,
        nominal: ni >= 0 ? amountOf(r[ni]) : 0, jam: hi >= 0 ? String(cells[hi] || '').slice(0, 5) : '',
      });
    });
  });
  items.sort(function (a, b) { return a.d - b.d || a.judul.localeCompare(b.judul); });

  const groups = [
    { key: 'late', title: 'Terlambat', color: '#B83A31', bg: '#FBE3E0', list: items.filter(function (x) { return x.d < 0; }) },
    { key: 'today', title: 'Hari ini', color: '#A3570A', bg: '#FDEBD3', list: items.filter(function (x) { return x.d === 0; }) },
    { key: 'week', title: '7 hari ke depan', color: '#7C5E00', bg: '#FBF0C9', list: items.filter(function (x) { return x.d >= 1 && x.d <= 7; }) },
    { key: 'early', title: 'Pengingat awal', color: '#4F5868', bg: '#EDF0F5', list: items.filter(function (x) { return x.d > 7; }) },
  ];
  const total = items.length;
  const fmtDay = function (iso) {
    const p = iso.split('-');
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return HARI[dt.getDay()] + ', ' + Number(p[2]) + ' ' + BULAN[Number(p[1]) - 1] + ' ' + p[0];
  };
  const rel = function (d) { return d === 0 ? 'Hari-H' : (d > 0 ? 'H-' + d : 'Terlambat ' + (-d) + ' hari'); };
  const sum = function (list) { return list.reduce(function (s, x) { return s + (x.payment ? x.nominal : 0); }, 0); };

  const parts = [];
  if (groups[1].list.length) parts.push(groups[1].list.length + ' jatuh tempo hari ini');
  if (groups[0].list.length) parts.push(groups[0].list.length + ' terlambat');
  if (groups[2].list.length) parts.push(groups[2].list.length + ' dalam 7 hari');
  if (!parts.length && groups[3].list.length) parts.push(groups[3].list.length + ' pengingat awal');
  const subject = 'Pengingat jadwal: ' + (parts.join(', ') || 'tidak ada jadwal') + ' (' + fmtDay(todayStr) + ')';

  const wrapStart = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1E2430;max-width:680px;margin:0 auto">'
    + '<h2 style="margin:0 0 4px;font-size:20px">Pengingat jadwal kalender</h2>'
    + '<p style="margin:0 0 16px;color:#626A79;font-size:13px">' + esc(fmtDay(todayStr)) + '</p><!--NOTE-->';
  const wrapEnd = '<p style="margin:24px 0 8px"><a href="' + esc(CONFIG.CALENDAR_URL) + '" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#3561C9;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:14px">Buka kalender</a></p>'
    + '<p style="margin:16px 0 0;color:#9AA1AE;font-size:11.5px">Email otomatis dari Kalender WM Center. Ubah penerima atau jam kirim lewat Pengaturan pengingat di kalender (khusus Admin).</p></div>';

  let html = wrapStart;
  let text = subject + '\n';
  groups.forEach(function (g) {
    if (!g.list.length) return;
    const tot = sum(g.list);
    html += '<h3 style="margin:20px 0 8px;font-size:15px;color:' + g.color + '">' + g.title + ' (' + g.list.length + ')'
      + (tot ? ' <span style="color:#626A79;font-weight:normal">· ' + idr(tot) + '</span>' : '') + '</h3>'
      + '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">';
    text += '\n' + g.title + ' (' + g.list.length + ')\n';
    g.list.slice(0, 50).forEach(function (x) {
      html += '<tr>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #EDF0F5;white-space:nowrap;color:#626A79">' + esc(fmtDay(x.iso)) + (x.jam ? ', ' + esc(x.jam) : '') + '</td>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #EDF0F5"><strong>' + esc(x.judul) + '</strong><br><span style="color:#9AA1AE;font-size:12px">' + esc(x.kategori) + '</span></td>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #EDF0F5;text-align:right;white-space:nowrap">' + (x.payment && x.nominal ? idr(x.nominal) : '') + '</td>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #EDF0F5;text-align:right;white-space:nowrap"><span style="padding:2px 8px;border-radius:999px;background:' + g.bg + ';color:' + g.color + ';font-size:11.5px;font-weight:bold">' + rel(x.d) + '</span></td>'
        + '</tr>';
      text += '- ' + fmtDay(x.iso) + ' · ' + x.judul + (x.payment && x.nominal ? ' · ' + idr(x.nominal) : '') + ' · ' + rel(x.d) + '\n';
    });
    if (g.list.length > 50) html += '<tr><td colspan="4" style="padding:8px 10px;color:#626A79">dan ' + (g.list.length - 50) + ' jadwal lainnya…</td></tr>';
    html += '</table>';
  });
  html += wrapEnd;
  text += '\nBuka kalender: ' + CONFIG.CALENDAR_URL + '\n';
  const emptyHtml = wrapStart + '<p style="padding:14px;border-radius:12px;background:#DFEDE0;color:#3A6344">Tidak ada jadwal yang terlambat, jatuh tempo hari ini, atau dalam 7 hari ke depan. Email harian hanya dikirim bila ada jadwal yang perlu diingatkan.</p>' + wrapEnd;
  return { total: total, subject: subject, html: html, text: text, emptyHtml: emptyHtml, groups: groups };
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_LOOKUP = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, pebruari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, nop: 11, nopember: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12 };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function idr(n) { return 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function isoDays(iso) { const p = iso.split('-'); return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000); }

/* Tanggal sel -> yyyy-MM-dd (Date, 15/01/2026, 2026-01-15, 15 Okt 2026, dengan atau tanpa jam) */
function dateIso(v, text, tz) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(text || v || '').trim().replace(/^[a-z]+,\s*/i, '').replace(/[T\s]+\d{1,2}[:.]\d{2}(?::\d{2})?\s*(wib|wita|wit)?$/i, '').trim();
  let y; let mo; let d; let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.\s]+(\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = s.match(/^(\d{1,2})[\s-]+([a-z]+)\.?[\s-]+(\d{4})$/i))) { d = +m[1]; mo = BULAN_LOOKUP[m[2].toLowerCase()]; y = +m[3]; }
  else return '';
  if (!mo) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

/* Nominal sel -> angka (134000000, "134,000,000", "Rp 4.750.000,00") */
function amountOf(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).toLowerCase().replace(/rp\.?|idr|\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return 0;
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (last >= 0 && s.length - last - 1 !== 3) s = s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1);
  else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function isDoneValue(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s || /^(belum|tidak|no|false|0|pending|open|todo)/.test(s)) return false;
  return /(selesai|lunas|done|sudah|paid|complete|ya|yes|true|1)/.test(s);
}

/* =============================================================
   BUKTI BAYAR (file disimpan di Google Drive pemilik spreadsheet)
   ============================================================= */
const PROOF_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

function uploadProof(user, body) {
  if (user.role === 'Pembaca') fail('forbidden', 'Peran Pembaca tidak dapat mengunggah bukti bayar.');
  const mime = String(body.mime || '').toLowerCase();
  if (!PROOF_TYPES[mime]) fail('invalid', 'Format file belum didukung. Gunakan PDF, JPG, PNG, atau WEBP.');
  const data = String(body.data || '').replace(/^data:[^,]*,/, '');
  if (!data) fail('invalid', 'File kosong.');
  const bytes = Utilities.base64Decode(data);
  if (!bytes.length) fail('invalid', 'File kosong.');
  if (bytes.length > CONFIG.BUKTI_MAX_MB * 1024 * 1024) fail('invalid', 'Ukuran file maksimal ' + CONFIG.BUKTI_MAX_MB + ' MB.');
  const ctx = user.ctx;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(body.tanggal || '')) ? String(body.tanggal) : Utilities.formatDate(new Date(), ctx.tz, 'yyyy-MM-dd');
  const label = String(body.label || 'Bukti bayar').replace(/[\\/:*?"<>|#%\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const orig = String(body.name || ('bukti.' + PROOF_TYPES[mime])).replace(/[\\/:*?"<>|#%\r\n]+/g, ' ').trim().slice(0, 80);
  const fileName = iso + ' - ' + label + ' - ' + orig;
  // Folder dibuat di dalam kunci agar tidak tercipta ganda; file diunggah di luar kunci
  const folders = withLock(function () {
    const root = proofFolder(ctx);
    const year = iso.slice(0, 4);
    const subs = root.getFoldersByName(year);
    return { root: root, year: subs.hasNext() ? subs.next() : root.createFolder(year) };
  });
  const file = folders.year.createFile(Utilities.newBlob(bytes, mime, fileName));
  file.setDescription('Diunggah oleh ' + user.email + ' dari Kalender untuk: ' + label);
  try { syncProofFolderAccess(ctx, folders.root); } catch (err) { /* akses folder bukan syarat unggah */ }
  return { ok: true, url: file.getUrl(), name: file.getName(), id: file.getId() };
}

function proofFolder(ctx) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('bukti_folder_id');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* folder dihapus atau tidak bisa dibuka: buat baru */ }
  }
  let parent = null;
  try {
    const parents = DriveApp.getFileById(ctx.ss.getId()).getParents();
    if (parents.hasNext()) parent = parents.next();
  } catch (err) { parent = null; }
  const folder = parent ? parent.createFolder(CONFIG.BUKTI_FOLDER) : DriveApp.createFolder(CONFIG.BUKTI_FOLDER);
  folder.setDescription('Bukti bayar yang diunggah dari Kalender. Akses lihat diberikan otomatis ke pengguna aktif di tab _Pengguna.');
  props.setProperty('bukti_folder_id', folder.getId());
  return folder;
}

/* Pengguna aktif di _Pengguna mendapat akses lihat ke folder bukti bayar */
function syncProofFolderAccess(ctx, folder) {
  const props = PropertiesService.getScriptProperties();
  if (!folder) {
    const id = props.getProperty('bukti_folder_id');
    if (!id) return 0;
    folder = DriveApp.getFolderById(id);
  }
  const have = {};
  folder.getViewers().concat(folder.getEditors()).forEach(function (u) { have[String(u.getEmail()).toLowerCase()] = true; });
  have[ctx.owner] = true;
  let added = 0;
  ctx.users.forEach(function (u) {
    if (!u.active || have[u.email]) return;
    try { folder.addViewer(u.email); added++; } catch (err) { /* email bukan akun Google: lewati */ }
  });
  const dom = String(ctx.settings.domain_kantor || '').replace(/^@/, '').trim();
  if (String(ctx.settings.mode_akses).toLowerCase() === 'domain' && dom) {
    try { folder.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW); } catch (err) { /* bukan akun Workspace */ }
  }
  return added;
}

/* =============================================================
   CATATAN SISTEM (dikirim kalender milik Admin)
   ============================================================= */
function notes(user, list) {
  if (user.role !== 'Admin') return { ok: true };
  if (!Array.isArray(list) || !list.length) return { ok: true };
  return withLock(function () {
    const ss = user.ctx.ss;
    const tz = user.ctx.tz;
    const byTab = {};
    list.slice(0, 500).forEach(function (x) { if (x && x.tab && x.id) (byTab[x.tab] = byTab[x.tab] || []).push(x); });
    Object.keys(byTab).forEach(function (tab) {
      const sh = ss.getSheetByName(tab);
      if (!sh || tab.charAt(0) === '_') return;
      const hasNote = byTab[tab].some(function (x) { return x.note; });
      let headers = headerRow(sh);
      if (colOf(headers, 'Catatan_Sistem') < 0) {
        if (!hasNote) return;
        addHeaders(sh, ['Catatan_Sistem'], true);
        headers = headerRow(sh);
      }
      const t = readSheet(sh, tz);
      const idc = colOf(t.headers, 'ID');
      const nc = colOf(t.headers, 'Catatan_Sistem');
      const rowOf = {};
      t.values.forEach(function (r, i) { const id = String(r[idc]).trim(); if (id) rowOf[id] = i + 2; });
      byTab[tab].forEach(function (x) {
        if (rowOf[x.id]) sh.getRange(rowOf[x.id], nc + 1).setValue(String(x.note || '').slice(0, 300));
      });
    });
    return { ok: true };
  });
}

/* =============================================================
   UTILITAS SHEET
   ============================================================= */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function categorySheets(ss) {
  return ss.getSheets().filter(function (sh) { return sh.getName().charAt(0) !== '_'; });
}

function templateOf(name, jenis) {
  const b = BUILTIN[normName(name)];
  if (b) return b.template;
  return jenis === 'pembayaran' ? 'pembayaran' : 'agenda';
}

function ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastColumn() < 1 || !String(sh.getRange(1, 1).getValue()).trim()) writeHeaderRow(sh, headers);
  return sh;
}

function writeHeaderRow(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  headers.forEach(function (h, i) {
    sh.getRange(1, i + 1).setBackground(isSysHeader(h) ? '#E5E8ED' : (STATUS_ALIASES.indexOf(norm(h)) >= 0 ? '#DFEDE0' : '#DCE8FC'));
  });
  sh.setFrozenRows(1);
}

function headerRow(sh) {
  const lc = sh.getLastColumn();
  if (lc < 1) return [];
  return sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
}

/* Menambah kolom yang belum ada. Kolom data disisipkan sebelum kolom sistem; kolom sistem di ujung kanan. */
function addHeaders(sh, names, asSystem) {
  (names || []).forEach(function (name) {
    if (!name) return;
    const headers = headerRow(sh);
    if (colOf(headers, name) >= 0) return;
    let used = headers.length;
    while (used > 0 && !headers[used - 1]) used--;
    let col = used + 1;
    if (!asSystem) {
      for (let i = 0; i < used; i++) {
        if (isSysHeader(headers[i])) {
          sh.insertColumnBefore(i + 1);
          col = i + 1;
          break;
        }
      }
    }
    const rng = sh.getRange(1, col);
    rng.setValue(name).setFontWeight('bold');
    rng.setBackground(asSystem ? '#E5E8ED' : (STATUS_ALIASES.indexOf(norm(name)) >= 0 ? '#DFEDE0' : '#DCE8FC'));
  });
}

function readSheet(sh, tz) {
  if (!sh) return { headers: [], values: [], display: [] };
  const lr = sh.getLastRow();
  const lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return { headers: [], values: [], display: [] };
  const rng = sh.getRange(1, 1, lr, lc);
  const values = rng.getValues();
  const display = rng.getDisplayValues();
  return { headers: values[0].map(function (h) { return String(h).trim(); }), values: values.slice(1), display: display.slice(1) };
}

function readRowCells(sh, n, width, tz) {
  if (width < 1) return [];
  const rng = sh.getRange(n, 1, 1, width);
  const v = rng.getValues()[0];
  const d = rng.getDisplayValues()[0];
  return v.map(function (x, i) { return cellText(x, d[i], tz); });
}

function rowCells(t, i, tz) {
  return t.values[i].map(function (v, c) { return cellText(v, t.display[i][c], tz); });
}

function cellText(v, display, tz) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    if (Utilities.formatDate(v, tz, 'yyyy') < '1901') {
      // Sel jam saja: pakai teks tampilan agar tidak bergeser karena zona waktu historis
      const m = String(display || '').match(/(\d{1,2})[:.](\d{2})/);
      return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : Utilities.formatDate(v, tz, 'HH:mm');
    }
    const hms = Utilities.formatDate(v, tz, 'HH:mm:ss');
    return hms === '00:00:00' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  return String(v).trim();
}

function valueText(v, tz) {
  if (v instanceof Date) return cellText(v, '', tz || 'Asia/Jakarta');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  return String(v == null ? '' : v).replace(/^'/, '').trim();
}

function toCellValue(v, tz) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (typeof v.d === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(v.d) ? Utilities.parseDate(v.d, tz, 'yyyy-MM-dd') : '';
    if ('b' in v) return v.b === true;
    return '';
  }
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // cegah teks terbaca sebagai rumus
}

function isBlankRow(cells, headers) {
  for (let c = 0; c < cells.length; c++) {
    if (isSysHeader(headers[c] || '')) continue;
    if (cells[c] !== '' && cells[c] !== 'FALSE') return false;
  }
  return true;
}

function lastDataRow(sh, tz) {
  const t = readSheet(sh, tz);
  for (let i = t.values.length - 1; i >= 0; i--) {
    if (t.values[i].some(function (v) { return v !== '' && v !== false && v !== null; })) return i + 2;
  }
  return 1;
}

function ensureRows(sh, lastNeeded) {
  const max = sh.getMaxRows();
  if (lastNeeded > max) sh.insertRowsAfter(max, lastNeeded - max);
}

function appendRows(sh, rows, tz, isLog) {
  if (!sh || !rows.length) return;
  const start = lastDataRow(sh, tz) + 1;
  ensureRows(sh, start + rows.length - 1);
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  if (isLog) sh.getRange(start, 1, rows.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
}

function buildIndex(ss, tz) {
  const byId = {};
  const headers = {};
  categorySheets(ss).forEach(function (sh) {
    const name = sh.getName();
    const t = readSheet(sh, tz);
    headers[name] = t.headers;
    const idc = colOf(t.headers, 'ID');
    if (idc < 0) return;
    t.values.forEach(function (r, i) {
      const cells = rowCells(t, i, tz);
      const id = cells[idc];
      if (!id || isBlankRow(cells, t.headers)) return;
      byId[id] = { tab: name, id: id, n: i + 2, cells: cells, raw: r, headers: t.headers, rev: rowRev(cells, t.headers) };
    });
  });
  return { byId: byId, headers: headers };
}

function rowRev(cells, headers) {
  const keep = cells.filter(function (c, i) { return REV_EXCLUDE.indexOf(norm(headers[i] || '')) < 0; });
  return digest(JSON.stringify(keep)).slice(0, 12);
}

function digest(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function newId() {
  return 'E' + Utilities.getUuid().replace(/-/g, '').slice(0, 11);
}

function short(s) {
  s = String(s == null ? '' : s);
  if (!s) return '(kosong)';
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}

function toBool(v, def) {
  if (v === true || v === false) return v;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return def;
  return ['true', 'ya', 'yes', '1', 'benar'].indexOf(s) >= 0;
}

function norm(h) {
  return String(h == null ? '' : h).trim().toLowerCase().replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function normName(n) {
  return String(n == null ? '' : n).trim().toLowerCase().replace(/\s+/g, ' ');
}

function isSysHeader(h) {
  return SYS_NORM.indexOf(norm(h)) >= 0;
}

function colOf(headers, name) {
  const n = norm(name);
  for (let i = 0; i < headers.length; i++) if (norm(headers[i]) === n) return i;
  return -1;
}

function findCol(headers, aliases) {
  for (let a = 0; a < aliases.length; a++) {
    const i = colOf(headers, aliases[a]);
    if (i >= 0) return i;
  }
  return -1;
}
