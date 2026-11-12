process.env.STORE_SLUG="cocoa"; process.env.STORE_NAME="Cocoa Corner";
process.env.FIREBASE_SERVICE_ACCOUNT = "{}"; process.env.ADMIN_PASSWORD = "pw-owner-1"; process.env.SESSION_SECRET = "s"; process.env.RESEND_API_KEY = "x"; process.env.ADMIN_EMAIL = "boss@x.com";
require("./fake.js");
const mails = []; const realFetch = global.fetch;
global.fetch = (u, o) => String(u).includes("resend.com") ? (mails.push(JSON.parse(o.body)), Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" })) : realFetch(u, o);
const app = require("../src/server.js"); const { JSDOM } = require("jsdom");
let pass = 0; const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } pass++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = app.listen(0), O = "http://127.0.0.1:" + srv.address().port;
  const call = async (p, m = "GET", b, hd = {}) => { const r = await realFetch(O + p, { method: m, headers: { "Content-Type": "application/json", "x-key": "pw-owner-1", ...hd }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  await call("/api/config");
  const M = "/api/manage/cocoa";
  {const r=await call(M + "/business", "PUT", { name: "Cocoa Corner", phone: "9876500000", gstDefault: 0, upi: "bad" });console.log(r);ok(r.s === 400, "bad upi rejected");}
  ok((await call(M + "/business", "PUT", { name: "Cocoa Corner", phone: "9876500000", gstDefault: 0, upi: "cocoa@upi" })).s === 200, "upi saved");
  const ids = []; for (const t of ["Dark","Milk"]) await call(M + "/tags", "POST", { name: t });
  for (const [n, pr, mrp, tg] of [["Dark Bar", 200, 250, "Dark"], ["Milk Bar", 150, 0, "Milk"]]) { const r = await call(M + "/products", "POST", { name: n, price: pr, mrp, cost: 80, qty: 10, featured: n == "Dark Bar", tags: [tg], active: false }); await call(M + "/products/" + r.j.id + "/photos", "POST", { data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ" }); const a = await call(M + "/products/" + r.j.id, "PUT", { active: true }); if (a.s !== 200) console.log(a); ids.push(r.j.id); }
  await call(M + "/brands", "POST", { name: "Cocoa Co" }); await call(M + "/products/" + ids[0], "PUT", { brand: "Cocoa Co" });
  const sd = (await call("/api/store/cocoa")).j;
  ok(sd.wa === "919876500000" && sd.hasUpi && sd.products.find(p => p.name == "Dark Bar").mrp === 250 && sd.products.find(p => p.name == "Dark Bar").featured, "store data has wa, upi, mrp, featured");
  // email login
  ok((await call("/api/store/cocoa/c/otp", "POST", { email: "nope" })).s === 400, "bad email refused");
  ok((await call("/api/store/cocoa/c/otp", "POST", { email: "Amit@Mail.com" })).s === 200, "otp sent");
  const code = (mails.at(-1).html.match(/>(\d{6})</) || [])[1]; ok(code && mails.at(-1).to[0] === "amit@mail.com", "code emailed");
  ok((await call("/api/store/cocoa/c/otp", "POST", { email: "amit@mail.com" })).s === 400, "30s cooldown");
  ok((await call("/api/store/cocoa/c/verify", "POST", { email: "amit@mail.com", code: "000000" })).s === 400, "wrong code refused");
  const v = await call("/api/store/cocoa/c/verify", "POST", { email: "amit@mail.com", code }); ok(v.s === 200 && v.j.token, "verified");
  const T = { "x-ctoken": v.j.token, "x-key": "" };
  ok((await call("/api/store/cocoa/c/verify", "POST", { email: "amit@mail.com", code })).s === 400, "code single use");
  ok((await call("/api/store/cocoa/c/me", "GET", null, { "x-ctoken": "junk" })).s === 401, "bad token 401");
  const A = { name: "Amit", phone: "9999999999", line: "12 MG Road", pin: "411001", city: "Pune", tag: "Home" };
  const ad = await call("/api/store/cocoa/c/addresses", "POST", A, T); ok(ad.s === 200, "address saved");
  ok((await call("/api/store/cocoa/c/addresses", "POST", { ...A, pin: "1" }, T)).s === 400, "bad pin refused");
  ok((await call("/api/store/cocoa/c/wishlist", "PUT", { id: ids[0], on: true }, T)).s === 200, "wishlist add");
  // order as logged-in user, UPI
  const od = await call("/api/store/cocoa/orders", "POST", { name: "Amit", phone: "9999999999", address: "12 MG Road, Pune", payMethod: "UPI", note: "gift wrap", items: [{ id: ids[0], qty: 2 }] }, T);
  ok(od.s === 200 && od.j.upi === "cocoa@upi" && od.j.total === 400, "order placed with upi");
  await sleep(50); ok(mails.some(m => /boss@x/.test(m.to.join())) && mails.some(m => m.to[0] === "amit@mail.com" && /placed|received|order/i.test(m.subject)), "owner and customer emails sent");
  let me = (await call("/api/store/cocoa/c/me", "GET", null, T)).j;
  ok(me.orders.length === 1 && me.orders[0].stage === 2 && me.wishlist.length === 1 && me.addresses.length === 1 && me.unread >= 1, "me shows order, stage 2");
  const sd2 = (await call("/api/store/cocoa")).j; ok(sd2.products.find(p => p.id == ids[0]).sold === 2, "sold counter");
  // owner moves it along
  const num = me.orders[0].number;
  await call(M + "/orders/" + num + "/seen", "POST"); await call(M + "/orders/" + num, "PATCH", { status: "Packed" });
  me = (await call("/api/store/cocoa/c/me", "GET", null, T)).j; ok(me.orders[0].stage === 4, "packed -> stage 4");
  const before = mails.length; await call(M + "/orders/" + num, "PATCH", { status: "In transit" }); await sleep(50);
  ok(mails.length > before, "customer emailed on dispatch"); me = (await call("/api/store/cocoa/c/me", "GET", null, T)).j; ok(me.orders[0].stage === 5, "stage 5");
  ok((await call("/api/store/cocoa/c/reviews", "POST", { number: num, rating: 5 }, T)).s === 400, "no review before delivered");
  await call(M + "/orders/" + num, "PATCH", { status: "Delivered" });
  ok((await call("/api/store/cocoa/c/reviews", "POST", { number: num, rating: 5, text: "Yum" }, T)).s === 200, "review ok");
  ok((await call("/api/store/cocoa/c/reviews", "POST", { number: num, rating: 5 }, T)).s === 400, "one review only");
  const s3 = (await call("/api/store/cocoa")).j; ok(s3.rating.n === 1 && s3.reviews[0].text === "Yum", "review shown");
  // cancel flow restores
  const o2 = await call("/api/store/cocoa/orders", "POST", { name: "Guest", phone: "9999999998", address: "5 Lane, Pune 411001", email: "g@x.com", items: [{ id: ids[1], qty: 3 }] });
  ok(o2.s === 200 && !o2.j.upi, "guest cash order"); await call(M + "/orders/" + o2.j.number, "PATCH", { status: "Cancelled" });
  ok((await call("/api/store/cocoa")).j.products.find(p => p.id == ids[1]).qty === 10, "cancel restores stock");

  // ---- UI ----
  const html = require("fs").readFileSync(__dirname + "/../public/store.html", "utf8");
  const errs = []; const dom = new JSDOM(html, { url: O + "/", runScripts: "dangerously", pretendToBeVisual: true, beforeParse(w) { w.__CFG = { slug: "cocoa", name: "Cocoa Corner" };
    w.fetch = async (u, o) => { const r = await realFetch(u.startsWith("http") ? u : O + u, o); if (r.status >= 400) console.log("HTTP", r.status, u, (o&&o.method)||""); return r; }; w.scrollTo = () => {}; w.confirm = () => true;
    w.addEventListener("error", e => errs.push(e.message)); } });
  const w = dom.window, d = w.document, txt = () => d.getElementById("app").textContent.replace(/\s+/g, " ");
  await sleep(400);
  ok(/Indulge in/.test(txt()) && /Offers & discounts/.test(txt()) && /New arrivals/.test(txt()) && /Shop by category/.test(txt()), "home sections");
  ok(!d.querySelector(".dots"), "no scroll dots under the banner");
  ok(/helpWA/.test(html) && /919167359045/.test(html), "Contact support goes straight to WhatsApp 91 91673 59045");
  ok(d.querySelector(".wa") && /919876500000/.test(d.querySelector(".wa").href), "whatsapp button");
  w.eval("go('product','" + ids[0] + "')"); ok(/20% OFF/.test(txt()) && /In stock/.test(txt()), "product page shows discount");
  ok(/cocoa co/i.test(txt()), "product page shows the brand");
  ok(d.querySelectorAll("#gal > *").length === 1 && !d.querySelector(".thumbs") && !d.getElementById("cnt"), "one photo: no scroller counter or thumbnails");
  w.eval("chg('" + ids[0] + "',1);go('cart')"); ok(/Delivery charges will be added in the final invoice/.test(txt()), "cart note");
  w.eval("go('checkout')"); const t = txt(); ok(/Cash/.test(t) && /UPI/.test(t) && !/Card|Wallet|Net ?banking/i.test(t) && /Delivery charges will be added in the final invoice/.test(t), "checkout has only cash/upi + note");
  w.eval("go('login')"); d.getElementById("em").value = "newbie@x.com"; w.eval("sendOtp()"); await sleep(400);
  const c2 = (mails.at(-1).html.match(/>(\d{6})</) || [])[1]; ok(c2 && d.getElementById("code"), "otp screen");
  d.getElementById("code").value = c2; w.eval("verifyOtp()"); await sleep(500); ok(/newbie@x.com/.test(txt()) && !/Payments/.test(txt()) && !/Track order|Reorder/.test(txt()), "account has no track/reorder/payments menu");
  w.eval("root('cart')"); w.eval("go('checkout')"); d.querySelectorAll("input")[0].value = ""; w.eval("gi.name='Neha';gi.phone='9888888888';gi.address='9 Park Street, Mumbai 400001';pay='UPI';placeOrder()"); await sleep(600);
  ok(/Order placed!/.test(txt()) && /with UPI/.test(txt()) && /upi:\/\/pay\?pa=cocoa%40upi/.test(d.body.innerHTML), "placed with UPI button");
  console.log('tok',w.eval('token').slice(0,10),w.eval('!!me'),w.eval('view')); w.eval("root('orders')"); await sleep(500); console.log(txt().slice(0,300)); ok(/Track order/.test(txt()) && /Reorder/.test(txt()), "orders have Track + Reorder");
  w.eval("go('track', me.orders[0].number)"); ok(/Order placed/.test(txt()) && /Preparing your chocolates/.test(txt()) && /Out for delivery/.test(txt()), "tracking steps");
  w.eval("reorder(me.orders[0].number)"); ok(/Checkout/.test(txt()), "reorder fills cart");
  ok(errs.length === 0, "no page errors " + errs.join("|"));
  { const cl = await call(M + "/customers"); const am = cl.j.find(c => c.email === "amit@mail.com"); ok(cl.s === 200 && am && am.orders >= 1 && am.value > 0 && am.paid <= am.value, "customers list shows Amit with orders, value, paid: " + JSON.stringify(am)); ok(!cl.j.some(c => c.email === "g@x.com"), "a guest checkout is not an account"); ok(Object.keys(am).sort().join() === "email,name,orders,paid,since,value", "only the basic fields are sent"); }
  console.log("STORE: ALL " + pass + " PASSED"); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
