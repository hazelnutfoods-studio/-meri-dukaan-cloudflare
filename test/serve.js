process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha Sarees";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s";
require("./fake.js"); const app = require("../src/server.js");
const srv = app.listen(3111, async () => {
  const O = "http://127.0.0.1:3111", call = async (p, m = "GET", b) => (await fetch(O + p, { method: m, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1" }, body: b ? JSON.stringify(b) : undefined })).json();
  await call("/api/config");
  const M = "/api/manage/asha";
  // a real-looking white 3:2 jpeg from canvas is not available here; use a tiny valid jpeg
  const jpg = require("fs").readFileSync(__dirname + "/p.jpg.b64", "utf8").trim();
  const ids = [];
  const names = ["Cotton Kurta Set Long Name Here", "Silk Saree Red", "Denim Jacket", "Linen Shirt", "Wool Shawl", "Tee"];
  for (let i = 0; i < names.length; i++) { const r = await call(M + "/products", "POST", { name: names[i], price: 1500 + i * 100, cost: 900, qty: 90 + i * 20, active: false, tags: [] }); await call(M + "/products/" + r.id + "/photos", "POST", { data: jpg }); await call(M + "/products/" + r.id, "PUT", { active: true }); ids.push(r.id); }
  await call(M + "/products", "POST", { name: "Big Stock Item", price: 99999, cost: 85000, qty: 12 });
  await call(M + "/products-import", "POST", { rows: [{ name: "Imported Mug" }, { name: "Imported Cap", price: 200 }] });
  await call(M + "/suppliers", "POST", { name: "ACME Textiles" });
  await fetch(O + "/api/store/asha/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Rohan Mehta", phone: "9876543210", address: "12 Long Street, Pune 411001", items: ids.map(id => ({ id, qty: 2 })) }) });
  await call(M + "/purchases", "POST", { supplier: "ACME Textiles", billNo: "B-12", lines: ids.slice(0, 5).map(id => ({ id, qty: 10, cost: 800 })), gst: 5, pay: { status: "partial", method: "UPI", amount: 10000 } });
  console.log("READY");
});
