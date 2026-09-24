import { STR } from "./i18n.js";
import { isComplete, isCorrect, questionsIn, scoreExam } from "./score.js";

const app = document.querySelector("#app");
const exams = {};
let catalog = null;
let pendingFocus = null;
let ticker = null;

const state = {
  lang: localStorage.getItem("az-lang") || "fr",
  screen: "home",
  sectionIndex: 0,
  questionIndex: 0,
  answers: {},
  marked: {},
  locked: {},
  deadline: 0,
  remaining: 45 * 60,
  submitted: false,
  timedOut: false,
  caseView: "question",
  tabs: {},
  modal: null,
  toast: "",
  theme: localStorage.getItem("az-theme") || "default",
  progressOn: true,
  timerOn: true,
  paused: false,
  calcOpen: false,
  themeOpen: false,
  calcValue: "0",
  menu: null,
  toolbarBig: false,
  reviewFilter: "all",
};

const t = () => STR[state.lang];

function cssAttr(value) {
  return String(value).replace(/(["\\])/g, "\\$1");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function fmt(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function exam() {
  return exams[state.lang];
}

function section() {
  return exam().sections[state.sectionIndex];
}

function question() {
  return section().questions[state.questionIndex];
}

function globalNumber(sectionIndex, questionIndex) {
  let count = questionIndex + 1;
  for (let i = 0; i < sectionIndex; i += 1) count += exam().sections[i].questions.length;
  return count;
}

function learnHref(url) {
  return state.lang === "fr" ? url.replace("/en-us/", "/fr-fr/") : url;
}

function save() {
  if (state.screen === "home" || state.screen === "intro" || state.screen === "ready") {
    sessionStorage.removeItem("az900-run");
    return;
  }
  sessionStorage.setItem("az900-run", JSON.stringify({
    lang: state.lang,
    screen: state.screen,
    sectionIndex: state.sectionIndex,
    questionIndex: state.questionIndex,
    answers: state.answers,
    marked: state.marked,
    locked: state.locked,
    deadline: state.deadline,
    submitted: state.submitted,
    timedOut: state.timedOut,
    caseView: state.caseView,
    tabs: state.tabs,
    theme: state.theme,
    progressOn: state.progressOn,
    timerOn: state.timerOn,
    paused: state.paused,
    remaining: state.remaining,
  }));
}

function restore() {
  const raw = sessionStorage.getItem("az900-run");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    state.lang = saved.lang || state.lang;
    if (saved.paused) {
      state.deadline = 0;
      state.remaining = saved.remaining ?? state.remaining;
    } else if (state.deadline && !state.submitted) {
      state.remaining = Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
    }
  } catch {
    sessionStorage.removeItem("az900-run");
  }
}

function resetAttempt() {
  state.sectionIndex = 0;
  state.questionIndex = 0;
  state.answers = {};
  state.marked = {};
  state.locked = {};
  state.deadline = 0;
  state.remaining = 45 * 60;
  state.submitted = false;
  state.timedOut = false;
  state.caseView = "question";
  state.tabs = {};
  state.modal = null;
  state.paused = false;
  state.calcOpen = false;
  state.themeOpen = false;
  state.calcValue = "0";
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function showToast(message) {
  state.toast = message;
  render();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      const node = document.querySelector(".toast");
      if (node) node.remove();
    }
  }, 3200);
}

function tick() {
  if (!state.deadline || state.submitted) return;
  state.remaining = Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
  const [hh, mm, ss] = fmt(state.remaining).split(":");
  const hours = document.querySelector("[data-timer-h]");
  const minutes = document.querySelector("[data-timer-m]");
  const seconds = document.querySelector("[data-timer-s]");
  if (hours && minutes && seconds) {
    hours.textContent = hh;
    minutes.textContent = mm;
    seconds.textContent = ss;
  }
  if (state.remaining <= 0) finish(true);
}

function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tick, 250);
}

function finish(timedOut) {
  if (state.submitted) return;
  state.submitted = true;
  state.timedOut = timedOut;
  state.screen = "results";
  state.modal = null;
  if (ticker) clearInterval(ticker);
  save();
  render();
}

function textOf(list, id) {
  return list.find((item) => item.id === id)?.text || id;
}

function formatAnswer(q, value) {
  const strings = t();
  if (value == null) return strings.none;
  if (q.type === "single" || q.type === "exhibit" || q.type === "multi") {
    if (!Array.isArray(value) || value.length === 0) return strings.none;
    return value.map((id) => textOf(q.choices, id)).join("\n");
  }
  if (q.type === "hot") {
    if (!Array.isArray(value) || value.length === 0) return strings.none;
    return value.map((id) => textOf(q.regions, id)).join("\n");
  }
  if (q.type === "build") {
    if (!Array.isArray(value) || value.length === 0) return strings.none;
    return value.map((id, index) => `${index + 1}. ${textOf(q.choices, id)}`).join("\n");
  }
  if (q.type === "drag") {
    const lines = q.targets.map((target) => {
      const source = value[target.id];
      return source ? `${target.label} → ${textOf(q.sources, source)}` : null;
    }).filter(Boolean);
    return lines.length ? lines.join("\n") : strings.none;
  }
  if (q.type === "active") {
    const lines = q.controls.map((control) => {
      const picked = value[control.id];
      return picked ? `${control.label}: ${textOf(control.options, picked)}` : null;
    }).filter(Boolean);
    return lines.length ? lines.join("\n") : strings.none;
  }
  if (q.type === "yesno") {
    const lines = q.statements.map((statement) => {
      const picked = value[statement.id];
      if (picked !== "yes" && picked !== "no") return null;
      return `${statement.text} — ${picked === "yes" ? strings.yes : strings.no}`;
    }).filter(Boolean);
    return lines.length ? lines.join("\n") : strings.none;
  }
  return strings.none;
}

function expectedValue(q) {
  return q.correct;
}

function instruction(q) {
  const strings = t();
  if (q.type === "multi") return strings.selectN.replace("{n}", q.select);
  if (q.type === "hot") return strings.hotN.replace("{n}", q.select);
  if (q.type === "build") return strings.buildN.replace("{n}", q.select);
  return "";
}

function choiceButtons(q) {
  const answer = state.answers[q.id] || [];
  const multi = q.type === "multi";
  return q.choices.map((choice) => {
    const on = answer.includes(choice.id);
    const inputId = `${q.id}-${choice.id}`;
    return `<div class="its-item-table ITSMCOptionTable">
      <div class="its-item-tr">
        <span class="its-item-td ITSMCOptionMarkerCell"><input id="${esc(inputId)}" class="ITSMCOptionMarker" type="${multi ? "checkbox" : "radio"}" name="${esc(q.id)}" value="${esc(choice.id)}" data-choice="${esc(choice.id)}" ${on ? "checked" : ""}></span>
        <label for="${esc(inputId)}" class="ITSMCOptionACCLabel"><span class="its-item-td ITSMCOptionLabelTextCell"><span class="ITSMCOptionLabelText">${esc(choice.id)}</span></span>
        <span class="its-item-td ITSMCOptionLabelSeparatorCell"><span class="ITSMCOptionLabelSeparator">.&nbsp;</span></span>
        <span class="its-item-td ITSMCOptionTextCell"><span class="ITSMCOptionText">${esc(choice.text)}</span></span></label>
      </div>
    </div>`;
  }).join("");
}

function hotButtons(q) {
  const answer = state.answers[q.id] || [];
  return `<div class="hot-grid">
    ${q.regions.map((region) => {
      const on = answer.includes(region.id);
      return `<button type="button" class="hot" aria-pressed="${on}" data-action="hot" data-region="${esc(region.id)}"><strong>${esc(region.label)}</strong><span>${esc(region.detail)}</span></button>`;
    }).join("")}
  </div>`;
}

function dragBoard(q) {
  const strings = t();
  const answer = state.answers[q.id] || {};
  const used = new Set(Object.values(answer));
  return `<div class="drag">
    <div>
      <h2>${esc(strings.sources)}</h2>
      ${q.sources.map((source) => `<div class="src ${used.has(source.id) ? "used" : ""}" draggable="true" data-source="${esc(source.id)}">${esc(source.text)}</div>`).join("")}
    </div>
    <div>
      <h2>${esc(strings.targets)}</h2>
      ${q.targets.map((target) => `<div class="target" data-drop="${esc(target.id)}">
        <p>${esc(target.label)}</p>
        <select data-target="${esc(target.id)}" aria-label="${esc(target.label)}">
          <option value="">${esc(strings.choose)}</option>
          ${q.sources.map((source) => `<option value="${esc(source.id)}" ${answer[target.id] === source.id ? "selected" : ""}>${esc(source.text)}</option>`).join("")}
        </select>
      </div>`).join("")}
    </div>
  </div>`;
}

function buildBoard(q) {
  const strings = t();
  const answer = state.answers[q.id] || [];
  const placed = new Set(answer);
  return `<div class="build">
    <div>
      <h2>${esc(strings.pool)}</h2>
      ${q.choices.filter((choice) => !placed.has(choice.id)).map((choice) => `<div class="slot"><span>${esc(choice.text)}</span><button type="button" class="ghost" data-action="build-add" data-choice="${esc(choice.id)}">${esc(strings.add)}</button></div>`).join("")}
    </div>
    <div>
      <h2>${esc(strings.answerArea)}</h2>
      ${answer.map((id, index) => `<div class="slot"><span>${index + 1}. ${esc(textOf(q.choices, id))}</span><span>
        <button type="button" class="ghost" data-action="build-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>${esc(strings.up)}</button>
        <button type="button" class="ghost" data-action="build-down" data-index="${index}" ${index === answer.length - 1 ? "disabled" : ""}>${esc(strings.down)}</button>
        <button type="button" class="ghost" data-action="build-remove" data-index="${index}">${esc(strings.remove)}</button>
      </span></div>`).join("")}
    </div>
  </div>`;
}

function activeBoard(q) {
  const answer = state.answers[q.id] || {};
  return `<div class="window">
    <header>${esc(q.panelTitle)}</header>
    <div class="body">
      ${q.controls.map((control) => `<label><span>${esc(control.label)}</span>
        <select data-control="${esc(control.id)}" aria-label="${esc(control.label)}">
          <option value="">${esc(t().choose)}</option>
          ${control.options.map((option) => `<option value="${esc(option.id)}" ${answer[control.id] === option.id ? "selected" : ""}>${esc(option.text)}</option>`).join("")}
        </select>
      </label>`).join("")}
    </div>
  </div>`;
}

function exhibitTable(exhibit) {
  return `<table>
    <thead><tr>${exhibit.columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead>
    <tbody>${exhibit.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function exhibitBoard(q) {
  const strings = t();
  const tab = state.tabs[q.id] || q.exhibits[0].id;
  const tabs = [`<button type="button" role="tab" aria-selected="${tab === "question"}" data-action="tab" data-tab="question">${esc(strings.questionTab)}</button>`]
    .concat(q.exhibits.map((exhibit) => `<button type="button" role="tab" aria-selected="${tab === exhibit.id}" data-action="tab" data-tab="${esc(exhibit.id)}">${esc(exhibit.title)}</button>`));
  let body = "";
  if (tab === "question") {
    body = q.type === "yesno" ? yesNoTable(q) : choiceButtons(q);
  } else {
    const exhibit = q.exhibits.find((item) => item.id === tab);
    body = exhibit ? exhibitTable(exhibit) : "";
  }
  return `<div class="tabs" role="tablist">${tabs.join("")}</div>${body}`;
}

function yesNoTable(q) {
  const strings = t();
  const answer = state.answers[q.id] || {};
  return `<table class="yn">
    <tbody>
      ${q.statements.map((statement) => `<tr>
        <td>${esc(statement.text)}</td>
        ${["yes", "no"].map((value) => `<td><label><input type="radio" name="${esc(q.id)}-${esc(statement.id)}" data-statement="${esc(statement.id)}" value="${value}" ${answer[statement.id] === value ? "checked" : ""}> ${esc(value === "yes" ? strings.yes : strings.no)}</label></td>`).join("")}
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function answerArea(q) {
  if (q.type === "single" || q.type === "multi") return choiceButtons(q);
  if (q.type === "hot") return hotButtons(q);
  if (q.type === "drag") return dragBoard(q);
  if (q.type === "build") return buildBoard(q);
  if (q.type === "active") return activeBoard(q);
  if (q.type === "exhibit" || q.type === "yesno") return exhibitBoard(q);
  return "";
}

function casePane(sec) {
  const strings = t();
  const study = sec.case;
  return `<aside class="case-pane">
    <p>${esc(strings.caseProgress)} ${state.questionIndex + 1} / ${sec.questions.length}</p>
    <h2>${esc(strings.caseQuestions)}</h2>
    ${sec.questions.map((item, index) => `<button type="button" class="ghost" data-action="case-q" data-index="${index}" ${index === state.questionIndex && state.caseView === "question" ? "aria-current=\"true\"" : ""}>${index + 1}. ${isComplete(item, state.answers[item.id]) ? "●" : "○"}</button>`).join(" ")}
    <h2>${esc(strings.caseTopics)}</h2>
    ${study.topics.map((topic) => `<button type="button" class="ghost" data-action="case-topic" data-topic="${esc(topic.id)}" ${state.caseView === topic.id ? "aria-current=\"true\"" : ""}>${esc(topic.title)}</button>`).join("")}
  </aside>`;
}

function itemTools() {
  const strings = t();
  const marked = Boolean(state.marked[question().id]);
  return `<section class="item-tools"><div id="item-tools"><button type="button" id="Reset" class="answer-reset pa-button" data-action="clear">${esc(strings.clear)}</button><ul class="rllb-list"><li><label class="mark-label" style="display:flex"><input id="Mark" type="checkbox" data-mark="1" ${marked ? "checked" : ""}> <span id="rl1">${esc(strings.markLater)}</span></label></li></ul></div></section>`;
}

function stemBlock(text, extra) {
  return `<div class="its-item-table ITSStem" id="question-heading"><div class="tr"><div class="its-item-td ITSStemText">${esc(text)}${extra || ""}</div></div></div>`;
}

function questionBody(q) {
  const strings = t();
  if (state.caseView !== "question" && section().case) {
    const topic = section().case.topics.find((item) => item.id === state.caseView);
    return `<div class="ITSDisplay"><h2 id="question-heading">${esc(topic.title)}</h2>${topic.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}<button type="button" class="btn-nrm" data-action="case-back">${esc(strings.backToQuestion)}</button></div>`;
  }
  const hint = instruction(q);
  const study = section().case ? casePane(section()) : "";
  return `<div class="item-row">${study}<div id="ITD-ITEM"><div class="shell its-item-table">${stemBlock(q.stem, hint ? `<br><br>${esc(hint)}` : "")}${answerArea(q)}${itemTools()}</div></div></div>`;
}

function icon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">${path}</svg>`;
}

const ICONS = {
  pause: icon('<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>'),
  calc: icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'),
  colors: icon('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>'),
  help: icon('<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7V14"/><path d="M12 17h.01"/>'),
  list: icon('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  clear: icon('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>'),
  mark: icon('<path d="M6 4h12v16l-6-3-6 3z"/>'),
  lang: icon('<circle cx="12" cy="12" r="8"/><path d="M3 12h18M12 4a14 14 0 0 1 0 16M12 4a14 14 0 0 0 0 16"/>'),
};

function tool(action, label, glyph, extra = "") {
  return `<button type="button" class="sb-tool" data-action="${action}" ${extra}>${glyph}<span>${esc(label)}</span></button>`;
}

function progressBlock(sectionTitle, current, total) {
  const strings = t();
  if (!state.progressOn) {
    return `<div class="sb-progress"><div class="sb-progress-top"><span>${esc(strings.progress)}</span>${toggle("progress", false)}</div></div>`;
  }
  const width = total ? Math.round((current / total) * 100) : 0;
  return `<div class="sb-progress">
    <div class="sb-progress-top"><span>${esc(strings.progress)}</span>${toggle("progress", true)}</div>
    <div class="sb-bars">
      <div><div class="sb-bar-label">${esc(sectionTitle)} (${current}/${total})</div><div class="sb-track"><span class="sb-fill" style="width:${width}%"></span></div></div>
    </div>
  </div>`;
}

function toggle(kind, checked) {
  const action = kind === "progress" ? "progress-toggle" : "timer-toggle";
  return `<button type="button" class="sb-switch" data-action="${action}" aria-pressed="${checked}"><span></span></button>`;
}

function clockBlock() {
  const strings = t();
  return `<div class="sb-clock">
    <div class="sb-clock-top"><span>${esc(strings.time)}</span>${toggle("timer", state.timerOn)}</div>
    ${state.timerOn ? `<div class="sb-digits" data-timer>${fmt(state.remaining)}</div>` : `<div data-timer hidden>${fmt(state.remaining)}</div>`}
  </div>`;
}

function themeMenu() {
  const strings = t();
  const item = (id, label) => `<button type="button" role="menuitemradio" data-action="theme" data-theme="${id}" aria-checked="${state.theme === id}">${esc(label)}</button>`;
  return `<div class="sb-theme">
    <button type="button" class="sb-tool" data-action="theme-menu" aria-expanded="${state.themeOpen}">${ICONS.colors}<span>${esc(strings.colors)}</span></button>
    ${state.themeOpen ? `<div class="sb-theme-menu" role="menu">${item("default", strings.light)}${item("dark-mode", strings.dark)}${item("yellow-on-black", strings.contrast)}</div>` : ""}
  </div>`;
}

function calcPanel() {
  if (!state.calcOpen) return "";
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+", "C"];
  return `<aside class="sb-calc">
    <header><span>${esc(t().calculator)}</span><button type="button" data-action="calc">${esc(t().close)}</button></header>
    <output>${esc(state.calcValue)}</output>
    <div class="keys">${keys.map((key) => `<button type="button" data-action="calc-key" data-key="${key}">${key}</button>`).join("")}</div>
  </aside>`;
}

const ICON = {
  details: "media/details.svg",
  submenu: "media/submenu.svg",
  progress: "media/progress.svg",
  pause: "media/pause.svg",
  calc: "media/calc.svg",
  lang: "media/lang.svg",
  colors: "media/colors.svg",
  help: "media/help.svg",
  home: "media/home.svg",
};

const SWATCH = `<svg class="svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14" aria-hidden="true"><rect width="22" height="14" class="has-fill-body-background"></rect><rect x="5" y="5" width="12" height="4" class="has-fill-secondary"></rect><rect x="5" y="2" width="2" height="1" class="has-fill-secondary"></rect><rect x="8" y="2" width="2" height="1" class="has-fill-secondary"></rect><rect x="11" y="2" width="3" height="1" class="has-fill-secondary"></rect><rect x="1" y="1" width="2" height="2" class="has-fill-secondary"></rect><rect x="5" y="10" width="7" height="2" rx="0.3" class="has-fill-primary"></rect><rect x="19" y="1" width="2" height="2" rx="1" class="has-fill-secondary"></rect></svg>`;

function examRows() {
  if (!exams[state.lang]) return [];
  const rows = [];
  exam().sections.forEach((sec, si) => {
    sec.questions.forEach((item, qi) => {
      rows.push({ sec, si, qi, item, locked: Boolean(state.locked[sec.id]) });
    });
  });
  return rows;
}

function rowStats(rows) {
  const answered = rows.filter((row) => isComplete(row.item, state.answers[row.item.id])).length;
  const marked = rows.filter((row) => state.marked[row.item.id]).length;
  return { total: rows.length, answered, unanswered: rows.length - answered, marked };
}

function phase() {
  if (state.screen === "home" || state.screen === "intro" || state.screen === "ready") return "welcome";
  if (state.screen === "review") return "review";
  if (state.screen === "results") return "results";
  return section().id === "independent" ? "independent" : "case";
}

function stepMode(name) {
  const order = ["welcome", "independent", "case", "review", "results"];
  const current = order.indexOf(phase());
  const index = order.indexOf(name);
  if (index === current) return "step-on";
  if (index < current) return "step-done";
  return "";
}

function tbButton(id, tip, icon, label, action) {
  return `<button type="button" id="${id}" class="cp-button" data-tip-text="${esc(tip)}" data-action="${action}" role="menuitem"><img src="${icon}" class="icon" alt="" role="presentation"><span>${esc(label)}</span></button>`;
}

function submenu(id, tip, icon, label, panelId, inner, panelClass) {
  const open = state.menu === panelId;
  return `<div data-inclusive-menu="">
    <button type="button" id="${id}" class="submenu cp-button" data-tip-text="${esc(tip)}" data-action="submenu" data-menu="${panelId}" aria-expanded="${open}" aria-haspopup="true" role="menuitem"><img src="${icon}" class="icon" alt="" role="presentation"><span>${esc(label)}</span><span class="submenu-icon"><img src="${ICON.submenu}" alt=""></span></button>
    <div id="${panelId}" class="${panelClass || "submenu"}" role="menu" ${open ? "" : "hidden"}>${inner}</div>
  </div>`;
}

function detailsMenu(rows) {
  const strings = t();
  const stats = rowStats(rows);
  const item = (id, filter, label, count) => {
    const off = filter !== "all" && count === 0;
    return `<button type="button" id="${id}" role="menuitem" data-action="review-filter" data-filter="${filter}" ${off ? "disabled" : ""}><span>${esc(label)} (${count})</span></button>`;
  };
  return item("eqd-total-row", "all", strings.all, stats.total)
    + item("eqd-answered-row", "answered", strings.answered, stats.answered)
    + item("eqd-unanswered-row", "unanswered", strings.unanswered, stats.unanswered)
    + item("eqd-marked-row", "marked", strings.forReview, stats.marked);
}

function progressMap() {
  const strings = t();
  const step = (name, label) => `<li class="${name} ${stepMode(name)}"><span>${esc(label)}</span><div></div></li>`;
  return `<ul class="about-exam2">
    ${step("welcome", strings.welcomeStep)}
    ${step("independent", strings.independent)}
    ${step("case", strings.caseSection)}
    ${step("review", strings.reviewShort)}
    ${step("results", strings.yourScore)}
  </ul>`;
}

function colorMenu() {
  const strings = t();
  const item = (id, klass, label) => `<button type="button" class="cs-example ${klass}" data-action="theme" data-theme="${id}" aria-checked="${state.theme === id}" role="menuitemradio"><span>${SWATCH}</span>${esc(label)}</button>`;
  return submenu("ColorScheme", strings.colors, ICON.colors, strings.colors, "colorSchemeLinks",
    item("default", "cs-default", strings.light) + item("dark-mode", "cs-dark", strings.dark) + item("yellow-on-black", "cs-high", strings.contrast));
}

function toolbarHtml() {
  const strings = t();
  const inExam = state.screen === "exam" || state.screen === "review";
  const parts = [];
  if (state.screen !== "home") {
    parts.push(tbButton("MainMenu", strings.mainMenu, ICON.home, strings.mainMenu, inExam ? "ask-quit" : "home-quiet"));
  }
  if (inExam) {
    const rows = examRows();
    parts.push(submenu("Review", strings.details, ICON.details, strings.details, "eqdLinks", detailsMenu(rows), "ext-qstn-dets submenu"));
    parts.push(submenu("showProgressMap", strings.examProgress, ICON.progress, strings.examProgress, "ExamProgressMap", progressMap(), "about-exam2 submenu"));
    parts.push(tbButton("TakeBreak", strings.pause, ICON.pause, strings.pause, "pause"));
    parts.push(tbButton("Calculator", strings.calculator, ICON.calc, strings.calculator, "calc"));
  }
  const langLabel = state.lang === "fr" ? strings.showEnglish : strings.showFrench;
  parts.push(tbButton("DisplayLanguage", langLabel, ICON.lang, langLabel, "lang-flip"));
  parts.push(colorMenu());
  if (state.screen === "exam") parts.push(tbButton("Help", strings.help, ICON.help, strings.help, "help"));
  return parts.join("");
}

function clockMarkup() {
  const strings = t();
  const [hh, mm, ss] = fmt(state.remaining).split(":");
  const digits = state.timerOn
    ? `<div class="time-digits" id="timer-text" role="timer">&nbsp;<span data-timer-h>${hh}</span>&nbsp;<span class="ITS-visually-hidden">${esc(strings.hours)}</span><span aria-hidden="true">:</span>&nbsp;<span data-timer-m>${mm}</span>&nbsp;<span class="ITS-visually-hidden">${esc(strings.minutes)}</span><span aria-hidden="true">:</span>&nbsp;<span data-timer-s>${ss}</span>&nbsp;<span class="ITS-visually-hidden">${esc(strings.seconds)}</span></div>`
    : "";
  return `<div class="clock-wrapper">
    <div id="ClockTime" class="clock-time timer-box" role="region" aria-labelledby="TimeLbl">
      <div class="timer-control">
        <div id="TimeLbl" aria-hidden="true">${esc(strings.time)} :</div>
        <label class="switch"><input role="switch" type="checkbox" data-toggle="timer" ${state.timerOn ? "checked" : ""} aria-checked="${state.timerOn}"><span class="slider round"></span></label>
      </div>
      ${digits}
    </div>
  </div>`;
}

function progressMarkup(sectionTitle, index, total) {
  const strings = t();
  const width = total ? Math.round(((index + 1) / total) * 1000) / 10 : 0;
  const review = state.screen === "review";
  const bars = state.progressOn ? `<ul class="status-bars">
      <li class="status-bar standalone-questions">
        <span class="pb-label"><span class="pb-label-text">${esc(sectionTitle)}</span><span class="pb-label-num">(${Math.min(index + 1, total)}/${total})</span></span>
        <div class="pb-bar" style="--width: ${review ? 100 : width}%;"></div>
      </li>
      <li class="review-bar"><span class="pb-label"><span class="pb-label-text">${esc(strings.reviewShort)}</span></span><div class="pb-bar" style="--width: ${review ? 100 : 0}%;"></div></li>
    </ul>` : "";
  return `<aside id="progress-wrapper" aria-labelledby="pbToggleLbl" ${state.progressOn ? "" : "aria-hidden=\"true\""}>
    <div class="status-bars-wrapper">
      <div class="pb-control">
        <div id="pbToggleLbl" aria-hidden="true">${esc(strings.progressWord)}</div>
        <label class="switch"><input role="switch" type="checkbox" data-toggle="progress" ${state.progressOn ? "checked" : ""} aria-checked="${state.progressOn}"><span class="slider round"></span></label>
      </div>
      ${bars}
    </div>
  </aside>`;
}

function navButton(id, klass, label, action, disabled) {
  if (!label) return "";
  return `<button id="${id}" type="button" class="btn-nrm ${klass} pa-button" data-action="${action}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
}

function msShell({ title, body, prevLabel, prevAction, prevDisabled, nextLabel, nextAction, preexam, showClock, showProgress, sectionTitle, qIndex, qTotal }) {
  const strings = t();
  const fin = nextAction === "ask-submit" || nextLabel === strings.finishSection;
  return `<article id="ui-wrapper" class="site-container${preexam ? " site-container-preexam" : ""}">
    <section id="ControlPanelFrameID" class="toolbar-container" aria-label="${esc(strings.toolbar)}">
      <button id="MenuToggle" type="button" data-action="toolbar-toggle" aria-expanded="${state.toolbarBig}" data-tip-text="${esc(strings.toolbar)}">
        <div class="mt-textarw"><div class="mt-text">${esc(strings.toolbar)}</div><div class="mt-arw"></div></div>
        <div class="mt-burger"></div>
      </button>
      <div id="ToolBar" class="tb-menu" role="menu">${toolbarHtml()}</div>
    </section>
    <div class="main-wrapper">
      <div class="header-maincontent">
        <header role="banner" id="ui-header">
          <div class="uiMainHeader-wrapper"><h1 id="uiMainHeader">${title}</h1></div>
          ${showProgress === false ? "" : progressMarkup(sectionTitle || strings.independent, qIndex || 0, qTotal || 0)}
          ${showClock === false ? "" : clockMarkup()}
        </header>
        <main id="MainContainerID" class="qstn-box" role="main"><div class="eframeWrapper">${body}</div></main>
      </div>
      <div class="ui-bottom-toolbar">
        <nav id="QuestionNav" class="qstn-nav">
          ${navButton("Back", "qstn-prev", prevLabel, prevAction, prevDisabled)}
          ${navButton("Next", `qstn-next${fin ? " qstn-fin" : ""}`, nextLabel, nextAction, false)}
        </nav>
      </div>
    </div>
    ${calcPanel()}
  </article>`;
}

function examScreen() {
  const strings = t();
  const sec = section();
  const q = question();
  const last = state.questionIndex === sec.questions.length - 1;
  const nextLabel = last ? (sec.id === "independent" ? strings.finishSection : strings.toReview) : strings.next;
  return msShell({
    title: `${esc(strings.question)}&nbsp;${globalNumber(state.sectionIndex, state.questionIndex)}`,
    body: questionBody(q),
    prevLabel: strings.previous,
    prevAction: "prev",
    prevDisabled: state.questionIndex === 0,
    nextLabel,
    nextAction: "next",
    sectionTitle: sec.title,
    qIndex: state.questionIndex,
    qTotal: sec.questions.length,
  });
}

function reviewTable() {
  const strings = t();
  const rows = examRows().filter((row) => {
    const done = isComplete(row.item, state.answers[row.item.id]);
    const marked = Boolean(state.marked[row.item.id]);
    if (state.reviewFilter === "answered") return done;
    if (state.reviewFilter === "unanswered") return !done;
    if (state.reviewFilter === "marked") return marked;
    return true;
  });
  const body = rows.map((row, index) => {
    const done = isComplete(row.item, state.answers[row.item.id]);
    const marked = Boolean(state.marked[row.item.id]);
    return `<tr class="RVReviewRow ${done ? "RVComplete" : ""} ${marked ? "" : "RVUnmark"} ${index % 2 ? "RV-even" : "RV-odd"}">
      <th class="seq" scope="row">${globalNumber(row.si, row.qi)}</th>
      <td class="revdesc"><button type="button" data-action="jump" data-section="${row.si}" data-index="${row.qi}" ${row.locked ? "disabled" : ""}>${esc(row.item.stem)}</button></td>
      <td class="cmpgraph">${done ? "●" : ""}</td>
      <td class="incgraph">${done ? "" : "●"}</td>
      <td class="mark">${marked ? "●" : ""}</td>
      <td class="markcomment"></td>
    </tr>`;
  }).join("");
  return `<div class="ITSDisplay review-instructs">
    <h2 class="instructs-header">${esc(strings.reviewTitle)}</h2>
    <p>${esc(strings.reviewLead)}</p>
    <table class="review-grid reviewtable"><thead><tr>
      <th class="seq">${esc(strings.qNumber)}</th>
      <th class="revdesc">${esc(strings.questions)}</th>
      <th class="cmpgraph">${esc(strings.answered)}</th>
      <th class="incgraph">${esc(strings.unanswered)}</th>
      <th class="mark">${esc(strings.forReview)}</th>
      <th class="markcomment">${esc(strings.forComment)}</th>
    </tr></thead><tbody>${body}</tbody></table>
  </div>`;
}

function reviewScreen() {
  const strings = t();
  const open = exam().sections.some((item) => !state.locked[item.id]);
  const sec = exam().sections[state.sectionIndex] || exam().sections[0];
  return msShell({
    title: esc(strings.reviewTitle),
    body: reviewTable(),
    prevLabel: open ? strings.exitReview : "",
    prevAction: "return",
    nextLabel: strings.submit,
    nextAction: "ask-submit",
    sectionTitle: sec.title,
    qIndex: sec.questions.length - 1,
    qTotal: sec.questions.length,
  });
}

function resultsScreen() {
  const strings = t();
  const doc = exam();
  const score = scoreExam(doc, state.answers);
  const percent = Math.round((score.correct / score.total) * 100);
  const sheet = `<div class="ITSDisplay">
      ${state.timedOut ? `<p><strong>${esc(strings.timeUp)}</strong></p>` : ""}
      <p class="score">${score.correct} / ${score.total} <span style="font-size:22px">(${percent}%)</span></p>
      <p class="note">${esc(strings.scoreNote)}</p>
      <div class="bars">
        ${doc.domains.map((domain) => {
          const bucket = score.byDomain[domain.id];
          return `<div class="bar"><div>${esc(domain.label)} — ${bucket.correct} / ${bucket.total}</div><meter min="0" max="${bucket.total}" value="${bucket.correct}"></meter></div>`;
        }).join("")}
      </div>
      ${doc.sections.flatMap((sec, si) => sec.questions.map((item, qi) => {
        const good = isCorrect(item, state.answers[item.id]);
        return `<article class="result ${good ? "good" : ""}">
          <h3>${esc(strings.question)} ${globalNumber(si, qi)} — ${esc(good ? strings.correct : strings.incorrect)}</h3>
          <p>${esc(item.stem)}</p>
          <p><strong>${esc(strings.yourAnswer)}</strong><br><span class="answer">${esc(formatAnswer(item, state.answers[item.id]))}</span></p>
          <p><strong>${esc(strings.correctAnswer)}</strong><br><span class="answer">${esc(formatAnswer(item, expectedValue(item)))}</span></p>
          <p><strong>${esc(strings.rationale)}</strong><br>${esc(item.rationale)}</p>
          <p><a href="${esc(learnHref(item.learnUrl))}" target="_blank" rel="noreferrer">${esc(strings.learn)}</a></p>
        </article>`;
      })).join("")}
    </div>`;
  return msShell({
    title: esc(strings.resultsTitle),
    body: sheet,
    showClock: false,
    showProgress: false,
    nextLabel: strings.home,
    nextAction: "home-quiet",
  });
}

function posterCard(card, langKey) {
  const strings = t();
  const title = card[`title${langKey}`];
  const note = card[`note${langKey}`] || "";
  const action = card.available ? "open" : "unavailable";
  return `<button type="button" class="card${card.available ? " live" : ""}" data-action="${action}" data-id="${esc(card.id)}" ${card.available ? "" : "aria-disabled=\"true\""}><code>${esc(card.code)}</code><p>${esc(title)}</p>${note ? `<small>${esc(note)}</small>` : ""}<span class="${card.available ? "go" : "soon"}">${esc(card.available ? strings.start : strings.unavailable)}</span></button>`;
}

function posterScreen() {
  const strings = t();
  const langKey = state.lang === "fr" ? "Fr" : "En";
  const groups = catalog.groups.map((group) => {
    return `<div class="group" style="grid-column: span ${group.columns.length}">${esc(group[`title${langKey}`])}</div>`;
  }).join("");
  const bands = catalog.bands.map((band) => {
    const cols = catalog.columns.map((column) => {
      const cards = catalog.cards.filter((card) => card.band === band.id && card.column === column);
      return `<div class="col">${cards.map((card) => posterCard(card, langKey)).join("")}</div>`;
    }).join("");
    return `<section class="band band-${band.id}">
      <div class="band-label"><h2>${esc(band[`title${langKey}`])}</h2><p>${esc(band[`subtitle${langKey}`])}</p></div>
      <div class="cols">${cols}</div>
    </section>`;
  }).join("");
  return msShell({
    title: esc(strings.brand),
    body: `<div class="ITSDisplay home-board"><p class="note">${esc(strings.unofficial)} ${esc(strings.posterUpdated)}</p><p class="scroll-hint">${esc(strings.scrollHint)}</p><div class="poster-scroll"><div class="poster"><div class="group-row"><div></div><div class="groups">${groups}</div></div>${bands}</div></div></div>`,
    preexam: true,
    showClock: false,
    showProgress: false,
  });
}

function introScreen() {
  const strings = t();
  const body = `<div class="ITSDisplay">
    <p class="kicker">${esc(strings.introKicker)}</p>
    <h2>${esc(strings.examTitle)}</h2>
    <p>${esc(strings.introLead)}</p>
    <ul>${strings.introPoints.map((point) => `<li>${esc(point)}</li>`).join("")}</ul>
    <p class="note">${esc(strings.unofficial)}</p>
  </div>`;
  return msShell({
    title: "AZ-900",
    body,
    preexam: true,
    showClock: false,
    showProgress: false,
    prevLabel: strings.back,
    prevAction: "home-quiet",
    nextLabel: strings.continue,
    nextAction: "to-ready",
  });
}

function readyScreen() {
  const strings = t();
  const doc = exams[state.lang];
  const independent = doc.sections[0].questions.length;
  const caseCount = doc.sections[1].questions.length;
  const body = `<div class="ITSDisplay">
    <h2>${esc(strings.readyTitle)}</h2>
    <p>${esc(strings.examTitle)} — AZ-900</p>
    <p>${esc(strings.time)} : 45 ${esc(strings.minutes)}</p>
    <p>${esc(strings.questions)} : ${independent + caseCount}</p>
    <p>${esc(strings.independent)} : ${independent}</p>
    <p>${esc(strings.caseSection)} : ${caseCount}</p>
    <p>${esc(strings.readyBody)}</p>
  </div>`;
  return msShell({
    title: esc(strings.readyTitle),
    body,
    preexam: true,
    showClock: false,
    showProgress: false,
    prevLabel: strings.back,
    prevAction: "to-intro",
    nextLabel: strings.begin,
    nextAction: "begin",
  });
}

function langButtons() {
  return `<div class="langs">
    <button type="button" data-action="lang" data-lang="fr" aria-pressed="${state.lang === "fr"}">Français</button>
    <button type="button" data-action="lang" data-lang="en" aria-pressed="${state.lang === "en"}">English</button>
  </div>`;
}

function miniLang() {
  return `<div class="langs">
    <button type="button" data-action="lang" data-lang="fr" aria-pressed="${state.lang === "fr"}">FR</button>
    <button type="button" data-action="lang" data-lang="en" aria-pressed="${state.lang === "en"}">EN</button>
  </div>`;
}

let pendingProceed = null;

function modalHtml() {
  if (!state.modal) return "";
  const modal = state.modal;
  const yesBtn = modal.yes ? `<button type="button" class="sb-nav modal-btn" data-action="modal-yes" id="modal-yes">${esc(modal.yes)}</button>` : "";
  const noBtn = `<button type="button" class="sb-nav modal-btn" data-action="modal-no">${esc(modal.no || t().close)}</button>`;
  const buttons = modal.alert ? `${noBtn}${yesBtn}` : `${yesBtn}${noBtn}`;
  return `<div class="modal-back" id="alertContainer"><div class="modal modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="alert-msg">
    <h1 id="modal-title">${esc(modal.title)}</h1>
    <div id="alert-msg">${modal.body}</div>
    <div class="modal-dialog-btn-group">${buttons}</div>
  </div></div>`;
}

function askIncomplete(kind, proceed) {
  const strings = t();
  const message = kind === "back" ? strings.incompleteBack : kind === "review" ? strings.incompleteReview : strings.incompleteNext;
  pendingProceed = proceed;
  state.modal = {
    alert: true,
    title: strings.incompleteTitle,
    body: `<p>${esc(message)}</p>`,
    yes: strings.ok,
    no: strings.cancel,
    onYes: "proceed-nav",
  };
  pendingFocus = "#modal-yes";
  render();
}

function guardNav(kind, proceed) {
  if (state.screen === "exam" && !isComplete(question(), state.answers[question().id])) {
    askIncomplete(kind, proceed);
    return;
  }
  proceed();
}

function render() {
  if (state.deadline && !state.submitted) {
    state.remaining = Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
  }
  const strings = t();
  document.documentElement.lang = strings.htmlLang;
  document.title = strings.pageTitle;
  document.documentElement.classList.add("default", "device-big", "device-desktop", "sandbox");
  document.documentElement.classList.toggle("tb-menu-big", state.toolbarBig);
  document.documentElement.classList.toggle("tb-menu-sml", !state.toolbarBig);
  document.documentElement.classList.toggle("dark-mode", state.theme === "dark-mode");
  document.documentElement.classList.toggle("yellow-on-black", state.theme === "yellow-on-black");
  const pane = document.querySelector(".eframeWrapper");
  const scroll = pane ? pane.scrollTop : 0;
  let html = "";
  if (state.screen === "home") html = posterScreen();
  else if (state.screen === "intro") html = introScreen();
  else if (state.screen === "ready") html = readyScreen();
  else if (state.screen === "exam") html = examScreen();
  else if (state.screen === "review") html = reviewScreen();
  else if (state.screen === "results") html = resultsScreen();
  app.innerHTML = html + modalHtml() + (state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : "");
  const nextPane = document.querySelector(".eframeWrapper");
  if (nextPane) nextPane.scrollTop = scroll;
  if (pendingFocus) {
    const node = document.querySelector(pendingFocus);
    if (node) node.focus();
    pendingFocus = null;
  }
  save();
}

function pressCalc(key) {
  const current = state.calcValue;
  if (key === "C") {
    state.calcValue = "0";
  } else if (key === "=") {
    const match = current.match(/^(-?\d*\.?\d+)([+\-*/])(-?\d*\.?\d+)$/);
    if (match) {
      const left = Number(match[1]);
      const right = Number(match[3]);
      const ops = { "+": left + right, "-": left - right, "*": left * right, "/": right === 0 ? "Err" : left / right };
      const value = ops[match[2]];
      state.calcValue = value === "Err" ? "Err" : String(Math.round(value * 1000) / 1000);
    }
  } else if ("+-*/".includes(key)) {
    state.calcValue = /[+\-*/]$/.test(current) ? current.slice(0, -1) + key : `${current}${key}`;
  } else if (current === "0" || current === "Err") {
    state.calcValue = key === "." ? "0." : key;
  } else {
    state.calcValue = current + key;
  }
  render();
}

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem("az-lang", lang);
  render();
}

function pick(choiceId) {
  const q = question();
  if (q.type === "single" || q.type === "exhibit") {
    state.answers[q.id] = [choiceId];
  } else if (q.type === "multi") {
    const current = new Set(state.answers[q.id] || []);
    if (current.has(choiceId)) current.delete(choiceId);
    else if (current.size < q.select) current.add(choiceId);
    state.answers[q.id] = [...current];
  }
  pendingFocus = `[data-choice="${cssAttr(choiceId)}"]`;
  render();
}

function pickHot(regionId) {
  const q = question();
  const current = new Set(state.answers[q.id] || []);
  if (q.select === 1) {
    state.answers[q.id] = [regionId];
  } else if (current.has(regionId)) {
    current.delete(regionId);
    state.answers[q.id] = [...current];
  } else if (current.size < q.select) {
    current.add(regionId);
    state.answers[q.id] = [...current];
  }
  pendingFocus = `[data-region="${cssAttr(regionId)}"]`;
  render();
}

function assignTarget(targetId, sourceId) {
  const q = question();
  const next = { ...(state.answers[q.id] || {}) };
  for (const key of Object.keys(next)) {
    if (next[key] === sourceId) delete next[key];
  }
  if (sourceId) next[targetId] = sourceId;
  else delete next[targetId];
  state.answers[q.id] = next;
  pendingFocus = `[data-target="${cssAttr(targetId)}"]`;
  render();
}

function assignControl(controlId, value) {
  const q = question();
  const next = { ...(state.answers[q.id] || {}) };
  if (value) next[controlId] = value;
  else delete next[controlId];
  state.answers[q.id] = next;
  pendingFocus = `[data-control="${cssAttr(controlId)}"]`;
  render();
}

function mutateBuild(mutator) {
  const q = question();
  const next = [...(state.answers[q.id] || [])];
  mutator(next);
  state.answers[q.id] = next;
  render();
}

function goNext(force) {
  const sec = section();
  const strings = t();
  const last = state.questionIndex >= sec.questions.length - 1;
  if (!force) {
    guardNav(last && sec.id !== "independent" ? "review" : "next", () => goNext(true));
    return;
  }
  if (state.questionIndex < sec.questions.length - 1) {
    state.questionIndex += 1;
    state.caseView = "question";
    pendingFocus = "#question-heading";
    render();
    return;
  }
  if (sec.id === "independent") {
    state.modal = {
      title: strings.leaveSectionTitle,
      body: `<p>${esc(strings.leaveSectionBody)}</p>`,
      yes: strings.confirm,
      no: strings.cancel,
      onYes: "leave-independent",
    };
    pendingFocus = "#modal-yes";
    render();
    return;
  }
  state.screen = "review";
  render();
}

function openList() {
  const strings = t();
  const sec = section();
  const buttons = sec.questions.map((item, index) => {
    const done = isComplete(item, state.answers[item.id]);
    const marked = state.marked[item.id];
    return `<button type="button" class="num ${done ? "done" : ""} ${marked ? "marked" : ""}" data-action="list-go" data-index="${index}">${globalNumber(state.sectionIndex, index)}</button>`;
  }).join("");
  state.modal = {
    title: strings.listTitle,
    body: `<div class="num-grid">${buttons}</div>`,
    no: strings.close,
  };
  render();
}

function openHelp() {
  const strings = t();
  const q = question();
  const extra = section().case ? `<p>${esc(strings.helpText.case)}</p>` : "";
  state.modal = {
    title: strings.help,
    body: `<p>${esc(strings.helpText[q.type] || "")}</p>${extra}`,
    no: strings.close,
  };
  render();
}

function onYes() {
  const action = state.modal?.onYes;
  state.modal = null;
  if (action === "leave-independent") {
    state.locked.independent = true;
    state.sectionIndex = 1;
    state.questionIndex = 0;
    state.caseView = "question";
    state.screen = "exam";
    pendingFocus = "#question-heading";
  } else if (action === "submit") {
    finish(false);
    return;
  } else if (action === "quit") {
    resetAttempt();
    state.screen = "home";
  } else if (action === "proceed-nav") {
    const proceed = pendingProceed;
    pendingProceed = null;
    if (proceed) proceed();
    return;
  } else if (action === "resume") {
    state.paused = false;
    if (!state.submitted && state.remaining > 0) {
      state.deadline = Date.now() + state.remaining * 1000;
      startTicker();
    }
  }
  render();
}

app.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (action === "lang") setLang(el.dataset.lang);
  else if (action === "unavailable") showToast(t().unavailableToast);
  else if (action === "open") {
    resetAttempt();
    state.screen = "intro";
    render();
  } else if (action === "screen") {
    state.screen = el.dataset.screen;
    render();
  } else if (action === "begin") {
    resetAttempt();
    state.deadline = Date.now() + 45 * 60 * 1000;
    state.remaining = 45 * 60;
    state.screen = "exam";
    startTicker();
    pendingFocus = "#question-heading";
    render();
  } else if (action === "pick") pick(el.dataset.choice);
  else if (action === "hot") pickHot(el.dataset.region);
  else if (action === "build-add") {
    const q = question();
    const answer = state.answers[q.id] || [];
    if (answer.length >= q.select) return;
    mutateBuild((next) => next.push(el.dataset.choice));
  } else if (action === "build-remove") mutateBuild((next) => next.splice(Number(el.dataset.index), 1));
  else if (action === "build-up") mutateBuild((next) => {
    const index = Number(el.dataset.index);
    if (index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
  });
  else if (action === "build-down") mutateBuild((next) => {
    const index = Number(el.dataset.index);
    if (index < next.length - 1) [next[index + 1], next[index]] = [next[index], next[index + 1]];
  });
  else if (action === "tab") {
    state.tabs[question().id] = el.dataset.tab;
    render();
  } else if (action === "clear") {
    delete state.answers[question().id];
    render();
  } else if (action === "mark") {
    const id = question().id;
    if (state.marked[id]) delete state.marked[id];
    else state.marked[id] = true;
    render();
  } else if (action === "help") openHelp();
  else if (action === "list") openList();
  else if (action === "list-go") {
    const index = Number(el.dataset.index);
    const proceed = () => {
      state.questionIndex = index;
      state.caseView = "question";
      state.modal = null;
      pendingFocus = "#question-heading";
      render();
    };
    if (index === state.questionIndex) proceed();
    else guardNav(index < state.questionIndex ? "back" : "next", proceed);
  } else if (action === "prev") {
    if (state.questionIndex > 0) {
      guardNav("back", () => {
        state.questionIndex -= 1;
        state.caseView = "question";
        pendingFocus = "#question-heading";
        render();
      });
    }
  } else if (action === "next") goNext();
  else if (action === "case-q") {
    const index = Number(el.dataset.index);
    const proceed = () => {
      state.questionIndex = index;
      state.caseView = "question";
      pendingFocus = "#question-heading";
      render();
    };
    if (index === state.questionIndex) proceed();
    else guardNav(index < state.questionIndex ? "back" : "next", proceed);
  } else if (action === "case-topic") {
    state.caseView = el.dataset.topic;
    pendingFocus = "#question-heading";
    render();
  } else if (action === "case-back") {
    state.caseView = "question";
    pendingFocus = "#question-heading";
    render();
  } else if (action === "jump") {
    state.sectionIndex = Number(el.dataset.section);
    state.questionIndex = Number(el.dataset.index);
    state.caseView = "question";
    state.screen = "exam";
    pendingFocus = "#question-heading";
    render();
  } else if (action === "return") {
    const open = exam().sections.findIndex((item) => !state.locked[item.id]);
    if (open >= 0) {
      state.sectionIndex = open;
      state.screen = "exam";
      render();
    }
  } else if (action === "lang-flip") setLang(state.lang === "fr" ? "en" : "fr");
  else if (action === "to-ready") { state.screen = "ready"; render(); }
  else if (action === "to-intro") { state.screen = "intro"; render(); }
  else if (action === "theme-menu") { state.themeOpen = !state.themeOpen; render(); }
  else if (action === "submenu") {
    state.menu = state.menu === el.dataset.menu ? null : el.dataset.menu;
    render();
  } else if (action === "toolbar-toggle") {
    state.toolbarBig = !state.toolbarBig;
    render();
  } else if (action === "review-filter") {
    const filter = el.dataset.filter;
    const go = () => {
      state.reviewFilter = filter;
      state.menu = null;
      state.screen = "review";
      render();
    };
    if (state.screen === "exam") guardNav("review", go);
    else go();
  } else if (action === "theme") {
    state.theme = el.dataset.theme;
    state.themeOpen = false;
    state.menu = null;
    localStorage.setItem("az-theme", state.theme);
    render();
  } else if (action === "progress-toggle") { state.progressOn = !state.progressOn; render(); }
  else if (action === "timer-toggle") { state.timerOn = !state.timerOn; render(); }
  else if (action === "calc") { state.calcOpen = !state.calcOpen; render(); }
  else if (action === "calc-key") pressCalc(el.dataset.key);
  else if (action === "pause") {
    if (ticker) clearInterval(ticker);
    ticker = null;
    state.paused = true;
    state.deadline = 0;
    const strings = t();
    state.modal = { title: strings.pauseTitle, body: `<p>${esc(strings.pauseBody)}</p>`, yes: strings.resume, no: strings.cancel, onYes: "resume" };
    pendingFocus = "#modal-yes";
    render();
  } else if (action === "ask-quit") {
    const strings = t();
    state.modal = {
      title: strings.quitTitle,
      body: `<p>${esc(strings.quitBody)}</p>`,
      yes: strings.quit,
      no: strings.cancel,
      onYes: "quit",
    };
    pendingFocus = "#modal-yes";
    render();
  } else if (action === "ask-submit") {
    const strings = t();
    state.modal = {
      title: strings.submit,
      body: `<p>${esc(strings.submitWarn)}</p>`,
      yes: strings.confirm,
      no: strings.cancel,
      onYes: "submit",
    };
    pendingFocus = "#modal-yes";
    render();
  } else if (action === "modal-yes") onYes();
  else if (action === "modal-no") {
    if (state.paused && !state.submitted) {
      state.modal = { onYes: "resume" };
      onYes();
      return;
    }
    state.modal = null;
    render();
  } else if (action === "home-quiet") {
    resetAttempt();
    state.screen = "home";
    render();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.choice) pick(target.dataset.choice);
  else if (target.dataset.mark) {
    const id = question().id;
    if (target.checked) state.marked[id] = true;
    else delete state.marked[id];
    render();
  } else if (target.dataset.toggle === "progress") {
    state.progressOn = target.checked;
    render();
  } else if (target.dataset.toggle === "timer") {
    state.timerOn = target.checked;
    render();
  } else if (target.dataset.target) assignTarget(target.dataset.target, target.value);
  else if (target.dataset.control) assignControl(target.dataset.control, target.value);
  else if (target.dataset.statement) {
    const q = question();
    const next = { ...(state.answers[q.id] || {}) };
    next[target.dataset.statement] = target.value;
    state.answers[q.id] = next;
    render();
  }
});

app.addEventListener("dragstart", (event) => {
  const source = event.target.closest("[data-source]");
  if (!source) return;
  event.dataTransfer.setData("text/plain", source.dataset.source);
});

app.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop]")) event.preventDefault();
});

app.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (!zone) return;
  event.preventDefault();
  assignTarget(zone.dataset.drop, event.dataTransfer.getData("text/plain"));
});

window.addEventListener("beforeunload", (event) => {
  if ((state.screen === "exam" || state.screen === "review") && !state.submitted) {
    event.preventDefault();
    event.returnValue = "";
  }
});

try {
  const [loadedCatalog, en, fr] = await Promise.all([
    fetch("./data/catalog.json").then((response) => response.json()),
    fetch("./data/az-900/en.json").then((response) => response.json()),
    fetch("./data/az-900/fr.json").then((response) => response.json()),
  ]);
  catalog = loadedCatalog;
  exams.en = en;
  exams.fr = fr;
  restore();
  if ((state.screen === "exam" || state.screen === "review") && !state.submitted && state.remaining > 0) startTicker();
  if ((state.screen === "exam" || state.screen === "review") && state.remaining <= 0 && !state.submitted) finish(true);
  else render();
} catch (error) {
  app.innerHTML = `<main class="wrap"><p>Impossible de charger l'épreuve. Servez ce dossier avec un serveur HTTP.</p><p>${esc(error.message)}</p></main>`;
}
