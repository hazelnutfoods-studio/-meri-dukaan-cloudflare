// Pretends to be a Cloudflare D1 database using the SQLite that comes with Node, so the same tests can run on a laptop.
const { DatabaseSync } = require("node:sqlite");
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.p = []; }
  bind(...p) { const s = new Stmt(this.db, this.sql); s.p = p.map(x => x === undefined ? (() => { throw new Error("D1 cannot bind undefined"); })() : x); if (s.p.length > 100) throw new Error("too many SQL variables (D1 allows 100)"); return s; }
  _run() { if (this.db.log) this.db.log.set(this.sql, this.p); const st = this.db.prepare(this.sql); if (/^\s*(SELECT|WITH|PRAGMA)/i.test(this.sql)) { const rows = st.all(...this.p); return { results: rows.map(r => ({ ...r })), success: true, meta: { changes: 0, rows_read: rows.length } }; } const r = st.run(...this.p); return { results: [], success: true, meta: { changes: Number(r.changes) } }; }
  async all() { return this._run(); }
  async run() { return this._run(); }
  async first() { const r = this._run().results; return r[0] || null; }
}
class D1 {
  constructor(file) { this.db = new DatabaseSync(file || ":memory:"); this.queries = 0; }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) { this.queries++; return new Stmt(this.db, sql); }
  async batch(list) { this.queries++; this.db.exec("BEGIN"); try { const out = list.map(s => s._run()); this.db.exec("COMMIT"); return out; } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
}
module.exports = { D1 };
