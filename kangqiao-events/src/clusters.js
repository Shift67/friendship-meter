// ─────────────────────────────────────────────────────────────
// clusters.js — 學期叢集收合/展開的控制列（案卷分頁），以及膠囊點擊。
// 節點一多就變毛球的問題，靠這個壓制。
// ─────────────────────────────────────────────────────────────
import { collapseTerm, expandTerm, isCollapsed, clusterState } from './graph.js';

let barEl = null;

export function initClusters(el) {
  barEl = el;
  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-term]');
    if (!btn) return;
    toggle(btn.dataset.term);
  });
}

export function toggle(term) {
  if (isCollapsed(term)) expandTerm(term);
  else collapseTerm(term);
}

// 供 graph 的 onClustersChanged 回呼刷新
export function renderClusterBar(state = clusterState()) {
  if (!barEl) return;
  if (!state.length) { barEl.hidden = true; return; }
  barEl.hidden = false;
  barEl.innerHTML =
    `<span class="cb-label">學期</span>` +
    state.map((s) =>
      `<button class="cb-chip${s.collapsed ? ' is-collapsed' : ''}" data-term="${s.term}" ` +
      `title="${s.collapsed ? '展開' : '收合'}：${s.term}（${s.count} 件）">` +
      `<span class="cb-dot"></span>${s.term}<span class="cb-count">${s.count}</span></button>`
    ).join('');
}
