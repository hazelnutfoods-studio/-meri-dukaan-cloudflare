// Same job as the Firebase stand-in the tests used before, but this one is the real D1 code running on SQLite.
const Module = require("module"), fs = require("fs"), path = require("path");
const { D1 } = require("./d1-shim.js");
const d1 = new D1(); d1.exec(fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8"));
globalThis.__D1 = d1;
const adapter = require("../src/d1-firestore.js");
const orig = Module._load;
Module._load = function (req, ...a) { return req === "firebase-admin" ? adapter : orig.call(this, req, ...a); };
// read-only view that behaves like the Map the old tests used: "stores/asha/orders/ID" -> data
const TBL = [...adapter.TABLES, "other"].map(t => "c_" + t);
const rows = () => TBL.flatMap(t => d1.db.prepare(`SELECT col,id,data FROM ${t}`).all().map(r => [r.col + "/" + r.id, JSON.parse(r.data, (k, v) => v && v.__ts !== undefined ? { toDate: () => new Date(v.__ts), ms: v.__ts } : v && v.__b !== undefined ? Buffer.from(v.__b, "base64") : v)]));
const put = (p, o) => { const i = p.lastIndexOf("/"), col = p.slice(0, i), id = p.slice(i + 1), t = "c_" + (adapter.TABLES.has(col.split("/").pop()) ? col.split("/").pop() : "other"); d1.db.prepare(`UPDATE ${t} SET data=?, v=v+1 WHERE col=? AND id=?`).run(JSON.stringify(o), col, id); };
const DB = { put, get size() { return rows().length; }, get: p => (rows().find(r => r[0] === p) || [])[1], keys: () => rows().map(r => r[0])[Symbol.iterator](), entries: () => rows()[Symbol.iterator](), [Symbol.iterator]() { return rows()[Symbol.iterator](); } };
module.exports = { DB, d1 };

// EXPLAIN=1 node test/be2.js  -> afterwards lists every kind of database search the app made and whether it used an index
if (process.env.EXPLAIN) {
  d1.db.log = new Map();
  process.on("exit", () => {
    const seen = new Set(); let scans = 0;
    for (const [sql, p] of d1.db.log) {
      if (!/^\s*SELECT/i.test(sql) || /sqlite_master/.test(sql)) continue;
      const key = sql.replace(/\(\?(,\?)*\)/g, "(?)"); if (seen.has(key)) continue; seen.add(key);
      const plan = d1.db.prepare("EXPLAIN QUERY PLAN " + sql).all(...p).map(r => r.detail).join(" | ");
      const full = /SCAN c_/.test(plan); if (full) scans++;
      console.log((full ? "FULL SCAN  " : "indexed    ") + plan.replace(/c_/g, "").slice(0, 150) + "   <- " + sql.replace(/\s+/g, " ").slice(0, 70));
    }
    console.log(seen.size + " kinds of search, " + scans + " read a whole table");
  });
}
