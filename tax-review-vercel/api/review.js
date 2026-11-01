import LIBRARY from "../lib/library.js";
import { checkAccess, rateLimited, send } from "../lib/http.js";
import { gatherAuthorities } from "../lib/lawApi.js";
import { Anthropic, ReviewError, dropUnknownAuthorities, extractQueries, makeClient, runReview } from "../lib/review.js";

const TEXT_MAX = 8000;
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function apiFailure(error) {
  if (error instanceof ReviewError) return [422, error.message];
  if (error instanceof Anthropic.AuthenticationError) return [502, "서버의 ANTHROPIC_API_KEY가 올바르지 않습니다."];
  if (error instanceof Anthropic.RateLimitError) return [429, "Claude API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."];
  if (error instanceof Anthropic.BadRequestError) return [502, "Claude API가 요청을 거부했습니다. 서버 로그를 확인해 주세요."];
  if (error instanceof Anthropic.APIError) return [502, "Claude API에 일시적인 문제가 있습니다. 다시 시도해 주세요."];
  return [500, "검토 중 오류가 났습니다. 다시 시도해 주세요."];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST만 지원합니다." });
  const access = checkAccess(req);
  if (!access.ok) return send(res, access.status, { error: access.error });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
  if (rateLimited(req, "review", 6)) return send(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });

  const body = req.body || {};
  const rawFacts = typeof body.facts === "string" ? body.facts.trim() : "";
  if (rawFacts.length < 20) return send(res, 400, { error: "사실관계를 20자 이상 적어 주세요." });
  if (rawFacts.length > TEXT_MAX) return send(res, 400, { error: `사실관계는 ${TEXT_MAX.toLocaleString()}자 이내로 줄여 주세요.` });
  const tax = text(body.tax, 30) || "자동 판단";
  const stage = text(body.stage, 30) || "미상";
  const question = text(body.question, 500);

  try {
    const client = makeClient();
    let live = [];
    let liveStatus = "off";
    let liveErrors = [];
    if (process.env.LAW_OC) {
      try {
        const queries = await extractQueries(client, rawFacts, tax);
        const found = queries.length ? await gatherAuthorities(queries) : { items: [], status: "ok", errors: [] };
        live = found.items;
        liveStatus = found.status;
        liveErrors = found.errors;
      } catch (error) {
        // 실시간 검색이 실패해도 내장 자료실로 검토를 이어 가되, 화면에 실패를 알린다.
        if (error instanceof ReviewError) throw error;
        liveStatus = "failed";
        liveErrors = ["실시간 검색어를 만들지 못했습니다."];
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = await runReview(client, { facts: rawFacts, tax, stage, question, live, today });
    const known = new Set([...LIBRARY, ...live].map((a) => a.id));
    return send(res, 200, { result: dropUnknownAuthorities(result, known), live, liveStatus, liveErrors });
  } catch (error) {
    // 사실관계가 로그에 남지 않도록 오류 종류만 기록한다.
    console.error("review failed", error?.name, error?.status);
    const [status, message] = apiFailure(error);
    return send(res, status, { error: message });
  }
}
