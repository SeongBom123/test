import { checkAccess, rateLimited, send } from "../lib/http.js";
import { LawApiError, searchKind } from "../lib/lawApi.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST만 지원합니다." });
  const access = checkAccess(req);
  if (!access.ok) return send(res, access.status, { error: access.error });
  if (rateLimited(req, "search", 30)) return send(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  const kind = req.body?.kind;
  if (query.length < 2 || query.length > 100) return send(res, 400, { error: "검색어를 2~100자로 적어 주세요." });
  try {
    const items = await searchKind(kind, query, { display: 10, withBody: 3 });
    return send(res, 200, { items });
  } catch (error) {
    if (error instanceof LawApiError) {
      const status = error.code === "kind" ? 400 : error.code === "off" ? 503 : 502;
      return send(res, status, { error: error.message });
    }
    console.error("search failed", error?.name);
    return send(res, 500, { error: "검색 중 오류가 났습니다." });
  }
}
