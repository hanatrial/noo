/* Pembaca file Stok BSP: dipakai halaman (stok-ancab.html tab 6) dan skrip cron (scripts/stok-bsp.mjs).
   - parseStok : file "Update stok barang polos" (.xls/.xlsx) -> {periode, gudang, rows}
   - parseItems: file "item_bsp_polos_avg_3bln_ctn" (.xlsx)  -> {bulan, items}
   - mapItems  : cocokkan item penjualan ke kode stok (pakai pemetaan lama bila nama sama, sisanya dicocokkan otomatis) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StokBSP = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var str = function (v) { return v == null ? "" : String(v).trim(); };
  function sheetRows(XLSX, data, type) {
    var wb = XLSX.read(data, { type: type || "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
  }

  function parseStok(XLSX, data, type) {
    var a = sheetRows(XLSX, data, type), hi = -1, i;
    for (i = 0; i < a.length; i++) if (str(a[i][1]).toLowerCase() === "kode" && /nama barang/i.test(str(a[i][2]))) { hi = i; break; }
    if (hi < 0) throw new Error("Header 'Kode / Nama Barang' tidak ditemukan. Pastikan ini file stok barang polos.");
    var col = {}; a[hi].forEach(function (h, j) { col[str(h).toLowerCase()] = j; });
    var idx = ["baik", "semi rusak", "rusak", "retur beli", "dps", "bermasalah", "onhold"].map(function (k, n) { return col[k] != null ? col[k] : [3, 5, 7, 9, 11, 13, 15][n]; });
    var ak = col["akhir"] != null ? col["akhir"] : 17, rows = [];
    for (i = hi + 1; i < a.length; i++) {
      var r = a[i], kode = str(r[1]); if (!kode) continue;
      var ket = idx.map(function (j) { return str(r[j]); }), akhir = str(r[ak]);
      if (akhir || ket.some(Boolean)) rows.push([kode, str(r[2])].concat(ket, [akhir]));
    }
    var periode = "", gudang = "";
    for (i = 0; i < hi; i++) {
      if (/^periode/i.test(str(a[i][0]))) {
        var m = /(\d{1,2})-(\d{1,2})-(\d{4})/.exec(str(a[i][2]));
        periode = m ? (+m[1]) + " " + BLN[+m[2] - 1] + " " + m[3] : str(a[i][2]);
      }
      if (/^gudang/i.test(str(a[i][0]))) { var g = /([A-Z]{2,}\d+)/.exec(str(a[i][2])); gudang = g ? g[1] : str(a[i][2]); }
    }
    return { periode: periode, gudang: gudang, rows: rows };
  }

  function parseItems(XLSX, data, type) {
    var a = sheetRows(XLSX, data, type), hi = -1, i;
    for (i = 0; i < a.length; i++) if (str(a[i][2]).toLowerCase() === "item" && /rata2/i.test(a[i].join("|"))) { hi = i; break; }
    if (hi < 0) throw new Error("Header 'Item / Rata2 3 Bln' tidak ditemukan. Pastikan ini file item BSP polos.");
    var h = a[hi].map(str), bulan = [3, 4, 5].map(function (j) { return h[j].replace(/\s.*$/, ""); });
    var cAvg = 6, cNet = 7;
    h.forEach(function (x, j) { if (/rata2/i.test(x) && cAvg === 6 && j >= 6 && !/setelah|retur/i.test(x)) cAvg = j; });
    h.forEach(function (x, j) { if (/netto/i.test(x)) cNet = j; });
    var num = function (v) { var n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; };
    var items = [];
    for (i = hi + 1; i < a.length; i++) {
      var r = a[i], nm = str(r[2]); if (!nm || /^total$/i.test(nm)) continue;
      items.push([nm, str(r[1]), +num(r[3]).toFixed(2), +num(r[4]).toFixed(2), +num(r[5]).toFixed(2), +num(r[cAvg]).toFixed(2), Math.round(num(r[cNet]))]);
    }
    return { bulan: bulan, items: items };
  }

  /* Sehat Indah: sheet "STOK ..." di file ekspor penjualan (PENJUALAN_ALL_*.xlsx). Baris: {k,n,s,t,h,p} sama dengan yang disimpan insentif. */
  function parseShiStok(XLSX, data, type) {
    var wb = XLSX.read(data, { type: type || "array" });
    var nm = wb.SheetNames.filter(function (n) { return /^stok/i.test(str(n)); })[0];
    if (!nm) throw new Error("Sheet 'STOK ...' tidak ditemukan. Pakai file ekspor Sehat Indah yang punya sheet stok.");
    var a = XLSX.utils.sheet_to_json(wb.Sheets[nm], { defval: null }), rows = [];
    a.forEach(function (r) {
      if (r.kd_brg == null || r.nm_brg == null) return;
      var p = str(r.pemasok).toUpperCase(), n = str(r.nm_brg);
      if (p === "P00008" || /^(NS |HI ?LO|LOKALATE|TS |BONUS|GIM)/i.test(n))
        rows.push({ k: str(r.kd_brg), n: n, s: Number(r.stok) || 0, t: str(r.stk_kms), h: Number(r.hrg_jual) || 0, p: str(r.pemasok) });
    });
    if (!rows.length) throw new Error("Tidak ada barang Nutrifood di sheet " + nm + ".");
    return { sheet: nm, rows: rows };
  }

  /* --- pencocokan nama item -> kode stok --- */
  var NOISE = { PLS: 1, REF: 1, POLOS: 1, GR: 1, G: 1, S: 1, X: 1, PX: 1, RX: 1, HANGER: 1, BAG: 1, BONUS: 1, BNS: 1, FREE: 1, SFREE: 1 };
  var FIX = { ALPUKET: "ALPUKAT", PIS: "PISANG", BELGIAN: "BELGIA", SERH: "SEREH" };
  function sig(s) {
    var u = s.toUpperCase().replace(/N'SARI/g, "NS").replace(/HI LO/g, "HILO").replace(/W'DANK/g, "WDANK");
    var bonus = /\b(BONUS|BNS)\b|FREE/.test(u), hanger = u.indexOf("HANGER") >= 0;
    var nums = (u.match(/\d+/g) || []).map(Number).filter(function (n) { return n > 0; });
    var w = {}; (u.match(/[A-Z]+/g) || []).forEach(function (x) { if (!NOISE[x]) w[FIX[x] || x] = 1; });
    return { w: w, nums: nums, bonus: bonus, hanger: hanger };
  }
  function score(a, b) {
    if (a.bonus !== b.bonus || a.hanger !== b.hanger) return 0;
    var ka = Object.keys(a.w), kb = Object.keys(b.w), inter = ka.filter(function (k) { return b.w[k]; }).length;
    var jac = inter / (ka.length + kb.length - inter || 1);
    var sa = {}, sb = {}; a.nums.forEach(function (n) { sa[n] = 1; }); b.nums.forEach(function (n) { sb[n] = 1; });
    var na = Object.keys(sa), nb = Object.keys(sb);
    var subset = na.every(function (n) { return sb[n]; }) || nb.every(function (n) { return sa[n]; });
    var share = na.some(function (n) { return sb[n]; });
    return jac * 0.7 + (subset ? 0.3 : share ? 0.15 : 0);
  }
  /* items: hasil parseItems; stokRows: parseStok.rows; prev: BSP.items sebelumnya ([nama,...,kode[]]) */
  function mapItems(items, stokRows, prev) {
    var old = {}; (prev || []).forEach(function (p) { old[p[0]] = p[7]; });
    var sg = stokRows.map(function (r) { return [r[0], sig(r[1])]; }), used = {}, out = [], notes = [];
    items.forEach(function (it) {
      if (old[it[0]]) old[it[0]].forEach(function (k) { used[k] = 1; });
    });
    items.forEach(function (it) {
      var ks = old[it[0]];
      if (!ks) {
        var s = sig(it[0]), best = null, bs = 0;
        sg.forEach(function (c) { if (used[c[0]]) return; var v = score(s, c[1]); if (v > bs) { bs = v; best = c[0]; } });
        ks = best && bs >= 0.7 ? [best] : [];
        if (ks.length) used[best] = 1; else notes.push(it[0]);
      }
      out.push(it.concat([ks]));
    });
    return { items: out, tanpaKode: notes };
  }
  return { parseStok: parseStok, parseItems: parseItems, mapItems: mapItems, parseShiStok: parseShiStok };
});
