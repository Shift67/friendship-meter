// ─────────────────────────────────────────────────────────────
// panel.js — 事件面板（桌機右側 / 手機底部抽屜）。
// 點事件看經過；點人物看他牽連的整條故事。缺欄位顯示「無記錄」，不編造。
// ─────────────────────────────────────────────────────────────
import { getModel } from './graph.js';

let el = null;
let cb = {};
let openState = null; // {type:'event'|'person', id}

export function initPanel(node, callbacks = {}) {
  el = node;
  cb = callbacks;
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('.panel-close')) { close(); cb.onClose && cb.onClose(); return; }
    const pchip = ev.target.closest('[data-pid]');
    if (pchip) { cb.onSelectPerson && cb.onSelectPerson(pchip.dataset.pid); return; }
    const erow = ev.target.closest('[data-eid]');
    if (erow) { cb.onSelectEvent && cb.onSelectEvent(erow.dataset.eid); return; }
  });
}

function nameOf(pid) {
  const p = getModel().people.find((x) => x.id === pid);
  return p ? p.name : pid;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function openEvent(evt) {
  if (!evt) return;
  openState = { type: 'event', id: evt.id };
  const num = String((evt.order ?? 0) + 1).padStart(2, '0');
  const dateStr = evt.rawDate ? esc(evt.rawDate) : '無日期';
  const tags = [evt.stage, evt.term].filter(Boolean)
    .map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const story = evt.story && evt.story.trim()
    ? evt.story.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('')
    : `<p class="muted">無記錄</p>`;
  const people = (evt.people || []).length
    ? evt.people.map((pid) => `<button class="chip" data-pid="${esc(pid)}">${esc(nameOf(pid))}</button>`).join('')
    : `<span class="muted">無記錄</span>`;

  el.innerHTML = `
    <button class="panel-close" aria-label="關閉">×</button>
    <div class="panel-kicker mono">事件 · ${num}</div>
    <h2 class="panel-title">${esc(evt.title)}</h2>
    <div class="panel-meta mono">${dateStr}</div>
    <div class="panel-tags">${tags}</div>
    <div class="panel-body">${story}</div>
    <div class="panel-section-label">牽連的人</div>
    <div class="panel-people">${people}</div>`;
  show();
}

export function openPerson(personId) {
  const model = getModel();
  const person = model.people.find((p) => p.id === personId);
  if (!person) return;
  openState = { type: 'person', id: personId };
  const evts = model.events
    .filter((e) => e.people.includes(personId))
    .sort((a, b) => a.order - b.order);
  const rows = evts.map((e) => `
    <button class="ev-row" data-eid="${esc(e.id)}">
      <span class="ev-date mono">${esc(e.rawDate || '—')}</span>
      <span class="ev-term mono">${esc(e.term || '')}</span>
      <span class="ev-title">${esc(e.title)}</span>
    </button>`).join('');

  el.innerHTML = `
    <button class="panel-close" aria-label="關閉">×</button>
    <div class="panel-kicker mono">人物</div>
    <h2 class="panel-title accent">${esc(person.name)}</h2>
    <div class="panel-meta mono">牽連 ${evts.length} 件事</div>
    <div class="panel-section-label">依時間</div>
    <div class="panel-body panel-events">${rows || '<p class="muted">無記錄</p>'}</div>`;
  show();
}

function show() {
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  // 觸發 slide+fade（透過 class，過場在 CSS）
  requestAnimationFrame(() => el.classList.add('is-open'));
}

export function close() {
  if (!openState) return;
  openState = null;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  setTimeout(() => { if (!openState) el.hidden = true; }, 300);
}

export function isOpen() { return openState != null; }
export function openType() { return openState && openState.type; }
