// Writes schema.sql: one table per kind of record, plus the few indexes that make every screen read only the rows it needs.
const { fieldExpr, TABLES, INDEX } = require("../src/d1-firestore.js");
let sql = "-- Meri Dukaan on Cloudflare D1. Made by scripts/make-schema.js, do not edit by hand.\n";
for (const t of [...TABLES, "other"]) {
  sql += `CREATE TABLE IF NOT EXISTS c_${t} (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, v INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (col, id)) WITHOUT ROWID;\n`;
  for (const f of INDEX[t] || []) sql += `CREATE INDEX IF NOT EXISTS idx_${t}_${f} ON c_${t}(col, ${fieldExpr(f)});\n`;
}
require("fs").writeFileSync(require("path").join(__dirname, "..", "schema.sql"), sql);
require("fs").writeFileSync(require("path").join(__dirname, "..", "src", "schema-sql.js"), "// Made by scripts/make-schema.js, do not edit by hand.\nmodule.exports = " + JSON.stringify(sql.split("\n").filter(l => /^CREATE/.test(l)), null, 1) + ";\n");
console.log(sql.split("\n").length - 1, "lines written");
