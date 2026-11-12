// Express normally loads a body reader that does not start on Cloudflare; this small one does the same job for JSON.
const json = (opt = {}) => { const limit = typeof opt.limit === "string" ? (parseInt(opt.limit) * (/mb/i.test(opt.limit) ? 1048576 : /kb/i.test(opt.limit) ? 1024 : 1)) : (opt.limit || 102400);
  return (req, res, next) => { if (req.body !== undefined) return next(); req.body = {}; if (!/json/i.test(req.headers["content-type"] || "")) return next(); let n = 0, over = false; const ch = [];
    req.on("data", c => { n += c.length; if (n > limit) over = true; else ch.push(c); });
    req.on("end", () => { if (over) return res.status(413).json({ error: "That is too big to send." }); try { req.body = ch.length ? JSON.parse(Buffer.concat(ch).toString("utf8")) : {}; next(); } catch (e) { res.status(400).json({ error: "Bad request" }); } });
    req.on("error", next); }; };
const none = () => (req, res, next) => next();
module.exports = Object.assign(() => none(), { json, urlencoded: none, raw: none, text: none });
