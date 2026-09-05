// ─────────────────────────────────────────────────────────────
// config.js — 端點網址、輪詢秒數、學期順序、圖的調律參數
// 這裡是唯一該被改動的地方；其他檔案不硬寫任何端點。
// ─────────────────────────────────────────────────────────────

// 來源試算表 ID（唯讀，絕不寫入）
// 可用 ?sheet=貼上你的試算表網址或ID 覆蓋（會記到 localStorage，之後免帶）
const DEFAULT_SHEET_ID = '1f-KyqIZ5PEXj5i3E4XwCjUJsOA0bD4FwC45wcx8G39Q';
export const SHEET_GID = '0';

function extractSheetId(s) {
  if (!s) return null;
  const m = String(s).match(/\/d\/([a-zA-Z0-9_-]{20,})/); // 完整網址
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(String(s).trim())) return String(s).trim(); // 純 ID
  return null;
}
function resolveSheetId() {
  const params = new URLSearchParams(location.search);
  const fromQuery = extractSheetId(params.get('sheet'));
  if (fromQuery) {
    try { localStorage.setItem('kq_sheet_id', fromQuery); } catch (_) {}
    return fromQuery;
  }
  try {
    const stored = localStorage.getItem('kq_sheet_id');
    if (stored) return stored;
  } catch (_) {}
  return DEFAULT_SHEET_ID;
}
export const SHEET_ID = resolveSheetId();

// ── 端點解析 ─────────────────────────────────────────────
// 路線 A（主推）：Google Apps Script 部署的 /exec 網址，回傳整張表的二維陣列。
//   設定方式（擇一）：
//     1) 直接把網址填進下面的 DEFAULT_APPS_SCRIPT_URL
//     2) 開網站時帶參數 ?api=https://script.google.com/.../exec（會記到 localStorage，之後免帶）
// 路線 B（fallback）：不填 API 時，改用 gviz 端點（需試算表設「知道連結的人可檢視」）。
const DEFAULT_APPS_SCRIPT_URL = '';

function resolveApiUrl() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('api');
  if (fromQuery) {
    try { localStorage.setItem('kq_api_url', fromQuery); } catch (_) {}
    return fromQuery;
  }
  try {
    const stored = localStorage.getItem('kq_api_url');
    if (stored) return stored;
  } catch (_) {}
  return DEFAULT_APPS_SCRIPT_URL;
}

export const APPS_SCRIPT_URL = resolveApiUrl();

// gviz fallback 端點（JSONP 讀取，避開 CORS）
// headers=1：強制只把第 1 列當表頭，避免合併儲存格害 gviz 把表頭跟第一筆事件糊在一起
export const GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
  `?tqx=out:json&gid=${SHEET_GID}&headers=1`;

// ?demo：載入內建示例資料，離線也能看圖跑起來（明確標示為示例，非康橋真實紀錄）
export const DEMO_MODE = new URLSearchParams(location.search).has('demo');

// 自動更新輪詢間隔（毫秒）；切回分頁時另外會立刻重抓一次
export const POLL_MS = 45000;

// ── 學期正規化順序（時間軸用；不管表裡怎麼跳，一律照這個先後）──
export const TERM_ORDER = [
  '七年級', '八上', '八下', '九上', '九下',
  '十上', '十下', '十一上', '十一下', '十二上', '十二下',
];

// 階段順序（僅供顯示分組）
export const STAGE_ORDER = ['國中事件', '高中事件'];

// ── 配色（chrome 近中性 + 一個功能色）────────────────────
// 底：冷調深空間（近黑帶藍，不是純黑）。功能色：暖橘，全站唯一亮點。
// 節點類型色：淺藍綠 / 紫的「去飽和安靜版」，只做功能區分。
export const PALETTE = {
  bg: '#0f141b',        // 近黑帶藍的底
  bgDeep: '#0a0e14',    // 霧的遠端 / 更深
  accent: '#e8823c',    // 暖橘：選中 / 活躍連線 / 聚焦高亮（唯一亮點）
  accentSoft: '#f0a469',
  event: '#7fb0a8',     // 事件節點：去飽和淺藍綠
  person: '#9a8fb8',    // 人物節點：去飽和紫
  link: '#3a4657',      // 連線：安靜的藍灰
  ink: '#dfe6ee',       // 主要文字
  inkDim: '#8b97a6',    // 次要文字 / 軸標
};

// ── 圖的調律（在 graph.js 使用；集中在此方便微調）──────────
export const TUNE = {
  termGap: 62,          // 相鄰學期在 Y 軸上的間距（world units）
  eventRadius: 5.2,     // 事件節點球半徑
  personRadius: 2.6,    // 人物節點半徑
  capsuleRadius: 8.5,   // 收合後學期膠囊半徑
  chargeStrength: -90,  // 斥力
  linkDistance: 34,
  linkStrength: 0.28,
  timelineStrength: 0.9,// 事件被 Y 軸（時間）拉住的力道，越大分層越清楚
  centerXZStrength: 0.03,
  collideRadius: 7,
  idleDriftSpeed: 0.12, // 待機鏡頭自轉速度（唯一允許的環境動畫，慢到幾乎察覺不到）
  idleDelayMs: 6000,    // 停止互動後多久恢復漂移
};
