// loads the file saved from the Firebase edition (test/../base/t/mv.js writes /tmp/move.json) into this Cloudflare edition
process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha Sarees";
process.env.FIREBASE_SERVICE_ACCOUNT="{}"; process.env.ADMIN_PASSWORD="pw-owner-1"; process.env.SESSION_SECRET="s";
const { DB } = require("./fake.js"); const app = require("../src/server.js"); const assert = require("assert");
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log("ok -", m); };
(async () => {
  const srv = app.listen(0), U = "http://127.0.0.1:" + srv.address().port, H = { "x-key": "pw-owner-1", "Content-Type": "application/json" }, M = "/api/manage/asha";
  const call = async (p, m = "GET", b) => { const r = await fetch(U + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  await call("/api/config");
  const file = JSON.parse(require("fs").readFileSync("/tmp/move.json", "utf8"));
  for (const c of ["store", "brands", "tags", "products", "photos", "orders"]) { const docs = file.parts[c] || []; if (!docs.length) continue; const r = await call(M + "/move-in", "POST", { c, docs }); ok(r.s === 200, "loaded " + c + " (" + docs.length + ")"); }
  const bad = await fetch(U + M + "/move-in", { method: "POST", headers: { "x-key": "nope", "Content-Type": "application/json" }, body: "{}" }); ok(bad.status === 401, "needs the owner password");
  const list = await call(M + "/products"); const p = list.j.find(x => x.name === "Moved Mug"); ok(p && p.price === 250 && p.description === "Nice mug", "product with price and description is there");
  const shop = await fetch(U + "/api/store/asha"); const sj = await shop.json(); const sp = (sj.products || []).find(x => x.name === "Moved Mug"); ok(sp && sp.photos && sp.photos.length === 1, "shop shows the product with its photo");
  const img = await fetch(U + sp.photos[0]); const buf = Buffer.from(await img.arrayBuffer()); ok(img.status === 200 && buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8, "photo is a real JPEG again (" + buf.length + " bytes)");
  const ord = await call(M + "/orders"); ok((ord.j.orders || []).length >= 1 && ord.j.orders[0].createdAt, "order history is there");
  console.log("MOVE-IN: ALL " + pass + " PASSED"); srv.close(); process.exit(0);
})().catch(e => { console.log("FAILED", e.message); process.exit(1); });
