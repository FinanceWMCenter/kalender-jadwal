/* =============================================================
   Calendar — Google Apps Script
   Penghubung Google Sheet <-> aplikasi kalender (GitHub Pages).

   Cara pasang (ringkas, panduan lengkap ada di README):
   1. Buka Google Sheet kalender > Extensions > Apps Script.
   2. Hapus isi Code.gs bawaan, tempel SELURUH isi file ini.
   3. Isi CONFIG.GOOGLE_CLIENT_ID di bawah, lalu klik Save.
   4. Deploy > New deployment > Web app
      Execute as: Me | Who has access: Anyone > Deploy.
   5. Salin URL Web App (berakhiran /exec) ke config.js aplikasi.
   ============================================================= */

const CONFIG = {
  // OAuth Client ID dari Google Cloud Console (berakhiran .apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '174841001822-mvoga9p4jmlmuiar3rfd7suh6vb0uh1e.apps.googleusercontent.com',
  SESSION_DAYS: 30,       // lama login tersimpan di perangkat
  HISTORY_LIMIT: 60,      // jumlah aktivitas terbaru yang dikirim ke kalender
};

/* ---------- Struktur ---------- */
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
const SYS_TABS = {
  _Kategori: ['Nama_Tab', 'Jenis', 'Warna', 'Tampilkan'],
  _Pengguna: ['Email', 'Nama', 'Peran', 'Aktif'],
  _Riwayat: ['Waktu', 'Email', 'Aksi', 'Tab', 'ID', 'Nama_Kegiatan', 'Perubahan'],
  _Pengaturan: ['Kunci', 'Nilai', 'Keterangan'],
};

/* =============================================================
   ENDPOINT
   ============================================================= */
/* Jalankan sekali dari editor Apps Script (pilih siapkanSheet > Run) untuk menyiapkan
   tab-tab di spreadsheet kosong sekaligus memberi izin akses. Aman dijalankan berulang. */
function siapkanSheet() {
  const ctx = context();
  withLock(function () { ensureStructure(ctx); });
  return 'Spreadsheet siap: ' + ctx.ss.getSheets().map(function (sh) { return sh.getName(); }).join(', ');
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
  const out = { mode_akses: 'daftar_email', domain_kantor: '', peran_default_domain: 'Kontributor', kontributor_boleh_centang: true, interval_sinkron_detik: 20, hari_pengingat: 30 };
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

  const tabs = categorySheets(ss).map(function (sh) {
    const t = readSheet(sh, tz);
    const rows = [];
    t.values.forEach(function (r, i) {
      const cells = rowCells(t, i, tz);
      if (isBlankRow(cells, t.headers)) return;
      rows.push({ n: i + 2, cells: cells, rev: rowRev(cells, t.headers) });
    });
    return { name: sh.getName(), headers: t.headers, rows: rows };
  });

  const h = readSheet(ss.getSheetByName('_Riwayat'), tz);
  const col = function (name) { return colOf(h.headers, name); };
  const pick = function (c, name) { const i = col(name); return i >= 0 ? (c[i] || '') : ''; };
  const history = [];
  for (let i = h.values.length - 1; i >= 0 && history.length < CONFIG.HISTORY_LIMIT; i--) {
    const c = rowCells(h, i, tz);
    if (!c.join('')) continue;
    history.push({ waktu: pick(c, 'Waktu'), email: pick(c, 'Email'), aksi: pick(c, 'Aksi'), tab: pick(c, 'Tab'), id: pick(c, 'ID'), judul: pick(c, 'Nama_Kegiatan'), perubahan: pick(c, 'Perubahan') });
  }

  return {
    tz: tz,
    settings: { kontributor_boleh_centang: ctx.settings.kontributor_boleh_centang, interval_sinkron_detik: ctx.settings.interval_sinkron_detik, hari_pengingat: ctx.settings.hari_pengingat },
    categories: categories,
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
    const keys = Object.keys(op.cells || {});
    if (keys.length && keys.every(function (k) { return STATUS_ALIASES.indexOf(norm(k)) >= 0; })) return;
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
