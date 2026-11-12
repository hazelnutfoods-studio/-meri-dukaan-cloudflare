process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha Sarees";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s";
const { DB } = require("./fake.js");
const realFetch = global.fetch; global.fetch = (u, o) => String(u).includes("openfoodfacts") ? Promise.resolve(String(u).includes("8901058852929") ? { ok: true, json: async () => ({ status: 1, product: { product_name: "Dairy Milk Silk", brands: "Cadbury,Mondelez", quantity: "60 g" } }) } : { ok: true, json: async () => ({ status: 0 }) }) : realFetch(u, o);
const app = require("../src/server.js");
const { JSDOM } = require("jsdom");
const assert = require("assert");
let pass = 0; const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; throw new Error(m); } pass++; console.log("ok -", m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = app.listen(0), port = srv.address().port, ORIGIN = "http://127.0.0.1:" + port;
  const call = async (p, method = "GET", body) => { const r = await fetch(ORIGIN + p, { method, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1" }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
  await call("/api/config");
  const M = "/api/manage/asha", jpg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";
  const ids = [];
  for (let i = 1; i <= 5; i++) { const r = await call(M + "/products", "POST", { name: "Item " + i, price: 1000 * i, cost: 500 * i, qty: 100, active: false }); await call(M + "/products/" + r.id + "/photos", "POST", { data: jpg }); await call(M + "/products/" + r.id, "PUT", { active: true }); ids.push(r.id); }
  await call(M + "/suppliers", "POST", { name: "ACME" });
  const ro = await fetch(ORIGIN + "/api/store/asha/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Cust", phone: "9876543210", address: "12 Long Street, Pune 411001", items: ids.map(id => ({ id, qty: 1 })) }) }); console.log("order", ro.status, (await ro.text()).slice(0, 80));


  const sub = async (p, m = "GET", b) => { const r = await realFetch(ORIGIN + M + p, { method: m, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1" }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const r1 = await sub("/products", "POST", { name: "Silk", price: 100, cost: 50, qty: 3, active: false, barcode: "8901058852929" }); ok(r1.s === 200, "product with barcode saved");
  ok((await sub("/products", "POST", { name: "Dup", price: 1, active: false, barcode: "8901058852929" })).s === 400, "same barcode refused");
  ok((await sub("/products", "POST", { name: "Dup2", price: 1, active: false, barcode: "08901058852929" })).s === 400, "same barcode with a leading zero refused");
  ok((await sub("/products", "POST", { name: "Bad", price: 1, active: false, barcode: "12ab" })).s === 400, "letters refused");
  const l1 = await sub("/barcode/8901058852929"); ok(l1.j.mine && l1.j.mine.name === "Silk", "lookup finds own product");
  const l2 = await sub("/barcode/7622210449283"); ok(l2.s === 200 && !l2.j.found && !l2.j.mine, "unknown code: nothing found");
  const l3 = await sub("/products", "POST", { name: "Other", price: 1, active: false }); const up = await sub("/products/" + l3.j.id, "PUT", { barcode: "8901058852929" }); ok(up.s === 400, "cannot move a barcode onto a second product");
  ok((await sub("/barcode/abc")).s === 400, "bad code refused");
  ok((await sub("/products/" + r1.j.id, "PUT", { barcode: "8901058852929", name: "Silk 60g" })).s === 200, "own barcode can be saved again");

  await sub("/products/" + r1.j.id, "PUT", { barcode: "" }); const l4 = await sub("/barcode/8901058852929"); ok(l4.j.found && l4.j.found.name === "Cadbury Dairy Milk Silk" && /60 g/.test(l4.j.found.description), "new code is looked up: " + JSON.stringify(l4.j));

  const html = require("fs").readFileSync(__dirname + "/../public/manage.html", "utf8");
  const dom = new JSDOM(html, { url: ORIGIN + "/manage", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { w.__CFG = { slug: "asha", name: "Asha Sarees" };
    w.localStorage.setItem("login:asha", JSON.stringify({ key: "pw-owner-1", tok: "" }));
    w.fetch = (u, o) => realFetch(u.startsWith("http") ? u : ORIGIN + u, o);
    w.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
    w.alert = m => { w.__alerts.push(m); }; w.__alerts = []; w.confirm = () => true; w.scrollTo = () => {};
    w.addEventListener("error", e => { console.error("PAGE ERROR", e.message); process.exit(1); }); } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id); await sleep(1200);
  w.eval("openProd()"); ok(d.querySelector('#dlg input[name="barcode"]') && /Scan/.test(d.querySelector("#dlg").textContent), "product form has barcode box and Scan button");
  w.eval("closeM(); openCreate()"); ok(/Scan barcode/.test($("dlg").textContent), "Create menu offers Scan barcode");
  w.eval("closeM(); scanToAdd()"); await sleep(100); ok($("scm") && $("scs"), "scanner opens with a number box");
  $("scm").value = "8901058852929"; w.eval("scanManual()"); await sleep(600);
  ok(d.querySelector('#dlg input[name="name"]').value === "Cadbury Dairy Milk Silk" && d.querySelector('#dlg input[name="barcode"]').value === "8901058852929", "typed barcode fills the new product form");
  w.eval("closeM(); scanToAdd()"); await sleep(50); $("scm").value = "12"; w.eval("scanManual()"); ok(/6 to 14 digits/.test($("scs").textContent), "short number refused in scanner");
  w.eval("closeM()");
  console.log("BARCODE: ALL " + pass + " PASSED"); process.exit(0);
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
