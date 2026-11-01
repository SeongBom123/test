"use strict";
var TYPE = { law: "세법", rul: "유권해석", trb: "심판례", crt: "판례" };
var LIB = [];
var BY = {};
var KNOWN = {};
var CASE_RE = /(조심|국심|심사|서면인터넷방문상담\d팀|서면|사전|기준|재산세제과|법인세제과|소득세제과|부가가치세제과|조세정책과)[\s\-]*\d[\d\-가-힣]*|\b\d{2,4}(재두|구합|구단|가합|가단|고합|고단|헌바|헌마|두|누|구|다|나|도|노)\d{1,6}\b/g;
var LAW_RE = /(국세기본법|국세징수법|소득세법|법인세법|부가가치세법|상속세\s*및\s*증여세법|상증법|상증세법|조세특례제한법|조특법|지방세법|지방세기본법|지방세특례제한법|종합부동산세법|국제조세조정에\s*관한\s*법률)(\s*시행령|\s*시행규칙)?\s*제\s*\d+\s*조(의\s*\d+)?/g;

function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function norm(s) { return String(s).replace(/[\s\-·.]/g, ""); }
function safeUrl(u) { return /^https:\/\//.test(String(u)) ? String(u) : "#"; }

function register(items) {
  items.forEach(function (a) {
    BY[a.id] = a;
    KNOWN[norm(a.no)] = 1;
    var m = String(a.no).match(/\d{2,4}[가-힣]{1,2}\d+/);
    if (m) KNOWN[m[0]] = 1;
  });
}

/* 확인된 자료에 없는 사건번호와 조문을 찾아 미확인으로 표시한다. */
function flag(html) {
  var out = html.replace(CASE_RE, function (m) {
    return KNOWN[norm(m)] ? m : '<span class="unv">' + m + "</span>";
  });
  return out.replace(LAW_RE, function (m) {
    return KNOWN[norm(m)] ? m : '<span class="unv">' + m + "</span>";
  });
}
function rich(s) {
  return String(s == null ? "" : s).split(/(\[\[[^\]]+\]\])/).map(function (p) {
    var m = p.match(/^\[\[([^\]]+)\]\]$/);
    if (!m) return flag(esc(p));
    var a = BY[m[1].trim()];
    if (!a) return '<span class="unv">' + esc(m[1]) + "</span>";
    return '<button type="button" class="cite t-' + a.k + '" data-open="' + esc(a.id) + '" title="' + esc(a.title) + '">' + esc(a.no) + "</button>";
  }).join("");
}
function srcLinks(a) {
  return '<a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">' + esc(a.src) + (a.live ? "" : "에서 보기") + "</a>" +
    (a.off ? ' · <a href="' + esc(safeUrl(a.off)) + '" target="_blank" rel="noopener">국세법령정보시스템</a>' : "");
}
function liveMark(a) { return a.live ? ' <span class="t t-live">실시간</span>' : ""; }
function refBlock(a) {
  return '<details class="ref" data-ref="' + esc(a.id) + '"><summary><span class="t t-' + a.k + '">' + TYPE[a.k] + "</span>" + liveMark(a) + " " + esc(a.no) + " · " + esc(a.title) + "</summary>" +
    '<p class="meta">' + esc(a.date) + (a.result ? " · " + esc(a.result) : "") + "</p><p>" + esc(a.sum) + "</p>" +
    (a.note ? '<p class="meta warn">' + esc(a.note) + "</p>" : "") + '<p class="meta">' + srcLinks(a) + "</p></details>";
}
function pill(s) {
  var c = /유리/.test(s) ? "유리" : /불리/.test(s) ? "불리" : /다툼/.test(s) ? "다툼" : "유보";
  return '<span class="pill ' + c + '">' + esc(s || "판단 유보") + "</span>";
}
function renderResult(r, liveInfo) {
  var h = '<div class="fade"><div class="res-head"><h2>검토 결과</h2><span>' + (r.example ? '<span class="stamp">예시 사안</span> ' : "") + '<button type="button" id="copy">텍스트 복사</button></span></div>';
  if (liveInfo) h += liveInfo;
  h += '<p class="summary">' + rich(r.summary) + "</p>";
  if (r.application_note) h += '<p class="hint big">적용 시점: ' + rich(r.application_note) + "</p>";
  h += '<div class="sec"><h3>쟁점별 검토</h3>';
  (r.issues || []).forEach(function (it, i) {
    h += '<div class="issue"><div class="issue-head"><h3>쟁점 ' + (i + 1) + ". " + rich(it.title) + "</h3>" + pill(it.assessment) + "</div>";
    h += '<div class="lbl">법리와 근거</div><p>' + rich(it.rule) + "</p>";
    h += '<div class="lbl">사안 적용</div><p>' + rich(it.application) + "</p>";
    h += '<div class="lbl">반대 논리</div><p>' + rich(it.counter) + "</p>";
    var ids = (it.authority_ids || []).filter(function (x) { return BY[x]; });
    if (ids.length) h += '<div class="lbl">사용한 근거</div>' + ids.map(function (x) { return refBlock(BY[x]); }).join("");
    h += "</div>";
  });
  h += "</div>";
  if ((r.missing_facts || []).length) h += '<div class="sec"><h3>결론을 바꿀 수 있는 추가 확인 사실</h3><ul>' + r.missing_facts.map(function (m) { return '<li><b>' + rich(m.question) + "</b> " + rich(m.why) + "</li>"; }).join("") + "</ul></div>";
  if ((r.gaps || []).length) h += '<div class="sec"><h3>더 찾아볼 근거</h3><p class="hint">확인된 자료에 없어 이 검토에 쓰지 못한 근거입니다. <a href="#sources">원문 찾기</a>에서 검색하세요.</p>' + r.gaps.map(function (g) { return '<div class="gap-box"><b>' + esc(g.where || "") + "</b> · " + rich(g.topic) + "<br>검색어: <code>" + esc(g.search_terms) + "</code></div>"; }).join("") + "</div>";
  if ((r.next_steps || []).length) h += '<div class="sec"><h3>다음 조치</h3><ul>' + r.next_steps.map(function (s) { return "<li>" + rich(s) + "</li>"; }).join("") + "</ul></div>";
  $("#out").innerHTML = h + "</div>";
  $("#copy").addEventListener("click", function () {
    var b = this;
    var fallback = function () {
      var range = document.createRange();
      range.selectNodeContents($("#out"));
      var sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      b.textContent = "선택됨: Ctrl+C로 복사";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText($("#out").innerText).then(function () { b.textContent = "복사했습니다"; }, fallback);
    else fallback();
  });
}
document.addEventListener("click", function (e) {
  var c = e.target.closest && e.target.closest("[data-open]");
  if (!c) return;
  var id = c.getAttribute("data-open");
  var scope = c.closest(".issue") || document;
  var d = scope.querySelector('[data-ref="' + CSS.escape(id) + '"]') || document.querySelector('[data-ref="' + CSS.escape(id) + '"]');
  if (d) { d.open = true; d.scrollIntoView({ block: "nearest" }); return; }
  if (BY[id] && !BY[id].live) {
    state.q = BY[id].no; $("#ls").value = state.q; state.k = ""; $("#lt").value = ""; state.tag = "";
    renderLib(); location.hash = "library";
  } else if (BY[id]) {
    window.open(safeUrl(BY[id].url), "_blank", "noopener");
  }
});

function codeValue() { return $("#code").value; }
function headers() { return { "Content-Type": "application/json", "x-access-code": codeValue() }; }
function saveCode() { try { sessionStorage.setItem("code", codeValue()); } catch (e) {} }
function saveDraft() { try { localStorage.setItem("draft", $("#facts").value); } catch (e) {} }

var ctl = null;
var config = { reviewEnabled: false, liveEnabled: false };
function setBusy(b) { $("#run").disabled = b || !config.reviewEnabled; $("#stop").hidden = !b; }
function liveNotice(data) {
  if (data.liveStatus === "off") return '<p class="info">법제처 실시간 검색이 꺼져 있어 내장 자료실만으로 검토했습니다.</p>';
  if (data.liveStatus === "failed") return '<p class="info warn-box">법제처 실시간 검색에 실패해 내장 자료실만으로 검토했습니다. ' + esc((data.liveErrors || [])[0] || "") + "</p>";
  var n = (data.live || []).length;
  if (data.liveStatus === "partial") return '<p class="info warn-box">법제처 검색 일부가 실패했습니다. 받은 자료 ' + n + "건을 함께 검토했습니다. " + esc((data.liveErrors || [])[0] || "") + "</p>";
  return '<p class="info">법제처 실시간 검색 자료 ' + n + "건을 함께 검토했습니다.</p>";
}
$("#f").addEventListener("submit", function (e) {
  e.preventDefault();
  var facts = $("#facts").value.trim();
  if (facts.length < 20) { $("#status").textContent = "사실관계를 20자 이상 적어 주세요."; return; }
  if (!codeValue()) { $("#status").textContent = "접근 코드를 입력해 주세요."; $("#code").focus(); return; }
  saveCode();
  ctl = new AbortController();
  setBusy(true);
  $("#status").textContent = "근거를 찾고 쟁점을 검토하고 있습니다. 보통 1~3분 걸립니다.";
  fetch("/api/review", {
    method: "POST", headers: headers(), signal: ctl.signal,
    body: JSON.stringify({ facts: facts, tax: $("#tax").value, stage: $("#stage").value, question: $("#q").value.trim() }),
  }).then(function (r) {
    return r.json().catch(function () { return { error: "서버 응답을 읽지 못했습니다. 다시 시도해 주세요." }; }).then(function (data) {
      if (!r.ok) throw new Error(data.error || "검토에 실패했습니다.");
      return data;
    });
  }).then(function (data) {
    register(data.live || []);
    renderResult(data.result, liveNotice(data));
    $("#status").textContent = "검토를 마쳤습니다. 표시된 근거의 원문을 확인하세요.";
  }).catch(function (err) {
    $("#status").textContent = err.name === "AbortError" ? "검토를 중단했습니다." : err.message === "Failed to fetch" ? "서버에 연결하지 못했습니다. 다시 시도해 주세요." : err.message;
  }).then(function () { setBusy(false); });
});
$("#stop").addEventListener("click", function () { if (ctl) ctl.abort(); });
$("#clear").addEventListener("click", function () { $("#facts").value = ""; $("#q").value = ""; saveDraft(); $("#facts").focus(); });
$("#facts").addEventListener("input", saveDraft);

function card(a) {
  return '<article class="card"><div><span class="t t-' + a.k + '">' + TYPE[a.k] + "</span>" + liveMark(a) + (a.result ? ' <span class="meta">' + esc(a.result) + "</span>" : "") + "</div><h3>" + esc(a.no) + '</h3><p class="strong">' + esc(a.title) + '</p><p class="meta">' + esc(a.date) + "</p>" + (a.sum ? "<p>" + esc(a.sum) + "</p>" : "") + (a.note ? '<p class="note">' + esc(a.note) + "</p>" : "") + '<p class="meta">' + srcLinks(a) + "</p></article>";
}
var state = { q: "", k: "", tag: "" };
var TAGS = [];
function renderLib() {
  $("#tags").innerHTML = [""].concat(TAGS).map(function (t) { return '<button type="button" class="chip" data-tag="' + esc(t) + '" aria-pressed="' + (state.tag === t) + '">' + esc(t || "전체 쟁점") + "</button>"; }).join("");
  var q = state.q.trim().toLowerCase();
  var list = LIB.filter(function (a) {
    if (state.k && a.k !== state.k) return false;
    if (state.tag && a.tags.indexOf(state.tag) < 0) return false;
    return !q || (a.no + " " + a.title + " " + a.sum + " " + a.tags.join(" ")).toLowerCase().indexOf(q) >= 0;
  });
  $("#lcount").textContent = list.length + "건";
  $("#cards").innerHTML = list.length ? list.map(card).join("") : '<p class="panel">조건에 맞는 자료가 없습니다. <a href="#sources">원문 찾기</a>에서 검색해 보세요.</p>';
}
$("#ls").addEventListener("input", function () { state.q = this.value; renderLib(); });
$("#lt").addEventListener("change", function () { state.k = this.value; renderLib(); });
$("#tags").addEventListener("click", function (e) { var b = e.target.closest("[data-tag]"); if (b) { state.tag = b.getAttribute("data-tag"); renderLib(); } });

$("#sf").addEventListener("submit", function (e) {
  e.preventDefault();
  var q = $("#sq").value.trim();
  if (q.length < 2) { $("#sstatus").textContent = "검색어를 2자 이상 적어 주세요."; return; }
  if (!codeValue()) { $("#sstatus").textContent = "사실관계 검토 화면에서 접근 코드를 먼저 입력해 주세요."; return; }
  saveCode();
  $("#sb").disabled = true;
  $("#sstatus").textContent = "검색하고 있습니다.";
  fetch("/api/search", { method: "POST", headers: headers(), body: JSON.stringify({ query: q, kind: $("#sk").value }) }).then(function (r) {
    return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "검색에 실패했습니다."); return d; });
  }).then(function (d) {
    register(d.items);
    $("#scards").innerHTML = d.items.map(card).join("");
    $("#sstatus").textContent = d.items.length ? d.items.length + "건을 찾았습니다." : "검색 결과가 없습니다. 검색어를 바꿔 보세요.";
  }).catch(function (err) { $("#sstatus").textContent = err.message; }).then(function () { $("#sb").disabled = !config.liveEnabled; });
});

function route() {
  var v = (location.hash || "#review").slice(1);
  if (["review", "library", "sources"].indexOf(v) < 0) v = "review";
  ["review", "library", "sources"].forEach(function (n) { $("#v-" + n).hidden = n !== v; });
  document.querySelectorAll("nav a").forEach(function (a) {
    if (a.getAttribute("data-v") === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", route);
route();

var draft = null;
try { draft = localStorage.getItem("draft"); $("#code").value = sessionStorage.getItem("code") || ""; } catch (e) {}
$("#facts").value = draft || window.TAX_EXAMPLE.facts;
if (!draft) {
  $("#q").value = "과세예고에 어떻게 대응해야 하나요?";
  $("#tax").value = "양도소득세";
  $("#stage").value = "세무조사·과세예고 통지";
}
$("#run").disabled = true;
$("#sb").disabled = true;

Promise.all([
  fetch("/api/library").then(function (r) { return r.json(); }),
  fetch("/api/config").then(function (r) { return r.json(); }),
]).then(function (res) {
  LIB = res[0].items;
  config = res[1];
  register(LIB);
  LIB.forEach(function (a) { a.tags.forEach(function (t) { if (TAGS.indexOf(t) < 0) TAGS.push(t); }); });
  renderResult(window.TAX_EXAMPLE.result);
  renderLib();
  $("#run").disabled = !config.reviewEnabled;
  $("#sb").disabled = !config.liveEnabled;
  $("#live-off").hidden = config.liveEnabled;
  if (!config.reviewEnabled) $("#status").textContent = "서버에 ANTHROPIC_API_KEY와 ACCESS_CODE가 설정되지 않아 검토 기능이 꺼져 있습니다.";
}).catch(function () {
  $("#status").textContent = "서버에 연결하지 못했습니다. 페이지를 새로 고쳐 주세요.";
});
