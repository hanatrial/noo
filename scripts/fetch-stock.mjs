// Ambil file stok dengan Modified terbaru dari share Nextcloud, ubah jadi stok-data.json
import XLSX from "xlsx";
import fs from "fs";

const TOKEN = "wSaQw8zZ6MPPy29";
const BASE = `https://bench.borwita.co.id/public.php/dav/files/${TOKEN}/`;
const headers = { Authorization: "Basic " + Buffer.from(TOKEN + ":").toString("base64") };

const pf = await fetch(BASE, { method: "PROPFIND", headers: { ...headers, Depth: "1" } });
if (!pf.ok && pf.status !== 207) throw new Error("PROPFIND gagal: " + pf.status);
const xml = await pf.text();

const files = [...xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)].map(m => {
  const href = decodeURIComponent(m[1].match(/<d:href>(.*?)<\/d:href>/)[1]);
  const lm = m[1].match(/<d:getlastmodified>(.*?)<\/d:getlastmodified>/);
  return { name: href.split("/").filter(Boolean).pop(), mod: lm ? new Date(lm[1]) : null };
}).filter(f => /\.(xlsb|xlsx|xlsm)$/i.test(f.name) && f.mod);
if (!files.length) throw new Error("Tidak ada file stok di share");
files.sort((a, b) => b.mod - a.mod);
const latest = files[0];
console.log("File terbaru:", latest.name, latest.mod.toISOString());

const dl = await fetch(BASE + encodeURIComponent(latest.name), { headers });
if (!dl.ok) throw new Error("Download gagal: " + dl.status);
const buf = Buffer.from(await dl.arrayBuffer());

const wb = XLSX.read(buf, { type: "buffer", sheets: "Update Stock" });
const ws = wb.Sheets["Update Stock"];
if (!ws) throw new Error("Sheet 'Update Stock' tidak ada");
const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

const map = { "MAKASSAR": "MAKASSAR", "BONE": "BONE", "PARE-PARE": "PAREPARE", "PAREPARE": "PAREPARE", "PALOPO": "PALOPO" };
const r2 = n => Math.round((+n || 0) * 100) / 100;
const rows = [];
for (const r of a) {
  const b = map[String(r[1] || "").trim().toUpperCase()];
  const cat = String(r[2] || "").trim().toUpperCase();
  if (b && (cat === "TRADITIONAL" || cat === "MODERN"))
    rows.push([b, String(r[4] || ""), String(r[6] || "").trim(), String(r[3] || "").trim(),
      String(r[7] || "").trim().toUpperCase(), r2(r[11]), r2(r[13]), r2(r[23]), cat]);
}
if (rows.length < 100) throw new Error("Baris terlalu sedikit (" + rows.length + "), file mungkin berubah format");

let label = latest.name.replace(/\.[^.]+$/, "");
for (let i = 0; i < 5 && i < a.length; i++) {
  const m = String(a[i][1] || "").match(/Stock Nutrifood\s+(.+)/i);
  if (m) { label = m[1].trim(); break; }
}
const out = { label, src: latest.name, modified: latest.mod.toISOString(), rows };
fs.writeFileSync("stok-data.json", JSON.stringify(out));
console.log("Tersimpan:", rows.length, "baris, label", label);
