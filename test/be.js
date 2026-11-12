process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha Sarees";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s";
const { DB } = require("./fake.js");
const app = require("../src/server.js");
const assert = require("assert");
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log("ok -", m); };
(async () => {
  const srv = app.listen(0); const port = srv.address().port, U = "http://127.0.0.1:" + port;
  const call = async (p, method = "GET", body, hdr = {}) => { const r = await fetch(U + p, { method, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1", ...hdr }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  let r = await call("/api/config"); console.log(r.s, JSON.stringify(r.j).slice(0, 100));
  const M = "/api/manage/asha";
  // ---------- live rule ----------
  r = await call(M + "/products", "POST", { name: "Tee", price: 100, cost: 50, qty: 5, active: true });
  ok(r.s == 400 && /photo/.test(r.j.error), "cannot create live without photo: " + r.j.error);
  r = await call(M + "/products", "POST", { name: "Tee", price: 100, cost: 50, qty: 5 }); ok(r.s == 200, "create draft product");
  const teeId = r.j.id;
  r = await call(M + "/products/" + teeId, "PUT", { active: true }); ok(r.s == 400 && /photo/.test(r.j.error), "cannot go live without photo");
  await call(M + "/products/" + teeId + "/photos", "POST", { data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ" }).then(x => console.log("photo", x.s, x.j.error || ""));
  r = await call(M + "/products/" + teeId, "PUT", { active: true }); ok(r.s == 200, "goes live with all details + photo");
  r = await call(M + "/products/" + teeId, "PUT", { qty: 7 }); ok(r.s == 200, "live product can still be edited");

  // ---------- import ----------
  const TEESKU = (await call(M + "/products")).j.find(p => p.id == teeId).sku;
  const rows = [
    { name: "Only Name" },
    { name: "Full Item", sku: "FI-1", description: "d", category: "Shirts|Sale", price: "₹1,200", cost: "800", qty: "10", lowAt: "3", expiry: "31/12/2026", supplier: "ACME", o1: "Red", o2: "M", live: "yes" },
    { name: "Variant Blue", sku: "FI-2", price: 1200, cost: 800, qty: 4, mergedUnder: "FI-1", expiry: "2027-02-30" },
    { name: "Variant by name", price: 1, mergedUnder: "Full Item" },
    { name: "", sku: "X" },
    { name: "Tee again", sku: TEESKU },
    { name: "Dup", sku: "FI-1" },
    { name: "Bad nums", price: "abc", qty: "2.5", cost: -3 },
  ];
  let before = DB.size;
  r = await call(M + "/products-import", "POST", { rows, dryRun: true }); console.log(JSON.stringify(r.j, null, 1).slice(0, 1800));
  ok(r.s == 200 && DB.size == before, "dry run writes nothing");
  ok(r.j.created == 5 && r.j.skipped == 3, `preview counts created=${r.j.created} skipped=${r.j.skipped}`);
  r = await call(M + "/products-import", "POST", { rows }); ok(r.s == 200, "import saved");
  let ps = (await call(M + "/products")).j; const by = n => ps.find(p => p.name == n);
  ok(ps.length == 6, "6 products now: " + ps.map(p => p.name).join(","));
  ok(by("Only Name") && by("Only Name").active === false && by("Only Name").sku, "name-only imported as draft with auto SKU " + by("Only Name").sku);
  const fi = by("Full Item");
  ok(fi.price == 1200 && fi.cost == 800 && fi.qty == 10 && fi.expiry == "2026-12-31" && fi.tags.join() == "Shirts,Sale" && fi.active === false, "full item parsed (₹ and DD/MM/YYYY); not live: no photo");
  ok((await call(M + "/tags")).j.map(t => t.name).join() == "Shirts,Sale", "categories auto-created");
  ok(by("Variant Blue").mergeUnder == fi.id, "merged under by code");
  ok(by("Variant by name").mergeUnder == fi.id, "merged under by name");
  ok(by("Variant Blue").expiry === "", "bad date left blank");
  ok(by("Bad nums").price === 0 && by("Bad nums").qty == null, "bad numbers left blank");
  const log = (await call(M + "/stock-log")).j; ok(log.some(l => l.reason == "Imported" && l.delta == 10), "qty logged as Imported");
  // update mode
  r = await call(M + "/products-import", "POST", { rows: [{ name: "Full Item", sku: "FI-1", qty: 15, price: "" }], update: true }); ok(r.j.updated == 1, "update existing");
  ps = (await call(M + "/products")).j; ok(by("Full Item").qty == 15 && by("Full Item").price == 1200, "update changed qty, kept price when blank");
  r = await call(M + "/products-import", "POST", { rows: [{ name: "Brandy Bar", brand: "Cadbury", qty: 2 }, { name: "Brandy Two", brand: "cadbury" }] }); ok(r.s == 200 && r.j.created == 2, "brand import");
  ps = (await call(M + "/products")).j; ok(by("Brandy Bar").brand == "Cadbury" && by("Brandy Two").brand == "Cadbury", "brand saved, same name merged");
  ok((await call(M + "/brands")).j.filter(x => x.toLowerCase() == "cadbury").length == 1, "brand list has it once");
  r = await call(M + "/products-import", "POST", { rows: Array.from({ length: 501 }, (_, i) => ({ name: "n" + i })) }); ok(r.s == 400, "max 500 rows");
  // second import with only-name rows: SKUs unique
  r = await call(M + "/products-import", "POST", { rows: [{ name: "A" }, { name: "B" }] }); ps = (await call(M + "/products")).j;
  ok(new Set(ps.map(p => p.sku)).size == ps.length, "all SKUs unique");

  // ---------- purchases ----------
  await call(M + "/suppliers", "POST", { name: "ACME" });
  const s1 = (await call(M + "/products")).j.find(p => p.name == "Tee"); const q0 = s1.qty;
  r = await call(M + "/purchases", "POST", { supplier: "ACME", billNo: "B-9", date: "2026-11-01", lines: [{ id: teeId, qty: 10, cost: 60 }, { name: "Brand New Thing", qty: 5, cost: 20 }], gst: 18, discount: 50, pay: { status: "partial", method: "UPI", amount: 100 } });
  ok(r.s == 200 && r.j.number == "PU-1001" && r.j.newProducts == 1, "purchase created " + JSON.stringify(r.j));
  ps = (await call(M + "/products")).j; ok(ps.find(p => p.id == teeId).qty == q0 + 10, "stock raised"); ok(ps.find(p => p.id == teeId).cost == 60, "purchase price updated");
  const nt = ps.find(p => p.name == "Brand New Thing"); ok(nt && nt.active === false && nt.qty == 5 && nt.cost == 20, "new product is a draft with stock");
  const pu = (await call(M + "/purchases")).j.purchases; ok(pu.length == 1 && pu[0].subtotal == 700 && pu[0].total == Math.round(650 * 1.18) && pu[0].paid == 100, "totals ok: " + pu[0].total);
  r = await call(M + "/purchases/PU-1001/payments", "POST", { amount: 5000, method: "UPI" }); ok(r.s == 400, "cannot overpay");
  r = await call(M + "/purchases/PU-1001/payments", "POST", { amount: 100, method: "Cash" }); ok(r.s == 200, "later payment");
  r = await call(M + "/purchases", "POST", { supplier: "ACME", lines: [{ id: teeId, qty: 1, cost: 10 }], cost: 0, updateCost: false, pay: { status: "unpaid" } });
  ok(r.j.number == "PU-1002" && (await call(M + "/products")).j.find(p => p.id == teeId).cost == 60, "updateCost=false keeps price; PU-1002");
  r = await call(M + "/purchases", "POST", { supplier: "", lines: [{ id: teeId, qty: 1, cost: 1 }] }); ok(r.s == 400, "supplier required");
  r = await call(M + "/purchases", "POST", { supplier: "ACME", lines: [{ id: teeId, qty: 0, cost: 1 }] }); ok(r.s == 400, "qty >=1");
  // delete with stock reversal
  const qNow = (await call(M + "/products")).j.find(p => p.id == teeId).qty;
  r = await call(M + "/purchases/PU-1001?reverse=1", "DELETE"); ok(r.s == 200, "delete purchase");
  ok((await call(M + "/products")).j.find(p => p.id == teeId).qty == qNow - 10, "stock taken off again");
  ok((await call(M + "/purchases")).j.purchases.length == 1, "gone from list");
  r = await call(M + "/purchases/PU-1002?reverse=0", "DELETE"); ok((await call(M + "/products")).j.find(p => p.id == teeId).qty == qNow - 10, "keep-stock delete leaves stock");
  // owner only
  await call(M + "/users", "POST", { username: "raj", name: "Raj", password: "secret12", perms: { stock: true, add: true } });
  const lg = await call(M + "/login", "POST", { user: "raj", password: "secret12" }, { "x-key": "" }); const tk = { "x-key": "", "x-token": lg.j.token };
  ok((await call(M + "/purchases", "GET", null, tk)).s == 403, "staff cannot see purchases");
  ok((await call(M + "/products-import", "POST", { rows: [{ name: "z" }] }, tk)).s == 403, "staff cannot import");
  // draft purchase
  r = await call(M + "/purchase-drafts", "POST", { supplier: "ACME", lines: [{ name: "x", qty: 1, cost: 1 }] }); ok(r.s == 200, "purchase draft saved");
  const dr = (await call(M + "/drafts")).j; ok(dr.some(d => d.kind == "purchase"), "draft comes back tagged purchase");

  // ---------- round 2: stock race, expiry, edit invoice, refund ----------
  const exp1 = await call(M + "/products", "POST", { name: "Milk", price: 50, cost: 30, qty: 20 }); const milk = exp1.j.id;
  await call(M + "/products/" + milk + "/photos", "POST", { data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ" });
  await call(M + "/products/" + milk, "PUT", { active: true });
  // stock race
  r = await call(M + "/products/" + milk, "PUT", { name: "Milk 1L" }); ok(r.s == 200 && (await call(M + "/products")).j.find(p => p.id == milk).qty == 20, "rename without qty keeps stock");
  const sale = await fetch(U + "/api/store/asha/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "C", phone: "9876543210", address: "12 Long Street Pune", items: [{ id: milk, qty: 5 }] }) }); ok(sale.status == 200, "customer buys 5");
  r = await call(M + "/products/" + milk, "PUT", { name: "Milk 1L", qty: 20, expectedQty: 20 }); ok(r.s == 400 && /Stock changed from 20 to 15/.test(r.j.error), "stale form refused: " + r.j.error);
  ok((await call(M + "/products")).j.find(p => p.id == milk).qty == 15, "stock stayed 15");
  r = await call(M + "/products/" + milk, "PUT", { qtyDelta: 10, stockReason: "Stock received" }); ok(r.s == 200 && (await call(M + "/products")).j.find(p => p.id == milk).qty == 25, "+10 applied to latest stock");
  r = await call(M + "/products/" + milk, "PUT", { qtyDelta: -2, stockReason: "Damaged or expired" }); ok((await call(M + "/products")).j.find(p => p.id == milk).qty == 23, "-2 applied");
  r = await call(M + "/products/" + milk, "PUT", { qtyDelta: -99 }); ok(r.s == 400, "cannot go below zero");
  r = await call(M + "/products/" + milk, "PUT", { qty: 30, expectedQty: 23 }); ok(r.s == 200 && (await call(M + "/products")).j.find(p => p.id == milk).qty == 30, "recount with matching expected number works");
  // expiry
  const yday = new Date(Date.now() + 5.5 * 3600e3 - 864e5).toISOString().slice(0, 10), tmr = new Date(Date.now() + 5.5 * 3600e3 + 864e5).toISOString().slice(0, 10);
  await call(M + "/products/" + milk, "PUT", { expiry: yday });
  let shop = await (await fetch(U + "/api/store/asha")).json(); ok(!shop.products.some(p => p.id == milk), "expired product hidden from the shop");
  const bad = await fetch(U + "/api/store/asha/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "C", phone: "9876543210", address: "12 Long Street Pune", items: [{ id: milk, qty: 1 }] }) }); const bj = await bad.json(); ok(bad.status == 400 && /no longer available/.test(bj.error), "expired item in cart blocked: " + bj.error);
  await call(M + "/products/" + milk, "PUT", { expiry: tmr }); shop = await (await fetch(U + "/api/store/asha")).json(); ok(shop.products.some(p => p.id == milk), "not yet expired is shown");
  // edit invoice
  r = await call(M + "/invoices", "POST", { name: "Walk", mode: "store", lines: [{ id: milk, qty: 4 }, { id: teeId, qty: 1 }], discount: 0, gst: 0, pay: { status: "partial", method: "Cash", amount: 100 } }); const inv = r.j.number; ok(r.s == 200, "invoice " + inv);
  const m0 = (await call(M + "/products")).j.find(p => p.id == milk).qty;
  r = await call(M + "/invoices/" + inv, "PUT", { name: "Walk Renamed", mode: "store", lines: [{ id: milk, qty: 2 }, { id: teeId, qty: 1 }], discount: 10, gst: 5, notes: "edited" }); ok(r.s == 200, "edit ok " + (r.j.error || ""));
  ok((await call(M + "/products")).j.find(p => p.id == milk).qty == m0 + 2, "stock returned for the 2 fewer");
  let ord = (await call(M + "/orders")).j.orders.find(o => o.number == inv); ok(ord.name == "Walk Renamed" && ord.total == Math.round((2 * 50 + 100 - 10) * 1.05) && ord.paid == 100, "totals recomputed, payment kept: " + ord.total);
  r = await call(M + "/invoices/" + inv, "PUT", { mode: "store", lines: [{ id: teeId, qty: 1 }], discount: 0, gst: 0 }); ok(r.s == 200 && (await call(M + "/products")).j.find(p => p.id == milk).qty == m0 + 4, "removed line fully restocked");
  r = await call(M + "/invoices/" + inv, "PUT", { mode: "store", lines: [{ id: milk, qty: 1 }], discount: 0, gst: 0 }); ok(r.s == 400 && /already paid/.test(r.j.error), "cannot drop total below paid: " + r.j.error);
  r = await call(M + "/invoices/" + inv, "PUT", { mode: "store", lines: [{ id: milk, qty: 9999 }] }); ok(r.s == 400, "qty cap");
  r = await call(M + "/invoices/" + inv, "PUT", { mode: "online", lines: [{ id: teeId, qty: 1 }], phone: "", address: "" }); ok(r.s == 400, "online needs address");
  // cancel + refund
  r = await call(M + "/orders/" + inv, "PATCH", { status: "Cancelled" }); ok(r.s == 200, "cancel");
  r = await call(M + "/invoices/" + inv, "PUT", { mode: "store", lines: [{ id: teeId, qty: 1 }] }); ok(r.s == 400 && /cancelled/.test(r.j.error), "cancelled invoice cannot be edited");
  const key = require("crypto").createHmac("sha256", process.env.SESSION_SECRET).update("invoice:asha:" + inv).digest("base64url").slice(0, 24);
  let iv = await (await fetch(U + "/api/invoice/asha/" + inv + "?k=" + key)).json(); ok(iv.status == "Cancelled" && iv.due == 0 && iv.refundDue == 100 && iv.cancelledAt, "invoice api: cancelled, nothing due, refund due 100");
  r = await call(M + "/orders/" + inv + "/refund", "POST", { method: "Cash" }); ok(r.s == 200, "refund recorded");
  iv = await (await fetch(U + "/api/invoice/asha/" + inv + "?k=" + key)).json(); ok(iv.refunded == 100 && iv.refundDue == 0, "now refunded 100");
  r = await call(M + "/orders/" + inv + "/refund", "POST", { method: "Cash" }); ok(r.s == 400, "no double refund");
  console.log("\nALL", pass, "PASSED"); srv.close(); process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
