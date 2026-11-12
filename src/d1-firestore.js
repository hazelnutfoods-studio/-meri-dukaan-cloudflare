"use strict";
// A small stand-in for the part of Firebase that Meri Dukaan uses, saving everything in Cloudflare D1 instead.
// server.js is almost unchanged: it asks for "firebase-admin" and this file answers (see [alias] in wrangler.toml).
//
// How it keeps the number of database reads low:
//  - one table per kind of thing (products, orders, ...), each with the few indexes its screens need (see schema.sql);
//  - every search is turned into one indexed SQL query, so only the rows you asked for are read, never the whole table;
//  - several "get this one record" calls made at the same moment are joined into a single query;
//  - small changes to a record are one UPDATE, without reading it first.

// ---------- values ----------
class Timestamp {
  constructor(ms) { this._ms = ms; }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
  get seconds() { return Math.floor(this._ms / 1000); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(nowMs()); }
}
let lastMs = 0;
const nowMs = () => (lastMs = Math.max(Date.now(), lastMs + 1)); // never the same twice, so "newest first" always has a clear order
class Sentinel { constructor(kind, v) { this.kind = kind; this.v = v; } }
const FieldValue = {
  serverTimestamp: () => new Sentinel("ts"), increment: n => new Sentinel("inc", n),
  arrayUnion: (...a) => new Sentinel("au", a), arrayRemove: (...a) => new Sentinel("ar", a), delete: () => new Sentinel("del"),
};
const isB = o => typeof Buffer !== "undefined" && (Buffer.isBuffer(o) || o instanceof Uint8Array);
function replacer(k, v) { const o = this[k]; if (o instanceof Timestamp) return { __ts: o._ms }; if (isB(o)) return { __b: Buffer.from(o).toString("base64") }; return v; }
const enc = v => JSON.stringify(v, replacer);
function reviver(k, v) { if (v && typeof v === "object" && !Array.isArray(v)) { if (v.__ts !== undefined) return new Timestamp(v.__ts); if (v.__b !== undefined) return Buffer.from(v.__b, "base64"); } return v; }
const dec = s => JSON.parse(s, reviver);
const clone = o => Array.isArray(o) ? o.map(clone) : o && typeof o === "object" && Object.getPrototypeOf(o) === Object.prototype ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])) : o;
const same = (a, b) => enc(a) === enc(b);

// apply a patch (with FieldValue markers) to a record we have in hand
function apply(old, patch) {
  const o = { ...old };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v instanceof Sentinel) {
      if (v.kind === "ts") o[k] = Timestamp.now();
      else if (v.kind === "inc") o[k] = (typeof o[k] === "number" ? o[k] : 0) + v.v;
      else if (v.kind === "au") { const cur = Array.isArray(o[k]) ? o[k] : []; o[k] = [...cur, ...v.v.filter(x => !cur.some(y => same(x, y)))]; }
      else if (v.kind === "ar") o[k] = (Array.isArray(o[k]) ? o[k] : []).filter(y => !v.v.some(x => same(x, y)));
      else if (v.kind === "del") delete o[k];
    } else o[k] = v;
  }
  return o;
}
const hasSentinel = patch => Object.values(patch).some(v => v instanceof Sentinel);
const needsRead = patch => Object.values(patch).some(v => v instanceof Sentinel && (v.kind === "au" || v.kind === "ar" || v.kind === "del"));

// ---------- tables and fields ----------
const TABLES = new Set(["stores", "products", "orders", "customers", "drafts", "otps", "photos", "purchases", "reviews", "stats", "stockLog", "suppliers", "tags", "trash", "users", "brands"]);
// the fields each kind of record can be searched or sorted by quickly (schema.sql is made from this list)
const INDEX = { products: ["active", "createdAt", "mergeUnder"], orders: ["createdAt", "status", "email"], tags: ["pos"], reviews: ["at"], drafts: ["savedAt"], purchases: ["createdAt"], suppliers: ["createdAt"], stockLog: ["at"] };
const tableOf = name => TABLES.has(name) ? "c_" + name : "c_other";
const FIELD = /^[A-Za-z0-9_]+$/;
// the one way a field is read inside SQL; the indexes in schema.sql use the very same text
const fieldExpr = f => { if (!FIELD.test(f)) throw new Error("Bad field name"); return `COALESCE(json_extract(data,'$.${f}.__ts'),json_extract(data,'$.${f}'))`; };
const bindv = v => v instanceof Timestamp ? v._ms : v instanceof Date ? v.getTime() : typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v;

const getDB = () => { const d = globalThis.__D1 || (globalThis.getEnv && globalThis.getEnv().DB); if (!d) throw new Error("The D1 database is not connected."); return d; };
// the tables are made the first time the app runs, so there is nothing to set up by hand
let schemaP = null;
const ready = () => schemaP || (schemaP = (async () => {
  const d = getDB(), has = await d.prepare("SELECT 1 AS x FROM sqlite_master WHERE name='c_stores'").first();
  if (!has) await d.batch(require("./schema-sql.js").map(q => d.prepare(q)));
})().catch(e => { schemaP = null; throw e; }));
const makeErr = (msg, code) => Object.assign(new Error(msg), { code });
const newId = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", b = new Uint8Array(20); (globalThis.crypto || require("crypto").webcrypto).getRandomValues(b); return Array.from(b, x => c[x % 62]).join(""); };

// ---------- reading ----------
const snapOf = (ref, row) => {
  let parsed = null; const ok = !!row;
  return { id: ref.id, exists: ok, ref, _v: ok ? row.v : null, data: () => { if (!ok) return undefined; if (!parsed) parsed = dec(row.data); return clone(parsed); } };
};
// several single-record reads asked for at the same moment travel as one query
let pending = [], scheduled = false;
function readDoc(ref) {
  return new Promise((ok, no) => {
    pending.push({ ref, ok, no });
    if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
  });
}
async function flush() {
  const list = pending; pending = []; scheduled = false;
  const groups = new Map();
  for (const p of list) { const k = p.ref._table + "|" + p.ref._col; (groups.get(k) || groups.set(k, []).get(k)).push(p); }
  try { await ready(); } catch (e) { list.forEach(p => p.no(e)); return; }
  for (const g of groups.values()) {
    const ids = [...new Set(g.map(p => p.ref.id))];
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80), want = g.filter(p => part.includes(p.ref.id));
      try {
        const r = await getDB().prepare(`SELECT id, data, v FROM ${g[0].ref._table} WHERE col=? AND id IN (${part.map(() => "?").join(",")})`).bind(g[0].ref._col, ...part).all();
        const byId = new Map(r.results.map(x => [x.id, x]));
        want.forEach(p => p.ok(snapOf(p.ref, byId.get(p.ref.id))));
      } catch (e) { want.forEach(p => p.no(e)); }
    }
  }
}

// ---------- writing: each write is a SQL statement; a group of them is run together (all or nothing) ----------
const jpath = k => `'$."${String(k).replace(/["']/g, "")}"'`;
function setStmt(ref, data) {
  const doc = apply({}, data);
  return getDB().prepare(`INSERT INTO ${ref._table}(col,id,data,v) VALUES(?,?,?,1) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, v=${ref._table}.v+1`).bind(ref._col, ref.id, enc(doc));
}
function patchStmt(ref, patch) { // a change that needs no reading first: one UPDATE
  const parts = [], binds = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v instanceof Sentinel && v.kind === "inc") { parts.push(`${jpath(k)}, COALESCE(json_extract(data,${jpath(k)}),0)+?`); binds.push(v.v); }
    else if (v instanceof Sentinel && v.kind === "ts") { parts.push(`${jpath(k)}, json(?)`); binds.push(enc(Timestamp.now())); }
    else { parts.push(`${jpath(k)}, json(?)`); binds.push(enc(v)); }
  }
  if (!parts.length) return getDB().prepare(`UPDATE ${ref._table} SET v=v WHERE col=? AND id=?`).bind(ref._col, ref.id);
  return getDB().prepare(`UPDATE ${ref._table} SET data=json_set(data, ${parts.join(", ")}), v=v+1 WHERE col=? AND id=?`).bind(...binds, ref._col, ref.id);
}
const assertStmt = (ref, v) => getDB().prepare(`SELECT CASE WHEN (SELECT v FROM ${ref._table} WHERE col=? AND id=?) IS ? THEN 1 ELSE abs(-9223372036854775808) END AS ok`).bind(ref._col, ref.id, v === undefined || v === null ? null : v); // fails the whole group if the record changed meanwhile
const delStmt = ref => getDB().prepare(`DELETE FROM ${ref._table} WHERE col=? AND id=?`).bind(ref._col, ref.id);
const changed = r => r && r.meta ? r.meta.changes : 1;
const isConflict = e => /integer overflow/i.test(String(e && e.message));

// change a record with array markers: read, work out, save only if nobody else changed it in between (try again if so)
async function readModifyWrite(ref, patch) {
  for (let i = 0; i < 6; i++) {
    const s = await readDoc(ref); if (!s.exists) throw makeErr("No document to update: " + ref.path, 5);
    const next = apply(s.data(), patch);
    try { await getDB().batch([assertStmt(ref, s._v), getDB().prepare(`UPDATE ${ref._table} SET data=?, v=v+1 WHERE col=? AND id=?`).bind(enc(next), ref._col, ref.id)]); return; }
    catch (e) { if (!isConflict(e) || i === 5) throw e; }
  }
}

class DocRef {
  constructor(col, id) { this._col = col.path; this._table = tableOf(col.name); this.id = id; this.parent = col; this.path = col.path + "/" + id; }
  collection(n) { return new ColRef(this.path + "/" + n, n); }
  get() { return readDoc(this); }
  async set(data) { await ready(); await getDB().batch([setStmt(this, data)]); }
  async update(patch) {
    if (needsRead(patch)) return readModifyWrite(this, patch);
    await ready(); const r = await getDB().batch([patchStmt(this, patch)]); if (!changed(r[0])) throw makeErr("No document to update: " + this.path, 5);
  }
  async delete() { await ready(); await getDB().batch([delStmt(this)]); }
}

class Query {
  constructor(col, filters = [], orders = [], lim = null) { this._col = col; this._f = filters; this._o = orders; this._l = lim; }
  where(f, op, v) { return new Query(this._col, [...this._f, [f, op, v]], this._o, this._l); }
  orderBy(f, dir) { return new Query(this._col, this._f, [...this._o, [f, dir === "desc" ? "DESC" : "ASC"]], this._l); }
  limit(n) { return new Query(this._col, this._f, this._o, n); }
  async get() {
    await ready(); const col = this._col, w = ["col=?"], b = [col.path];
    for (const [f, op, v] of this._f) {
      const E = fieldExpr(f);
      if (op === "array-contains") { w.push(`json_type(data,'$.${f}')='array' AND EXISTS (SELECT 1 FROM json_each(data,'$.${f}') WHERE value=?)`); b.push(bindv(v)); }
      else if (op === "in") { const a = (v || []).slice(0, 90); w.push(a.length ? `${E} IN (${a.map(() => "?").join(",")})` : "0"); b.push(...a.map(bindv)); }
      else if (op === "==") { if (v === null) w.push(`${E} IS NULL`); else { w.push(`${E} = ?`); b.push(bindv(v)); } }
      else if (["<", "<=", ">", ">=", "!="].includes(op)) { w.push(`${E} ${op} ?${op === "!=" ? ` AND ${E} IS NOT NULL` : ""}`); b.push(bindv(v)); }
      else throw new Error("Unsupported filter " + op);
    }
    for (const [f] of this._o) w.push(`${fieldExpr(f)} IS NOT NULL`); // like Firebase, records without that field are left out
    const ord = this._o.length ? " ORDER BY " + this._o.map(([f, d]) => `${fieldExpr(f)} ${d}`).join(", ") + `, id ${this._o[this._o.length - 1][1]}` : "";
    // tell the database which index to use, so it never reads the whole table when an index can answer
    const have = INDEX[col.name] || [], pick = (this._f.find(([f, op]) => have.includes(f) && ["==", "<", "<=", ">", ">="].includes(op)) || [])[0] || (this._o.find(([f]) => have.includes(f)) || [])[0];
    const from = pick ? `${col._table} INDEXED BY idx_${col.name}_${pick}` : col._table;
    const r = await getDB().prepare(`SELECT id, data, v FROM ${from} WHERE ${w.join(" AND ")}${ord}${this._l ? " LIMIT " + Math.floor(this._l) : ""}`).bind(...b).all();
    const docs = r.results.map(x => snapOf(new DocRef(col, x.id), x));
    return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) };
  }
}
class ColRef extends Query {
  constructor(path, name) { super(null); this.path = path; this.name = name; this._table = tableOf(name); this._col = this; }
  doc(id) { return new DocRef(this, id || newId()); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
}

class Batch {
  constructor() { this.q = []; }
  set(ref, d) { this.q.push(() => setStmt(ref, d)); return this; }
  update(ref, d) { this.q.push(() => patchStmt(ref, d)); return this; }
  delete(ref) { this.q.push(() => delStmt(ref)); return this; }
  async commit() { await ready(); if (this.q.length) await getDB().batch(this.q.map(f => f())); }
}

// a "transaction": read what you need, make changes; at the end everything is saved together,
// but only if none of the records you read were changed by someone else meanwhile (otherwise it starts over)
async function runTransaction(fn) {
  await ready();
  for (let attempt = 0; attempt < 6; attempt++) {
    const seen = new Map(), writes = [];
    const t = {
      get: async ref => { const s = await readDoc(ref); seen.set(ref.path, { ref, v: s._v, snap: s }); return s; },
      set: (ref, d) => { writes.push({ k: "set", ref, d }); return t; },
      update: (ref, d) => { writes.push({ k: "update", ref, d }); return t; },
      delete: ref => { writes.push({ k: "delete", ref }); return t; },
      create: (ref, d) => { writes.push({ k: "set", ref, d }); return t; },
    };
    const out = await fn(t);
    try {
      const stmts = [];
      for (const { ref, v } of seen.values()) stmts.push(assertStmt(ref, v));
      for (const w of writes) {
        if (w.k === "set") stmts.push(setStmt(w.ref, w.d));
        else if (w.k === "delete") stmts.push(delStmt(w.ref));
        else if (needsRead(w.d)) { // array change on a record we did not read: read it now and guard it
          const s = seen.has(w.ref.path) ? seen.get(w.ref.path).snap : await readDoc(w.ref); if (!s.exists) throw makeErr("No document to update: " + w.ref.path, 5);
          if (!seen.has(w.ref.path)) stmts.push(assertStmt(w.ref, s._v));
          stmts.push(getDB().prepare(`UPDATE ${w.ref._table} SET data=?, v=v+1 WHERE col=? AND id=?`).bind(enc(apply(s.data(), w.d)), w.ref._col, w.ref.id));
        } else stmts.push(patchStmt(w.ref, w.d));
      }
      if (stmts.length) await getDB().batch(stmts);
      return out;
    } catch (e) { if (!isConflict(e) || attempt === 5) throw e; }
  }
}

const db = { collection: n => new ColRef(n, n), batch: () => new Batch(), runTransaction };
const firestore = () => db;
firestore.Timestamp = Timestamp; firestore.FieldValue = FieldValue;
module.exports = { initializeApp() {}, credential: { cert: () => ({}) }, firestore, fieldExpr, TABLES, tableOf, INDEX };
