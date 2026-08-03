import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.TARGET_PORT ?? 3000);

const loginPage = String.raw`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QA 샘플 로그인</title>
    <style>
      * { box-sizing: border-box; }
      body {
        display: grid;
        min-height: 100vh;
        margin: 0;
        place-items: center;
        background: #f4f6fa;
        color: #172033;
        font: 15px/1.5 system-ui, sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid #dfe4ec;
        border-radius: 14px;
        background: white;
        box-shadow: 0 18px 45px rgb(23 32 51 / 9%);
      }
      h1 { margin: 0 0 6px; font-size: 24px; }
      p { margin: 0 0 24px; color: #667085; }
      label { display: block; margin-top: 16px; font-weight: 700; }
      input {
        width: 100%;
        margin-top: 7px;
        padding: 11px 12px;
        border: 1px solid #cfd5df;
        border-radius: 8px;
        font: inherit;
      }
      button {
        width: 100%;
        margin-top: 22px;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        background: #3157d5;
        color: white;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      #error { min-height: 22px; margin-top: 12px; color: #b42318; }
    </style>
  </head>
  <body>
    <main>
      <h1>QA 샘플 로그인</h1>
      <p>Scenario QA의 실제 Playwright 실행을 확인하는 로컬 대상입니다.</p>
      <form id="login-form">
        <label>
          아이디
          <input data-testid="login-id" autocomplete="username">
        </label>
        <label>
          비밀번호
          <input data-testid="login-password" type="password" autocomplete="current-password">
        </label>
        <button data-testid="login-submit" type="submit">로그인</button>
        <div id="error" role="alert" data-testid="login-error"></div>
      </form>
    </main>
    <script>
      document.querySelector("#login-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const id = document.querySelector("[data-testid='login-id']").value;
        const password = document.querySelector("[data-testid='login-password']").value;
        if (id === "qa-user" && password === "qa-password") {
          sessionStorage.setItem("qa-user", id);
          location.href = "/dashboard";
          return;
        }
        document.querySelector("#error").textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
      });
    </script>
  </body>
</html>`;

const dashboardPage = String.raw`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QA 샘플 대시보드</title>
    <style>
      body {
        max-width: 920px;
        margin: 0 auto;
        padding: 56px 24px;
        background: #f8fafc;
        color: #172033;
        font: 15px/1.5 system-ui, sans-serif;
      }
      header {
        padding: 28px;
        border: 1px solid #dfe4ec;
        border-radius: 14px;
        background: white;
      }
      h1 { margin: 0; }
      p { color: #667085; }
    </style>
  </head>
  <body>
    <header>
      <h1 data-testid="dashboard-title">테스트 대시보드</h1>
      <p>로그인이 완료되었습니다.</p>
      <a data-testid="items-link" href="/items">주요 목록 보기</a>
    </header>
  </body>
</html>`;

const itemsPage = String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QA 샘플 목록</title><style>body{max-width:920px;margin:0 auto;padding:56px 24px;background:#f8fafc;color:#172033;font:15px/1.5 system-ui,sans-serif}main{padding:28px;border:1px solid #dfe4ec;border-radius:14px;background:white}.empty{margin-top:20px;padding:30px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b}</style></head><body><main><h1 data-testid="items-title">주요 항목</h1><div class="empty" data-testid="items-empty">등록된 테스트 항목이 없습니다.</div></main></body></html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  response.setHeader("Cache-Control", "no-store");

  if (url.pathname === "/" || url.pathname === "/login") {
    sendHtml(response, loginPage);
    return;
  }
  if (url.pathname === "/dashboard") {
    sendHtml(response, dashboardPage);
    return;
  }
  if (url.pathname === "/items") {
    sendHtml(response, itemsPage);
    return;
  }
  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
});

function sendHtml(response, html) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

server.listen(port, host, () => {
  console.log(`QA sample target: http://${host}:${port}/login`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
