// Counts what the database is asked for by each screen of a store with 100 products and 300 orders.
// Run: node test/efficiency.js
process.env.STORE_SLUG = "asha"; process.env.STORE_NAME = "Asha Sarees"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s";
const { d1 } = require("./fake.js"); const app = require("../src/server.js");
(async () => {
  const srv = app.listen(0), U = "http://127.0.0.1:" + srv.address().port, M = "/api/manage/asha";
  const call = async (p, m = "GET", b) => { const r = await fetch(U + p, { method: m, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1" }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  await call("/api/config"); const jpg = require("fs").readFileSync(__dirname + "/p.jpg.b64", "utf8").trim();
  await call(M + "/tags", "POST", { name: "Sweet" });
  const ids = [];
  for (let i = 0; i < 100; i++) { const r = await call(M + "/products", "POST", { name: "Item " + i, price: 50 + i, cost: 30, qty: 500, tags: ["Sweet"], brand: "B" + (i % 5) }); ids.push(r.j.id); if (i < 20) { await call(M + "/products/" + r.j.id + "/photos", "POST", { data: jpg }); await call(M + "/products/" + r.j.id, "PUT", { active: true }); } }
  const admin = require("firebase-admin"), fs = admin.firestore(), TS = admin.firestore.Timestamp, bt = fs.batch(); // 300 older orders put straight in
  for (let i = 0; i < 300; i++) bt.set(fs.collection("stores").doc("asha").collection("orders").doc("old" + i), { number: "OLD-" + i, name: "C" + i, phone: "9876543210", address: "x", status: i % 10 == 0 ? "New" : "Delivered", total: 100, paid: 100, lines: [], createdAt: TS.fromDate(new Date(Date.now() - (i + 1) * 3600e3)) });
  await bt.commit();
  const rows = []; const count = async (name, fn) => { const q0 = d1.queries; let rr = 0; const orig = d1.db.prepare.bind(d1.db); d1.db.prepare = sql => { const st = orig(sql); const all = st.all.bind(st); st.all = (...a) => { const x = all(...a); rr += /^\s*SELECT/i.test(sql) ? x.length : 0; return x; }; return st; }; await fn(); d1.db.prepare = orig; rows.push([name, d1.queries - q0, rr]); };
  await count("Customer opens the shop (first time)", () => call("/api/store/asha"));
  await count("Customer opens the shop (again within 30 s)", () => call("/api/store/asha"));
  await count("Owner opens the backend (all lists)", async () => { await Promise.all([call(M + "/products"), call(M + "/suppliers"), call(M + "/tags"), call(M + "/orders"), call(M + "/drafts"), call(M + "/purchases"), call(M + "/summary"), call(M + "/brands")]); });
  await count("Backend checks for new orders (every minute)", () => call(M + "/orders/ping"));
  await count("Customer places an order", () => call("/api/store/asha/orders", "POST", { name: "Z", phone: "9876543210", address: "12 Long Street Pune", items: [{ id: ids[3], qty: 2 }] }));
  await count("Owner changes one product", () => call(M + "/products/" + ids[5], "PUT", { price: 77 }));
  const ph = (await call("/api/store/asha")).j.products[0].photos[0];
  await count("Photo shown to a customer (first time; then cached)", () => fetch(U + ph));
  console.log("\nWhat each action asks the database (D1 free plan: 5,000,000 rows read and 100,000 rows written per day)\n");
  for (const [n, q, r] of rows) console.log(String(n).padEnd(52), String(q).padStart(3) + " queries", String(r).padStart(5) + " rows read");
  process.exit(0);
})();
