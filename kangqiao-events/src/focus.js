// ─────────────────────────────────────────────────────────────
// focus.js — 招牌動作：點一個人物節點，其餘沉進景深霧、鏡頭聚焦、
//            他牽連的線一條條被拉出。整站只在這一處砸膽量。
// ─────────────────────────────────────────────────────────────
import gsap from 'gsap';
import {
  allNodes, getNode, personConnections, personEvents, applyLinkFocus,
  getCamera, getControls, cameraTo,
} from './graph.js';

let current = null;

export function isFocused() { return current != null; }
export function focusedPerson() { return current; }

export function focusPerson(personId) {
  const self = getNode(personId);
  if (!self) return;
  current = personId;
  getControls().autoRotate = false;

  const { nodeIds } = personConnections(personId);

  // 節點：相關的浮出、其餘沉入霧
  for (const n of allNodes()) {
    const related = nodeIds.has(n.id);
    const hi = n.id === personId ? 1 : related ? 0.8 : 0;
    gsap.to(n, { _dim: related ? 0 : 1, _hi: hi, duration: 0.55, ease: 'power2.out' });
  }

  // 連線：相關的高亮成橘色 + 放出粒子（像被拉出的線），其餘沉入底色
  applyLinkFocus(personId);

  moveCameraTo(nodeIds);
}

export function clearFocus(reframe = true) {
  if (!current) return;
  current = null;
  for (const n of allNodes()) gsap.to(n, { _dim: 0, _hi: 0, duration: 0.5, ease: 'power2.out' });
  applyLinkFocus(null);
  if (reframe) {
    import('./graph.js').then((g) => g.frameAll(900));
  }
}

function moveCameraTo(nodeIds) {
  const pts = [...nodeIds].map(getNode).filter((n) => n && n.x != null);
  if (!pts.length) return;
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) { c.x += p.x; c.y += p.y; c.z += p.z; }
  c.x /= pts.length; c.y /= pts.length; c.z /= pts.length;

  let spread = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    if (d > spread) spread = d;
  }
  const dist = Math.min(520, Math.max(110, spread * 2.3 + 70));

  // 保留當前視角方向，只把鏡頭重新框到此人重心
  const cam = getCamera();
  let dir = { x: cam.position.x - c.x, y: cam.position.y - c.y, z: cam.position.z - c.z };
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const pos = { x: c.x + dir.x * dist, y: c.y + dir.y * dist * 0.8 + spread * 0.2, z: c.z + dir.z * dist };
  cameraTo(pos, c, 900);
}

export { personEvents };
