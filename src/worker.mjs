// The front door. Pages come straight from the public folder; everything under /api goes to the shop's server code (server.js).
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import fontR from "./fonts/Regular.ttf";
import fontB from "./fonts/Bold.ttf";

globalThis.getEnv = () => env;
globalThis.__FONTS = { r: Buffer.from(fontR), b: Buffer.from(fontB) }; // invoice PDF fonts
const { default: app } = await import("./server.js");
app.listen(3000);
const node = httpServerHandler({ port: 3000 });

const PAGE = p => p === "/" || p === "" ? "/store.html" : p === "/manage" || p === "/manage/" ? "/manage.html" : p === "/move" || p === "/move/" ? "/move.html" : /^\/invoice\/[^/]+\/[^/]+\/?$/.test(p) ? "/invoice.html" : null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), p = url.pathname;
    if (p.startsWith("/api/")) {
      // photos never change once saved, so they are kept at Cloudflare's edge and cost no database read after the first one
      if (request.method === "GET" && p.startsWith("/api/photo/")) {
        const cache = caches.default, hit = await cache.match(request);
        if (hit) return hit;
        const res = await node.fetch(request, env, ctx);
        if (res.status === 200) ctx.waitUntil(cache.put(request, res.clone()));
        return res;
      }
      return node.fetch(request, env, ctx);
    }
    if (p.startsWith("/s/")) return Response.redirect(url.origin + "/", 302);
    const page = PAGE(p);
    if (page) { const r = await env.ASSETS.fetch(new Request(new URL(page, url.origin), request)); const h = new Headers(r.headers); h.set("Cache-Control", "no-cache"); return new Response(r.body, { status: r.status, headers: h }); }
    return env.ASSETS.fetch(request);
  },
};
