"use strict";
var TYPE = { law: "세법", rul: "유권해석", trb: "심판례", crt: "판례" };
var ORIGIN = { builtin: "내장", edited: "내장 · 수정됨", deleted: "내장 · 삭제됨", custom: "관리자 등록" };
var CHECK_NAMES = { claude: "Claude API", law: "법제처 OPEN API", store: "저장소", access: "사이트 접근 코드", admin_code: "관리자 비밀번호" };
var STATE = { ok: ["유리", "정상"], off: ["유보", "꺼짐"], fail: ["불리", "문제 있음"] };
var FIELDS = ["k", "no", "title", "date", "result", "sum", "note", "src", "url", "off"];
var items = [];
var storeOn = false;
var editing = null;
var code = "";

function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function num(n) { return Number(n).toLocaleString("ko-KR"); }

function api(path, options) {
  var o = options || {};
  return fetch(path, {
    method: o.method || "GET",
    headers: { "Content-Type": "application/json", "x-admin-code": code },
    body: o.body ? JSON.stringify(o.body) : undefined,
  }).then(function (r) {
    return r.json().catch(function () { return { error: "서버 응답을 읽지 못했습니다." }; }).then(function (d) {
      if (r.status === 401) logout(d.error);
      if (!r.ok) throw new Error(d.error || "요청에 실패했습니다.");
      return d;
    });
  });
}

function logout(message) {
  code = "";
  try { sessionStorage.removeItem("admin-code"); } catch (e) {}
  $("#app").hidden = true;
  $("#menu").hidden = true;
  $("#login").hidden = false;
  $("#code").value = "";
  $("#login-status").textContent = message || "";
}

function loadStatus() {
  $("#status-msg").textContent = "점검하고 있습니다.";
  return api("/api/admin-status").then(function (d) {
    $("#status-msg").textContent = "";
    $("#checks").innerHTML = Object.keys(CHECK_NAMES).map(function (key) {
      var c = d.checks[key];
      var s = STATE[c.state];
      return '<div class="adm-check"><span class="pill ' + s[0] + '">' + s[1] + "</span><div><b>" + esc(CHECK_NAMES[key]) + '</b><p class="meta">' + esc(c.message) + "</p></div></div>";
    }).join("");
    return d;
  });
}

function loadStats() {
  $("#stats-msg").textContent = "불러오고 있습니다.";
  $("#stats").innerHTML = "";
  return api("/api/admin-stats").then(function (d) {
    $("#stats-msg").textContent = "";
    var t = d.totals;
    var rows = d.daily.filter(function (x) { return x.reviews; });
    $("#stats").innerHTML =
      '<div class="adm-totals">' + [["검토", t.reviews], ["실패", t.failed], ["입력 토큰", t.input_tokens], ["출력 토큰", t.output_tokens]].map(function (x) {
        return '<div><span class="meta">' + x[0] + "</span><b>" + num(x[1]) + "</b></div>";
      }).join("") + "</div>" +
      (rows.length
        ? '<div class="adm-scroll"><table class="adm-table"><thead><tr><th>날짜</th><th>검토</th><th>실패</th><th>입력 토큰</th><th>출력 토큰</th></tr></thead><tbody>' +
          rows.map(function (x) { return "<tr><td>" + esc(x.date) + "</td><td>" + num(x.reviews) + "</td><td>" + num(x.failed) + "</td><td>" + num(x.input_tokens) + "</td><td>" + num(x.output_tokens) + "</td></tr>"; }).join("") +
          "</tbody></table></div>"
        : '<p class="meta">아직 기록이 없습니다.</p>');
  }).catch(function (err) { $("#stats-msg").textContent = err.message; });
}

function renderItems() {
  var q = $("#find").value.trim().toLowerCase();
  var list = items.filter(function (a) { return !q || (a.no + " " + a.title + " " + a.sum).toLowerCase().indexOf(q) >= 0; });
  $("#items").innerHTML = list.length ? list.map(function (a) {
    var deleted = a.origin === "deleted";
    var buttons = "";
    if (storeOn) {
      if (!deleted) buttons += '<button type="button" data-act="edit" data-id="' + esc(a.id) + '">수정</button><button type="button" data-act="delete" data-id="' + esc(a.id) + '">삭제</button>';
      if (deleted || a.origin === "edited") buttons += '<button type="button" data-act="restore" data-id="' + esc(a.id) + '">원래대로</button>';
    }
    return '<article class="adm-item' + (deleted ? " adm-off" : "") + '"><div><span class="t t-' + esc(a.k) + '">' + esc(TYPE[a.k]) + '</span> <span class="meta">' + esc(ORIGIN[a.origin]) + "</span><h3>" + esc(a.no) + '</h3><p class="meta">' + esc(a.title) + " · " + esc(a.date) + '</p></div><div class="actions">' + buttons + "</div></article>";
  }).join("") : '<p class="meta">조건에 맞는 자료가 없습니다.</p>';
}

function loadItems() {
  return api("/api/admin-library").then(function (d) {
    items = d.items;
    storeOn = d.storeEnabled;
    $("#item-form").hidden = !storeOn;
    $("#list-msg").textContent = storeOn ? items.length + "건" : "저장소가 설정되지 않아 조회만 할 수 있습니다. 상태 점검 메뉴를 확인하세요.";
    renderItems();
  }).catch(function (err) { $("#list-msg").textContent = err.message; });
}

function fillForm(a) {
  editing = a ? a.id : null;
  FIELDS.forEach(function (f) { $("#i-" + f).value = a ? a[f] || "" : f === "k" ? "law" : ""; });
  $("#i-tags").value = a ? (a.tags || []).join(", ") : "";
  $("#form-title").textContent = a ? "근거 자료 수정: " + a.no : "근거 자료 추가";
  $("#cancel").hidden = !a;
  $("#form-msg").textContent = "";
}

$("#item-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var item = {};
  FIELDS.forEach(function (f) { item[f] = $("#i-" + f).value; });
  item.tags = $("#i-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  $("#save").disabled = true;
  api("/api/admin-library", { method: "POST", body: { action: "save", id: editing, item: item } }).then(function () {
    fillForm(null);
    $("#form-msg").textContent = "저장했습니다.";
    return loadItems();
  }).catch(function (err) { $("#form-msg").textContent = err.message; }).then(function () { $("#save").disabled = false; });
});
$("#cancel").addEventListener("click", function () { fillForm(null); });
$("#find").addEventListener("input", renderItems);
$("#recheck").addEventListener("click", function () { loadStatus().catch(function (err) { $("#status-msg").textContent = err.message; }); });

$("#items").addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]");
  if (!b) return;
  var id = b.getAttribute("data-id");
  var act = b.getAttribute("data-act");
  var a = items.filter(function (x) { return x.id === id; })[0];
  if (!a) return;
  if (act === "edit") {
    fillForm(a);
    $("#item-form").scrollIntoView({ block: "start" });
    return;
  }
  var question = act === "delete"
    ? a.no + " 자료를 삭제할까요? 다음 검토부터 근거로 쓰이지 않습니다." + (a.origin === "custom" ? " 관리자가 등록한 자료는 되살릴 수 없습니다." : "")
    : a.no + " 자료를 내장 원본으로 되돌릴까요?";
  if (!window.confirm(question)) return;
  api("/api/admin-library", { method: "POST", body: { action: act, id: id } }).then(function () {
    if (editing === id) fillForm(null);
    return loadItems();
  }).catch(function (err) { $("#list-msg").textContent = err.message; });
});

function route() {
  var v = (location.hash || "#status").slice(1);
  if (["status", "stats", "library"].indexOf(v) < 0) v = "status";
  ["status", "stats", "library"].forEach(function (n) { $("#v-" + n).hidden = n !== v; });
  document.querySelectorAll("#menu a[data-v]").forEach(function (a) {
    if (a.getAttribute("data-v") === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (!code) return;
  if (v === "stats") loadStats();
  if (v === "library") loadItems();
}
window.addEventListener("hashchange", route);

function enter(value) {
  code = value;
  $("#login-status").textContent = "확인하고 있습니다.";
  loadStatus().then(function () {
    try { sessionStorage.setItem("admin-code", code); } catch (e) {}
    $("#login").hidden = true;
    $("#login-status").textContent = "";
    $("#app").hidden = false;
    $("#menu").hidden = false;
    route();
  }).catch(function (err) {
    code = "";
    $("#login-status").textContent = err.message;
  });
}
$("#login").addEventListener("submit", function (e) {
  e.preventDefault();
  enter($("#code").value);
});

var saved = "";
try { saved = sessionStorage.getItem("admin-code") || ""; } catch (e) {}
if (saved) enter(saved);
