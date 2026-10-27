// Ubah file stok BSP (dan opsional file item penjualan) jadi stok-bsp.json, dipakai tab 6 "Stok BSP" di stok-ancab.html
// Pakai:  node scripts/stok-bsp.mjs <file-stok.xls> [file-item.xlsx]
//   - file stok  : "Update stok barang polos ... .xls"  (wajib)
//   - file item  : "item_bsp_polos_avg_3bln_ctn.xlsx"   (opsional; hanya kalau penjualan 3 bulan berubah)
// Pemetaan item -> kode stok dan pasangan gramasi diambil dari stok-bsp.json yang sudah ada.
// Butuh: npm i xlsx
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const L = createRequire(import.meta.url)("../stok-bsp-lib.js");
const OUT = new URL("../stok-bsp.json", import.meta.url);
const [, , stokFile, itemFile] = process.argv;
if (!stokFile) { console.error("Pakai: node scripts/stok-bsp.mjs <file-stok.xls> [file-item.xlsx]"); process.exit(1); }

const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
const st = L.parseStok(XLSX, fs.readFileSync(stokFile), "buffer");
if (st.rows.length < 5) { console.error("Hanya " + st.rows.length + " baris stok terbaca, file tidak dipakai (mungkin bukan file stok barang polos)."); process.exit(1); }

const bsp = { ...prev, periode: st.periode || prev.periode, gudang: st.gudang || prev.gudang, file: path.basename(stokFile), rows: st.rows, diperbarui: new Date().toISOString() };
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
// pasangan gramasi (AP3M digabung dengan konversi renceng) harus punya kedua itemnya
for (const g of bsp.gramasi || []) {
  const nama = new Set(bsp.items.map((i) => i[0]));
  if (!nama.has(g.a) || !nama.has(g.b)) console.warn("PERINGATAN: pasangan gramasi tidak lengkap di daftar item: " + g.a + " / " + g.b);
}
fs.writeFileSync(OUT, JSON.stringify(bsp));
console.log("stok-bsp.json: periode " + bsp.periode + ", " + bsp.rows.length + " baris stok, " + bsp.items.length + " item" + (itemFile ? " (item diperbarui)" : ""));
if (tanpaKode.length) console.log("Item tanpa kode stok (dianggap stok 0): " + tanpaKode.join("; "));
