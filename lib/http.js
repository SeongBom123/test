import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();

/** 접근 코드를 확인한다. ACCESS_CODE가 없으면 유료 API가 열리지 않도록 항상 거부한다. */
export function checkAccess(req) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return { ok: false, status: 503, error: "서버에 ACCESS_CODE가 설정되지 않았습니다." };
  const given = req.headers["x-access-code"];
  if (typeof given !== "string" || !timingSafeEqual(sha(given), sha(expected))) {
    return { ok: false, status: 401, error: "접근 코드가 맞지 않습니다." };
  }
  return { ok: true };
}

// 소유자 요청으로 넣은 기본 관리자 비밀번호. 공개 저장소에서 누구나 볼 수 있다. ADMIN_CODE를 설정하면 그 값이 우선한다.
const DEFAULT_ADMIN_CODE = "1";
export const adminCode = () => process.env.ADMIN_CODE || DEFAULT_ADMIN_CODE;

/** 관리자 코드를 확인한다. */
export function checkAdmin(req) {
  const expected = adminCode();
  if (rateLimited(req, "admin", 30)) return { ok: false, status: 429, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
  const given = req.headers["x-admin-code"];
  if (typeof given !== "string" || !timingSafeEqual(sha(given), sha(expected))) {
    return { ok: false, status: 401, error: "관리자 코드가 맞지 않습니다." };
  }
  return { ok: true };
}

const hits = new Map();

/**
 * 인스턴스별 간이 호출 제한. 서버리스 인스턴스끼리 공유되지 않으므로
 * 실수로 인한 연속 호출을 막는 용도이며, 실제 보호는 접근 코드가 맡는다.
 */
export function rateLimited(req, key, limit, windowMs = 60_000) {
  const ip = String(req.headers["x-forwarded-for"] || "local").split(",")[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(id, recent);
    return true;
  }
  recent.push(now);
  hits.set(id, recent);
  return false;
}

export function send(res, status, body) {
  res.status(status).json(body);
}
