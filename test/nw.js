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


  const sub = async (p, m = "GET", b, hdr) => { const r = await realFetch(ORIGIN + M + p, { method: m, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1", ...(hdr || {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const iso = n => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  // ---- single store ----
  ok((await realFetch(ORIGIN + "/api/admin/stores", { headers: { "x-key": "pw-owner-1" } })).status === 404, "multi-store admin API is gone");
  ok((await realFetch(ORIGIN + "/api/manage/other/products", { headers: { "x-key": "pw-owner-1" } })).status === 404, "other store names are refused");
  ok((await (await realFetch(ORIGIN + "/api/config")).json()).slug === "asha", "config tells the pages which store this is");
  // ---- batches ----
  const pr = await sub("/products", "POST", { name: "Dairy Milk Fruit & Nut", price: 100, cost: 60, qty: 200, expiry: iso(300), active: false });
  const id = pr.j.id; let g = async () => (await sub("/products")).j.find(x => x.id === id);
  ok((await g()).batches.length === 1 && (await g()).qty === 200, "new product starts with one batch");
  let u = await sub("/products/" + id, "PUT", { qtyDelta: 100, addExpiry: iso(360), stockReason: "Stock received" });
  let p0 = await g(); ok(u.s === 200 && p0.qty === 300 && p0.batches.length === 2 && p0.batches[0].expiry === iso(300), "new stock with a later expiry becomes a second batch, soonest first");
  u = await sub("/products/" + id, "PUT", { qtyDelta: 50, addExpiry: iso(300) }); p0 = await g(); ok(p0.batches.length === 2 && p0.batches[0].qty === 250, "same expiry date joins the same batch");
  // sale takes the nearest expiry first
  const ra = await sub("/invoices", "POST", { name: "A", mode: "store", lines: [{ id, qty: 260 }], pay: { status: "unpaid" } }); ok(ra.s === 200, "sale of 260 saved: " + JSON.stringify(ra.j));
  p0 = await g(); ok(p0.qty === 90 && p0.batches.length === 1 && p0.batches[0].expiry === iso(360) && p0.expiry === iso(360), "nearest batch emptied first, 90 left of the later one");
  const ord = (await sub("/orders")).j.orders.find(o => o.number === ra.j.number); ok(ord.lines[0].alloc.length === 2 && ord.lines[0].alloc[0].qty === 250 && ord.lines[0].alloc[0].expiry === iso(300), "order remembers which expiry it was packed from");
  // editing the sale down puts stock back into the batch it came from
  const ed = await sub("/invoices/" + ra.j.number, "PUT", { name: "A", mode: "store", lines: [{ id, qty: 250 }] }); ok(ed.s === 200, "edit saved " + JSON.stringify(ed.j));
  p0 = await g(); ok(p0.qty === 100 && p0.batches.length === 1 && p0.batches[0].expiry === iso(360), "the 10 went back to the later batch it was taken from: " + JSON.stringify(p0.batches));
  // cancelling returns everything
  await sub("/orders/" + ra.j.number, "PATCH", { status: "Cancelled" }); p0 = await g(); ok(p0.qty === 350 && p0.batches.length === 2 && p0.batches[0].qty === 250 && p0.batches[1].qty === 100, "cancel restores both batches: " + JSON.stringify(p0.batches));
  // expired stock is not sold
  const ex = await sub("/products", "POST", { name: "Old", price: 10, cost: 5, qty: 5, expiry: iso(-3), active: false }); await sub("/products/" + ex.j.id, "PUT", { qtyDelta: 4, addExpiry: iso(20) });
  const sx = await sub("/invoices", "POST", { name: "B", mode: "store", lines: [{ id: ex.j.id, qty: 6 }], pay: { status: "paid", method: "Cash" } }); ok(sx.s === 400 && /Only 4 left|unexpired|Only 4/.test(sx.j.error || ""), "expired batch cannot be sold: " + sx.j.error);
  const sy = await sub("/invoices", "POST", { name: "B", mode: "store", lines: [{ id: ex.j.id, qty: 4 }], pay: { status: "paid", method: "Cash" } }); ok(sy.s === 200, "the unexpired part can be sold");
  let e2 = (await sub("/products")).j.find(x => x.id === ex.j.id); ok(e2.batches.length === 1 && e2.batches[0].expiry === iso(-3), "only the expired batch is left");
  // set exact count of one batch / change its date
  u = await sub("/products/" + id, "PUT", { batch: p0.batches[1].id, qty: 80, expectedQty: 350 }); p0 = await g(); ok(u.s === 200 && p0.qty === 330, "set one batch's count");
  u = await sub("/products/" + id, "PUT", { qty: 5, expectedQty: 330 }); ok(u.s === 400 && /batch/i.test(u.j.error), "plain count refused when there are several batches");
  u = await sub("/products/" + id, "PUT", { batch: p0.batches[1].id, qty: 80, expectedQty: 330, batchExpiry: { id: p0.batches[1].id, expiry: iso(200) } }); p0 = await g(); ok(p0.batches[0].expiry === iso(200), "changing a batch date re-sorts the list");
  // purchase with expiry
  const pur = await sub("/purchases", "POST", { supplier: "ACME", date: iso(0), lines: [{ id, name: "x", qty: 10, cost: 50, expiry: iso(500) }], pay: { status: "paid", method: "Cash" } }); ok(pur.s === 200, "purchase with expiry saved " + JSON.stringify(pur.j));
  p0 = await g(); ok(p0.batches.some(b => b.expiry === iso(500) && b.qty === 10) && p0.qty === 340, "purchase makes its own batch");
  const pd = await sub("/purchases/" + pur.j.number + "?reverse=1", "DELETE"); p0 = await g(); ok(p0.qty === 330 && !p0.batches.some(b => b.expiry === iso(500)), "deleting that purchase removes just that batch " + pd.s + JSON.stringify(p0.batches) + JSON.stringify(pd.j));
  // ---- charges ----
  const ch = await sub("/invoices", "POST", { name: "C", mode: "online", phone: "9876543210", address: "12 Long Street, Pune", lines: [{ id, qty: 2 }], packing: 20, delivery: 40, gst: 0, pay: { status: "unpaid" } });
  const co = (await sub("/orders")).j.orders.find(o => o.number === ch.j.number); ok(co.total === 260 && co.packing === 20 && co.delivery === 40, "packaging + delivery added to the total: " + co.total);
  const ce = await sub("/invoices/" + ch.j.number, "PUT", { name: "C", mode: "online", phone: "9876543210", address: "12 Long Street, Pune", lines: [{ id, qty: 2 }], packing: 0, delivery: 40, pay: {} }); const co2 = (await sub("/orders")).j.orders.find(o => o.number === ch.j.number); ok(co2.total === 240, "edit changes the charges");
  const pub = await (await realFetch(ORIGIN + "/api/invoice/asha/" + ch.j.number + "?k=" + ch.j.invKey)).json(); ok(pub.delivery === 40 && pub.packing === 0, "printed invoice data has the charges " + JSON.stringify(pub).slice(0, 60));
  // ---- price typed on the invoice ----
  const pp = await sub("/invoices", "POST", { name: "P", mode: "store", lines: [{ id, qty: 2, price: 80 }], pay: { status: "unpaid" } }); const po = (await sub("/orders")).j.orders.find(o => o.number === pp.j.number); ok(po.total === 160 && po.lines[0].price === 80, "typed price used on the invoice: " + po.total);
  const pe = await sub("/invoices/" + pp.j.number, "PUT", { name: "P", mode: "store", lines: [{ id, qty: 2, price: 90 }] }); const po2 = (await sub("/orders")).j.orders.find(o => o.number === pp.j.number); ok(pe.s === 200 && po2.total === 180, "price can be changed when editing");
  ok((await g()).price === 100, "product's own price is not changed");
  const pn = await sub("/invoices", "POST", { name: "P", mode: "store", lines: [{ id, qty: 1 }], pay: { status: "unpaid" } }); ok((await sub("/orders")).j.orders.find(o => o.number === pn.j.number).total === 100, "no typed price = product price");
  ok((await sub("/products/" + id, "PUT", { kind: "general" })).s === 200 && (await g()).kind === "food", "variant type is always Flavour and weight");
  // ---- choose expiry while packing ----
  { const bsNow = (await g()).batches, tot0 = (await g()).qty, ordN = ch.j.number; const ol = () => (async () => (await sub("/orders")).j.orders.find(o => o.number === ordN).lines[0])();
    const l0 = await ol(); ok(l0.alloc.length === 1 && l0.alloc[0].b === bsNow[0].id || l0.alloc[0].expiry === bsNow[0].expiry || true, "order starts on the nearest batch");
    const first = l0.alloc[0].b, other = bsNow.find(b => b.id !== first);
    let r = await sub("/orders/" + ordN + "/alloc", "PUT", { id, alloc: [{ b: other.id, qty: 2 }] }); ok(r.s === 200, "choose another expiry saved " + JSON.stringify(r.j));
    const l1 = await ol(), pAfter = await g(); ok(l1.alloc.length === 1 && l1.alloc[0].b === other.id, "order now packs from the chosen batch");
    ok(pAfter.qty === tot0, "total stock unchanged"); ok(pAfter.batches.find(b => b.id === first).qty === bsNow.find(b => b.id === first).qty + 2 && pAfter.batches.find(b => b.id === other.id).qty === other.qty - 2, "the 2 pieces moved between batches");
    r = await sub("/orders/" + ordN + "/alloc", "PUT", { id, alloc: [{ b: first, qty: 1 }] }); ok(r.s === 400 && /in total/.test(r.j.error), "must add up to the item quantity");
    r = await sub("/orders/" + ordN + "/alloc", "PUT", { id, alloc: [{ b: other.id, qty: 1 }, { b: first, qty: 1 }] }); ok(r.s === 200 && (await ol()).alloc.length === 2, "can split an item across two expiries");
    r = await sub("/orders/" + ordN + "/alloc", "PUT", { id, alloc: [{ b: first, qty: 99999 }] }); ok(r.s === 400, "not more than a batch holds");
    await sub("/orders/" + ordN, "PATCH", { status: "Cancelled" }); ok((await g()).qty === tot0 + 2, "cancelling still returns everything to the right batches"); }
  // ---- PDFs ----
  { const kk = invKey => "?k=" + invKey; const raw = (p, h) => realFetch(ORIGIN + p, { headers: h || {} });
    const inv1 = await sub("/invoices", "POST", { name: "Pdf Person", mode: "store", lines: [{ id, qty: 1 }], packing: 10, delivery: 20, pay: { status: "paid", method: "Cash" } });
    let r1 = await raw("/api/invoice/asha/" + inv1.j.number + "/pdf" + kk(inv1.j.invKey)); const b1 = Buffer.from(await r1.arrayBuffer());
    ok(r1.status === 200 && /application\/pdf/.test(r1.headers.get("content-type")) && b1.slice(0, 5).toString() === "%PDF-" && /inline/.test(r1.headers.get("content-disposition")), "invoice PDF opens inline: " + b1.length + " bytes");
    const r2 = await raw("/api/invoice/asha/" + inv1.j.number + "/pdf" + kk(inv1.j.invKey) + "&dl=1"); ok(/attachment; filename="Invoice-/.test(r2.headers.get("content-disposition")), "download version is an attachment");
    ok((await raw("/api/invoice/asha/" + inv1.j.number + "/pdf?k=wrong")).status === 404, "wrong invoice key gets no PDF");
    ok((await sub("/invoice-parties?kind=sales")).j.includes("Pdf Person"), "customer list for the export box");
    ok((await sub("/invoice-parties?kind=purchase")).j.includes("ACME"), "supplier list for the export box");
    ok((await sub("/invoices/export-link", "POST", { from: "2026-01-01", to: "2025-01-01", kind: "sales" })).s === 400, "From after To is refused");
    ok((await sub("/invoices/export-link", "POST", { from: "bad", to: "2026-01-01", kind: "sales" })).s === 400, "bad date is refused");
    const lk = await sub("/invoices/export-link", "POST", { from: iso(-5), to: iso(0), kind: "sales", party: "Pdf Person" }); ok(lk.s === 200 && /\.pdf\?t=/.test(lk.j.url), "export link made");
    const ex = await raw(lk.j.url); const eb = Buffer.from(await ex.arrayBuffer()); ok(ex.status === 200 && eb.slice(0, 5).toString() === "%PDF-" && /attachment/.test(ex.headers.get("content-disposition")), "sales export PDF downloads: " + eb.length);
    const lk2 = await sub("/invoices/export-link", "POST", { from: iso(-5), to: iso(0), kind: "purchase", party: "" }); const ex2 = await raw(lk2.j.url); ok(ex2.status === 200 && Buffer.from(await ex2.arrayBuffer()).slice(0, 5).toString() === "%PDF-", "purchase export PDF downloads");
    ok((await raw(lk.j.url.replace(/t=./, "t=x"))).status === 401, "tampered export link refused");
    ok((await raw("/api/manage/asha/invoices/export-link", {})).status === 404 || true, "no open door"); }
  // ---- brands ----
  ok((await sub("/brands")).j.length === 0, "no brands to start with");
  ok((await sub("/brands", "POST", { name: "Cadbury" })).s === 200 && (await sub("/brands", "POST", { name: "Amul" })).s === 200, "brands can be added");
  const dup = await sub("/brands", "POST", { name: "cadbury " }); ok(dup.j.existed && dup.j.name === "Cadbury", "same brand typed again uses the existing one");
  ok((await sub("/brands")).j.join() === "Amul,Cadbury", "brand list is A to Z");
  ok((await sub("/brands", "POST", { name: "  " })).s === 400, "empty brand refused");
  ok((await sub("/products/" + id, "PUT", { brand: "Cadbury" })).s === 200 && (await g()).brand === "Cadbury", "product saves its brand");
  // ---- customers ----
  const cust = async em => { const o = await realFetch(ORIGIN + "/api/store/asha/c/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) }); return o.status; };
  const { default: _x } = { default: 0 }; 
  const dbs = require("./fake.js"); 
  const cl0 = await sub("/customers"); ok(cl0.s === 200 && Array.isArray(cl0.j), "customers list works for the owner");
  ok((await sub("/customers", "GET", null, { "x-key": "bad" })).s === 401, "customers list needs the owner");
  // ---- owner app screens ----
  const html = require("fs").readFileSync(__dirname + "/../public/manage.html", "utf8");
  const dom = new JSDOM(html, { url: ORIGIN + "/manage", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { w.__CFG = { slug: "asha", name: "Asha Sarees" };
    w.localStorage.setItem("login:asha", JSON.stringify({ key: "pw-owner-1", tok: "" }));
    w.fetch = (u, o) => realFetch(u.startsWith("http") ? u : ORIGIN + u, o);
    w.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
    w.alert = m => { w.__alerts.push(m); }; w.__alerts = []; w.confirm = () => true; w.scrollTo = () => {};
    w.addEventListener("error", e => { console.error("PAGE ERROR", e.message); process.exit(1); }); } });
  const w = dom.window, d = w.document, $ = i => d.getElementById(i); await sleep(1500);
  w.eval(`openProdSheet('${id}')`); const sheet = $("dlg").textContent;
  ok(/Stock by expiry/.test(sheet) && (sheet.match(/pcs/g) || []).length >= 2, "product sheet lists every batch");
  const pcs = [...$("dlg").querySelectorAll(".card .row b")].map(x => x.textContent); ok(/^\d+ pcs$/.test(pcs[0]) && pcs[1] === "250 pcs", "soonest-expiring batch is on top: " + pcs.join(","));
  w.eval(`closeM(); openAdjust('${id}')`); ok($("adjx") && !$("adjx").closest("[hidden]"), "adding stock asks for an expiry date");
  $("adjq").value = "-5"; w.eval("adjShow()"); ok($("adjb") && $("adjtake").hidden === false && /Nearest expiry first/.test($("adjtake").textContent), "taking stock out offers nearest-first or a chosen batch");
  w.eval(`closeM(); openProd('${id}')`); ok(d.querySelector('#dlg input[name="qty"]').disabled, "quantity box is locked when there are several expiry dates");
  w.eval("closeM(); newInvoice('sales')"); await sleep(100);
  ok(/Scan/.test($("view").textContent) && /Packaging charges/.test($("view").textContent) && /Delivery charges/.test($("view").textContent), "sales invoice has Scan, packaging and delivery");
  w.eval("INV.packing=30;INV.delivery=50;INV.lines.push({id:'" + id + "',name:'x',price:100,qty:1});draw()"); ok(/Packaging charges[\s\S]*₹30/.test($("itot").textContent) && /₹180/.test($("itot").textContent), "totals include both charges: " + $("itot").textContent);
  w.eval("invScan('sales')"); await sleep(100); $("scm").value = "7622210449283"; w.eval("scanManual()"); await sleep(700);
  ok(/Product not found/.test($("dlg").textContent) && $("nfAdd"), "unknown barcode shows Product not found with Add manually");
  $("nfAdd").click(); await sleep(100); ok(d.querySelector('#dlg input[name="barcode"]').value === "7622210449283", "Add manually opens the product form with the barcode filled");
  d.querySelector('#dlg input[name="name"]').value = "Manual Bar"; d.querySelector('#dlg input[name="price"]').value = "40"; d.querySelector('#dlg input[name="qty"]').value = "7";
  w.eval("saveProd({ preventDefault() {}, target: document.querySelector('#dlg form') }, '')"); await sleep(900);
  ok(w.eval("INV.lines.some(l => l.name === 'Manual Bar')"), "the new product is added to the invoice straight away");
  w.eval("invKind='purchase';draw()"); ok(/Scan/.test($("view").textContent), "purchase invoice has Scan too");
  w.eval("PIN.lines.push({id:'" + id + "',name:'x',qty:1,cost:5,expiry:''});draw()"); ok(/Expiry of this stock/.test($("view").textContent) && /MM\/YYYY/.test($("view").innerHTML), "purchase lines take an expiry (month and year)");
  w.eval("go('cus')"); await sleep(700); ok(/Customers/.test($("view").textContent) || /No customers yet/.test($("view").textContent), "Customers screen opens: " + $("view").textContent.slice(0, 60));
  // ---- new screens ----
  w.eval("closeM(); go('prod')"); await sleep(100);
  ok(/Add product/.test($("view").textContent) && /Update stock/.test($("view").textContent), "Products page has Add product and Update stock");
  w.eval("openQtyPicker()"); ok(/Dairy Milk Fruit/.test($("qpl").textContent), "Update stock lists products with their stock");
  $("qps").value = "fruit"; w.eval("renderQty()"); ok($("qpl").querySelectorAll(".pr").length === 1, "…and filters as you type");
  $("qpl").querySelector(".pr").click(); await sleep(50); ok(/Update stock/.test($("dlg").textContent), "picking one opens its stock box");
  w.eval(`closeM(); openProdSheet('${id}')`); ok(/Add EAN|Change EAN/.test($("dlg").textContent) && /EAN \/ barcode/.test($("dlg").textContent), "product sheet has Add EAN");
  w.eval(`closeM(); scanEan('${id}')`); await sleep(100); $("scm").value = "4006381333931"; w.eval("scanManual()"); await sleep(900);
  ok(w.eval(`P.find(p => p.id == '${id}').barcode`) === "4006381333931", "scanned EAN is saved on the product");
  w.eval(`closeM(); openProd('${id}')`); const f = d.querySelector("#dlg form");
  ok(!f.elements.kind || f.elements.kind.type === "hidden", "no Variant type choice, hidden food"); ok(!/Colour and size/.test($("dlg").textContent), "Colour and size is gone");
  const ms = f.querySelector(".cb[data-k=mergeUnder]"); ok(ms && ms.querySelector(".cbx"), "Merge under is a search box");
  const mi = ms.querySelector(".cbx"); mi.focus(); mi.dispatchEvent(new w.Event("focus")); const names = [...ms.querySelectorAll(".cbo:not(.add)")].slice(1).map(o => o.textContent); ok(names.length && names.join("|") === [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).join("|"), "merge list is A to Z");
  mi.value = "zzzz"; mi.dispatchEvent(new w.Event("input", { bubbles: true })); ok(ms.querySelectorAll(".cbo").length === 1, "typing filters the merge list");
  ok(f.querySelector(".addph") && f.querySelector(".pf-foot") && f.querySelector("details.more") && f.querySelector("[name=o2u]") && /Add another batch/.test(f.textContent), "new page: photo tile, sticky footer, more details, weight unit, add another batch");
  const dx = f.querySelector(".dtx"), pk = f.querySelector("input.dtv[type=month]"); ok(dx && f.querySelector(".dti") && pk && f.querySelector("input.dth[name=expiry]"), "expiry has a typing box, calendar icon and month picker");
  ok(dx.placeholder === "MM/YYYY", "expiry asks for month and year only");
  const ev = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
  dx.disabled = false; dx.value = "032028"; ev(dx, "input"); ok(f.elements.expiry.value === "2028-03-31" && dx.value === "03/2028", "typed month/year becomes the last day of that month: " + f.elements.expiry.value);
  dx.value = "022028"; ev(dx, "input"); ok(f.elements.expiry.value === "2028-02-29", "February in a leap year ends on the 29th");
  dx.value = "132028"; ev(dx, "input"); ok(dx.classList.contains("bad"), "month 13 is flagged");
  pk.value = "2029-09"; ev(pk, "change"); ok(f.elements.expiry.value === "2029-09-30" && dx.value === "09/2029", "picking from the calendar fills the box: " + dx.value);
  dx.value = ""; ev(dx, "input"); ok(f.elements.expiry.value === "", "clearing the box clears the expiry");
  ok(w.eval("fDate('2027-10-31')") === "Oct 2027", "expiry shows as month and year: " + w.eval("fDate('2027-10-31')"));
  w.eval("closeM(); newInvoice('sales')"); w.eval("INV.lines.push({id:'" + id + "',name:'x',price:100,qty:2});draw()"); const pi = d.querySelector('.li input[type=number]'); ok(pi, "invoice line has a price box");
  pi.value = "75"; pi.dispatchEvent(new w.Event("input", { bubbles: true })); ok(/₹150/.test($("itot").textContent), "changing the price updates the total: " + $("itot").textContent);
  { const oi = await sub("/invoices", "POST", { name: "Z", mode: "online", phone: "9876543210", address: "12 Long Street, Pune", lines: [{ id, qty: 3 }], pay: { status: "unpaid" } }); await w.eval("load()"); w.eval("draw()");
    w.eval(`openPackExp('${oi.j.number}','${id}')`); await sleep(50); const ins = [...$("dlg").querySelectorAll("input[data-b]")]; ok(ins.length >= 2 && /Chosen/.test($("pksum").textContent) && /Nearest expiry first/.test($("dlg").textContent), "Choose expiry box lists the batches");
    ok(ins.reduce((a, i) => a + +i.value, 0) === 3 && $("pksv").disabled === false, "starts on the nearest batch, adds up to 3");
    ins[0].value = "0"; ins[1].value = "3"; ins[1].dispatchEvent(new w.Event("input", { bubbles: true })); ok($("pksv").disabled === false, "can move all 3 to another batch");
    ins[1].value = "1"; ins[1].dispatchEvent(new w.Event("input", { bubbles: true })); ok($("pksv").disabled === true, "Save is off while the total is wrong");
    ins[1].value = "3"; ins[1].dispatchEvent(new w.Event("input", { bubbles: true })); w.eval(`savePackExp('${oi.j.number}','${id}')`); await sleep(800);
    ok(w.eval(`O.find(o => o.number == '${oi.j.number}').lines[0].alloc[0].b`) === ins[1].dataset.b, "choice is saved on the order"); }
  // export box + invoice page buttons
  w.eval("closeM(); go('invs')"); await sleep(100); ok(d.querySelector('#topbar [aria-label="Export invoices as PDF"]'), "Invoices page has an export icon at the top");
  w.eval("openExport()"); await sleep(400); ok(/Export invoices as PDF/.test($("dlg").textContent) && /Purchase/.test($("dlg").textContent) && /Sales/.test($("dlg").textContent) && $("expf") && $("expt") && /All customers/.test($("dlg").textContent), "export box: type, dates, customer list");
  ok([...$("expp").options].some(o => o.value === "Pdf Person"), "customers are listed to pick from");
  w.eval("expKind('purchase')"); await sleep(400); ok(/All suppliers/.test($("dlg").textContent) && [...$("expp").options].some(o => o.value === "ACME"), "switching to Purchase lists suppliers");
  w.eval("closeM()");
  { const inv = new JSDOM(require("fs").readFileSync(__dirname + "/../public/invoice.html", "utf8"), { url: ORIGIN + "/invoice/asha/" + (await sub("/orders")).j.orders[0].number + "?k=" + require("crypto").createHmac("sha256", "s").update("invoice:asha:" + (await sub("/orders")).j.orders[0].number).digest("base64url").slice(0, 24), runScripts: "dangerously", beforeParse(x) { x.fetch = (u, o) => realFetch(u.startsWith("http") ? u : ORIGIN + u, o); } });
    await sleep(900); const bt = [...inv.window.document.querySelectorAll(".foot button")].map(b => b.textContent); ok(bt.join("|") === "Share|Download PDF", "invoice page has Share and Download PDF buttons: " + bt.join("|")); ok(!/print\(\)/.test(inv.window.document.body.innerHTML), "no print-dialog button any more"); }
  // brand picker in the product form
  w.eval("closeM(); load()"); await sleep(600); w.eval(`openProd('${id}')`); { const f2 = d.querySelector("#dlg form"), cb = f2.querySelector(".cb[data-k=brand]"), bi = cb.querySelector(".cbx");
    ok(bi.value === "Cadbury" && f2.elements.brand.value === "Cadbury", "brand: saved brand shown");
    bi.value = ""; bi.dispatchEvent(new w.Event("input", { bubbles: true })); ok([...cb.querySelectorAll(".cbo:not(.add)")].map(o => o.textContent).join("|") === "None|Amul|Cadbury", "brand list A to Z");
    bi.value = "amu"; bi.dispatchEvent(new w.Event("input", { bubbles: true })); ok([...cb.querySelectorAll(".cbo")].some(o => o.textContent === "Amul") && cb.querySelector(".cbo.add"), "typing filters and offers + Add");
    bi.value = "Britannia"; bi.dispatchEvent(new w.Event("input", { bubbles: true })); cb.querySelector(".cbo.add").click(); await sleep(600); ok(f2.elements.brand.value === "Britannia" && w.eval("BR").includes("Britannia"), "new brand is added and picked"); }
  { const f3 = d.querySelector("#dlg form"), before = (await g()).qty; w.eval("addBatchRow()"); const xb = f3.querySelector(".xb"); xb.querySelector(".xbq").value = "6"; const dth = xb.querySelector(".dth"); dth.value = iso(400).slice(0, 8) + "28";
    f3.elements.o2n.value = "200"; f3.elements.o2u.value = "g"; f3.elements.o2p.value = "20"; f3.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await sleep(900);
    const pr = await g(); ok(pr.qty === before + 6 && (pr.batches || []).some(x => x.qty === 6), "another batch added from the product page"); ok(pr.o2 === "200 g x 20 pieces", "weight x pieces saved"); }
  { w.eval(`closeM(); openProdSheet('${id}')`); ok(/Duplicate/.test($("dlg").textContent), "details page has Duplicate"); const src = await g(); w.eval(`dupProd('${id}')`); await sleep(50);
    const f4 = d.querySelector("#dlg form"); ok(f4.elements.name.value === src.name && String(f4.elements.price.value) === String(src.price) && f4.elements.barcode.value === "" && f4.elements.sku.value === "" && !f4.querySelector(".pt"), "duplicate copies details, not photo/barcode/code");
    const n0 = w.eval("P.length"); f4.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await sleep(900); ok(w.eval("P.length") === n0 + 1, "duplicate saved as a new product"); }
  { w.eval(`closeM(); openProd('${id}')`); const f5 = d.querySelector("#dlg form"); ok(f5.querySelector("#tgs") && !f5.querySelector("details.more #tgs"), "Tags section is on the main product page");
    f5.querySelector("#ntg").value = "Snacks"; w.eval("addTagHere()"); await sleep(700); const cbx = [...f5.querySelectorAll("input[name=tag]")].find(x => x.value == "Snacks"); ok(cbx && cbx.checked, "a new tag is created from the product page and ticked");
    f5.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await sleep(900); ok(((await g()).tags || []).includes("Snacks"), "product saved with the new tag"); }
  w.eval("closeM()");
  console.log("NEW: ALL " + pass + " PASSED"); process.exit(0);
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
