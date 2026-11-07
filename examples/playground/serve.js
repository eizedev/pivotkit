// A static file server for the built playground (examples/playground/dist), for the browser tests and
// a quick look without a dev server: node examples/playground/serve.js [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("./dist/", import.meta.url).pathname;
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

/** The decoded path of a request; null when its percent-encoding is malformed. */
function pathOf(url) {
    try {
        return decodeURIComponent(new URL(url, "http://x").pathname);
    } catch {
        return null;
    }
}

const server = createServer(async (req, res) => {
    const decoded = pathOf(req.url);
    if (decoded === null) {
        res.writeHead(400, { "content-type": "text/plain" }).end("bad request");
        return;
    }
    const path = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
    if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
        res.end(body);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
});
// port 0 picks a free one; the address printed is the one listened on
server.listen(port, "127.0.0.1", () => console.log(`playground on http://127.0.0.1:${server.address().port}/`));
