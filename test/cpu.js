// how much computer time one product save takes when the shop has many products (free Cloudflare allows about 10 ms of it per request)
process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha"; process.env.FIREBASE_SERVICE_ACCOUNT="{}"; process.env.ADMIN_PASSWORD="pw-owner-1"; process.env.SESSION_SECRET="s";
const { DB } = require("./fake.js"); const app = require("../src/server.js");
(async () => {
  const srv = app.listen(0), U = "http://127.0.0.1:" + srv.address().port, H = { "x-key": "pw-owner-1", "Content-Type": "application/json" }, M = "/api/manage/asha";
  const call = async (p, m = "GET", b) => { const r = await fetch(U + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  await call("/api/config");
  const ids = []; for (let i = 0; i < 400; i++) { const r = await call(M + "/products", "POST", { name: "Item " + i, price: 100 + i, cost: 50, qty: 5, barcode: "89012345" + String(1000 + i), description: "A product with some text ".repeat(8), flavour: "Milk chocolate", weight: 160, unit: "g" }); ids.push(r.j.id); }
  const id = ids[7]; const was = await call(M + "/products"); const p = was.j.find(x => x.id === id);
  const time = async (b) => { const c0 = process.cpuUsage(); const r = await call(M + "/products/" + id, "PUT", b); const c = process.cpuUsage(c0); return { s: r.s, ms: Math.round((c.user + c.system) / 1000) }; };
  console.log("edit, barcode unchanged:", JSON.stringify(await time({ name: "Item 7 renamed", price: 120, barcode: p.barcode })));
  console.log("edit, no barcode field:  ", JSON.stringify(await time({ name: "Item 7 again", price: 121 })));
  console.log("edit, barcode changed:   ", JSON.stringify(await time({ barcode: "9990001112223" })));
  srv.close(); process.exit(0);
})();
