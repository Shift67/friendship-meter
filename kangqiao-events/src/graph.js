// ─────────────────────────────────────────────────────────────
// graph.js — 3d-force-graph 建圖：時間軸力、節點材質、拖曳、orbit、
//            自訂連線、學期軸標、待機鏡頭漂移。
// 這裡刻意不用 3d-force-graph 的預設長相：霧面材質 + 近中性底 +
// 學期在 Y 軸上分層，讓「空間即時間」讀得出來。
// ─────────────────────────────────────────────────────────────
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { forceX, forceY, forceZ, forceCollide } from 'd3-force-3d';
import { PALETTE, TUNE } from './config.js';

let Graph = null;
let container = null;
let handlers = {};

let model = { events: [], people: [], links: [], terms: [] };
let eventById = new Map();
const nodeById = new Map();   // 持久節點物件，跨 derive 保留位置與材質參照
const collapsed = new Set();  // 收合中的學期
let presentTerms = [];
const termYMap = new Map();

let idleTimer = null;
let firstFramed = false;

const C = {
  bg: new THREE.Color(PALETTE.bg),
  fog: new THREE.Color(PALETTE.bgDeep),
  accent: new THREE.Color(PALETTE.accent),
  event: new THREE.Color(PALETTE.event),
  person: new THREE.Color(PALETTE.person),
  link: new THREE.Color(PALETTE.link),
  ink: new THREE.Color(PALETTE.ink),
  dim: new THREE.Color(PALETTE.bgDeep),
};

// ── 建立 ────────────────────────────────────────────────
export function createGraph(el, h = {}) {
  container = el;
  handlers = h;

  Graph = new ForceGraph3D(el, { controlType: 'orbit', rendererConfig: { antialias: true, alpha: false } })
    .backgroundColor(PALETTE.bg)
    .showNavInfo(false)
    .nodeThreeObject(nodeThreeObject)
    .nodeVal((n) => (n.kind === 'capsule' ? 16 : n.kind === 'event' ? 8 : 3))
    .nodeLabel(() => '') // 用自繪 sprite，不要預設 tooltip
    // 內建連線畫成實心圓柱，永遠牢牢接在兩點中心
    .linkColor(linkColorFor)
    .linkWidth(linkWidthFor)
    .linkOpacity(0.6)
    .linkDirectionalParticleWidth(2.2)
    .linkDirectionalParticleSpeed(0.014)
    .linkDirectionalParticleColor(() => PALETTE.accentSoft)
    .enableNodeDrag(true)
    .onNodeClick(onNodeClick)
    .onNodeHover(onNodeHover)
    .onBackgroundClick(() => handlers.onBackground && handlers.onBackground())
    .onNodeDragEnd((node) => {
      // 拖完放開 → 解除釘選，讓力學重新穩定（含 Y 軸時間力把它拉回該學期層）
      node.fx = undefined; node.fy = undefined; node.fz = undefined;
      Graph.d3ReheatSimulation();
    });

  Graph.d3AlphaDecay(0.018).d3VelocityDecay(0.32);

  // 光：冷調環境 + 柔和頂光 + 微弱補光，塑造霧面體積感（不是發光球）
  Graph.lights([
    new THREE.AmbientLight(0x9aa7b6, 0.55),
    keyLight(0xffffff, 0.75, [0.4, 1, 0.6]),
    keyLight(0x6f7d8c, 0.35, [-0.6, -0.4, -0.5]),
  ]);

  // 霧：遠端沉入景深，也是聚焦「退霧」的底色
  const scene = Graph.scene();
  scene.fog = new THREE.FogExp2(PALETTE.bgDeep, 0.0016);

  // 力場
  Graph.d3Force('center', null);
  Graph.d3Force('charge').strength(TUNE.chargeStrength).distanceMax(600);
  Graph.d3Force('link').distance(TUNE.linkDistance).strength((l) => l._strength ?? TUNE.linkStrength);
  Graph.d3Force('timeline',
    forceY((n) => n._targetY ?? 0).strength((n) => (n.kind === 'event' || n.kind === 'capsule') ? TUNE.timelineStrength : 0));
  Graph.d3Force('cx', forceX(0).strength(TUNE.centerXZStrength));
  Graph.d3Force('cz', forceZ(0).strength(TUNE.centerXZStrength));
  Graph.d3Force('collide',
    forceCollide((n) => n.kind === 'capsule' ? TUNE.capsuleRadius + 4 : n.kind === 'event' ? TUNE.collideRadius : TUNE.personRadius + 1).strength(0.7));

  // 學期軸標（案卷分頁感）
  buildAxis();

  // 待機鏡頭漂移（唯一允許的環境動畫，慢到幾乎察覺不到）
  const controls = Graph.controls();
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.autoRotate = true; // 待機時就開始極慢漂移；互動時暫停、閒置後恢復
  controls.autoRotateSpeed = TUNE.idleDriftSpeed;
  controls.minDistance = 40;
  controls.maxDistance = 2600;
  controls.addEventListener('start', onUserInteract);

  window.addEventListener('resize', onResize);
  onResize();

  startVisualLoop();
  return controller;
}

function keyLight(color, intensity, dir) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(dir[0], dir[1], dir[2]);
  return l;
}

// ── 資料進圖 ─────────────────────────────────────────────
export function render(nextModel, opts = {}) {
  model = nextModel;
  eventById = new Map(model.events.map((e) => [e.id, e]));
  const data = derive();
  Graph.graphData(data);

  // 首次自動收合高中，避免一開場就爆（國中先展開）
  if (opts.autoCollapseHighSchool && collapsed.size === 0) {
    for (const t of model.terms) {
      const evs = model.events.filter((e) => e.term === t);
      if (evs.length && evs[0].stage && evs[0].stage.includes('高中')) collapsed.add(t);
    }
    if (collapsed.size) {
      const d2 = derive();
      Graph.graphData(d2);
    }
  }

  if (opts.animateIds && opts.animateIds.length) playEntrance(opts.animateIds);

  if (!firstFramed) {
    firstFramed = true;
    setTimeout(() => frameAll(1200), 1600);
  }
  handlers.onClustersChanged && handlers.onClustersChanged(clusterState());
}

function derive() {
  const nodes = [];
  const links = [];
  presentTerms = model.terms.slice();
  computeTermY();

  const byTerm = new Map();
  for (const e of model.events) {
    if (!byTerm.has(e.term)) byTerm.set(e.term, []);
    byTerm.get(e.term).push(e);
  }

  for (const term of presentTerms) {
    const evs = byTerm.get(term) || [];
    if (!evs.length) continue;
    if (collapsed.has(term)) {
      const n = ensureNode('cap_' + term, 'capsule');
      n.term = term; n.count = evs.length; n.stage = evs[0].stage;
      n._targetY = termY(term);
      seedPos(n, term);
      nodes.push(n);
    } else {
      for (const e of evs) {
        const n = ensureNode(e.id, 'event');
        n.title = e.title; n.term = e.term; n.stage = e.stage;
        n.rawDate = e.rawDate; n.date = e.date; n.story = e.story;
        n.people = e.people; n.order = e.order; n.eventRef = e;
        n._targetY = termY(term);
        seedPos(n, term);
        nodes.push(n);
      }
    }
  }

  for (const p of model.people) {
    const n = ensureNode(p.id, 'person');
    n.name = p.name; n.eventCount = p.eventCount;
    nodes.push(n);
  }

  // links：人 ↔（事件 / 收合膠囊），對膠囊去重加權
  const seen = new Map();
  for (const l of model.links) {
    const ev = eventById.get(l.eventId);
    if (!ev) continue;
    const collapsedTerm = collapsed.has(ev.term);
    const targetId = collapsedTerm ? 'cap_' + ev.term : l.eventId;
    const key = l.personId + '>' + targetId;
    if (seen.has(key)) { seen.get(key)._weight++; continue; }
    const link = {
      source: l.personId, target: targetId, key,
      _weight: 1, _dim: 0, _hi: 0,
      _strength: collapsedTerm ? 0.12 : TUNE.linkStrength,
    };
    seen.set(key, link);
    links.push(link);
  }

  return { nodes, links };
}

function ensureNode(id, kind) {
  let n = nodeById.get(id);
  if (!n) {
    n = { id, kind, _enter: 1, _dim: 0, _hi: 0 };
    nodeById.set(id, n);
  }
  n.kind = kind;
  return n;
}

function seedPos(n, term) {
  if (n.x == null) {
    const r = 60 + Math.random() * 120;
    const a = Math.random() * Math.PI * 2;
    n.x = Math.cos(a) * r;
    n.z = Math.sin(a) * r;
    n.y = termY(term) + (Math.random() - 0.5) * 20;
  }
}

// ── 時間軸 Y 值：只給「有事件」的學期分配壓縮後的層 ────────
function computeTermY() {
  termYMap.clear();
  const list = presentTerms.filter((t) => model.events.some((e) => e.term === t));
  const n = list.length;
  list.forEach((t, i) => {
    // 上=早、下=晚：index 0 在最上（最大 Y）
    const y = ((n - 1) / 2 - i) * TUNE.termGap;
    termYMap.set(t, y);
  });
}
function termY(term) { return termYMap.get(term) ?? 0; }

// ── 節點的 three 物件（霧面材質 + 自繪標籤）──────────────
function nodeThreeObject(node) {
  if (node.__obj) return node.__obj;
  const group = new THREE.Group();
  let geo, baseColor, radius, label, mono = false;

  if (node.kind === 'event') {
    radius = TUNE.eventRadius;
    geo = new THREE.SphereGeometry(radius, 24, 18);
    baseColor = C.event;
    label = node.title;
  } else if (node.kind === 'capsule') {
    radius = TUNE.capsuleRadius;
    geo = new THREE.CapsuleGeometry(radius * 0.62, radius * 1.1, 6, 14);
    baseColor = C.event.clone().lerp(C.ink, 0.12);
    label = `${node.term}｜${node.count}`;
    mono = true;
  } else {
    radius = TUNE.personRadius;
    geo = new THREE.OctahedronGeometry(radius, 0);
    baseColor = C.person;
    label = node.name;
  }

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor.clone(),
    roughness: 0.58,
    metalness: 0.12,
    emissive: baseColor.clone().multiplyScalar(0.10),
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const sprite = makeTextSprite(label, {
    color: node.kind === 'person' ? PALETTE.person : PALETTE.ink,
    mono,
    weight: node.kind === 'event' ? 700 : 400,
  });
  sprite.position.set(radius + 3.5, radius * 0.4, 0);
  group.add(sprite);

  node.__obj = group;
  node.__mesh = mesh;
  node.__mat = mat;
  node.__baseColor = baseColor.clone();
  node.__label = sprite;
  node.__labelMat = sprite.material;
  node.__radius = radius;
  return group;
}

function makeTextSprite(text, { color = '#dfe6ee', mono = false, weight = 400 } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const fontFamily = mono
    ? '"JetBrains Mono", ui-monospace, monospace'
    : '"Noto Sans TC", system-ui, sans-serif';
  const fontPx = 42;
  const font = `${weight} ${fontPx}px ${fontFamily}`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const str = String(text ?? '');
  const w = Math.ceil(measure.measureText(str).width) + 24;
  const h = fontPx + 20;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  // 極淡描邊提升在霧上的可讀性（不是發光）
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(10,14,20,0.85)';
  ctx.strokeText(str, 12, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(str, 12, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = TUNE.labelScale / 2; // world units per css px（labelScale 越大字越大）
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.center.set(0, 0.5);
  return sprite;
}

// ── 內建連線的樣式（用 accessor 控制；聚焦時整批重算）─────────
let linkFocusKeys = null; // null=無聚焦；否則是被高亮的連線 key 集合
function lkey(l) {
  const s = (l.source && l.source.id) || l.source;
  const t = (l.target && l.target.id) || l.target;
  return s + '>' + t;
}
function linkColorFor(l) {
  if (!linkFocusKeys) return PALETTE.link;
  return linkFocusKeys.has(lkey(l)) ? PALETTE.accent : PALETTE.bgDeep;
}
function linkWidthFor(l) {
  if (!linkFocusKeys) return TUNE.linkWidth;
  return linkFocusKeys.has(lkey(l)) ? TUNE.linkWidth * 2.2 : TUNE.linkWidth * 0.35;
}
export function applyLinkFocus(personId) {
  linkFocusKeys = personId ? personConnections(personId).linkKeys : null;
  // 重設 accessor 逼 3d-force-graph 重算連線材質
  Graph.linkColor(linkColorFor).linkWidth(linkWidthFor);
  if (personId) {
    const keys = linkFocusKeys;
    for (const l of Graph.graphData().links) {
      if (keys.has(lkey(l))) { try { Graph.emitParticle(l); } catch (_) {} }
    }
  }
}

// ── 每幀套用視覺狀態（focus 的退霧 / 高亮 / 進場都經過這裡）──
function startVisualLoop() {
  const tmp = new THREE.Color();
  const loop = () => {
    for (const n of nodeById.values()) {
      if (!n.__mat) continue;
      const enter = n._enter ?? 1;
      const dim = n._dim ?? 0;
      const hi = n._hi ?? 0;
      // 顏色：基底 → dim 拉向霧色、hi 拉向功能色
      tmp.copy(n.__baseColor);
      if (dim > 0) tmp.lerp(C.dim, dim * 0.82);
      if (hi > 0) tmp.lerp(C.accent, hi);
      n.__mat.color.copy(tmp);
      n.__mat.emissive.copy(tmp).multiplyScalar(0.10 + hi * 0.35);
      const op = (1 - dim * 0.92);
      n.__mat.opacity = op * enter;
      if (n.__obj) {
        const s = enter * (1 + hi * 0.12);
        n.__obj.scale.setScalar(s);
      }
      // 標籤可見性：事件永遠顯示；人物只在 hover / 聚焦時顯示（避免 47 個名字擠成一團）
      if (n.__label && n.__labelMat) {
        const hover = n._hover ?? 0;
        const show = n.kind === 'person' ? (hi > 0.02 || hover > 0.5) : (op * enter > 0.12);
        n.__label.visible = show;
        n.__labelMat.opacity = show ? Math.max(0, (1 - dim * 1.15)) * enter : 0;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ── 進場動畫（新事件飛入）──────────────────────────────
function playEntrance(ids) {
  for (const id of ids) {
    const n = nodeById.get(id);
    if (!n) continue;
    n._enter = 0;
    // 從時間軸層外側一點飛入
    if (n.x != null) {
      n.x *= 1.6; n.z *= 1.6;
    }
    animateValue(n, '_enter', 1, 900, easeOutBack);
  }
  Graph.d3ReheatSimulation();
}

// ── 學期軸標：極淡刻度線 + mono 學期名（案卷分頁）──────────
let axisGroup = null;
function buildAxis() {
  const scene = Graph.scene();
  if (axisGroup) scene.remove(axisGroup);
  axisGroup = new THREE.Group();
  scene.add(axisGroup);
  refreshAxis();
}
export function refreshAxis() {
  if (!axisGroup) return;
  while (axisGroup.children.length) axisGroup.remove(axisGroup.children[0]);
  const list = presentTerms.filter((t) => model.events.some((e) => e.term === t));
  const leftX = -230;
  for (const term of list) {
    const y = termY(term);
    // 只留學期名當卷宗分頁錨點（拿掉沒意義的橫線）；分層感由 Y 間距本身表達
    const label = makeTextSprite(term, { color: PALETTE.inkDim, mono: true, weight: 600 });
    label.position.set(leftX, y, 0);
    label.center.set(1, 0.5);
    label.material.opacity = 0.6;
    axisGroup.add(label);
  }
}

// ── 收合 / 展開 ─────────────────────────────────────────
export function isCollapsed(term) { return collapsed.has(term); }
export function clusterState() {
  return presentTerms
    .filter((t) => model.events.some((e) => e.term === t))
    .map((t) => ({ term: t, collapsed: collapsed.has(t), count: model.events.filter((e) => e.term === t).length }));
}
export function setCollapsed(term, on) {
  if (on) collapsed.add(term); else collapsed.delete(term);
}
export function reRender(animateIds) {
  const data = derive();
  Graph.graphData(data);
  refreshAxis();
  if (animateIds && animateIds.length) playEntrance(animateIds);
  handlers.onClustersChanged && handlers.onClustersChanged(clusterState());
}

// 收合：該學期事件收進膠囊；膠囊彈入
export function collapseTerm(term) {
  setCollapsed(term, true);
  Graph.graphData(derive());
  refreshAxis();
  const cap = nodeById.get('cap_' + term);
  if (cap) { cap._enter = 0; animateValue(cap, '_enter', 1, 600, easeOutBack); }
  Graph.d3ReheatSimulation();
  handlers.onClustersChanged && handlers.onClustersChanged(clusterState());
}

// 展開：事件從膠囊當時的位置散出到時間軸層
export function expandTerm(term) {
  const cap = nodeById.get('cap_' + term);
  const anchor = cap && cap.x != null ? { x: cap.x, y: cap.y, z: cap.z } : null;
  setCollapsed(term, false);
  Graph.graphData(derive());
  refreshAxis();
  for (const e of model.events) {
    if (e.term !== term) continue;
    const n = nodeById.get(e.id);
    if (!n) continue;
    if (anchor) {
      n.x = anchor.x + (Math.random() - 0.5) * 10;
      n.y = anchor.y + (Math.random() - 0.5) * 10;
      n.z = anchor.z + (Math.random() - 0.5) * 10;
      n.vx = n.vy = n.vz = 0;
    }
    n._enter = 0;
    animateValue(n, '_enter', 1, 650, easeOutBack);
  }
  Graph.d3ReheatSimulation();
  handlers.onClustersChanged && handlers.onClustersChanged(clusterState());
}

// ── 互動 ────────────────────────────────────────────────
function onNodeClick(node) {
  if (node.kind === 'event') handlers.onEventClick && handlers.onEventClick(node);
  else if (node.kind === 'person') handlers.onPersonClick && handlers.onPersonClick(node);
  else if (node.kind === 'capsule') handlers.onCapsuleClick && handlers.onCapsuleClick(node);
}

let hoverNode = null;
function onNodeHover(node) {
  if (hoverNode === node) return;
  if (hoverNode) hoverNode._hover = 0;
  hoverNode = node || null;
  if (hoverNode) hoverNode._hover = 1;
  if (container) container.style.cursor = node ? 'pointer' : '';
}

function onUserInteract() {
  const controls = Graph.controls();
  controls.autoRotate = false;
  handlers.onInteract && handlers.onInteract();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { controls.autoRotate = true; }, TUNE.idleDelayMs);
}

function onResize() {
  if (!Graph || !container) return;
  Graph.width(container.clientWidth);
  Graph.height(container.clientHeight);
}

// ── 鏡頭 ────────────────────────────────────────────────
// 用「水平展開」定鏡頭距離，讓節點維持可讀大小；很高的時間軸就讓它延伸出畫面，靠拖曳/滾輪探索。
export function frameAll(ms = 1000) {
  const ns = [...nodeById.values()].filter((n) => n.__obj && (n._enter ?? 1) > 0.2 && n.x != null);
  if (!ns.length) { try { Graph.zoomToFit(ms, 80); } catch (_) {} return; }
  let cx = 0, cy = 0, cz = 0;
  for (const n of ns) { cx += n.x; cy += n.y; cz += n.z; }
  cx /= ns.length; cy /= ns.length; cz /= ns.length;
  let maxR = 0;
  for (const n of ns) { const d = Math.hypot(n.x - cx, n.z - cz); if (d > maxR) maxR = d; }
  const dist = Math.min(760, Math.max(280, maxR * 2.4 + 170));
  Graph.cameraPosition({ x: cx, y: cy + dist * 0.12, z: cz + dist }, { x: cx, y: cy, z: cz }, ms);
}
export function getCamera() { return Graph.camera(); }
export function getControls() { return Graph.controls(); }
export function cameraTo(pos, lookAt, ms) { Graph.cameraPosition(pos, lookAt, ms); }
export function emitPulse(link) { try { Graph.emitParticle(link); } catch (_) {} }

// ── 給 focus.js 的存取原語 ───────────────────────────────
export function getNode(id) { return nodeById.get(id); }
export function allNodes() { return [...nodeById.values()]; }
export function getModel() { return model; }
export function getEvent(id) { return eventById.get(id); }
export function personEvents(personId) {
  return model.events
    .filter((e) => e.people.includes(personId))
    .sort((a, b) => a.order - b.order);
}
// 某人在目前可見圖中，牽連到的節點 id（收合時對到膠囊）與連線 key
export function personConnections(personId) {
  const nodeIds = new Set([personId]);
  const linkKeys = new Set();
  for (const e of model.events) {
    if (!e.people.includes(personId)) continue;
    const target = collapsed.has(e.term) ? 'cap_' + e.term : e.id;
    nodeIds.add(target);
    linkKeys.add(personId + '>' + target);
  }
  return { nodeIds, linkKeys };
}

// ── 小工具：requestAnimationFrame 補間（避免每個小動畫都拉 gsap）──
export function animateValue(target, prop, to, ms, ease = (t) => t) {
  const from = target[prop] ?? 0;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    target[prop] = from + (to - from) * ease(p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// controller（給 main 用；其餘模組直接 import 具名函式）
const controller = {
  render, reRender, frameAll, setCollapsed, isCollapsed, clusterState,
  getModel, getNode, personEvents,
};
