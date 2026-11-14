// Ubah file stok BSP (dan opsional file item penjualan / file stok non polos) jadi stok-bsp.json,
// dipakai tab 6 "Stok BSP" di stok-ancab.html
// Pakai:  node scripts/stok-bsp.mjs <file-stok.xls> [file-item.xlsx] [--nonpolos file-colour.xls]
//   - file stok  : "Update stok barang polos ... .xls"  (wajib)
//   - file item  : "item_bsp_polos_avg_3bln_ctn.xlsx"   (opsional; hanya kalau penjualan 3 bulan berubah)
//   - --nonpolos : "Update stok barang colour ... .xls" (opsional; stok non polos, tanpa DOI)
// Pemetaan item -> kode stok dan gabungan gramasi diambil dari stok-bsp.json yang sudah ada.
// Butuh: npm i xlsx
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const L = createRequire(import.meta.url)("../stok-bsp-lib.js");
const OUT = new URL("../stok-bsp.json", import.meta.url);
const pos = [];
let npFile = "";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--nonpolos" || a === "--non-polos") npFile = process.argv[++i] || "";
  else pos.push(a);
}
const [stokFile, itemFile] = pos;
if (!stokFile) { console.error("Pakai: node scripts/stok-bsp.mjs <file-stok.xls> [file-item.xlsx] [--nonpolos file-colour.xls]"); process.exit(1); }

const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
const st = L.parseStok(XLSX, fs.readFileSync(stokFile), "buffer");
if (st.rows.length < 5) { console.error("Hanya " + st.rows.length + " baris stok terbaca, file tidak dipakai (mungkin bukan file stok barang polos)."); process.exit(1); }

const bsp = { ...prev, periode: st.periode || prev.periode, gudang: st.gudang || prev.gudang, file: path.basename(stokFile), rows: st.rows, diperbarui: new Date().toISOString() };
if (npFile) {
  const np = L.parseStok(XLSX, fs.readFileSync(npFile), "buffer");
  if (np.rows.length < 5) { console.error("Hanya " + np.rows.length + " baris stok non polos terbaca, file tidak dipakai (mungkin bukan file stok barang colour)."); process.exit(1); }
  bsp.nonPolos = { periode: np.periode || "", gudang: np.gudang || bsp.gudang, file: path.basename(npFile), rows: np.rows, diperbarui: new Date().toISOString() };
}
let tanpaKode = [];
if (itemFile) {
  const it = L.parseItems(XLSX, fs.readFileSync(itemFile), "buffer");
  if (!it.items.length) { console.error("File item kosong, tidak dipakai."); process.exit(1); }
  const m = L.mapItems(it.items, bsp.rows, prev.items);
  bsp.items = m.items; bsp.bulan = it.bulan; bsp.itemFile = path.basename(itemFile); tanpaKode = m.tanpaKode;
} else {
  const m = L.mapItems(prev.items.map((i) => i.slice(0, 7)), bsp.rows, prev.items);   // isi kode yang masih kosong bila ada stok baru
  bsp.items = m.items; tanpaKode = m.tanpaKode;
}
// gabungan gramasi harus punya item dasar dan anaknya
for (const g of bsp.gabung || []) {
  const nama = new Set(bsp.items.map((i) => i[0]));
  if (!nama.has(g.base) || g.anak.some((a) => !nama.has(a[0]))) console.warn("PERINGATAN: gabungan gramasi " + g.base + " tidak lengkap di daftar item.");
}
fs.writeFileSync(OUT, JSON.stringify(bsp));
console.log("stok-bsp.json: periode " + bsp.periode + ", " + bsp.rows.length + " baris stok, " + bsp.items.length + " item" + (itemFile ? " (item diperbarui)" : "") + (npFile ? ", non polos " + bsp.nonPolos.rows.length + " baris (" + bsp.nonPolos.file + ")" : ""));
if (tanpaKode.length) console.log("Item tanpa kode stok (dianggap stok 0): " + tanpaKode.join("; "));
