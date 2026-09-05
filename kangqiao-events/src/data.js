// ─────────────────────────────────────────────────────────────
// data.js — 抓端點 → 解析 → 正規化 → diff
// 規則全部照 build spec 第 2 節：合併儲存格向下填補、E 欄 split 多人、
// 以列序為主排序、缺欄留空絕不編造、來源唯讀。
// ─────────────────────────────────────────────────────────────
import {
  APPS_SCRIPT_URL, GVIZ_URL, DEMO_MODE, TERM_ORDER,
} from './config.js';

// 穩定 hash（名稱 + 列序）→ 短字串，讓即時同步能 diff 出哪些是新的
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ── 抓原始二維陣列 ───────────────────────────────────────
export async function fetchRaw() {
  if (DEMO_MODE) return demoRaw();
  if (APPS_SCRIPT_URL) return fetchAppsScript();
  return fetchGviz();
}

async function fetchAppsScript() {
  const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Apps Script ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Apps Script 回傳格式非二維陣列');
  return data;
}

// gviz 用 JSONP 讀取，避開 fetch 的 CORS 限制
function fetchGviz() {
  return new Promise((resolve, reject) => {
    const g = (window.google = window.google || {});
    g.visualization = g.visualization || {};
    g.visualization.Query = g.visualization.Query || {};
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('gviz 逾時（試算表是否設為「知道連結的人可檢視」？）'));
    }, 15000);
    function cleanup() {
      clearTimeout(timer);
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    g.visualization.Query.setResponse = (resp) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(gvizToRows(resp));
      } catch (e) {
        reject(e);
      }
    };
    const s = document.createElement('script');
    s.src = GVIZ_URL + '&_=' + Date.now();
    s.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('gviz 載入失敗'));
    };
    document.head.appendChild(s);
  });
}

// gviz 的 table 轉成「含標題列」的二維陣列，跟 Apps Script 回傳對齊
function gvizToRows(resp) {
  const table = resp && resp.table;
  if (!table) throw new Error('gviz 無 table');
  const header = (table.cols || []).map((c) => (c && c.label) || '');
  const body = (table.rows || []).map((r) =>
    (r.c || []).map((cell) => {
      if (!cell) return '';
      if (cell.f != null) return String(cell.f);
      if (cell.v != null) return String(cell.v);
      return '';
    })
  );
  // 若標題列全空（gviz 沒認出表頭），就不硬塞
  return header.some((h) => h) ? [header, ...body] : body;
}

// ── 解析 + 正規化 ────────────────────────────────────────
const HEADER_KEYS = {
  stage: ['階段'],
  term: ['學期'],
  title: ['事件名稱', '名稱', '事件'],
  date: ['日期', '發生日期', '時間'],
  people: ['發生人', '參與', '人'],
  story: ['事件內容', '內容', '經過', '故事', '說明'],
};

const CANON = { stage: 0, term: 1, title: 2, date: 3, people: 4, story: 5 };

// 對不到的欄位，回退到標準 A..F 位置（但不搶已被別欄用掉的位置）。
// 這樣就算有人把 A1 標題改成惡搞字（例如「屁眼」），階段欄仍讀得到。
function fillMissingCols(idx) {
  const used = new Set(Object.values(idx).filter((i) => i >= 0));
  for (const [key, pos] of Object.entries(CANON)) {
    if (idx[key] < 0 && !used.has(pos)) { idx[key] = pos; used.add(pos); }
  }
  return idx;
}

function detectColumns(values) {
  for (let r = 0; r < Math.min(values.length, 6); r++) {
    const row = (values[r] || []).map((c) => String(c ?? '').trim());
    const idx = {};
    for (const [key, kws] of Object.entries(HEADER_KEYS)) {
      idx[key] = row.findIndex((cell) => kws.some((kw) => cell.includes(kw)));
    }
    // 至少對到「事件名稱」與其一，才當作標題列
    if (idx.title >= 0 && (idx.term >= 0 || idx.people >= 0)) {
      return { headerRow: r, cols: fillMissingCols(idx) };
    }
  }
  // 完全對不到 → 純位置 fallback A..F
  return {
    headerRow: values.length && looksLikeHeader(values[0]) ? 0 : -1,
    cols: { ...CANON },
  };
}

function looksLikeHeader(row) {
  const joined = (row || []).map((c) => String(c ?? '')).join('');
  return /階段|學期|事件|日期|發生|內容/.test(joined);
}

function splitPeople(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(/[\s　、,，;；/]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function parseDate(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/(\d{4})[\/\-.年](\d{1,2})(?:[\/\-.月](\d{1,2}))?/);
  if (!m) return null;
  const y = m[1];
  const mo = String(Math.min(12, Math.max(1, +m[2]))).padStart(2, '0');
  const d = String(Math.min(31, Math.max(1, +(m[3] || 1)))).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function parseRows(values) {
  if (!Array.isArray(values) || !values.length) {
    return emptyModel();
  }
  // 主要：關鍵字偵測到的欄位對應
  const detected = detectColumns(values);
  const a = parseWith(values, detected.headerRow, detected.cols);
  // 保險：純位置 A..F（合併儲存格害 gviz 把表頭切歪時，這個通常更準）
  const posHeader = looksLikeHeader(values[0]) ? 0 : -1;
  const b = parseWith(values, posHeader, { ...CANON });
  // 取「解析出比較多事件」的那個，對付各種讀取管道的怪異
  return b.events.length > a.events.length ? b : a;
}

function parseWith(values, headerRow, cols) {
  const start = headerRow + 1;

  const events = [];
  const peopleMap = new Map(); // id -> {id, name, eventCount}
  const links = [];
  let lastStage = '';
  let lastTerm = '';

  for (let r = start; r < values.length; r++) {
    const row = values[r] || [];
    const get = (i) => (i >= 0 ? String(row[i] ?? '').trim() : '');

    // A、B 欄合併儲存格：向下填補
    const stageCell = get(cols.stage);
    const termCell = get(cols.term);
    if (stageCell) lastStage = stageCell;
    if (termCell) lastTerm = termCell;

    const title = get(cols.title);
    // 略過完全空白列與沒有事件名稱的列
    if (!title) continue;
    const anyContent = title || get(cols.date) || get(cols.people) || get(cols.story);
    if (!anyContent) continue;

    const rawDate = get(cols.date);
    const story = get(cols.story);
    const names = splitPeople(get(cols.people));

    const id = 'e_' + hashId(title + '|' + r);
    const personIds = names.map((name) => {
      const pid = 'p_' + hashId(name);
      const existing = peopleMap.get(pid);
      if (existing) existing.eventCount++;
      else peopleMap.set(pid, { id: pid, name, eventCount: 1 });
      return pid;
    });

    events.push({
      id,
      stage: lastStage,
      term: normalizeTerm(lastTerm),
      title,
      rawDate,
      date: parseDate(rawDate),
      story,
      people: personIds,
      order: events.length,
    });
    for (const pid of personIds) links.push({ eventId: id, personId: pid });
  }

  const people = [...peopleMap.values()];
  const terms = TERM_ORDER.filter((t) => events.some((e) => e.term === t));
  // 表裡出現但不在正規順序內的學期，補在後面（不丟資料）
  for (const e of events) {
    if (e.term && !terms.includes(e.term)) terms.push(e.term);
  }
  return { events, people, links, terms };
}

function normalizeTerm(t) {
  const s = String(t ?? '').trim();
  // 常見別名歸一
  const alias = {
    '七上': '七年級', '七下': '七年級', '7年級': '七年級', '七': '七年級',
  };
  return alias[s] || s;
}

function emptyModel() {
  return { events: [], people: [], links: [], terms: [] };
}

// ── diff：找出新增 / 移除的事件，供即時同步的飛入動畫 ──────
export function diffModel(oldModel, newModel) {
  const oldIds = new Set((oldModel?.events || []).map((e) => e.id));
  const newIds = new Set(newModel.events.map((e) => e.id));
  const added = newModel.events.filter((e) => !oldIds.has(e.id)).map((e) => e.id);
  const removed = [...oldIds].filter((id) => !newIds.has(id));
  return { added, removed, isFirst: !oldModel };
}

// ── 內建示例（僅 ?demo；明確標示為示例，非康橋真實紀錄）──────
// 刻意做到跟真實資料相近的密度（約 36 件、多學期、人物重複穿線），用來調視覺。
function demoRaw() {
  const A = '示例甲', B = '示例乙', C = '示例丙', D = '示例丁', E = '示例戊';
  const F = '示例己', G = '示例庚', H = '示例辛', I = '示例壬', J = '示例癸';
  const rows = [
    ['階段', '學期', '事件名稱', '發生日期', '發生人', '事件內容'],
    ['國中事件', '七年級', '示例·分班初遇', '2021/9', `${A} ${B} ${C}`, '（示例）開學第一週被分到同一組。'],
    ['', '', '示例·午休風波', '2021/11', `${B} ${D}`, '（示例）午休的小衝突。'],
    ['', '', '示例·走廊事件', '2021/12', `${A} ${E} ${F}`, '（示例）走廊上的插曲。'],
    ['', '八上', '示例·社團成立', '2022/3', `${A} ${E} G班全體`, '（示例）合力申請新社團。'],
    ['', '', '示例·園遊會', '2022/4', `${C} ${G} ${H}`, '（示例）園遊會擺攤。'],
    ['', '八下', '示例·段考之亂', '2022/6', `${C} ${D} ${E}`, '（示例）段考前的讀書會。'],
    ['', '', '示例·球賽', '2022/7', `${F} ${G} ${I}`, '（示例）班際球賽。'],
    ['', '九上', '示例·口袋事件', '2022/10~11', `${A} ${B} ${F}`, '（示例）流傳很久的往事。'],
    ['', '', '示例·夜衝', '2022/11', `${D} ${H} ${J}`, '（示例）一次夜衝。'],
    ['', '', '示例·誤會', '2022/12', `${B} ${E}`, '（示例）一場誤會。'],
    ['', '九下', '示例·會考前夕', '2023/4', `${A} ${C} ${G}`, '（示例）會考倒數。'],
    ['', '', '示例·畢業前夕', '2023/5', `${A} ${B} ${C} ${D} ${E} ${F}`, '（示例）國中最後全員到齊。'],
    ['', '', '示例·謝師宴', '2023/6', `${G} ${H} ${I} ${J}`, '（示例）謝師宴。'],
    ['高中事件', '十上', '示例·重新編班', '2023/9', `${A} ${G}`, '（示例）升高中被打散重編。'],
    ['', '', '示例·迎新', '2023/10', `${E} ${H} 1001部分男性`, '（示例）迎新活動。'],
    ['', '十下', '示例·校慶擺攤', '2024/3', `${E} ${G} 1001部分男性`, '（示例）校慶攤位。'],
    ['', '', '示例·段考翻車', '2024/4', `${C} ${F}`, '（示例）段考失利。'],
    ['', '', '示例·社遊', '2024/5', `${A} ${D} ${I}`, '（示例）社團出遊。'],
    ['', '', '示例·排位賽', '2024/5', `${B} ${H}`, '（示例）排位賽。'],
    ['', '', '示例·撞車事變', '2024/6', `${C} ${J}`, '（示例）小擦撞。'],
    ['', '', '示例·毒駕事件', '2024/6', 'G班全體', '（示例）環台途中。'],
    ['', '', '示例·嘉睿事變', '2024/6', `${E} ${G}`, '（示例）一次爭執。'],
    ['', '', '示例·徐鼻事件', '2024/7', `${A} ${I}`, '（示例）小插曲。'],
    ['', '', '示例·冷戰II', '2024/7', `${D} ${F}`, '（示例）又一次冷戰。'],
    ['', '十一上', '示例·夜讀', '2024/10', `${A} ${F} ${G}`, '（示例）圖書館夜讀。'],
    ['', '', '示例·冷戰', '2024/11', `${B} ${D}`, '（示例）一段冷戰。'],
    ['', '', '示例·和好', '2024/12', `${B} ${D} ${A}`, '（示例）談開和好。'],
    ['', '十一下', '示例·畢旅', '2025/3', `${A} ${C} ${E} ${G} ${I}`, '（示例）畢業旅行。'],
    ['', '', '示例·告白', '2025/4', `${F} ${J}`, '（示例）一次告白。'],
    ['', '', '示例·散夥飯', '2025/6', `${A} ${B} ${C} ${D} ${E} ${F} ${G}`, '（示例）散夥飯。'],
  ];
  return rows;
}
