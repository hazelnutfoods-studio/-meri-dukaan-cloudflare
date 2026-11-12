process.env.STORE_SLUG="ravi"; process.env.STORE_NAME="Ravi Store";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; delete process.env.SESSION_SECRET;
const { DB } = require("./fake.js");
const app = require("../src/server.js");
const assert = require("assert");
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log("ok -", m); };
(async () => {
  const srv = app.listen(0); const U = "http://127.0.0.1:" + srv.address().port;
  const call = async (p, method = "GET", body, hdr = {}) => { const r = await fetch(U + p, { method, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1", ...hdr }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  let r = await call("/api/config"); const M = "/api/manage/ravi";
  const PH = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";
  const mk = async (b) => { const x = await call(M + "/products", "POST", b); await call(M + "/products/" + x.j.id + "/photos", "POST", { data: PH }); return x.j.id; };

  // ----- 1. purchase price -----
  r = await call(M + "/products", "POST", { name: "No cost", price: 100, qty: 5 }); ok(r.s == 200, "product with blank purchase price saves");
  let p = (await call(M + "/products")).j.find(x => x.id == r.j.id); ok(p.cost === null, "blank purchase price is stored as empty, not 0");
  await call(M + "/products/" + r.j.id + "/photos", "POST", { data: PH });
  r = await call(M + "/products/" + r.j.id, "PUT", { active: true }); ok(r.s == 400 && /purchase price/.test(r.j.error), "cannot go live without a purchase price: " + r.j.error);
  r = await call(M + "/products", "POST", { name: "Zero", price: 10, cost: 0 }); ok(r.s == 400 && /free/.test(r.j.error), "typed 0 needs confirming: " + r.j.error);
  r = await call(M + "/products", "POST", { name: "Zero", price: 10, cost: 0, freeOk: true }); ok(r.s == 200, "confirmed free item saves");
  p = (await call(M + "/products")).j.find(x => x.id == r.j.id); ok(p.cost === 0, "free item keeps cost 0");

  // ----- 2. order limit -----
  const big = await mk({ name: "Salt", price: 20, cost: 10, qty: 500 }); await call(M + "/products/" + big, "PUT", { active: true });
  const order = (qty, extra = {}) => fetch(U + "/api/store/ravi/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "C", phone: "9876543210", address: "12 Long Street, Pune", items: [{ id: big, qty }], ...extra }) }).then(async x => ({ s: x.status, j: await x.json() }));
  let sh = await (await fetch(U + "/api/store/ravi")).json(); ok(sh.maxQty == 20, "shop page reports the default limit 20");
  r = await order(21); ok(r.s == 400 && /up to 20/.test(r.j.error), "21 refused with a clear message: " + r.j.error);
  r = await call(M + "/business", "PUT", { name: "Ravi Store", gstDefault: 0, maxQty: 60, phone: "99999 11111" }); ok(r.s == 200, "owner sets the limit to 60");
  sh = await (await fetch(U + "/api/store/ravi")).json(); ok(sh.maxQty == 60 && sh.phone == "99999 11111", "shop page now reports 60 and the phone");
  r = await order(21); ok(r.s == 200, "21 now accepted");
  r = await order(61); ok(r.s == 400 && /up to 60/.test(r.j.error) && /99999 11111/.test(r.j.error), "61 refused, shows phone: " + r.j.error);
  r = await call(M + "/business", "PUT", { name: "Ravi Store", gstDefault: 0, maxQty: 0 }); ok(r.s == 400, "limit must be 1 or more");
  r = await call(M + "/business", "PUT", { name: "Ravi Store", gstDefault: 0, maxQty: 1000 }); ok(r.s == 400, "limit cannot pass 999");
  ok((await call(M + "/me")).j.business.maxQty == 60, "setting is returned to the app");

  // ----- 3. secret notice -----
  let sm = (await call(M + "/summary")).j; ok(sm.secretSet === false, "summary says the private secret is not set");

  // ----- 4. running totals stay exact -----
  const same = async (label) => { const a = (await call(M + "/summary")).j; await call(M + "/summary/rebuild", "POST"); const b = (await call(M + "/summary")).j; assert.deepStrictEqual(a, b, label + "\nrunning " + JSON.stringify(a) + "\nrecount " + JSON.stringify(b)); ok(true, "totals match a fresh recount after: " + label); return a; };
  await same("online order + first invoice");
  const inv = async (b) => { const x = await call(M + "/invoices", "POST", { mode: "store", lines: [{ id: big, qty: 2 }], pay: { status: "unpaid" }, ...b }); assert(x.s == 200, JSON.stringify(x.j)); return x.j.number; };
  const n1 = await inv({ pay: { status: "paid", method: "UPI" } }); await same("paid invoice");
  const n2 = await inv({ gst: 18, discount: 5 }); await same("unpaid invoice with GST");
  r = await call(M + "/orders/" + n2 + "/payments", "POST", { amount: 10, method: "Cash" }); ok(r.s == 200, "part payment"); await same("part payment");
  r = await call(M + "/orders/" + n2 + "/payment", "PUT", { mode: "paid", method: "UPI" }); ok(r.s == 200, "mark paid"); await same("marked paid");
  r = await call(M + "/orders/" + n2 + "/payment", "PUT", { mode: "unpaid" }); await same("marked unpaid");
  r = await call(M + "/invoices/" + n2, "PUT", { mode: "store", lines: [{ id: big, qty: 5 }], gst: 5, discount: 0, pay: { status: "unpaid" } }); ok(r.s == 200, "edit invoice"); await same("invoice edited");
  const online = (await call(M + "/orders")).j.orders.find(o => o.channel == "online");
  r = await call(M + "/orders/" + online.number + "/items", "PUT", { lines: [{ id: big, qty: 30 }] }); ok(r.s == 200, "owner edits an online order beyond 20"); await same("online order quantity changed");
  r = await call(M + "/orders/" + online.number, "PATCH", { status: "Packed" }); await same("status moved");
  r = await call(M + "/orders/" + n1, "PATCH", { status: "Cancelled" }); ok(r.s == 200, "cancel a paid invoice"); let s1 = await same("paid invoice cancelled"); ok(s1.refundDue == 40, "refund due counted: " + s1.refundDue);
  r = await call(M + "/orders/" + n1 + "/refund", "POST", { method: "Cash" }); s1 = await same("refunded"); ok(s1.refundDue == 0, "refund due cleared");
  r = await call(M + "/orders/" + n2, "DELETE"); ok(r.s == 200, "delete an order"); await same("order deleted");
  const pu = await call(M + "/purchases", "POST", { supplier: "ACME", lines: [{ id: big, qty: 10, cost: 9 }], pay: { status: "partial", method: "Cash", amount: 30 } }); ok(pu.s == 200, "purchase made"); let s2 = await same("purchase created"); ok(s2.supDue == 60 && s2.supBought == 90, "supplier dues exact: " + s2.supDue);
  r = await call(M + "/purchases/" + pu.j.number + "/payments", "POST", { amount: 20, method: "UPI" }); s2 = await same("purchase paid"); ok(s2.supDue == 40, "dues now 40");
  r = await call(M + "/purchases/" + pu.j.number + "?reverse=0", "DELETE"); s2 = await same("purchase deleted"); ok(s2.supDue == 0 && s2.purchases == 0, "dues gone with the purchase");

  // ranges: everything happened today, so today = 30 days = year
  sm = (await call(M + "/summary")).j; ok(sm.ranges[1].rev == sm.ranges[30].rev && sm.ranges[30].rev == sm.ranges[365].rev && sm.ranges[1].rev > 0, "ranges add up: " + sm.ranges[1].rev);
  // backdated orders land in the right window
  const st = DB.get("stores/ravi/stats/totals"), ist = d => new Date(Date.now() + 5.5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
  st.days[ist(-3)] = { s: 1000, c: 400, g: 100, p: 700 }; st.days[ist(-40)] = { s: 5000, c: 2000, g: 0, p: 5000 }; st.days[ist(-200)] = { s: 9000, c: 3000, g: 0, p: 9000 }; DB.put("stores/ravi/stats/totals", st);
  const base = sm.ranges; sm = (await call(M + "/summary")).j;
  ok(sm.ranges[30].rev == base[30].rev + 1000 && sm.ranges[30].prof == base[30].prof + 500, "30 days includes day -3, excludes day -40");
  ok(sm.ranges[365].rev == base[365].rev + 15000, "year includes all three");
  ok(sm.ranges[30].before == 5000, "previous 30 days = day -40: " + sm.ranges[30].before);
  await call(M + "/summary/rebuild", "POST");

  // ----- 5. pages, search, unpaid -----
  for (let i = 0; i < 105; i++) await inv({ name: "Cust " + i, phone: "9000000" + String(i).padStart(3, "0"), pay: { status: i % 2 ? "paid" : "unpaid", method: "UPI" } });
  const oldest = "Cust 0";
  let pg = (await call(M + "/orders")).j; ok(pg.more === true && pg.orders.length >= 100 && !!pg.cursor, "first page: " + pg.orders.length + " orders, more=" + pg.more);
  ok(!pg.orders.find(o => o.name == oldest), "oldest order is not on the first page");
  const seen = new Set(pg.orders.map(o => o.number)); let cur = pg.cursor, guard = 0;
  while (cur && guard++ < 5) { const nx = (await call(M + "/orders?before=" + encodeURIComponent(cur))).j; nx.orders.forEach(o => seen.add(o.number)); cur = nx.more ? nx.cursor : null; }
  const total = DB.size && [...DB.keys()].filter(k => /^stores\/ravi\/orders\/[^/]+$/.test(k)).length; ok(seen.size == total, "Load older reaches every order: " + seen.size + "/" + total);
  r = (await call(M + "/orders?q=" + encodeURIComponent("cust 0"))).j; ok(r.orders.some(o => o.name == oldest), "search finds an order that is not on the first page");
  r = (await call(M + "/orders?q=9000000104")).j; ok(r.orders.length == 1, "search by phone");
  r = (await call(M + "/orders?unpaid=1")).j; const wantU = [...DB.entries()].filter(([k, v]) => /^stores\/ravi\/orders\/[^/]+$/.test(k) && v.status != "Cancelled" && v.total - (v.paid || 0) > 0).length; ok(r.orders.length == Math.min(300, wantU), "unpaid scan returns every unpaid order: " + r.orders.length);
  const pp = (await call(M + "/purchases")).j; ok(Array.isArray(pp.purchases) && pp.more === false, "purchases list shape");
  // open orders always come with the first page, however old
  await same("after 105 more invoices");
  console.log("\nALL", pass, "PASSED"); srv.close(); process.exit(0);
})().catch(e => { console.error("FAIL", e.message.slice(0, 900)); process.exit(1); });
