import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url)); const port = Number(process.env.FIXTURE_PORT || 3000); const requests = [];
const routes = { "/": "index.html", "/state": "state.html", "/products": "products.html", "/products/1": "product-detail-1.html", "/products/2": "product-detail-2.html", "/products/3": "product-detail-2.html", "/search": "search.html", "/about": "about.html", "/articles/qa-guide": "article.html", "/guide": "article.html" };
createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`); requests.push(`${request.method} ${url.pathname}${url.search}`);
  if (url.pathname === "/health") return json(response, 200, { status: "ok" });
  if (url.pathname === "/requests") return json(response, 200, { requests });
  if (url.pathname === "/api/missing" || url.pathname === "/broken") return html(response, 404, "<!doctype html><title>404 Fixture</title><h1>페이지를 찾을 수 없음</h1>");
  if (url.pathname === "/server-error") return html(response, 500, "<!doctype html><title>500 Fixture</title><h1>서버 오류</h1>");
  if (url.pathname === "/redirect") { response.writeHead(302, { location: "/about" }); response.end(); return; }
  if (["/logout", "/account/delete", "/private-preview", "/files/manual.pdf"].includes(url.pathname)) return html(response, 418, "<!doctype html><title>위험 링크 방문됨</title><h1>방문하면 안 됨</h1>");
  const file = routes[url.pathname]; if (!file) return html(response, 404, "<!doctype html><title>404 Fixture</title><h1>Not found</h1>");
  html(response, 200, await readFile(path.join(root, file)));
}).listen(port, "127.0.0.1", () => console.log(`QA fixture: http://127.0.0.1:${port}`));
function html(response, status, body) { response.writeHead(status, { "content-type": "text/html; charset=utf-8" }); response.end(body); }
function json(response, status, body) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
