import { adminList, deleteItem, restoreItem, saveItem } from "../lib/authorities.js";
import { checkAdmin, send } from "../lib/http.js";
import { storeEnabled, StoreError } from "../lib/store.js";

export default async function handler(req, res) {
  const admin = checkAdmin(req);
  if (!admin.ok) return send(res, admin.status, { error: admin.error });
  try {
    if (req.method === "GET") return send(res, 200, { items: await adminList(), storeEnabled: storeEnabled() });
    if (req.method !== "POST") return send(res, 405, { error: "GET과 POST만 지원합니다." });
    if (!storeEnabled()) return send(res, 503, { error: "저장소가 설정되지 않아 자료를 바꿀 수 없습니다." });

    const { action, id, item } = req.body || {};
    let result;
    if (action === "save") result = await saveItem({ ...item, id });
    else if (typeof id !== "string" || !id) return send(res, 400, { error: "자료 ID가 없습니다." });
    else if (action === "delete") result = await deleteItem(id);
    else if (action === "restore") result = await restoreItem(id);
    else return send(res, 400, { error: "알 수 없는 작업입니다." });

    const { status, ...body } = result;
    return send(res, status, status === 200 ? { ok: true, ...body } : body);
  } catch (error) {
    console.error("admin library failed", error?.name);
    return send(res, 502, { error: error instanceof StoreError ? error.message : "자료를 처리하지 못했습니다." });
  }
}
