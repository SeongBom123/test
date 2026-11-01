import { checkAdmin, send } from "../lib/http.js";
import { LawApiError, searchKind } from "../lib/lawApi.js";
import { Anthropic, model } from "../lib/review.js";
import { redis, storeEnabled, StoreError } from "../lib/store.js";

const OK = (message) => ({ state: "ok", message });
const OFF = (message) => ({ state: "off", message });
const FAIL = (message) => ({ state: "fail", message });

/** 모델 정보 조회만 하므로 토큰 요금이 나가지 않는다. */
async function checkClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return OFF("ANTHROPIC_API_KEY가 없어 검토 기능이 꺼져 있습니다.");
  try {
    const name = model();
    await new Anthropic({ timeout: 10_000, maxRetries: 0 }).models.retrieve(name);
    return OK(`연결됨 (모델 ${name})`);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return FAIL("API 키가 올바르지 않습니다.");
    if (error instanceof Anthropic.NotFoundError) return FAIL("CLAUDE_MODEL에 지정한 모델을 찾지 못했습니다.");
    return FAIL("Claude API에 연결하지 못했습니다.");
  }
}

async function checkLaw() {
  if (!process.env.LAW_OC) return OFF("LAW_OC가 없어 내장 자료만으로 검토합니다.");
  try {
    await searchKind("prec", "양도소득세", { display: 1, withBody: 0 });
    return OK("연결됨");
  } catch (error) {
    return FAIL(error instanceof LawApiError ? error.message : "법제처 API 확인 중 오류가 났습니다.");
  }
}

async function checkStore() {
  if (!storeEnabled()) return OFF("저장소가 없어 통계와 근거 자료 수정을 쓸 수 없습니다.");
  try {
    await redis("PING");
    return OK("연결됨");
  } catch (error) {
    return FAIL(error instanceof StoreError ? error.message : "저장소 확인 중 오류가 났습니다.");
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "GET만 지원합니다." });
  const admin = checkAdmin(req);
  if (!admin.ok) return send(res, admin.status, { error: admin.error });

  const [claude, law, store] = await Promise.all([checkClaude(), checkLaw(), checkStore()]);
  const access = !process.env.ACCESS_CODE
    ? OFF("ACCESS_CODE가 없어 검토와 검색이 꺼져 있습니다.")
    : process.env.ACCESS_CODE === process.env.ADMIN_CODE
      ? FAIL("ACCESS_CODE와 ADMIN_CODE가 같습니다. 사용자에게 관리자 권한까지 넘어가므로 다른 값으로 바꾸세요.")
      : OK("설정됨");
  return send(res, 200, { checks: { claude, law, store, access } });
}
