/* =============================================================
   Calendar — config.js
   Kosongkan kedua nilai di bawah untuk memakai kalender tanpa
   Google Sheet (data tersimpan di browser masing-masing).
   Isi keduanya untuk mengaktifkan login Google dan sinkron
   dengan Google Sheet. Panduan lengkap ada di README.md.
   ============================================================= */
window.CALENDAR_CONFIG = {
  // URL Web App dari Apps Script (berakhiran /exec)
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxeYOdIrln80EKPJOLLypocvt_llkja6bmLuEc5xV4B4XP_NfnYlRLphICnUEjY9LMV/exec',

  // OAuth Client ID dari Google Cloud Console (berakhiran .apps.googleusercontent.com)
  googleClientId: '174841001822-mvoga9p4jmlmuiar3rfd7suh6vb0uh1e.apps.googleusercontent.com',
};
