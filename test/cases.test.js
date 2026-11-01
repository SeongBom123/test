// 인기 사례 데이터가 내장 자료실과 입력 양식에 맞는지 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import library from "../lib/library.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ctx = { window: {} };
vm.runInNewContext(read("../public/cases.js"), ctx);
const cases = ctx.window.TAX_CASES;
const html = read("../public/index.html");
const options = (id) => [...html.match(new RegExp(`<select id="${id}">(.*?)</select>`))[1].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);

test("인기 사례는 자료실 ID와 양식 선택지만 쓴다", () => {
  const ids = new Set(library.map((a) => a.id));
  const taxes = options("tax");
  const stages = options("stage");
  assert.ok(cases.length >= 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    for (const id of c.ids) assert.ok(ids.has(id), `${c.id}: ${id}`);
    assert.ok(taxes.includes(c.tax), `${c.id}: ${c.tax}`);
    assert.ok(stages.includes(c.stage), `${c.id}: ${c.stage}`);
    assert.ok(c.facts === null || c.facts.length >= 20, c.id);
    assert.ok(c.title && c.summary && c.issues.length, c.id);
  }
});
