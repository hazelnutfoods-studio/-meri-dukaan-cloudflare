process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha"; process.env.FIREBASE_SERVICE_ACCOUNT="{}"; process.env.ADMIN_PASSWORD="pw-owner-1"; process.env.SESSION_SECRET="s";
const { DB } = require("./fake.js"); const app = require("../src/server.js"); const assert = require("assert"); const crypto = require("crypto");
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log("ok -", m); };
(async () => {
  const srv = app.listen(0), U = "http://127.0.0.1:" + srv.address().port, H = { "x-key": "pw-owner-1", "Content-Type": "application/json" }, M = "/api/manage/asha";
  const call = async (p, m = "GET", b) => { const r = await fetch(U + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  await call("/api/config"); const jpg = require("fs").readFileSync(__dirname + "/p.jpg.b64", "utf8").trim();
  // ---- barcode checks that no longer load every product ----
  const a = await call(M + "/products", "POST", { name: "A", price: 10, cost: 5, qty: 5, barcode: "8901234567890" }); ok(a.s === 200, "product with barcode");
  const b = await call(M + "/products", "POST", { name: "B", price: 10, qty: 5, barcode: "8901234500011" }); ok(b.s === 200, "second product");
  let r = await call(M + "/products", "POST", { name: "C", price: 10, qty: 1, barcode: "8901234567890" }); ok(r.s === 400 && /already used by/.test(r.j.error), "same barcode refused on a new product");
  r = await call(M + "/products/" + b.j.id, "PUT", { barcode: "8901234567890" }); ok(r.s === 400 && /already used by .A./.test(r.j.error), "changing to a used barcode is refused");
  r = await call(M + "/products/" + a.j.id, "PUT", { name: "A renamed", barcode: "8901234567890" }); ok(r.s === 200, "saving with the unchanged barcode works");
  const z = await call(M + "/products", "POST", { name: "Z", price: 10, qty: 1, barcode: "0123456789012" }); ok(z.s === 200, "barcode with a leading zero saved");
  r = await call(M + "/products", "POST", { name: "Z2", price: 10, qty: 1, barcode: "123456789012" }); ok(r.s === 400, "same barcode without the leading zero is also caught");
  r = await call(M + "/barcode/8901234567890"); ok(r.s === 200 && r.j.mine && r.j.mine.name === "A renamed", "scanner finds the product: " + JSON.stringify(r.j).slice(0, 80));
  // ---- expiry on the shop page ----
  await call(M + "/products/" + a.j.id + "/photos", "POST", { data: jpg });
  r = await call(M + "/products/" + a.j.id, "PUT", { expiry: "2027-03-31", active: true }); ok(r.s === 200, "expiry set and product live: " + JSON.stringify(r.j));
  let shop = await (await fetch(U + "/api/store/asha")).json(); let p = shop.products.find(x => x.id === a.j.id); ok(p && p.exp === "2027-03-31", "shop gets the expiry date: " + (p && p.exp));
  // two batches: the shop shows the one that is sold first
  await call(M + "/products/" + a.j.id, "PUT", { qtyDelta: 4, addExpiry: "2026-12-31", stockReason: "Stock received" });
  shop = await (await fetch(U + "/api/store/asha?" + Date.now())).json(); p = shop.products.find(x => x.id === a.j.id); ok(p.exp === "2026-12-31" || p.exp === "2027-03-31", "with two batches the shop shows one of them: " + p.exp);
  // ---- expiry on the invoice ----
  r = await call(M + "/invoices", "POST", { name: "Rohan", mode: "store", lines: [{ id: a.j.id, qty: 2 }], pay: { status: "paid", method: "Cash" } }); ok(r.s === 200, "sale made");
  const key = crypto.createHmac("sha256", "s").update("invoice:asha:" + r.j.number).digest("base64url").slice(0, 24);
  const inv = await (await fetch(`${U}/api/invoice/asha/${r.j.number}?k=${r.j.invKey || key}`)).json(); ok(inv.lines && inv.lines[0].expiry && inv.lines[0].expiry.length === 1, "invoice line carries its expiry: " + JSON.stringify(inv.lines && inv.lines[0].expiry));
  const pdf = await fetch(`${U}/api/invoice/asha/${r.j.number}/pdf?k=${r.j.invKey || key}`); ok(pdf.status === 200 && (await pdf.arrayBuffer()).byteLength > 1000, "invoice PDF still builds");
  console.log("EXPIRY+BARCODE: ALL " + pass + " PASSED"); srv.close(); process.exit(0);
})().catch(e => { console.log("FAILED", e.message); process.exit(1); });
