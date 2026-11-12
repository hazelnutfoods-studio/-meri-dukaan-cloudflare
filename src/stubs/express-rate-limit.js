// A small "slow down" guard (same job as the express-rate-limit package, which cannot start on Cloudflare).
// It counts per visitor inside each running copy of the app; that is enough to stop quick repeated guessing.
function rateLimit(opt = {}) {
  const windowMs = opt.windowMs || 60000, limit = opt.limit || opt.max || 100, hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip || (req.headers["cf-connecting-ip"] || "x");
    if (hits.size > 5000) for (const [k, v] of hits) if (v.t < now) hits.delete(k); // tidy up now and then
    let h = hits.get(key); if (!h || h.t < now) { h = { n: 0, t: now + windowMs }; hits.set(key, h); }
    h.n++;
    if (h.n > limit) { res.set("Retry-After", String(Math.ceil((h.t - now) / 1000))); return res.status(429).send(typeof opt.message === "string" ? opt.message : "Too many requests, please try again later."); }
    next();
  };
}
module.exports = rateLimit; module.exports.rateLimit = rateLimit; module.exports.default = rateLimit;
