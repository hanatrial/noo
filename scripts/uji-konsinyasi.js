#!/usr/bin/env node
/* Uji halaman konsinyasi tanpa browser: firebase + canvas + kamera dipalsukan.
   Jalankan: cd scripts && npm i jsdom && node uji-konsinyasi.js
   Diuji: foto pajangan wajib, kompres foto, simpan ke subkoleksi, tampil di daftar,
   tambah/ganti foto per kedai, foto ikut terhapus saat kedai dihapus. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'konsinyasi', 'index.html'), 'utf8');
const store = new Map();
const subs = [];
const DEL = Symbol('del');

function setPath(obj, p, val) {
  const parts = p.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (val === DEL) delete cur[parts[parts.length - 1]];
  else cur[parts[parts.length - 1]] = val;
}
function merge(a, b) {
  const out = Object.assign({}, a);
  for (const k of Object.keys(b)) {
    const v = b[k];
    if (k.includes('.')) { setPath(out, k, v); continue; }
    if (v === DEL) { delete out[k]; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
    else out[k] = v;
  }
  return out;
}
const notify = () => subs.forEach(fn => fn());

class Doc {
  constructor(p) { this.path = p; }
  collection(n) { return new Col(this.path + '/' + n); }
  async set(d, o) { store.set(this.path, o && o.merge ? merge(store.get(this.path) || {}, d) : d); notify(); }
  async update(d) { store.set(this.path, merge(store.get(this.path) || {}, d)); notify(); }
  async get() { const v = store.get(this.path); return { exists: store.has(this.path), data: () => v }; }
  async delete() { store.delete(this.path); notify(); }
}
class Col { constructor(p) { this.path = p; } doc(id) { return new Doc(this.path + '/' + id); } }

const dom = new JSDOM(HTML, {
  runScripts: 'dangerously',
  url: 'https://hanatrial.github.io/noo/konsinyasi/',
  beforeParse(win) {
    win.firebase = {
      initializeApp() {},
      firestore: Object.assign(() => ({
        collection: n => {
          const ref = new Col(n), orig = ref.doc.bind(ref);
          ref.doc = id => { const d = orig(id); d.onSnapshot = ok => { const run = () => { const v = store.get(d.path); ok({ exists: !!v, data: () => v }); }; subs.push(run); run(); }; return d; };
          return ref;
        },
      }), { FieldValue: { delete: () => DEL } }),
    };
    win.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(120000);
    win.Image = class { set src(v) { this.width = 1600; this.height = 1200; setTimeout(() => this.onload && this.onload(), 0); } };
    win.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,RAW'; setTimeout(() => this.onload && this.onload(), 0); } };
    win.navigator.geolocation = { getCurrentPosition: ok => ok({ coords: { latitude: -5.147, longitude: 119.432, accuracy: 12 } }) };
  },
});

const win = dom.window, doc = win.document, $ = id => doc.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const check = (name, cond, extra) => out.push([cond ? 'LULUS' : 'GAGAL', name, extra === undefined ? '' : String(extra)]);
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const pilihFoto = (input, nama) => {
  Object.defineProperty(input, 'files', { value: [new win.File([new Uint8Array([1, 2, 3])], nama, { type: 'image/jpeg' })], configurable: true });
  input.dispatchEvent(new win.Event('change'));
};

(async () => {
  await wait(120);
  check('Simpan terkunci saat form kosong', $('btnSave').disabled);

  $('nama').value = 'Kedai Bu Ani'; $('nama').dispatchEvent(new win.Event('input'));
  $('alamat').value = 'Jl. Veteran No. 12'; $('alamat').dispatchEvent(new win.Event('input'));
  $('nominal').value = '1500000'; $('nominal').dispatchEvent(new win.Event('input'));
  check('Nominal diformat ribuan', $('nominal').value === '1.500.000', $('nominal').value);
  click(doc.querySelector('#mdsPick button[data-mds="Eva"]'));
  click($('btnLoc'));
  await wait(60);
  check('Lokasi tersimpan', $('locSt').className.includes('ok'));
  check('Terkunci walau lokasi ada, karena foto belum', $('btnSave').disabled);

  let cam = 0; $('pcam').click = () => { cam++; };
  click($('pzone'));
  check('Ketuk kotak foto membuka kamera', cam === 1);
  pilihFoto($('pcam'), 'pajangan.jpg');
  await wait(120);
  check('Pratinjau foto tampil', !$('pview').hidden);
  check('Status foto siap', $('pst').className.includes('ok'), $('pst').textContent);
  check('Simpan terbuka setelah foto ada', !$('btnSave').disabled);

  click($('btnSave'));
  await wait(250);
  const ids = Object.keys(store.get('monitoring_noo/konsinyasi_kedai').shops);
  const id = ids[0], s = store.get('monitoring_noo/konsinyasi_kedai').shops[id] || {};
  check('Kedai tersimpan', ids.length === 1);
  check('Data kedai lengkap', s.nama === 'Kedai Bu Ani' && s.alamat === 'Jl. Veteran No. 12' && s.nominal === 1500000 && s.mds === 'Eva');
  check('Penanda foto di kedai', s.foto === true);
  const f = store.get('monitoring_noo/konsinyasi_kedai/foto/' + id);
  check('Foto tersimpan di subkoleksi', !!f && /^data:image\/jpeg/.test(f.data));
  check('Foto dikompres ke sisi <=1000', f && f.w === 1000 && f.h === 750, f && f.w + 'x' + f.h);
  check('Form tereset', $('nama').value === '' && $('pview').hidden);
  check('MDS wajib dipilih ulang', $('mdsHint').textContent.includes('belum ada'));

  await wait(120);
  const card = doc.querySelector('#list .item');
  const btnLihat = card.querySelector('button[data-act="see"]');
  const imgCard = card.querySelector('img.foto-big');
  check('Kartu punya tombol Lihat foto', !!btnLihat && btnLihat.textContent.includes('Lihat foto pajangan'));
  check('Foto tersembunyi sebelum diketuk', !!imgCard && imgCard.hidden === true);
  click(btnLihat);
  check('Foto muncul setelah diketuk', imgCard.hidden === false);
  check('Tombol berubah jadi Sembunyikan', btnLihat.textContent.includes('Sembunyikan foto'));
  click(btnLihat);
  check('Foto tersembunyi lagi setelah diketuk kedua', imgCard.hidden === true);

  const oldId = 'kold1';
  await new Col('monitoring_noo').doc('konsinyasi_kedai').set({ shops: { [oldId]: { nama: 'Kedai Lama', alamat: 'Jl. Lama', nominal: 500000, mds: 'Asrar', lat: -5.1, lng: 119.4, createdAt: new Date().toISOString() } } }, { merge: true });
  await wait(120);
  check('Kedai lama tanpa foto masuk "Perlu dicek"', $('btnIssues').textContent.includes('1'), $('btnIssues').textContent);
  const oldCard = doc.querySelector(`#list [data-id="${oldId}"]`);
  check('Kartu lama punya tombol Tambah foto', oldCard.querySelector('button[data-act="photo"]').textContent === 'Tambah foto');

  const origCreate = doc.createElement.bind(doc); let inp = null;
  doc.createElement = t => { const el = origCreate(t); if (String(t).toLowerCase() === 'input') { inp = el; el.click = () => {}; } return el; };
  click(oldCard.querySelector('button[data-act="photo"]'));
  check('Tombol foto membuka kamera', !!inp && inp.getAttribute('capture') === 'environment');
  pilihFoto(inp, 'pajangan2.jpg');
  await wait(250);
  check('Foto kedai lama tersimpan dari kartu', !!store.get('monitoring_noo/konsinyasi_kedai/foto/' + oldId));
  const oldCard2 = doc.querySelector(`#list [data-id="${oldId}"]`);
  check('Tombol berubah jadi Ganti foto', oldCard2.querySelector('button[data-act="photo"]').textContent === 'Ganti foto');

  win.confirm = () => true;
  click(doc.querySelector(`#list [data-id="${id}"] button[data-act="del"]`));
  await wait(200);
  check('Kedai terhapus', !(store.get('monitoring_noo/konsinyasi_kedai').shops || {})[id]);
  check('Foto ikut terhapus', !store.has('monitoring_noo/konsinyasi_kedai/foto/' + id));

  out.forEach(r => console.log(r[0].padEnd(6), r[1], r[2] ? '→ ' + r[2] : ''));
  const gagal = out.filter(r => r[0] === 'GAGAL').length;
  console.log(`\n${out.length - gagal}/${out.length} lulus`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('ERROR UJI', e); process.exit(1); });
