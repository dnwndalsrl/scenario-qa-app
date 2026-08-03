import { randomBytes, scryptSync } from "node:crypto";

if (!process.stdin.isTTY) {
  console.error("NORTHFLANK_ENVIRONMENT_INVALID: Run this command in an interactive terminal.");
  process.exit(1);
}

const password = await readHidden("관리자 비밀번호(14자 이상): ");
const confirmation = await readHidden("비밀번호 확인: ");
if (password !== confirmation) throw new Error("입력한 비밀번호가 일치하지 않습니다.");
if (password.length < 14) throw new Error("관리자 비밀번호는 14자 이상이어야 합니다.");

const N = 16_384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const derived = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
const sessionSecret = randomBytes(48).toString("base64url");

console.log("\n아래 두 값만 Northflank Secret에 등록하세요. 평문 비밀번호는 저장되지 않았습니다.");
console.log(`APP_AUTH_PASSWORD_HASH=${hash}`);
console.log(`APP_SESSION_SECRET=${sessionSecret}`);

async function readHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (key: string) => {
      if (key === "\r" || key === "\n") {
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (key === "\u0003") {
        process.stdin.setRawMode(false);
        process.exit(130);
      } else if (key === "\u007f") {
        value = value.slice(0, -1);
      } else if (key >= " ") {
        value += key;
      }
    };
    process.stdin.on("data", onData);
  });
}
