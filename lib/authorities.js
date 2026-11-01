import { randomUUID } from "node:crypto";
import BUILTIN from "./library.js";
import { hashToObject, redis, storeEnabled } from "./store.js";

/**
 * 내장 자료(lib/library.js)는 코드에 그대로 두고, 관리자가 바꾼 내용만 저장소에 둔다.
 * 저장소의 값은 새 자료, 내장 자료의 수정본, 내장 자료의 삭제 표시({deleted:true}) 중 하나다.
 */
const KEY = "library:overrides";
const MAX_OVERRIDES = 200;
const KINDS = new Set(["law", "rul", "trb", "crt"]);
const builtinIds = new Set(BUILTIN.map((a) => a.id));

export const isBuiltin = (id) => builtinIds.has(id);

export async function readOverrides() {
  const raw = hashToObject(await redis("HGETALL", KEY));
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    try {
      out[id] = JSON.parse(value);
    } catch {
      console.error("library entry unreadable");
    }
  }
  return out;
}

export function mergeLibrary(overrides) {
  const merged = [];
  for (const item of BUILTIN) {
    const override = overrides[item.id];
    if (!override) merged.push(item);
    else if (!override.deleted) merged.push(override);
  }
  for (const [id, override] of Object.entries(overrides)) {
    if (!isBuiltin(id) && !override.deleted) merged.push(override);
  }
  return merged;
}

/** 검토와 공개 목록에서 쓴다. 저장소가 실패하면 내장 자료로 계속하고 degraded로 알린다. */
export async function loadLibrary() {
  if (!storeEnabled()) return { items: BUILTIN, degraded: false };
  try {
    return { items: mergeLibrary(await readOverrides()), degraded: false };
  } catch (error) {
    console.error("library load failed", error?.name);
    return { items: BUILTIN, degraded: true };
  }
}

const field = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const isHttps = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** 입력을 검사해 저장할 항목을 만든다. 오류가 있으면 { error }를 돌려준다. */
export function validateItem(input, id) {
  const source = input && typeof input === "object" ? input : {};
  const item = {
    id,
    k: source.k,
    no: field(source.no, 100),
    title: field(source.title, 200),
    date: field(source.date, 60),
    result: field(source.result, 60),
    tags: (Array.isArray(source.tags) ? source.tags : []).map((t) => field(t, 30)).filter(Boolean).slice(0, 10),
    sum: field(source.sum, 5000),
    note: field(source.note, 1000),
    url: field(source.url, 500),
    src: field(source.src, 60),
    off: field(source.off, 500),
    custom: true,
  };
  if (!KINDS.has(item.k)) return { error: "자료 종류를 선택해 주세요." };
  if (!item.no || !item.title || !item.sum || !item.date) return { error: "번호, 제목, 날짜, 요지는 필수입니다." };
  if (!item.src || !isHttps(item.url)) return { error: "출처 이름과 https로 시작하는 출처 주소는 필수입니다." };
  if (item.off && !isHttps(item.off)) return { error: "국세법령정보시스템 주소는 https로 시작해야 합니다." };
  return { item };
}

export async function saveItem(input) {
  const requested = typeof input?.id === "string" && input.id ? input.id : null;
  const overrides = await readOverrides();
  if (requested && !isBuiltin(requested) && !overrides[requested]) return { status: 404, error: "없는 자료입니다." };
  if (!overrides[requested] && Object.keys(overrides).length >= MAX_OVERRIDES) {
    return { status: 400, error: `관리자가 바꾼 자료는 ${MAX_OVERRIDES}건까지 저장할 수 있습니다.` };
  }
  const { item, error } = validateItem(input, requested || `A-${randomUUID().slice(0, 8)}`);
  if (error) return { status: 400, error };
  await redis("HSET", KEY, item.id, JSON.stringify(item));
  return { status: 200, item };
}

/** 내장 자료는 삭제 표시를 남기고, 관리자가 만든 자료는 지운다. */
export async function deleteItem(id) {
  if (isBuiltin(id)) await redis("HSET", KEY, id, JSON.stringify({ id, deleted: true }));
  else if (!(await redis("HDEL", KEY, id))) return { status: 404, error: "없는 자료입니다." };
  return { status: 200 };
}

/** 내장 자료의 수정이나 삭제를 취소해 원래 내용으로 되돌린다. */
export async function restoreItem(id) {
  if (!isBuiltin(id)) return { status: 400, error: "내장 자료만 되돌릴 수 있습니다." };
  await redis("HDEL", KEY, id);
  return { status: 200 };
}

/** 관리자 화면용 목록. 삭제된 내장 자료도 되돌릴 수 있도록 포함한다. */
export async function adminList() {
  const overrides = storeEnabled() ? await readOverrides() : {};
  const items = BUILTIN.map((item) => {
    const override = overrides[item.id];
    if (!override) return { ...item, origin: "builtin" };
    return override.deleted ? { ...item, origin: "deleted" } : { ...override, origin: "edited" };
  });
  for (const [id, override] of Object.entries(overrides)) {
    if (!isBuiltin(id) && !override.deleted) items.push({ ...override, origin: "custom" });
  }
  return items;
}
