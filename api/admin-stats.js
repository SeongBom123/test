import { checkAdmin, send } from "../lib/http.js";
import { readStats } from "../lib/stats.js";
import { storeEnabled, StoreError } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "GET만 지원합니다." });
  const admin = checkAdmin(req);
  if (!admin.ok) return send(res, admin.status, { error: admin.error });
  if (!storeEnabled()) return send(res, 503, { error: "저장소가 설정되지 않아 통계를 볼 수 없습니다." });
  try {
    return send(res, 200, await readStats(30));
  } catch (error) {
    console.error("admin stats failed", error?.name);
    return send(res, 502, { error: error instanceof StoreError ? error.message : "통계를 읽지 못했습니다." });
  }
}
