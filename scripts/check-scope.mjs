// 分支範圍檢查：ai/chatgpt 只負責介面與文件，不能動核心、資料、模擬與建置設定。
// 確實需要時，在該分支任一 commit 訊息加上 [scope-ok]，並由整合者審過。
import { execSync } from "node:child_process";

const SCOPES = {
  "ai/chatgpt": {
    // 例外：src/data/events/ 底下的 .json 事件檔交給 ChatGPT 寫（載入清單 load.ts 與驗證仍由 Claude 管）
    allowed: [/^src\/data\/events\/[^/]+\.json$/],
    forbidden: ["src/core/", "src/data/", "scripts/", ".github/", "package.json", "package-lock.json", "vite.config.ts", "AGENTS.md", "CLAUDE.md", "tests/save-shape.json"],
  },
};

const run = (cmd) => execSync(cmd, { encoding: "utf-8" }).trim();
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || run("git rev-parse --abbrev-ref HEAD");
const scope = SCOPES[branch];
if (!scope) {
  console.log(`分支 ${branch} 沒有範圍限制。`);
  process.exit(0);
}

const base = process.env.SCOPE_BASE || "origin/master";
const files = run(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
// 作者標記：所有助手共用同一個 git 使用者，靠 Co-Authored-By 辨識是誰寫的（不受 [scope-ok] 豁免）
const unsigned = run(`git log ${base}..HEAD --no-merges --format=%H`)
  .split("\n")
  .filter(Boolean)
  .filter((h) => !/Co-Authored-By:\s*ChatGPT/i.test(run(`git log -1 --format=%B ${h}`)))
  .map((h) => h.slice(0, 7));
if (unsigned.length > 0) {
  console.error(`分支 ${branch} 有 commit 缺少「Co-Authored-By: ChatGPT <noreply@openai.com>」：${unsigned.join(", ")}`);
  process.exit(1);
}

const messages = run(`git log ${base}..HEAD --format=%B`);
if (messages.includes("[scope-ok]")) {
  console.log("commit 訊息有 [scope-ok]，略過範圍檢查（整合者要人工審）。");
  process.exit(0);
}

const bad = files.filter((f) => !(scope.allowed ?? []).some((re) => re.test(f)) && scope.forbidden.some((p) => f === p || f.startsWith(p)));
if (bad.length > 0) {
  console.error(`分支 ${branch} 動到了不在負責範圍內的檔案：\n${bad.map((f) => `  ${f}`).join("\n")}`);
  console.error("這些由 Claude 負責。若確實需要，請先跟整合者討論，並在 commit 訊息加上 [scope-ok]。");
  process.exit(1);
}
console.log(`分支 ${branch}：${files.length} 個檔案都在範圍內。`);
