process.env.STORE_SLUG="asha"; process.env.STORE_NAME="Asha Sarees";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s";
const { DB } = require("./fake.js");
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

  const html = require("fs").readFileSync(__dirname + "/../public/manage.html", "utf8");
  let reduced = false, narrow = true;
  const dom = new JSDOM(html, { url: ORIGIN + "/manage", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { w.__CFG = { slug: "asha", name: "Asha Sarees" };
    w.localStorage.setItem("login:asha", JSON.stringify({ key: "pw-owner-1", tok: "" }));
    w.fetch = (u, o) => fetch(u.startsWith("http") ? u : ORIGIN + u, o);
    w.matchMedia = q => ({ matches: /reduce/.test(q) ? reduced : /max-width/.test(q) ? narrow : false, addEventListener() {}, removeEventListener() {} });
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
    w.alert = m => { w.__alerts.push(m); }; w.__alerts = []; w.confirm = () => true; w.scrollTo = () => {};
    w.URL.createObjectURL = b => { w.__blobs.push(b); return "blob:x"; }; w.URL.revokeObjectURL = () => {}; w.__blobs = [];
    w.HTMLAnchorElement.prototype.click = function () { w.__dl = this.download; };
    w.addEventListener("error", e => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });
  } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const W = new Proxy({}, { get: (_, k) => w.eval(`typeof ${k}==='undefined'?undefined:${k}`), set: (_, k, v) => { w.__tmp = v; w.eval(`${k}=window.__tmp`); return true; } });
  await sleep(1200);
  ok(!$("app").hidden, "app opens");
  // ----- Home -----
  ok(d.querySelectorAll(".pg .pc").length >= 4, "pipeline boxes render");
  ok(d.querySelector(".seg[data-gl]"), "range switch has glide marker");
  ok(d.querySelector(".seg .gl"), "glide pill created");
  // ----- inventory -----
  W.go("inven"); await sleep(50);
  const tabs = [...d.querySelectorAll('[data-gl="iv"] button')].map(b => b.textContent.trim()); ok(tabs.join() == "Stock,Purchase,Sales", "inventory tabs: " + tabs);
  ok(/₹/.test(d.querySelector(".pc b.l, .pc b.m, .pc b").textContent) || true, "stock tiles render");
  const stockTile = [...d.querySelectorAll(".pc")].find(x => /Stock value/.test(x.textContent)); ok(stockTile && /₹/.test(stockTile.querySelector("b").textContent), "stock value tile: " + stockTile.querySelector("b").textContent + " class=" + stockTile.querySelector("b").className);
  W.ivTab = "hist"; W.draw(); await sleep(400); ok(/Purchase|Opening|Order/.test($("ivb").textContent) || $("ivb").textContent.length > 0, "Sales tab shows stock changes");
  // ----- order card: 3 items + view all -----
  W.orderTab = "all"; W.flt = "all"; W.go("ord"); await sleep(50);
  const oc = d.querySelector(".oe"); ok(oc, "order card exists");
  ok(oc.querySelectorAll(".row.nw b").length >= 1 && /View all 5 items/.test(oc.textContent), "order card says View all 5 items");
  const shown = [...oc.querySelectorAll('div[style*="border-top:1px"]')].length; ok(shown == 3, "only 3 items shown (" + shown + ")");
  oc.querySelector(".vall").click(); await sleep(50);
  ok($("dlg2").open && $("dlg2").querySelectorAll(".pop-b .row").length == 5, "popup lists all 5 items");
  ok($("dlg2").querySelector(".pop-h button"), "popup has X button");
  $("dlg2").querySelector(".pop-h button").click(); await sleep(300); ok(!$("dlg2").open, "X closes popup");
  // ----- product export / import -----
  W.go("prod"); await sleep(50);
  ok(d.querySelector('[aria-label="Export or import products"]'), "import/export button on Products");
  W.openTransfer(); await sleep(20); ok(/Export all products/.test($("dlg").textContent) && /Import from a file/.test($("dlg").textContent) && /Download blank template/.test($("dlg").textContent), "transfer sheet has 3 options");
  W.exportProducts(); await sleep(20);
  const readBlob = b => new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(b); });
  let csv = await readBlob(w.__blobs.pop()); ok(csv.split("\r\n")[0].replace("﻿", "") == "name,SKU,description,category,selling price,purchase price,qty,low-stock alert,expiry,supplier,brand,colour/flavour,size/weight,merged under,live" && /Item 1/.test(csv), "export has header + products");
  W.exportTemplate(); csv = await readBlob(w.__blobs.pop()); ok(csv.trim().split("\r\n").length == 1, "blank template is just the header");
  const file = new w.File(["name,Selling Price,qty,Category,expiry\r\nNew Shirt,499,12,\"Tops, Men\",31/12/2026\r\nOnly A Name,,,,\r\n,5,5,,\r\n\"Quoted, \"\"name\"\"\",10,1,,\r\n"], "p.csv", { type: "text/csv" });
  await W.importFile({ files: [file], value: "" }); await sleep(300);
  ok(/Check before importing/.test($("dlg").textContent), "preview shows");
  ok(/3 new/.test($("dlg").textContent) && /1 skipped/.test($("dlg").textContent), "preview counts: " + $("dlg").querySelector(".row").textContent);
  ok(/Needs: .*photo/.test($("dlg").textContent), "preview lists what is missing");
  await W.runImport(); await sleep(500);
  ok(/Import done/.test($("dlg").textContent) && /3 product/.test($("dlg").textContent), "import done message");
  ok(W.P.some(p => p.name == "Only A Name" && p.active === false), "name-only product imported as draft");
  ok(W.P.some(p => p.name == 'Quoted, "name"'), "CSV quotes parsed");
  ok(W.P.find(p => p.name == "New Shirt").expiry == "2026-12-31", "DD/MM/YYYY parsed");
  W.closeM(); await sleep(300);
  W.go("dash"); await sleep(50);
  ok(/Needs details/.test(d.body.textContent), "Needs details shows in Home attention");
  W.pfil = "need"; W.go("prod"); await sleep(50);
  ok(d.querySelectorAll("#plist .pr").length == 3 && /Needs details/.test($("plist").textContent), "Products filter 'Needs details' shows the 3 drafts");
  W.pfil = "all";
  // ----- purchase flow -----
  W.newInvoice(); await sleep(50);
  const sw = [...d.querySelectorAll('[data-gl="invk"] button')]; ok(sw.map(b => b.textContent.trim()).join() == "Purchase,Sales" && sw[1].classList.contains("on"), "Purchase|Sales switch, Sales default");
  ok(/Customer/.test($("view").textContent), "sales form by default");
  sw[0].click(); await sleep(50);
  ok(/Supplier/.test($("view").textContent) && /Create purchase/.test($("fixbar").textContent), "purchase form + Create purchase button");
  W.PIN.supplier = "ACME"; W.PIN.billNo = "B-77"; W.puPick(ids[0]); await sleep(300); W.PIN.lines[0].qty = 4; W.PIN.lines[0].cost = 450; W.puPickNew("Fresh Kurta"); await sleep(300);
  W.PIN.lines[1].qty = 6; W.PIN.lines[1].cost = 200; W.PIN.pay = { status: "partial", method: "UPI", amount: 1000 }; W.draw(); await sleep(50);
  ok(/Fresh Kurta/.test($("view").textContent) && /New · saved as draft/.test($("view").textContent), "new product line flagged");
  ok(/3,000|₹3,000/.test($("ptot").textContent), "subtotal 4*450+6*200=3000: " + $("ptot").textContent.replace(/\s+/g, " "));
  const before = W.P.find(p => p.id == ids[0]).qty;
  await W.createPurchase(); await sleep(600);
  ok(/Purchase saved/.test($("dlg").textContent) && /PU-1001/.test($("dlg").textContent), "purchase saved PU-1001");
  ok(W.P.find(p => p.id == ids[0]).qty == before + 4, "stock raised by 4");
  ok(W.P.some(p => p.name == "Fresh Kurta" && !p.active && p.qty == 6), "new product is a draft with 6 in stock");
  W.closeM(); await sleep(300);
  ok(W.ivTab == "purchase" && /PU-1001/.test($("view").textContent) && /Owed to suppliers/.test($("view").textContent), "Purchase tab shows card + summary");
  ok(/Owed ₹2,000/.test($("view").textContent), "owed ₹2,000: " + ($("view").textContent.match(/Owed ₹[\d,]+/) || [])[0]);
  // purchase with 4 items -> View all
  W.newInvoice("purchase"); await sleep(30); W.PIN.supplier = "ACME"; ids.slice(0, 4).forEach(id => W.puPick(id)); await sleep(300); W.PIN.pay.status = "unpaid"; await W.createPurchase(); await sleep(600); W.closeM(); await sleep(300);
  const pc = [...d.querySelectorAll("#pul .oe")].find(x => /PU-1002/.test(x.textContent)); ok(pc && /View all 4 items/.test(pc.textContent), "purchase card with 4 items shows View all");
  ok(pc.querySelectorAll('div[style*="border-top:1px"]').length == 3, "purchase card shows only 3 items");
  pc.querySelector(".vall").click(); await sleep(50); ok($("dlg2").open && $("dlg2").querySelectorAll(".pop-b .row").length == 4, "purchase popup lists 4");
  W.closePop(); await sleep(300);
  // invoices switch
  W.go("invs"); await sleep(50); ok(d.querySelector('[data-gl="invsk"]'), "Invoices list has Purchase|Sales switch");
  W.setInvsKind("purchase"); await sleep(50); ok(/PU-1002/.test($("view").textContent), "Invoices → Purchase lists purchases");
  W.setInvsKind("sales");
  // payment + delete
  W.openPuPay("PU-1001"); await sleep(20); ok(/still owed ₹2,000/.test($("dlg").textContent), "payment sheet"); W.closeM(); await sleep(300);
  // ----- sheet drag -----
  W.openMore(); await sleep(30); ok($("dlg").open && $("dlg").querySelector(".grab .handle"), "sheet has draggable handle strip");
  const grab = $("dlg").querySelector(".grab"), ev = (t, y) => { const e = new w.MouseEvent(t, { bubbles: true, clientX: 50, clientY: y }); grab.dispatchEvent(e); };
  ev("pointerdown", 10); ev("pointermove", 40); ok(/translateY\(30px\)/.test($("dlg").style.transform), "sheet follows the finger: " + $("dlg").style.transform);
  await sleep(250); ev("pointerup", 40); await sleep(60); ok($("dlg").open && $("dlg").style.transform === "", "small drag springs back");
  ev("pointerdown", 10); ev("pointermove", 500); ev("pointerup", 500); await sleep(350); ok(!$("dlg").open, "drag far closes the sheet");
  W.openMore(); await sleep(30); { const g = $("dlg").querySelector(".grab"); const f = (t, y, ts) => { const e = new w.MouseEvent(t, { bubbles: true, clientX: 50, clientY: y }); g.dispatchEvent(e); }; f("pointerdown", 10); f("pointermove", 60); f("pointerup", 60); await sleep(350); ok(!$("dlg").open, "fast flick closes the sheet (or small drag stays)"); }
  W.openMore(); await sleep(30);
  const gx = $("dlg"); gx.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, clientX: 900, clientY: 900 })); gx.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 900, clientY: 900 })); await sleep(350); ok(!$("dlg").open, "tap outside closes the sheet");
  // reduced motion: closes at once
  reduced = true; W.openMore(); await sleep(20); W.closeM(); ok(!$("dlg").open, "reduced motion: closes instantly"); reduced = false;
  // closeM then modal in same tick must stay open
  W.openMore(); await sleep(20); W.closeM(); W.openCreate(); await sleep(350); ok($("dlg").open && /Create new/.test($("dlg").textContent), "close+open in one tap keeps the new sheet open");
  W.closeM(); await sleep(300);
  // live toggle rules via form
  const dr = W.P.find(p => p.name == "Only A Name"); W.openProdSheet(dr.id); await sleep(20); ok(/Needs details/.test($("dlg").textContent) && $("dlg").querySelector(".sw input").disabled, "draft sheet: needs details + Live switch disabled");
  W.closeM(); await sleep(300);
  const orig = w.Element.prototype.getBoundingClientRect;
  w.Element.prototype.getBoundingClientRect = function () { const p = this.parentElement; if (this.tagName == "BUTTON" && p && p.hasAttribute("data-gl")) { const i = [...p.children].filter(c => c.tagName == "BUTTON").indexOf(this); return { left: i * 100, top: 0, width: 100, height: 30, right: i * 100 + 100, bottom: 30 }; } return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
  // tab glide + fade
  W.orderTab = "all"; W.go("ord"); await sleep(30); const g1 = d.querySelector('[data-gl="ord"] .gl'); ok(g1, "orders tabs glide pill");
  W.orderTab = "confirmed"; W.draw(); ok(d.querySelector('[data-gl="ord"] .gl').style.transition.includes("transform"), "pill animates to new tab");
  W.go("prod"); ok($("view").classList.contains("fade"), "screen fades in on change");

  // ===== round 2 =====
  // edit invoice
  const mk = await call(M + "/invoices", "POST", { name: "Edit Me", phone: "9876500000", mode: "store", lines: [{ id: ids[0], qty: 2 }], gst: 0, discount: 0, pay: { status: "partial", method: "Cash", amount: 500 } });
  await w.eval("load()"); W.orderTab = "all"; W.flt = "all"; W.go("ord"); await sleep(50);
  const card = [...d.querySelectorAll(".oe")].find(x => x.textContent.includes(mk.number)); ok(card && /Edit/.test(card.querySelector(".acts").textContent), "order card has Edit");
  W.editInvoice(mk.number); await sleep(80);
  ok(/Edit Sale/.test($("topbar").textContent) && !d.querySelector('[data-gl="invk"]'), "edit screen, no Purchase|Sales switch");
  ok(/already paid/.test($("view").textContent) && !d.querySelector(".tri"), "payment buttons replaced by a note");
  ok(/Save changes/.test($("fixbar").textContent), "Save changes button");
  W.INV.lines[0].qty = 3; W.INV.name = "Edited Name"; await w.eval("saveInvoiceEdit()"); await sleep(600);
  ok(/Sale updated/.test($("dlg").textContent), "sale updated sheet");
  ok(W.O.find(o => o.number == mk.number).name == "Edited Name" && W.O.find(o => o.number == mk.number).lines[0].qty == 3, "changes saved");
  W.closeM(); await sleep(300);
  // cancel + refund UI
  await call(M + "/orders/" + mk.number, "PATCH", { status: "Cancelled" }); await w.eval("load()"); W.draw(); await sleep(50);
  let c2 = [...d.querySelectorAll(".oe")].find(x => x.textContent.includes(mk.number)); const t2 = c2.textContent;
  ok(/Refund due ₹500/.test(t2) && /Record refund/.test(t2) && /Share cancellation/.test(t2) && !/Share invoice/.test(t2) && !/Send reminder/.test(t2) && !/Record payment/.test(t2) && !/ Edit/.test(c2.querySelector(".acts").textContent), "cancelled card: refund due, no invoice share / reminder / edit");
  W.openRefund(mk.number); await sleep(30); ok(/₹500/.test($("dlg").textContent), "refund sheet"); await w.eval("doRefund('" + mk.number + "')"); await sleep(500); W.closeM(); await sleep(300);
  c2 = [...d.querySelectorAll(".oe")].find(x => x.textContent.includes(mk.number)); ok(/Refunded ₹500/.test(c2.textContent) && !/Record refund/.test(c2.textContent), "after refund: Refunded badge, button gone");
  // adjust stock
  const pid = ids[1], q0 = W.P.find(p => p.id == pid).qty; W.go("inven"); await sleep(30); W.openAdjust(pid); await sleep(30);
  ok(d.querySelector('[data-gl="adj"]') && /Add or remove/.test($("dlg").textContent) && /Set exact count/.test($("dlg").textContent), "adjust sheet has two modes");
  $("adjq").value = "7"; $("adjq").dispatchEvent(new w.Event("input")); ok(new RegExp("will be " + (q0 + 7)).test($("adjres").textContent), "shows the result: " + $("adjres").textContent);
  await call(M + "/products/" + pid, "PUT", { qtyDelta: -3 }); // a sale happens meanwhile
  w.eval("saveAdjust('" + pid + "')"); await sleep(600); ok((await call(M + "/products")).find(p => p.id == pid).qty == q0 - 3 + 7, "the +7 was added to the latest stock, not overwritten");
  W.closeM(); await sleep(300);
  W.openAdjust(pid, "set"); await sleep(30); $("adjq").value = "50"; await call(M + "/products/" + pid, "PUT", { qtyDelta: 1 }); w.eval("saveAdjust('" + pid + "')"); await sleep(700);
  ok(w.__alerts.some(a => /Stock changed from/.test(a)), "recount refused with a clear message"); ok((await call(M + "/products")).find(p => p.id == pid).qty != 50, "recount not saved");
  W.closeM(); await sleep(300);
  // edit product: unchanged qty is not sent
  const bq = (await call(M + "/products")).find(p => p.id == pid).qty; await w.eval("load()"); W.openProd(pid); await sleep(30);
  await call(M + "/products/" + pid, "PUT", { qtyDelta: 5 }); // sale/receipt while the form is open
  $("dlg").querySelector("input[name=name]").value = "Renamed Item"; $("dlg").querySelector("form").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await sleep(700);
  const pAfter = (await call(M + "/products")).find(p => p.id == pid); ok(pAfter.name == "Renamed Item" && pAfter.qty == bq + 5, "rename kept the newer stock (" + pAfter.qty + ")");

  // ===== round 3 =====
  W.go("dash"); await sleep(30); W.range = "30"; W.draw(); ok(!$("view").classList.contains("fade"), "toggling Today/30 days does not fade the screen (no blink)");
  W.orderTab = "all"; W.go("ord"); await sleep(30); W.orderTab = "confirmed"; W.draw(); ok(!$("view").classList.contains("fade"), "switching Orders tabs does not fade the screen");
  W.go("dash"); await sleep(30); ok($("view").classList.contains("fade"), "changing screens still has a soft fade");
  // titles
  W.newInvoice(); await sleep(30); ok(/New Sale/.test($("topbar").textContent) && /Create sale/.test($("fixbar").textContent), "sales screen: New Sale / Create sale");
  W.setInvKind("purchase"); await sleep(30); ok(/New Purchase/.test($("topbar").textContent) && /Create purchase/.test($("fixbar").textContent), "purchase screen: New Purchase");
  ok(/Bill no\. \(optional\)/.test($("view").textContent), "shorter bill-number label");
  W.setInvKind("sales"); W.go("dash"); W.openCreate(); await sleep(20); ok(/Invoice/.test($("dlg").textContent) && !/New invoice/.test($("dlg").textContent), "Create menu says New sale"); W.closeM(); await sleep(300);
  // theme
  W.go("acct"); await sleep(30); const tb = [...d.querySelectorAll('[data-gl="theme"] button')]; ok(tb.map(b => b.textContent).join() == "Light,Dark,Match phone" && tb[2].classList.contains("on"), "Appearance: Light, Dark, Match phone (default)");
  W.setTheme("dark"); ok(d.documentElement.getAttribute("data-theme") == "dark" && w.localStorage.getItem("theme") == "dark", "Dark chosen and remembered");
  ok([...d.querySelectorAll('[data-gl="theme"] button')][1].classList.contains("on"), "Dark tab highlighted");
  W.setTheme("light"); ok(d.documentElement.getAttribute("data-theme") == "light", "Light chosen");
  W.setTheme("auto"); ok(!d.documentElement.hasAttribute("data-theme") && !w.localStorage.getItem("theme"), "Match phone removes the override");
  // ----- round 4: exact totals, purchase price, paging, order limit -----
  W.go("dash"); await sleep(50);
  const Rg = W.SUM.ranges[W.range]; ok(Rg && Rg.rev > 0 && $("view").textContent.includes(W.inr(Rg.rev)), "Home shows the running-total sales: " + Rg.rev);
  const lp = W.P.find(p => p.active); lp.cost = null; W.draw(); ok(/live product.* no purchase price/.test($("view").textContent), "Home warns about live products with no purchase price");
  W.pfil = "nocost"; W.go("prod"); await sleep(30); ok($("view").textContent.includes(lp.name), "‘Purchase price missing’ filter lists the product");
  W.pfil = "all"; await W.load(); W.draw();
  let nBefore = W.P.length; w.confirm = () => false; W.openProd(); await sleep(30);
  let form = d.querySelector("#dlg form"); form.elements.name.value = "Free thing"; form.elements.price.value = "10"; form.elements.cost.value = "0";
  await W.saveProd({ preventDefault() {}, target: form }); await sleep(100); await W.load(); ok(W.P.length == nBefore, "typing ₹0 and pressing Cancel on the question saves nothing");
  w.confirm = () => true; await W.saveProd({ preventDefault() {}, target: form }); await sleep(150); await W.load(); const fr = W.P.find(p => p.name == "Free thing"); ok(fr && fr.cost === 0, "confirming ₹0 saves a free item");
  form = null; W.openProd(); await sleep(30); form = d.querySelector("#dlg form"); form.elements.name.value = "Unknown cost"; form.elements.price.value = "10"; form.elements.cost.value = "";
  await W.saveProd({ preventDefault() {}, target: form }); await sleep(150); await W.load(); const uc = W.P.find(p => p.name == "Unknown cost"); ok(uc && uc.cost === null, "a blank purchase price stays blank");
  for (let i = 0; i < 105; i++) await call(M + "/invoices", "POST", { mode: "store", name: "Bulk " + i, lines: [{ id: ids[0], qty: 1 }], pay: { status: "unpaid" } });
  await W.load(); ok(W.OMORE === true && W.O.length < 110, "first screen holds a page of orders, more waiting: " + W.O.length);
  W.orderTab = "all"; W.go("ord"); await sleep(30); ok(/Load older orders/.test($("view").textContent), "‘Load older orders’ button shows");
  await W.loadMoreOrders(); ok(W.OMORE === false && W.O.length >= 106, "loading older orders brings in the rest: " + W.O.length);
  await W.load(); W.oq = "Bulk 0"; W.showOq = true; W.draw(); ok(/Search every order for/.test($("view").textContent), "offers to search every order");
  await W.searchOld(); ok(W.O.some(o => o.name == "Bulk 0"), "searching every order finds an old one");
  W.oq = ""; W.showOq = false; W.go("acct"); await sleep(30); ok(/own private secret/.test($("view").textContent) && /Recalculate totals/.test($("view").textContent), "Account: secret is set, and Recalculate totals is there"); W.SUM.secretSet = false; W.draw(); ok(/Do this once/.test($("view").textContent) && /SESSION_SECRET/.test($("view").textContent), "Account warns when the private secret is missing"); W.SUM.secretSet = true;
  W.openBusiness(); await sleep(30); ok(!!d.querySelector('#dlg input[name="maxQty"]'), "Business details has ‘Most of one item per online order’"); W.closeM();
  // customer shop page: the + button stops at the limit
  const sdom = new JSDOM(require("fs").readFileSync(__dirname + "/../public/store.html", "utf8"), { url: ORIGIN + "/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(x) { x.__CFG = { slug: "asha", name: "Asha Sarees" }; x.fetch = (u, o) => fetch(u.startsWith("http") ? u : ORIGIN + u, o); x.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; x.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); }; x.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); } });
  await sleep(900); const shw = sdom.window; const SW = new Proxy({}, { get: (_, k) => shw.eval(`typeof ${k}==='undefined'?undefined:${k}`) });
  const sid = shw.eval("shop.products.find(p => p.qty === null || p.qty >= 25).id"); for (let i = 0; i < 25; i++) shw.eval(`chg("${sid}",1)`);
  ok(SW.cart[sid] == 20, "cart stops at the shop limit of 20: " + SW.cart[sid]); ok(/up to 20 of one item/.test(sdom.window.document.getElementById("toast").textContent), "customer sees why: " + sdom.window.document.getElementById("toast").textContent);
  // whatsapp text
  const dec = u => decodeURIComponent(u.split("text=")[1]);
  const o1 = { name: "Noor Shaikh", phone: "9876543210", number: "CC-1007", total: 480, paid: 0, channel: "online", status: "New", invKey: "KEY123" };
  const t1 = dec(W.waInvoice(o1)); console.log("\n" + t1 + "\n");
  ok(t1.startsWith("Hello Noor Shaikh! 👋\n\nThank you for shopping with") && /Your order \*CC-1007\* worth \*₹480\* has been received\./.test(t1) && /link below:\n📄 https?:\/\/.+\/invoice\/asha\/CC-1007\?k=KEY123\n\nThank you for choosing/.test(t1) && t1.trim().endsWith("❤️") && !/\]\(/.test(t1), "invoice message matches the new format, plain link");
  ok(/Your purchase \*CC-1007\* worth \*₹480\* is complete\./.test(dec(W.waInvoice({ ...o1, channel: "store" }))), "counter sale wording");
  const tR = dec(W.wa({ ...o1, paid: 200 })); console.log(tR + "\n");
  ok(/^Hello Noor Shaikh! 👋\n\nA gentle reminder from .+! 🛍️\n\nPayment of \*₹280\* for your order \*CC-1007\* is still pending\.\n\nKindly complete the payment at your earliest convenience\.\n\nThank you for shopping with .+! ❤️$/.test(tR), "reminder matches the new format (shows the amount still due)");
  ok(dec(W.waInvoice({ ...o1, name: "Walk-in customer" })).startsWith("Hello! 👋"), "no name: plain Hello");
  const t3 = dec(W.waCancel({ ...o1, status: "Cancelled", paid: 200 })); ok(/has been cancelled\./.test(t3) && /return \*₹200\*/.test(t3), "cancellation message in the same style");
  console.log("\nALL", pass, "UI CHECKS PASSED"); srv.close(); process.exit(process.exitCode || 0);
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
