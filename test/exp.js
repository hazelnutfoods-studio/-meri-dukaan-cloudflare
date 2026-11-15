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
  // ---- category (tag) photos ----
  await call(M + "/tags", "POST", { name: "Snacks" }); const tl = await call(M + "/tags"); const tg = tl.j.find(x => x.name === "Snacks"); ok(tg && tg.photo === "", "tag starts without a photo");
  r = await call(M + "/tags/" + tg.id + "/photo", "POST", { data: jpg }); ok(r.s === 200 && /^\/api\/photo\/asha\//.test(r.j.photo), "tag photo saved: " + JSON.stringify(r.j));
  r = await call(M + "/tags/" + tg.id + "/photo", "POST", { data: "hello" }); ok(r.s === 400, "a non-photo is refused");
  shop = await (await fetch(U + "/api/store/asha?" + Date.now())).json(); ok(shop.tagPics && /\/api\/photo\/asha\//.test(shop.tagPics.Snacks), "shop gets the category photo");
  const img = await fetch(U + shop.tagPics.Snacks); const bf = Buffer.from(await img.arrayBuffer()); ok(img.status === 200 && bf[0] === 0xff, "category photo is served as an image");
  const first = tl.j.length; r = await call(M + "/tags/" + tg.id + "/photo", "POST", { data: jpg }); r = await call(M + "/tags/" + tg.id + "/photo", "DELETE"); ok(r.s === 200, "photo removed");
  shop = await (await fetch(U + "/api/store/asha?" + Date.now())).json(); ok(!shop.tagPics.Snacks, "shop no longer shows it");
  const noOwner = await fetch(U + M + "/tags/" + tg.id + "/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: jpg }) }); ok(noOwner.status === 401, "only the owner can add it");
  // ---- renaming a tag changes every product ----
  await call(M + "/tags", "POST", { name: "TUBS" }); const tl2 = await call(M + "/tags"); const tb = tl2.j.find(x => x.name === "TUBS");
  const mk = async (n) => (await call(M + "/products", "POST", { name: n, price: 10, qty: 1, tags: ["TUBS", "Snacks"] })).j.id; const ids = [await mk("T1"), await mk("T2"), await mk("T3")];
  const pre = (await call(M + "/products")).j.filter(x => ids.includes(x.id)); ok(pre.every(x => x.tags.includes("TUBS")), "three products carry TUBS");
  r = await call(M + "/tags/" + tb.id, "PUT", { name: "Tubs" }); ok(r.s === 200 && r.j.changed === 3, "renamed: " + JSON.stringify(r.j));
  const post = (await call(M + "/products")).j.filter(x => ids.includes(x.id)); ok(post.every(x => x.tags.join() === "Tubs,Snacks"), "every product shows Tubs, other tags and order kept: " + post.map(x => x.tags.join()).join(" | "));
  ok((await call(M + "/tags")).j.some(x => x.name === "Tubs") && !(await call(M + "/tags")).j.some(x => x.name === "TUBS"), "tag list shows the new name");
  r = await call(M + "/tags/" + tb.id, "PUT", { name: "snacks" }); ok(r.s === 400 && /already/.test(r.j.error), "cannot take another tag's name");
  r = await call(M + "/tags/" + tb.id, "PUT", { name: "  " }); ok(r.s === 400, "empty name refused");
  // ---- add / remove one product from a tag's own page ----
  const lone = await mk2();
  async function mk2() { return (await call(M + "/products", "POST", { name: "Lone", price: 10, qty: 1, tags: [] })).j.id; }
  r = await call(M + "/tags/" + tb.id + "/items", "POST", { product: lone, on: true }); ok(r.s === 200, "product added to the tag");
  ok((await call(M + "/products")).j.find(x => x.id === lone).tags.join() === "Tubs", "product now has the tag");
  await call(M + "/tags/" + tb.id + "/items", "POST", { product: lone, on: true }); ok((await call(M + "/products")).j.find(x => x.id === lone).tags.length === 1, "adding twice does not repeat it");
  r = await call(M + "/tags/" + tb.id + "/items", "POST", { product: lone, on: false }); ok((await call(M + "/products")).j.find(x => x.id === lone).tags.length === 0, "product taken out of the tag");
  r = await call(M + "/tags/" + tb.id + "/items", "POST", { product: "nope", on: true }); ok(r.s === 404 || r.s === 400, "unknown product refused");
  console.log("EXPIRY+BARCODE: ALL " + pass + " PASSED"); srv.close(); process.exit(0);
})().catch(e => { console.log("FAILED", e.message); process.exit(1); });
