// Runs against the real Cloudflare runtime started with `npm run dev` (port 8801): checks pages, database, photos, orders and PDFs.
const O = process.env.URL || "http://127.0.0.1:8801", K = "pw-owner-1", M = "/api/manage/asha";
const jpg = require("fs").readFileSync(__dirname + "/p.jpg.b64", "utf8").trim();
let bad = 0; const ok = (c, m) => { console.log((c ? "ok - " : "FAIL - ") + m); if (!c) bad++; };
const call = async (p, m = "GET", b, h = {}) => { const r = await fetch(O + p, { method: m, headers: { "Content-Type": "application/json", "x-key": K, ...h }, body: b ? JSON.stringify(b) : undefined }); let j = null; const ct = r.headers.get("content-type") || ""; try { j = ct.includes("json") ? await r.json() : null; } catch (e) {} return { s: r.status, j, r }; };
(async () => {
  let r = await fetch(O + "/"); ok(r.status == 200 && /<html/i.test(await r.text()), "shop page opens");
  r = await fetch(O + "/manage"); ok(r.status == 200 && /manage|Owner|Products/i.test(await r.text()), "owner page opens");
  r = await call("/api/config"); ok(r.j && r.j.slug == "asha", "config");
  r = await call(M + "/me"); ok(r.s == 200 && r.j.role == "owner", "owner key accepted");
  const tag = await call(M + "/tags", "POST", { name: "Chocolate" }); ok(tag.s == 200 || tag.s == 400, "tag created (or already there)");
  const p = await call(M + "/products", "POST", { name: "Smoke Bar", price: 50, cost: 30, qty: 10, brand: "Cocoa Co", tags: ["Chocolate"], o1: "Mint", o2: "100 g x 5 pieces" }); ok(p.s == 200 && p.j.id, "product created");
  const id = p.j.id;
  r = await call(M + "/products/" + id + "/photos", "POST", { data: jpg }); ok(r.s == 200 && r.j.id, "photo uploaded"); const ph = r.j.id;
  r = await fetch(O + "/api/photo/asha/" + ph); const buf = Buffer.from(await r.arrayBuffer()); ok(r.status == 200 && /image/.test(r.headers.get("content-type")) && buf.length > 100, "photo comes back as an image (" + buf.length + " bytes)");
  r = await fetch(O + "/api/photo/asha/" + ph); ok(r.status == 200, "photo again (edge cache)");
  r = await call(M + "/products/" + id, "PUT", { active: true }); ok(r.s == 200, "product made live");
  r = await call("/api/store/asha"); ok(r.s == 200 && r.j.products.some(x => x.name == "Smoke Bar" && x.brand == "Cocoa Co" && x.tags.includes("Chocolate")), "shop lists it with brand and tag");
  r = await call("/api/store/asha/orders", "POST", { name: "Ravi", phone: "9876543210", address: "12 Test Road, Mumbai", payMethod: "Cash", items: [{ id, qty: 2 }] }); ok(r.s == 200 && r.j.number, "order placed " + (r.j && r.j.number)); const num = r.j.number;
  r = await call(M + "/products"); ok(r.j.find(x => x.id == id).qty == 8, "stock went down to 8");
  r = await call(M + "/orders"); ok(r.s == 200 && r.j.orders.length >= 1, "orders list");
  r = await call(M + "/orders/ping"); ok(r.j.n == num, "light order check");
  r = await call(M + "/summary"); ok(r.s == 200 && r.j.ranges, "summary");
  const o = (await call(M + "/orders")).j.orders[0];
  r = await fetch(O + "/api/invoice/asha/" + num + "/pdf?k=" + encodeURIComponent(o.invKey) + "&dl=1"); const pdf = Buffer.from(await r.arrayBuffer()); ok(r.status == 200 && pdf.slice(0, 4).toString() == "%PDF", "invoice PDF made (" + pdf.length + " bytes) " + r.status);
  r = await call(M + "/invoices/export-link", "POST", { from: "2020-01-01", to: "2099-01-01", kind: "sales", party: "" }); ok(r.s == 200 && r.j.url, "export link");
  if (r.j && r.j.url) { const x = await fetch(O + r.j.url); const b = Buffer.from(await x.arrayBuffer()); ok(x.status == 200 && b.slice(0, 4).toString() == "%PDF", "invoices PDF export (" + b.length + " bytes)"); }
  r = await call(M + "/products-import", "POST", { rows: [{ name: "Imp A", brand: "NewBrand", qty: 3, price: 10 }] }); ok(r.s == 200 && r.j.created == 1, "import with brand");
  r = await call(M + "/brands"); ok(r.j.includes("NewBrand"), "brand list");
  r = await call(M + "/purchases", "POST", { supplier: "ACME", lines: [{ id, qty: 5, cost: 20, expiry: "2027-12-31" }], pay: { status: "unpaid" } }); ok(r.s == 200, "purchase");
  r = await fetch(O + "/api/store/asha", { headers: { "x-key": "" } }); ok(r.status == 200, "shop still fine");
  console.log(bad ? "FAILED " + bad : "ALL SMOKE CHECKS PASSED"); process.exit(bad ? 1 : 0);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
