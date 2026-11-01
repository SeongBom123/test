// 실제 API 없이 Anthropic과 법제처 API를 로컬 모의 서버로 대체해 함수 동작을 시험한다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

const OC = "secret-oc-value";
let anthropicRequests = [];
let lawRequests = [];
let lawMode = "ok";
let answers = [];

const REVIEW = {
  summary: "요약 [[P66]]", application_note: "", issues: [{ title: "쟁점", assessment: "다툼 있음", rule: "[[L-prec-111]]", application: "a", counter: "c", authority_ids: ["P66", "L-prec-111", "NOPE"] }],
  missing_facts: [], gaps: [], next_steps: [],
};

function sse(res, text, stopReason = "end_turn") {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
  ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
  ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  ev("content_block_stop", { index: 0 });
  ev("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1 } });
  ev("message_stop", {});
  res.end();
}

const anthropic = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    anthropicRequests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    const next = answers.shift() || { text: JSON.stringify(REVIEW) };
    sse(res, next.text, next.stop);
  });
});

const law = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  lawRequests.push(url);
  res.setHeader("content-type", "application/json");
  if (lawMode === "auth") return res.end(JSON.stringify({ result: "사용자 정보 검증에 실패하였습니다.", msg: "등록" }));
  const target = url.searchParams.get("target");
  if (url.pathname.endsWith("lawSearch.do")) {
    if (target === "prec") return res.end(JSON.stringify({ PrecSearch: { totalCnt: "1", prec: [{ 판례일련번호: "111", 사건명: "양도소득세부과처분취소", 사건번호: "2020두111", 선고일자: "2021.01.01", 법원명: "대법원" }] } }));
    if (target === "ttSpecialDecc") return res.end(JSON.stringify({ Decc: { decc: [{ "특별행정심판재결례 일련번호": "222", 사건명: "심판 사건", 청구번호: "조심2022서222", 의결일자: "2022.02.02" }] } }));
    return res.end(JSON.stringify({ Expc: { expc: { 법령해석일련번호: "333", 안건명: "해석 제목", 안건번호: "서면-2023-333", 해석일자: "2023.03.03" } } }));
  }
  if (target === "prec") return res.end(JSON.stringify({ PrecService: { 판례정보일련번호: "111", 판시사항: "판시<br/>내용", 판결요지: "요지 <b>본문</b>" } }));
  return res.end(JSON.stringify({ SpecialDeccService: { 특별행정심판재결례일련번호: "222", 재결요지: "재결 요지" } }));
});

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
let review, search, config;

function call(handler, { method = "POST", body, code = "open-sesame" } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      status(s) { this.code = s; return this; },
      json(d) { resolve({ status: this.code, body: d }); },
    };
    Promise.resolve(handler({ method, body, headers: code == null ? {} : { "x-access-code": code } }, res)).catch(reject);
  });
}
const FACTS = "A는 2018년 아파트를 취득해 2025년에 양도하였고 딸 B가 별도 주택을 보유하고 있다.";

before(async () => {
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${await listen(anthropic)}`;
  process.env.LAW_API_BASE = `http://127.0.0.1:${await listen(law)}/DRF`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ACCESS_CODE = "open-sesame";
  process.env.LAW_OC = OC;
  review = (await import("../api/review.js")).default;
  search = (await import("../api/search.js")).default;
  config = (await import("../api/config.js")).default;
});
after(() => { anthropic.close(); law.close(); });

test("접근 코드가 틀리거나 없으면 어떤 외부 호출도 하지 않는다", async () => {
  anthropicRequests = []; lawRequests = [];
  assert.equal((await call(review, { body: { facts: FACTS }, code: "wrong" })).status, 401);
  assert.equal((await call(review, { body: { facts: FACTS }, code: null })).status, 401);
  assert.equal((await call(search, { body: { query: "가산세", kind: "prec" }, code: "wrong" })).status, 401);
  assert.equal(anthropicRequests.length + lawRequests.length, 0);
});

test("ACCESS_CODE가 없으면 검토를 막는다", async () => {
  delete process.env.ACCESS_CODE;
  assert.equal((await call(review, { body: { facts: FACTS } })).status, 503);
  process.env.ACCESS_CODE = "open-sesame";
});

test("입력 길이를 검사한다", async () => {
  assert.equal((await call(review, { body: { facts: "짧음" } })).status, 400);
  assert.equal((await call(review, { body: { facts: "가".repeat(8001) } })).status, 400);
});

test("검토: 검색어 추출, 법제처 검색, 분석 순으로 실행하고 없는 근거 ID를 지운다", async () => {
  anthropicRequests = []; lawRequests = []; lawMode = "ok";
  answers = [{ text: JSON.stringify({ queries: ["생계 같이 가족"] }) }];
  const r = await call(review, { body: { facts: FACTS, tax: "양도소득세", stage: "신고 전 검토" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.liveStatus, "ok");
  assert.deepEqual(r.body.result.issues[0].authority_ids, ["P66", "L-prec-111"]);

  const items = Object.fromEntries(r.body.live.map((a) => [a.id, a]));
  assert.equal(items["L-prec-111"].no, "대법원 2020두111");
  assert.match(items["L-prec-111"].sum, /판시 내용/);
  assert.match(items["L-prec-111"].sum, /요지 본문/);
  assert.equal(items["L-decc-222"].sum, "재결 요지");
  assert.equal(items["L-nts-333"].sum, "");
  assert.match(items["L-nts-333"].note, /제목만/);

  assert.equal(anthropicRequests.length, 2);
  const main = anthropicRequests[1];
  assert.equal(main.body.model, "claude-opus-5-5");
  assert.equal(main.body.fallbacks, "default");
  assert.equal(main.body.output_config.format.type, "json_schema");
  assert.match(main.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.match(main.body.messages[0].content, /L-prec-111/);
  assert.match(main.body.messages[0].content, /<facts>/);
});

test("OC 값은 응답 어디에도 나오지 않는다", async () => {
  lawMode = "ok";
  answers = [{ text: JSON.stringify({ queries: ["가산세"] }) }];
  const r = await call(review, { body: { facts: FACTS } });
  assert.ok(!JSON.stringify(r.body).includes(OC));
  assert.ok(lawRequests.every((u) => u.searchParams.get("OC") === OC));
});

test("법제처 인증 실패: 내장 자료실로 계속 검토하고 실패를 알린다", async () => {
  lawMode = "auth";
  answers = [{ text: JSON.stringify({ queries: ["가산세"] }) }];
  const r = await call(review, { body: { facts: FACTS } });
  assert.equal(r.status, 200);
  assert.equal(r.body.liveStatus, "failed");
  assert.match(r.body.liveErrors[0], /인증을 거부/);
  assert.ok(!JSON.stringify(r.body).includes(OC));
  lawMode = "ok";
});

test("LAW_OC가 없으면 법제처를 호출하지 않는다", async () => {
  delete process.env.LAW_OC;
  anthropicRequests = []; lawRequests = [];
  const r = await call(review, { body: { facts: FACTS } });
  assert.equal(r.status, 200);
  assert.equal(r.body.liveStatus, "off");
  assert.equal(lawRequests.length, 0);
  assert.equal(anthropicRequests.length, 1);
  process.env.LAW_OC = OC;
});

test("거절과 잘림과 JSON 오류를 각각 오류로 돌려준다", async () => {
  delete process.env.LAW_OC;
  for (const [answer, pattern] of [
    [{ text: "", stop: "refusal" }, /검토할 수 없습니다/],
    [{ text: "{", stop: "max_tokens" }, /끊겼습니다/],
    [{ text: "not json" }, /형식이 올바르지/],
  ]) {
    answers = [answer];
    process.env.RATE_RESET = "1";
    const r = await new Promise((resolve, reject) => {
      const res = { status(s) { this.code = s; return this; }, json(d) { resolve({ status: this.code, body: d }); } };
      review({ method: "POST", body: { facts: FACTS }, headers: { "x-access-code": "open-sesame", "x-forwarded-for": String(Math.random()) } }, res).catch(reject);
    });
    assert.equal(r.status, 422);
    assert.match(r.body.error, pattern);
  }
  process.env.LAW_OC = OC;
});

test("실시간 검색: 잘못된 종류를 거부하고 결과를 돌려준다", async () => {
  lawMode = "ok";
  assert.equal((await call(search, { body: { query: "가산세", kind: "bad" } })).status, 400);
  const r = await call(search, { body: { query: "가산세", kind: "prec" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.items[0].id, "L-prec-111");
  assert.ok(lawRequests.at(-1).searchParams.get("target") === "prec");
});

test("설정 상태에 비밀 값이 없다", async () => {
  const r = await call(config, { method: "GET" });
  assert.deepEqual(r.body, { reviewEnabled: true, liveEnabled: true });
});
