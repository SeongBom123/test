import { hashToObject, pipeline, storeEnabled } from "./store.js";

// 횟수와 토큰 수만 저장한다. 사실관계, 질문, 결과, IP는 저장하지 않는다.
const KEEP_SECONDS = 90 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

const dateKey = (time) => new Date(time + KST_MS).toISOString().slice(0, 10);

/** 통계 기록이 실패해도 검토 결과에는 영향을 주지 않는다. */
export async function recordReview({ ok, usage }) {
  if (!storeEnabled()) return;
  const key = `stats:${dateKey(Date.now())}`;
  try {
    await pipeline([
      ["HINCRBY", key, "reviews", 1],
      ["HINCRBY", key, "failed", ok ? 0 : 1],
      ["HINCRBY", key, "input_tokens", usage?.input_tokens || 0],
      ["HINCRBY", key, "output_tokens", usage?.output_tokens || 0],
      ["EXPIRE", key, KEEP_SECONDS],
    ]);
  } catch (error) {
    console.error("stats failed", error?.name);
  }
}

/** 최근 days일의 통계를 최신 날짜부터 돌려준다. 기록이 없는 날도 0으로 채운다. */
export async function readStats(days = 30) {
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => dateKey(now - i * DAY_MS));
  const rows = await pipeline(dates.map((date) => ["HGETALL", `stats:${date}`]));
  const daily = dates.map((date, i) => {
    const row = hashToObject(rows[i]);
    return {
      date,
      reviews: Number(row.reviews) || 0,
      failed: Number(row.failed) || 0,
      input_tokens: Number(row.input_tokens) || 0,
      output_tokens: Number(row.output_tokens) || 0,
    };
  });
  const totals = daily.reduce(
    (sum, d) => ({
      reviews: sum.reviews + d.reviews,
      failed: sum.failed + d.failed,
      input_tokens: sum.input_tokens + d.input_tokens,
      output_tokens: sum.output_tokens + d.output_tokens,
    }),
    { reviews: 0, failed: 0, input_tokens: 0, output_tokens: 0 },
  );
  return { days, totals, daily };
}
