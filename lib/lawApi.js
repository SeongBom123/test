/**
 * 법제처 국가법령정보 OPEN API 클라이언트.
 * 요청 변수와 필드 이름은 open.law.go.kr 활용가이드를 따랐다.
 * 응답의 최상위 구조는 가이드에 없으므로 일련번호 필드로 행을 찾는다.
 * OC 값은 비밀이므로 응답, 링크, 오류 메시지 어디에도 넣지 않는다.
 */
const KINDS = {
  prec: { target: "prec", k: "crt", idKey: "판례일련번호", hasBody: true },
  decc: { target: "ttSpecialDecc", k: "trb", idKey: "특별행정심판재결례일련번호", hasBody: true },
  nts: { target: "ntsCgmExpc", k: "rul", idKey: "법령해석일련번호", hasBody: false },
};

export class LawApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const base = () => process.env.LAW_API_BASE || "https://www.law.go.kr/DRF";
const compact = (key) => key.replace(/\s/g, "");

function normalizeKeys(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [compact(k), v]));
}

/** 응답 어디에 있든 일련번호 필드가 있는 객체를 모두 찾는다. */
export function findRows(node, idKey, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => findRows(n, idKey, out));
  } else if (node && typeof node === "object") {
    const row = normalizeKeys(node);
    if (row[idKey] != null) out.push(row);
    else Object.values(node).forEach((n) => findRows(n, idKey, out));
  }
  return out;
}

export function cleanText(value, max = 1500) {
  if (value == null) return "";
  const text = String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function call(path, params) {
  const oc = process.env.LAW_OC;
  if (!oc) throw new LawApiError("off", "LAW_OC가 설정되지 않았습니다.");
  const url = `${base()}/${path}?${new URLSearchParams({ OC: oc, type: "JSON", ...params })}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new LawApiError("network", "법제처 API에 연결하지 못했습니다.");
  }
  if (!response.ok) throw new LawApiError("http", `법제처 API가 ${response.status} 오류를 반환했습니다.`);
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new LawApiError("format", "법제처 API 응답을 해석하지 못했습니다.");
  }
  if (typeof data?.result === "string" && /검증에 실패/.test(data.result)) {
    throw new LawApiError("auth", "법제처 API가 인증을 거부했습니다. OC 값과 등록한 서버 IP·도메인을 확인하세요.");
  }
  return data;
}

function linkFor(kind, id, row) {
  if (kind === "prec") return `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${encodeURIComponent(id)}`;
  if (kind === "decc") return "https://www.tt.go.kr/";
  return "https://taxlaw.nts.go.kr/";
}

function toItem(kind, row, body) {
  const def = KINDS[kind];
  const id = String(row[def.idKey]);
  const merged = { ...row, ...(body || {}) };
  const no =
    kind === "prec"
      ? `${cleanText(merged["법원명"])} ${cleanText(merged["사건번호"])}`.trim()
      : kind === "decc"
        ? cleanText(merged["청구번호"] || merged["사건번호"])
        : cleanText(merged["안건번호"]);
  const title = cleanText(merged["사건명"] || merged["안건명"], 200);
  const date = cleanText(merged["선고일자"] || merged["의결일자"] || merged["해석일자"]);
  const result = cleanText(merged["선고"] || merged["재결구분명"] || merged["재결례유형명"], 60);
  const sum =
    kind === "prec"
      ? [merged["판시사항"], merged["판결요지"]].map((v) => cleanText(v)).filter(Boolean).join(" / ")
      : kind === "decc"
        ? cleanText(merged["재결요지"] || merged["주문"])
        : "";
  let note = "";
  if (kind === "nts") note = "법제처 API는 국세청 해석의 본문을 제공하지 않습니다. 제목만 확인된 자료이므로 원문을 찾아 읽어야 합니다.";
  else if (!sum) note = "요지를 받지 못해 제목만 확인된 자료입니다. 원문을 읽어야 합니다.";
  return {
    id: `L-${kind}-${id}`,
    k: def.k,
    no: no || title,
    title,
    date,
    result,
    tags: [],
    sum,
    note,
    url: linkFor(kind, id, merged),
    src: kind === "prec" ? "국가법령정보센터" : kind === "decc" ? "조세심판원 (번호로 검색)" : "국세법령정보시스템 (번호로 검색)",
    live: true,
  };
}

async function fetchBody(kind, id) {
  const def = KINDS[kind];
  const data = await call("lawService.do", { target: def.target, ID: id });
  const rows = findRows(data, def.idKey);
  if (rows[0]) return rows[0];
  // 본문 응답은 일련번호 이름이 다를 수 있어(판례정보일련번호) 첫 객체의 본문 필드를 쓴다.
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const row = normalizeKeys(node);
      if (row["판시사항"] != null || row["판결요지"] != null || row["재결요지"] != null) return row;
      stack.push(...Object.values(node));
    }
  }
  return null;
}

/** 한 종류의 자료를 검색해 공통 형식으로 돌려준다. */
export async function searchKind(kind, query, { display = 5, withBody = 3 } = {}) {
  const def = KINDS[kind];
  if (!def) throw new LawApiError("kind", "알 수 없는 자료 종류입니다.");
  const data = await call("lawSearch.do", { target: def.target, search: "2", query, display: String(display) });
  const rows = findRows(data, def.idKey).slice(0, display);
  return Promise.all(
    rows.map(async (row, index) => {
      let body = null;
      if (def.hasBody && index < withBody) {
        try {
          body = await fetchBody(kind, String(row[def.idKey]));
        } catch {
          body = null; // 본문 하나가 실패해도 목록 정보는 유지한다. note로 드러난다.
        }
      }
      return toItem(kind, row, body);
    }),
  );
}

/** 여러 검색어와 자료 종류를 모아 검색한다. 일부만 실패하면 경고와 함께 나머지를 돌려준다. */
export async function gatherAuthorities(queries, { max = 18 } = {}) {
  const jobs = [];
  for (const query of queries) {
    for (const kind of Object.keys(KINDS)) jobs.push(searchKind(kind, query, { display: 4, withBody: 2 }));
  }
  const settled = await Promise.allSettled(jobs);
  const seen = new Map();
  const errors = new Set();
  for (const result of settled) {
    if (result.status === "fulfilled") result.value.forEach((item) => seen.has(item.id) || seen.set(item.id, item));
    else errors.add(result.reason?.message || "법제처 검색 오류");
  }
  const items = [...seen.values()]
    .sort((a, b) => Number(Boolean(b.sum)) - Number(Boolean(a.sum)))
    .slice(0, max);
  const failed = settled.filter((r) => r.status === "rejected").length;
  return {
    items,
    status: failed === 0 ? "ok" : failed === settled.length ? "failed" : "partial",
    errors: [...errors],
  };
}
