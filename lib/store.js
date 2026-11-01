/**
 * Upstash Redis REST 클라이언트. 의존성 없이 fetch만 쓴다.
 * Vercel Marketplace 연결 방식에 따라 변수 이름이 달라 두 이름을 모두 받는다.
 * 토큰은 응답과 오류 메시지 어디에도 넣지 않는다.
 */
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const storeEnabled = () => Boolean(url() && token());

export class StoreError extends Error {}

async function post(path, body) {
  if (!storeEnabled()) throw new StoreError("저장소가 설정되지 않았습니다.");
  let response;
  try {
    response = await fetch(`${url().replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new StoreError("저장소에 연결하지 못했습니다.");
  }
  if (response.status === 401 || response.status === 403) throw new StoreError("저장소가 인증을 거부했습니다.");
  if (!response.ok) throw new StoreError(`저장소가 ${response.status} 오류를 반환했습니다.`);
  try {
    return await response.json();
  } catch {
    throw new StoreError("저장소 응답을 해석하지 못했습니다.");
  }
}

/** 명령 하나를 실행한다. 예: redis("HGET", "key", "field") */
export async function redis(...command) {
  const data = await post("", command);
  if (data.error) throw new StoreError("저장소 명령이 실패했습니다.");
  return data.result;
}

/** 여러 명령을 한 번에 실행하고 결과 배열을 돌려준다. */
export async function pipeline(commands) {
  const data = await post("/pipeline", commands);
  if (!Array.isArray(data) || data.some((d) => d.error)) throw new StoreError("저장소 명령이 실패했습니다.");
  return data.map((d) => d.result);
}

/** HGETALL의 [필드, 값, 필드, 값] 응답을 객체로 바꾼다. */
export function hashToObject(flat) {
  const out = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}
