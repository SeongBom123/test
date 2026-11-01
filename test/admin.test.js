// 관리자 API를 모의 Redis, Anthropic, 법제처 서버로 시험한다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";

const TOKEN = "secret-redis-token";
const OC = "secret-oc-value";
const hashes = new Map();
let redisDown = false;
let redisAuthHeaders = [];
let claudeAuthFail = false;
let anthropicBodies = [];

function run([cmd, key, ...args]) {
  const hash = hashes.get(key) || new Map();
  switch (cmd) {
    case "PING": return "PONG";
    case "HGETALL": return [...hash.entries()].flat();
    case "HSET": hash.set(args[0], String(args[1])); hashes.set(key, hash); return 1;
    case "HDEL": return hash.delete(args[0]) ? 1 : 0;
    case "HINCRBY": hash.set(args[0], String(Number(hash.get(args[0]) || 0) + Number(args[1]))); hashes.set(key, hash); return 0;
    case "EXPIRE": return 1;
    default: throw new Error(`mock: ${cmd}`);
  }
}

const redisServer = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    redisAuthHeaders.push(req.headers.authorization);
    if (redisDown) { res.statusCode = 500; return res.end("{}"); }
    res.setHeader("content-type", "application/json");
    const body = JSON.parse(raw);
    if (req.url === "/pipeline") return res.end(JSON.stringify(body.map((c) => ({ result: run(c) }))));
    res.end(JSON.stringify({ result: run(body) }));
  });
});

const anthropic = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") {
      if (claudeAuthFail) { res.statusCode = 401; return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x" } })); }
      return res.end(JSON.stringify({ type: "model", id: "claude-opus-5-5", display_name: "m", created_at: "2026-01-01T00:00:00Z" }));
    }
    anthropicBodies.push(JSON.parse(raw));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    const text = JSON.stringify({ summary: "요약", application_note: "", issues: [], missing_facts: [], gaps: [], next_steps: [] });
    ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } });
    ev("message_stop", {});
    res.end();
  });
});

const law = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ PrecSearch: { prec: [{ 판례일련번호: "1", 사건명: "a", 사건번호: "b", 법원명: "c" }] } }));
});

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
let status, stats, library, publicLibrary, review;
let ip = 0;

function call(handler, { method = "GET", body, code = "boss", access } = {}) {
  ip += 1;
  const headers = { "x-forwarded-for": `10.0.0.${ip}` };
  if (code != null) headers["x-admin-code"] = code;
  if (access) headers["x-access-code"] = access;
  return new Promise((resolve, reject) => {
    const res = { status(s) { this.code = s; return this; }, json(d) { resolve({ status: this.code, body: d }); } };
    Promise.resolve(handler({ method, body, headers }, res)).catch(reject);
  });
}

const ITEM = { k: "trb", no: "조심2026서1", title: "새 심판례", date: "2026.01.01", sum: "새 요지입니다", src: "조세심판원", url: "https://www.tt.go.kr/", tags: ["가산세"] };
const FACTS = "A는 2018년 아파트를 취득해 2025년에 양도하였고 딸 B가 별도 주택을 보유하고 있다.";

before(async () => {
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${await listen(redisServer)}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${await listen(anthropic)}`;
  process.env.LAW_API_BASE = `http://127.0.0.1:${await listen(law)}/DRF`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ACCESS_CODE = "open-sesame";
  process.env.ADMIN_CODE = "boss";
  process.env.LAW_OC = OC;
  status = (await import("../api/admin-status.js")).default;
  stats = (await import("../api/admin-stats.js")).default;
  library = (await import("../api/admin-library.js")).default;
  publicLibrary = (await import("../api/library.js")).default;
  review = (await import("../api/review.js")).default;
});
after(() => { redisServer.close(); anthropic.close(); law.close(); });
beforeEach(() => { hashes.clear(); redisDown = false; claudeAuthFail = false; anthropicBodies = []; process.env.ADMIN_CODE = "boss"; process.env.ACCESS_CODE = "open-sesame"; });

test("관리자 코드가 틀리거나 없으면 모든 관리자 API를 막는다", async () => {
  for (const handler of [status, stats, library]) {
    assert.equal((await call(handler, { code: "wrong" })).status, 401);
    assert.equal((await call(handler, { code: null })).status, 401);
    assert.equal((await call(handler, { code: "open-sesame" })).status, 401);
  }
  assert.equal((await call(library, { method: "POST", code: "wrong", body: { action: "save", item: ITEM } })).status, 401);
  assert.equal(hashes.size, 0);
});

test("ADMIN_CODE가 없으면 기본 비밀번호를 쓰고 상태 점검에서 경고하며, 있으면 기본값을 막는다", async () => {
  assert.equal((await call(status, { code: "1" })).status, 401);
  delete process.env.ADMIN_CODE;
  assert.equal((await call(status, { code: "undefined" })).status, 401);
  const r = await call(status, { code: "1" });
  assert.equal(r.status, 200);
  assert.equal(r.body.checks.admin_code.state, "fail");
});

test("상태 점검: 연결 상태를 보여 주고 비밀 값은 넣지 않는다", async () => {
  const r = await call(status);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.values(r.body.checks).map((c) => c.state), ["ok", "ok", "ok", "ok", "ok"]);
  const text = JSON.stringify(r.body);
  assert.equal(r.body.checks.admin_code.state, "ok");
  for (const secret of [TOKEN, OC, "test-key", "open-sesame", "boss"]) assert.ok(!text.includes(secret));
  assert.equal(anthropicBodies.length, 0, "상태 점검은 메시지 요금을 쓰지 않는다");
  assert.ok(redisAuthHeaders.every((h) => h === `Bearer ${TOKEN}`));
});

test("상태 점검: 실패와 코드 중복을 알린다", async () => {
  claudeAuthFail = true;
  redisDown = true;
  process.env.ACCESS_CODE = "boss";
  const { checks } = (await call(status)).body;
  assert.equal(checks.claude.state, "fail");
  assert.equal(checks.store.state, "fail");
  assert.equal(checks.access.state, "fail");
});

test("근거 자료: 입력을 검사한다", async () => {
  const save = (item, id) => call(library, { method: "POST", body: { action: "save", id, item } });
  assert.equal((await save({ ...ITEM, k: "bad" })).status, 400);
  assert.equal((await save({ ...ITEM, sum: " " })).status, 400);
  assert.equal((await save({ ...ITEM, url: "javascript:alert(1)" })).status, 400);
  assert.equal((await save({ ...ITEM, url: "http://a.kr" })).status, 400);
  assert.equal((await save(ITEM, "NOPE")).status, 404);
});

test("근거 자료: 추가한 자료가 공개 목록과 검토에 들어가고 삭제하면 빠진다", async () => {
  const saved = await call(library, { method: "POST", body: { action: "save", item: ITEM } });
  assert.equal(saved.status, 200);
  const id = saved.body.item.id;
  assert.equal(saved.body.item.custom, true);
  assert.ok((await call(publicLibrary)).body.items.some((a) => a.id === id));

  const r = await call(review, { method: "POST", code: null, access: "open-sesame", body: { facts: FACTS } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(anthropicBodies.at(-1).messages[0].content, /조심2026서1/);

  assert.equal((await call(library, { method: "POST", body: { action: "delete", id } })).status, 200);
  assert.ok(!(await call(publicLibrary)).body.items.some((a) => a.id === id));
  assert.equal((await call(library, { method: "POST", body: { action: "delete", id } })).status, 404);
});

test("근거 자료: 내장 자료를 수정, 삭제, 복원한다", async () => {
  const find = async (id) => (await call(publicLibrary)).body.items.find((a) => a.id === id);
  const original = await find("P66");
  assert.ok(original);

  await call(library, { method: "POST", body: { action: "save", id: "P66", item: { ...original, title: "고친 제목" } } });
  assert.equal((await find("P66")).title, "고친 제목");
  assert.equal((await call(library)).body.items.find((a) => a.id === "P66").origin, "edited");

  await call(library, { method: "POST", body: { action: "delete", id: "P66" } });
  assert.equal(await find("P66"), undefined);
  assert.equal((await call(library)).body.items.find((a) => a.id === "P66").origin, "deleted");
  await call(review, { method: "POST", code: null, access: "open-sesame", body: { facts: FACTS } });
  assert.ok(!anthropicBodies.at(-1).messages[0].content.includes('"id":"P66"'));

  await call(library, { method: "POST", body: { action: "restore", id: "P66" } });
  assert.deepEqual(await find("P66"), original);
});

test("저장소 장애: 검토는 내장 자료로 계속하고 알리며, 수정은 오류를 돌려준다", async () => {
  redisDown = true;
  const r = await call(review, { method: "POST", code: null, access: "open-sesame", body: { facts: FACTS } });
  assert.equal(r.status, 200);
  assert.equal(r.body.libraryDegraded, true);
  assert.ok((await call(publicLibrary)).body.items.length > 0);
  const saved = await call(library, { method: "POST", body: { action: "save", item: ITEM } });
  assert.equal(saved.status, 502);
  assert.ok(!JSON.stringify(saved.body).includes(TOKEN));
  assert.equal((await call(stats)).status, 502);
});

test("사용 현황: 횟수와 토큰만 집계하고 입력 내용은 저장하지 않는다", async () => {
  delete process.env.LAW_OC;
  const ok = await call(review, { method: "POST", code: null, access: "open-sesame", body: { facts: FACTS, question: "비밀질문" } });
  process.env.LAW_OC = OC;
  assert.equal(ok.status, 200);

  const r = await call(stats);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.totals, { reviews: 1, failed: 0, input_tokens: 100, output_tokens: 7 });
  assert.equal(r.body.daily.length, 30);
  const stored = JSON.stringify([...hashes.entries()].map(([k, v]) => [k, [...v.entries()]]));
  assert.ok(!stored.includes("아파트") && !stored.includes("비밀질문"));
});
