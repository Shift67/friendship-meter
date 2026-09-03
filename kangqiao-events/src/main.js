// ─────────────────────────────────────────────────────────────
// main.js — 進入點：載字體、組裝圖 + 面板 + 收合 + 聚焦，接上即時同步。
// ─────────────────────────────────────────────────────────────
import '@fontsource/noto-sans-tc/400.css';
import '@fontsource/noto-sans-tc/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';

import { POLL_MS, DEMO_MODE, APPS_SCRIPT_URL, SHEET_ID } from './config.js';
import { fetchRaw, parseRows, diffModel } from './data.js';
import { createGraph, render, getEvent, getControls, getCamera } from './graph.js';
import { toggle as toggleCluster } from './clusters.js';
import { initClusters, renderClusterBar } from './clusters.js';
import { focusPerson, clearFocus, isFocused } from './focus.js';
import { initPanel, openEvent, openPerson, close as closePanel } from './panel.js';

const $ = (id) => document.getElementById(id);
let lastModel = null;
let polling = false;
let hintDismissed = false;

boot();

async function boot() {
  // 字體就緒後再建圖，讓 sprite 標籤用對字體繪製
  try { await Promise.race([document.fonts.ready, wait(1500)]); } catch (_) {}

  createGraph($('scene'), {
    onEventClick: (node) => { fadeHint(); openEvent(node.eventRef || node); },
    onPersonClick: (node) => { fadeHint(); focusPerson(node.id); openPerson(node.id); },
    onCapsuleClick: (node) => { fadeHint(); toggleCluster(node.term); },
    onBackground: () => { clearFocus(); closePanel(); },
    onInteract: fadeHint,
    onClustersChanged: renderClusterBar,
  });

  initClusters($('clusterbar'));
  initPanel($('panel'), {
    onSelectPerson: (pid) => { focusPerson(pid); openPerson(pid); },
    onSelectEvent: (eid) => { const e = getEvent(eid); if (e) openEvent(e); },
    onClose: () => clearFocus(),
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearFocus(); closePanel(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncOnce();
  });

  await firstLoad();
  if (!DEMO_MODE) setInterval(syncOnce, POLL_MS);

  // 僅 ?demo：對外暴露少量 hook 供離線自我驗證，不影響正式使用
  if (DEMO_MODE) {
    window.__kq = {
      model: () => lastModel,
      firstPersonId: () => lastModel && lastModel.people[0] && lastModel.people[0].id,
      focusPerson, clearFocus, isFocused,
      openEvent: (i = 0) => openEvent(lastModel.events[i]),
      openPerson,
      toggleCluster,
      controls: () => getControls(),
      camera: () => getCamera(),
      // 模擬「試算表新增一列」→ 走 diff + 飛入同步路徑
      addDemoEvent: () => {
        const m = JSON.parse(JSON.stringify(lastModel));
        const id = 'e_new' + Date.now();
        const pid = m.people[0].id;
        m.events.push({
          id, stage: '國中事件', term: '九下', title: '示例·新同步事件',
          rawDate: '2023/6', date: '2023-06-01', story: '（示例）剛從試算表同步進來的一列。',
          people: [pid], order: m.events.length,
        });
        m.links.push({ eventId: id, personId: pid });
        const before = lastModel;
        lastModel = m;
        const added = diffModel(before, m).added;
        render(m, { animateIds: added });
        return added;
      },
    };
  }
}

async function firstLoad() {
  setStatus('讀取事件…', 'load');
  try {
    const raw = await fetchRaw();
    const model = parseRows(raw);
    if (!model.events.length) { showEmptyGuide(); return; }
    lastModel = model;
    render(model, { autoCollapseHighSchool: true });
    clearStatus();
    showHint();
  } catch (err) {
    showError(err);
  }
}

async function syncOnce() {
  if (polling || DEMO_MODE) return;
  polling = true;
  try {
    const raw = await fetchRaw();
    const model = parseRows(raw);
    if (!model.events.length) { polling = false; return; }
    const { added } = diffModel(lastModel, model);
    lastModel = model;
    // 新事件飛入；既有節點位置盡量保留（graph 內以 id 復用物件）
    render(model, { animateIds: added });
    if (added.length) flash(`同步：新增 ${added.length} 件事`);
  } catch (err) {
    // 靜默；下一輪再試（不打斷閱讀）
  } finally {
    polling = false;
  }
}

// ── 首次教學：一互動就淡出 ──────────────────────────────
function showHint() {
  if (hintDismissed) return;
  const h = $('hint');
  h.hidden = false;
  requestAnimationFrame(() => h.classList.add('is-on'));
}
function fadeHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  const h = $('hint');
  h.classList.remove('is-on');
  setTimeout(() => { h.hidden = true; }, 600);
}

// ── 狀態 / 引導 ─────────────────────────────────────────
function setStatus(text, kind = '') {
  const s = $('status');
  s.hidden = false;
  s.className = `status ${kind}`;
  s.innerHTML = `<span class="status-dot"></span>${text}`;
}
function clearStatus() { $('status').hidden = true; }

function flash(text) {
  setStatus(text, 'flash');
  setTimeout(clearStatus, 2600);
}

function showEmptyGuide() {
  const s = $('status');
  s.hidden = false;
  s.className = 'status guide';
  const route = APPS_SCRIPT_URL
    ? `目前使用 Apps Script 端點，但沒讀到任何事件。確認試算表有資料、且 doGet 有部署最新版本。`
    : `目前用 gviz fallback 讀取。請把試算表設為「知道連結的人可檢視」，<br>或部署 Apps Script 後用 <code>?api=你的/exec網址</code> 開啟本頁。`;
  s.innerHTML = `
    <div class="guide-card">
      <div class="guide-title mono">沒有讀到事件</div>
      <p>${route}</p>
      <p class="muted">試算表 ID：<code>${SHEET_ID}</code></p>
      <p class="muted">要離線看圖跑起來，可用 <code>?demo</code> 開啟示例資料。</p>
    </div>`;
}

function showError(err) {
  const s = $('status');
  s.hidden = false;
  s.className = 'status guide';
  s.innerHTML = `
    <div class="guide-card">
      <div class="guide-title mono">連線失敗</div>
      <p>${escapeHtml(err && err.message || String(err))}</p>
      <p class="muted">路線 A：部署 Apps Script 後用 <code>?api=…/exec</code>。<br>
      路線 B：把試算表設為「知道連結的人可檢視」。<br>
      離線預覽：<code>?demo</code>。</p>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
