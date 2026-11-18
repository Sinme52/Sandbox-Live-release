// こもれび ころころ
// 森を飛ぶ光を好きなものに宿し、転がして森じゅうのものをくっつけていくゲーム。
import { CATALOG, FINAL, FINAL_D, BY_ID, STAGES, IMAGE_FILES } from './catalog.js';

const W = 960;
const H = 540;
const BASE_Y = 452; // 地面の画面上の高さ
const GRAB = 0.85; // 自分の直径のこの割合までのものをくっつけられる
const GROW = 0.22; // くっつけたときの成長の強さ
const TIME_LIMIT = 180;
const START_D = 7;
const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
const BGM = [262, 392, 330, 440, 294, 392, 349, 523];

const img = {};
const glow = {};
let loaded = 0;
let ready = false;
let vignette = null;
let rayTex = null;
let treeLayer = null;

let world = null;
let phase = 'intro';
let objs = [];
let ball = null;
let wisp = null;
let sparks = [];
let floats = [];
let rings = [];
let motes = [];
let counts = {};
let seen = new Set();
let stage = 0;
let zoom = 1;
let camX = 0;
let bgMix = 0;
let treeAlpha = 1;
let bgScroll = 0;
let frontScroll = 0;
let timeLeft = TIME_LIMIT;
let hovered = null;
let kbIndex = -1;
let transferTarget = null;
let transferT = 0;
let waitRelease = false;
let banner = null;
let spawnT = 0;
let comboT = 0;
let combo = 0;
let bumpCd = 0;
let warnCd = 0;
let bgmT = 0;
let bgmStep = 0;
let endT = 0;
let cleared = false;
let finalSpawned = false;
let rollHintT = 0;
let clock = 0;
let lastDraw = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const canGrab = (def, D) => (def.final ? D >= FINAL_D : def.d <= D * GRAB);
const stageFor = (D) => {
  let s = 0;
  while (s < STAGES.length - 1 && D >= STAGES[s].to) s += 1;
  return s;
};
const formatSize = (cm) => {
  if (cm < 10) return `${cm.toFixed(1)}cm`;
  if (cm < 100) return `${Math.round(cm)}cm`;
  return `${(cm / 100).toFixed(cm < 1000 ? 2 : 1)}m`;
};
// かたまりが育つほど、くっついたものも少し大きく見せて表面をびっしり埋める
const itemScale = (it, R) => Math.max((R / it.R0) ** 0.55, (R * 0.36) / Math.max(it.w, it.h));
const zoomFor = (D) => {
  const s = STAGES[stageFor(D)];
  const from = Math.max(s.from, START_D);
  const p = clamp(Math.log(D / from) / Math.log(s.to / from), 0, 1);
  return (96 + 94 * p) / D;
};

// ---------------- 素材 ----------------
function makeGlow(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.25, `rgba(${rgb},0.55)`);
  gr.addColorStop(0.6, `rgba(${rgb},0.12)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return c;
}

function makeTextures() {
  glow.gold = makeGlow('255,206,120');
  glow.white = makeGlow('255,249,222');
  glow.teal = makeGlow('150,255,222');
  glow.pink = makeGlow('255,170,200');
  glow.shadow = makeGlow('6,14,12');

  vignette = document.createElement('canvas');
  vignette.width = W / 2;
  vignette.height = H / 2;
  const v = vignette.getContext('2d');
  v.setTransform(W / 2 / 100, 0, 0, H / 2 / 100, 0, 0);
  const vg = v.createRadialGradient(50, 46, 34, 50, 50, 74);
  vg.addColorStop(0, 'rgba(6,14,22,0)');
  vg.addColorStop(1, 'rgba(6,14,22,0.62)');
  v.fillStyle = vg;
  v.fillRect(0, 0, 100, 100);

  rayTex = document.createElement('canvas');
  rayTex.width = 64;
  rayTex.height = 256;
  const r = rayTex.getContext('2d');
  const hg = r.createLinearGradient(0, 0, 64, 0);
  hg.addColorStop(0, 'rgba(255,232,170,0)');
  hg.addColorStop(0.5, 'rgba(255,232,170,1)');
  hg.addColorStop(1, 'rgba(255,232,170,0)');
  r.fillStyle = hg;
  r.fillRect(0, 0, 64, 256);
  r.globalCompositeOperation = 'destination-in';
  const vgr = r.createLinearGradient(0, 0, 0, 256);
  vgr.addColorStop(0, 'rgba(0,0,0,1)');
  vgr.addColorStop(1, 'rgba(0,0,0,0)');
  r.fillStyle = vgr;
  r.fillRect(0, 0, 64, 256);
}

// 木の層の上端が線にならないよう、上をぼかして空になじませる
function fadeTop(im) {
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  c.naturalWidth = c.width;
  c.naturalHeight = c.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  const gr = x.createLinearGradient(0, 0, 0, c.height * 0.42);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = gr;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function loadAll() {
  return Promise.all(
    IMAGE_FILES.map(
      ([key, file]) =>
        new Promise((resolve) => {
          const im = new Image();
          im.onload = async () => {
            try {
              await im.decode();
            } catch {
              // decode 非対応でも描画はできる
            }
            img[key] = im;
            loaded += 1;
            resolve();
          };
          im.onerror = () => {
            loaded += 1;
            resolve();
          };
          im.src = `assets/${file}`;
        }),
    ),
  ).then(() => {
    treeLayer = fadeTop(img.trees);
    ready = true;
  });
}

// ---------------- 世界 ----------------
function makeObj(def, x) {
  const im = img[def.id];
  const ar = im ? im.naturalWidth / im.naturalHeight : 1;
  const w = ar >= 1 ? def.d : def.d * ar;
  const h = ar >= 1 ? def.d / ar : def.d;
  return {
    def,
    x,
    w,
    h,
    alt: def.move === 'fly' ? def.d * rand(0.5, 1.5) : 0,
    dir: Math.random() < 0.5 ? -1 : 1,
    t: rand(0, 10),
    turn: rand(1.5, 5),
    wob: 0,
    y: 0,
  };
}

function buildWorld() {
  objs = [];
  sparks = [];
  floats = [];
  rings = [];
  counts = {};
  seen = new Set();
  ball = null;
  stage = 0;
  phase = 'intro';
  zoom = zoomFor(START_D);
  camX = 0;
  bgMix = 0;
  treeAlpha = 1;
  timeLeft = TIME_LIMIT;
  hovered = null;
  kbIndex = -1;
  transferTarget = null;
  banner = null;
  spawnT = 0;
  combo = 0;
  comboT = 0;
  bumpCd = 0;
  warnCd = 0;
  bgmT = 0.5;
  bgmStep = 0;
  endT = 0;
  cleared = false;
  finalSpawned = false;
  rollHintT = 7;

  // 最初に光を宿せるものを画面いっぱいに並べる
  const viewW = W / zoom;
  const lineup = ['dandelion', 'acorn', 'toadstool', 'snail', 'wildflower', 'pebble', 'pinecone', 'clover', 'ladybug'];
  lineup.forEach((id, i) => {
    const x = ((i + 0.5) / lineup.length - 0.5) * viewW * 0.9 + rand(-0.6, 0.6);
    const o = makeObj(BY_ID[id], x);
    o.intro = true;
    objs.push(o);
  });
  for (let i = 0; i < 26; i++) {
    const def = pick(CATALOG.filter((c) => c.tier === 0));
    const x = rand(0.62, 2.2) * viewW * (Math.random() < 0.5 ? -1 : 1);
    objs.push(makeObj(def, x));
  }
  objs.sort((a, b) => b.def.d - a.def.d);

  wisp = { x: -viewW * 0.3, y: -viewW * 0.2, vx: 0, vy: 0, t: 0, trail: [] };
  if (!motes.length) {
    for (let i = 0; i < 48; i++) {
      motes.push({ x: rand(0, W), y: rand(0, H), z: rand(0.3, 1.2), t: rand(0, 10), s: rand(2, 6) });
    }
  }
  world = true;
}

function spawnAround(viewZoom) {
  const vw = W / viewZoom;
  const curVW = W / zoom;
  const span = vw * 1.7;
  const center = ball ? ball.x : camX;
  for (let t = stage - 1; t <= stage + 1; t++) {
    if (t < 0 || t > 4) continue;
    const want = t === stage ? 18 : t > stage ? 4 : 10;
    let have = 0;
    for (const o of objs) if (o.def.tier === t && Math.abs(o.x - center) < span) have += 1;
    const defs = CATALOG.filter((c) => c.tier === t);
    for (let n = have; n < want; n++) {
      const reach = ball ? defs.filter((c) => c.d <= ball.D * 1.5) : defs;
      const def = t === stage && reach.length && Math.random() < 0.65 ? pick(reach) : pick(defs);
      for (let tries = 0; tries < 8; tries++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = center + side * rand(curVW * 0.56 + def.d, Math.max(span, curVW * 0.7 + def.d));
        const clash = objs.some((o) => o.def.tier >= t && Math.abs(o.x - x) < (o.w + def.d) * 0.42);
        if (!clash) {
          objs.push(makeObj(def, x));
          break;
        }
      }
    }
  }
  objs = objs.filter((o) => o.def.final || (Math.abs(o.x - center) < vw * 2.8 && o.def.d * zoom > 3));
  objs.sort((a, b) => b.def.d - a.def.d);
}

// ---------------- 光を宿す ----------------
function beginRoll(target, api) {
  const def = target.def;
  ball = {
    x: target.x,
    y: -START_D / 2,
    h: START_D / 2,
    D: START_D,
    shown: START_D,
    R: START_D / 2,
    vx: 0,
    rot: 0,
    items: [],
    coreId: def.id,
    pulse: 1,
  };
  const scale = START_D / Math.max(target.w, target.h);
  ball.items.push({
    id: def.id,
    w: target.w * scale,
    h: target.h * scale,
    a: 0,
    ratio: 0,
    fromR: 0,
    R0: START_D / 2,
    rot: 0,
    t: 1,
    flip: 1,
  });
  objs = objs.filter((o) => o !== target);
  for (const o of objs) o.intro = false;
  counts[def.id] = 1;
  phase = 'roll';
  waitRelease = api.input.pointer.down;
  addRing(ball.x, ball.y, START_D * 3, 'gold');
  sparkle(ball.x, ball.y, START_D, 30, 'gold');
  api.sfx('power');
  api.shake(5);
  floatText(`${def.name}に 光がやどった！`, ball.x, ball.y - START_D * 1.4, '#ffe9a8', 26);
}

function sparkle(x, y, size, n, kind = 'gold') {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const v = size * rand(1.2, 5);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - size, life: rand(0.5, 1.1), age: 0, size: size * rand(0.12, 0.34), kind });
  }
  if (sparks.length > 240) sparks.splice(0, sparks.length - 240);
}

function addRing(x, y, size, kind) {
  rings.push({ x, y, size, age: 0, life: 0.8, kind });
}

function floatText(text, x, y, color = '#fff3dc', size = 22) {
  const lane = floats.filter((f) => f.age < 0.5).length;
  floats.push({ text, x, y, color, size, age: 0, life: 1.5, lane });
  if (floats.length > 5) floats.shift();
}

// ---------------- くっつける ----------------
function attach(o, api) {
  const def = o.def;
  const R = ball.R;
  const oy = -(o.alt + o.y) - o.h / 2;
  const angle = Math.atan2(oy - ball.y, o.x - ball.x);
  const limit = def.final ? (ball.D * 0.8) / Math.max(o.w, o.h) : 1;
  const w = o.w * limit;
  const h = o.h * limit;
  ball.items.push({
    id: def.id,
    w,
    h,
    a: angle - ball.rot + rand(-0.35, 0.35),
    ratio: Math.sqrt(Math.random()) * 0.97, // 円の中まで均等に敷きつめる
    fromR: Math.hypot(o.x - ball.x, oy - ball.y) / R,
    R0: R,
    rot: rand(-0.5, 0.5) - ball.rot,
    t: 0,
    flip: o.dir < 0 && def.move ? -1 : 1,
  });
  counts[def.id] = (counts[def.id] || 0) + 1;
  ball.D = Math.sqrt(ball.D * ball.D + GROW * Math.min(def.d, ball.D * 1.2) ** 2);
  ball.R = ball.D / 2;
  ball.pulse = 1;

  // 古いものから順に、奥へ埋もれて消えていく
  if (ball.items.length > 150) ball.items.splice(0, ball.items.length - 150);

  const big = def.d / ball.D;
  combo = comboT > 0 ? combo + 1 : 0;
  comboT = 1.6;
  const note = NOTES[Math.min(combo, NOTES.length - 1)];
  api.tone({ type: 'triangle', from: note, to: note * 1.01, dur: 0.2, vol: 0.14 });
  api.tone({ type: 'sine', from: note * 2, dur: 0.16, vol: 0.06, delay: 0.06 });
  if (big > 0.35) {
    api.tone({ type: 'sine', from: 170, to: 60, dur: 0.24, vol: 0.2 });
    api.shake(4 + big * 8);
  }
  sparkle(o.x, oy, Math.max(def.d * 0.5, ball.D * 0.12), big > 0.35 ? 22 : 10, def.final ? 'white' : 'gold');
  addRing(o.x, oy, def.d * 1.1, 'gold');
  if (!banner && (big > 0.3 || !seen.has(def.id))) {
    floatText(`+ ${def.name}`, o.x, oy - o.h * 0.7, big > 0.35 ? '#ffe08a' : '#fff3dc', big > 0.35 ? 26 : 20);
  }
  seen.add(def.id);
  api.addScore(Math.ceil(def.d));

  const next = stageFor(ball.D);
  if (next > stage) {
    stage = next;
    banner = { text: STAGES[stage].name, age: 0, life: 2.8 };
    api.sfx('power');
    api.shake(10);
    addRing(ball.x, ball.y, ball.D * 4, 'white');
    sparkle(ball.x, ball.y, ball.D * 0.7, 46, 'white');
    spawnAround(zoomFor(ball.D));
    if (stage === 4 && !finalSpawned) {
      finalSpawned = true;
      const side = ball.vx >= 0 ? 1 : -1;
      const tree = makeObj(FINAL, ball.x + side * (W / zoomFor(ball.D)) * 1.5);
      tree.dir = 1;
      objs.unshift(tree);
    }
  }
}

// まだ大きなものは通りぬけるが、少し引っかかって揺れる
function brush(o, dt, api) {
  ball.vx *= Math.exp(-1.6 * dt);
  o.wob = Math.max(o.wob, 0.6);
  if (bumpCd > 0) return;
  bumpCd = 0.7;
  api.tone({ type: 'sine', from: 180, to: 110, dur: 0.14, vol: 0.1 });
  sparkle(ball.x, ball.y, ball.D * 0.2, 5, 'white');
  if (warnCd <= 0 && !banner) {
    warnCd = 3;
    const need = o.def.final ? FINAL_D : o.def.d / GRAB;
    floatText(`${o.def.name}まで あと${formatSize(Math.max(0.1, need - ball.D))}`, ball.x, ball.y - ball.D * 0.8, '#ffd9b8', 22);
  }
}

// ---------------- 更新 ----------------
function updateObjects(dt, center) {
  for (const o of objs) {
    o.t += dt;
    o.wob = Math.max(0, o.wob - dt * 2.5);
    const mv = o.def.move;
    if (!mv) continue;
    o.turn -= dt;
    if (o.turn <= 0) {
      o.turn = rand(1.5, 5);
      o.dir *= -1;
    }
    let sp = o.def.d * (o.def.speed || 0.5);
    if (ball && canGrab(o.def, ball.D) && Math.abs(o.x - center) < ball.R + o.def.d * 3) {
      o.dir = Math.sign(o.x - center) || 1; // 近づくと少し逃げる
      sp *= 1.7;
    }
    o.x += o.dir * sp * dt;
  }
}

function updateRoll(dt, api) {
  const { input } = api;
  if (waitRelease && !input.pointer.down) waitRelease = false;
  let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (!dir && input.pointer.down && !waitRelease) {
    const sx = W / 2 + (ball.x - camX) * zoom;
    const dx = input.pointer.x - sx;
    if (Math.abs(dx) > 16) dir = Math.sign(dx);
  }
  const vmax = ball.D * 1.9;
  ball.vx += dir * vmax * 3.2 * dt;
  if (!dir) ball.vx *= Math.exp(-2.6 * dt);
  ball.vx = clamp(ball.vx, -vmax, vmax);
  ball.x += ball.vx * dt;
  ball.rot += (ball.vx / ball.R) * dt;
  ball.shown += (ball.D - ball.shown) * Math.min(1, dt * 7);
  ball.pulse = Math.max(0, ball.pulse - dt * 2.2);
  bumpCd -= dt;
  warnCd -= dt;
  comboT -= dt;

  // 出っぱりで弾むように転がる
  let lift = ball.R;
  const start = Math.max(0, ball.items.length - 30);
  for (let i = start; i < ball.items.length; i++) {
    const it = ball.items[i];
    const down = Math.sin(it.a + ball.rot) * it.ratio * ball.R + Math.min(it.w, it.h) * itemScale(it, ball.R) * 0.42;
    if (down > lift) lift = down;
  }
  ball.h += (lift - ball.h) * Math.min(1, dt * 16);
  ball.y = -ball.h;

  for (const it of ball.items) it.t = Math.min(1, it.t + dt * 5);

  // 当たり判定
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (!o) continue; // くっつけた拍子に一覧が入れ替わることがある
    const hw = o.def.final ? o.w * 0.12 : o.w * 0.38;
    const bottom = -(o.alt + o.y);
    const top = bottom - o.h * 0.9;
    const nx = clamp(ball.x, o.x - hw, o.x + hw);
    const ny = clamp(ball.y, top, bottom);
    const dx = ball.x - nx;
    const dy = ball.y - ny;
    const r = Math.max(ball.R * 0.98, ball.h * 1.04); // 出っぱりで浮いていても足もとのものに届く
    if (dx * dx + dy * dy > r * r) continue;
    if (canGrab(o.def, ball.D)) {
      objs.splice(i, 1);
      attach(o, api);
      if (o.def.final) {
        cleared = true;
        beginEnding(api);
        return;
      }
    } else {
      brush(o, dt, api);
    }
  }

  // 残り時間
  timeLeft -= dt;
  if (timeLeft <= 10 && Math.ceil(timeLeft) !== Math.ceil(timeLeft + dt)) {
    api.tone({ type: 'sine', from: 880, dur: 0.08, vol: 0.12 });
  }
  if (timeLeft <= 0) {
    timeLeft = 0;
    beginEnding(api);
  }

  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.35;
    spawnAround(Math.min(zoom, zoomFor(ball.D)));
  }

  // やさしいBGM
  bgmT -= dt;
  if (bgmT <= 0) {
    bgmT = 0.62;
    bgmStep += 1;
    const f = BGM[bgmStep % BGM.length] * (stage >= 3 ? 0.75 : 1);
    api.tone({ type: 'sine', from: f, dur: 1.1, vol: 0.05 });
    if (bgmStep % 4 === 0) api.tone({ type: 'triangle', from: f / 2, dur: 1.6, vol: 0.05 });
  }
}

function beginEnding(api) {
  phase = 'ending';
  endT = 0;
  api.addScore(Math.round(ball.D));
  if (cleared) {
    api.addScore(Math.ceil(timeLeft) * 100);
    banner = { text: '世界樹まで、ぜんぶ光のなかへ', age: 0, life: 3 };
    addRing(ball.x, ball.y, ball.D * 6, 'white');
    sparkle(ball.x, ball.y, ball.D, 90, 'white');
    api.shake(18);
    api.sfx('power');
  } else {
    banner = { text: 'そろそろ 日がくれる…', age: 0, life: 3 };
  }
}

function updateIntro(api) {
  const { input } = api;
  const selectable = objs.filter((o) => o.intro).sort((a, b) => a.x - b.x);
  const px = input.pointer.x;
  const py = input.pointer.y;
  let best = null;
  if (input.pointer.active) {
    let bestDist = 74;
    for (const o of selectable) {
      const sx = W / 2 + (o.x - camX) * zoom;
      const sy = BASE_Y - (o.alt + o.h / 2) * zoom;
      const d = Math.hypot(px - sx, py - sy) - Math.max(o.w, o.h) * zoom * 0.35;
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
  }
  if (input.pressed.left || input.pressed.right) {
    const step = input.pressed.right ? 1 : -1;
    kbIndex = kbIndex < 0 ? Math.floor(selectable.length / 2) : (kbIndex + step + selectable.length) % selectable.length;
    input.pointer.active = false;
    api.sfx('select');
  }
  if (best) kbIndex = selectable.indexOf(best);
  hovered = best || selectable[kbIndex] || null;

  const chooseByTap = input.pointer.pressed && best;
  const chooseByKey = input.pressed.action && hovered;
  if (chooseByTap || chooseByKey) {
    transferTarget = chooseByTap ? best : hovered;
    transferT = 0;
    phase = 'transfer';
    api.sfx('select');
  }
}

export default {
  title: 'こもれび ころころ',
  howTo: '光を宿して転がそう',
  controls: ['left', 'right', 'action'],
  hud: false,

  init() {
    makeTextures();
    loadAll();
  },

  start() {
    world = null;
    if (ready) buildWorld();
  },

  update(dt, api) {
    if (!ready) return;
    if (!world) buildWorld();

    if (phase === 'intro') {
      updateIntro(api);
    } else if (phase === 'transfer') {
      transferT += dt;
      if (transferT > 0.7) beginRoll(transferTarget, api);
    } else if (phase === 'roll') {
      updateRoll(dt, api);
    } else if (phase === 'ending') {
      endT += dt;
      ball.vx *= Math.exp(-2 * dt);
      ball.x += ball.vx * dt;
      ball.rot += (ball.vx / ball.R) * dt;
      ball.shown += (ball.D - ball.shown) * Math.min(1, dt * 7);
      for (const it of ball.items) it.t = Math.min(1, it.t + dt * 5);
      if (endT > 2.6) api.gameOver();
    }

    updateObjects(dt, ball ? ball.x : camX);
    rollHintT -= phase === 'roll' ? dt : 0;

    // カメラ
    if (ball) {
      camX += (ball.x + ball.vx * 0.18 - camX) * Math.min(1, dt * 5);
      const target = zoomFor(ball.D);
      zoom = Math.exp(Math.log(zoom) + (Math.log(target) - Math.log(zoom)) * Math.min(1, dt * 2.4));
      const moved = ball.vx * zoom * dt;
      bgScroll += moved * 0.05;
      frontScroll += moved * 1.5;
    }
  },

  draw(g, api, scene) {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - (lastDraw || now));
    lastDraw = now;
    clock += dt;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'medium';
    if (!ready) {
      drawLoading(g);
      return;
    }
    if (!world) buildWorld();
    tickEffects(dt);

    drawBackdrop(g);
    drawTreeLayers(g);
    drawRays(g);
    drawMist(g);
    drawGround(g);

    g.save();
    g.translate(W / 2 - camX * zoom, BASE_Y);
    g.scale(zoom, zoom);
    drawObjects(g);
    if (ball && scene !== 'result') drawBall(g, ball.x, ball.y);
    drawEffects(g);
    if (phase === 'intro' || phase === 'transfer' || scene === 'title') drawWisp(g);
    g.restore();

    drawFront(g);
    drawMotes(g);
    g.drawImage(vignette, 0, 0, W, H);
    if (stage === 4) {
      g.fillStyle = 'rgba(255,120,60,0.06)';
      g.fillRect(0, 0, W, H);
    }

    if (scene === 'playing') {
      drawFloats(g, api);
      drawHud(g, api);
    }
  },

  drawTitle(g, api, t) {
    const top = g.createLinearGradient(0, 0, 0, 320);
    top.addColorStop(0, 'rgba(8,24,22,0.62)');
    top.addColorStop(1, 'rgba(8,24,22,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 320);
    g.globalCompositeOperation = 'lighter';
    glowAt(g, glow.gold, W / 2, 88, 620, 0.32 + Math.sin(t * 1.6) * 0.06);
    g.globalCompositeOperation = 'source-over';
    api.text('こもれび ころころ', W / 2, 84, { size: 76, color: '#fff0c2', stroke: '#2b3d22' });
    api.text('光をやどして、森じゅうのものを くっつけよう', W / 2, 146, { size: 25, weight: 700, color: '#e9f6d8', stroke: '#16291f' });
    api.text('① 飛んでいる光を、好きなものに クリック / タップ', W / 2, 188, { size: 20, weight: 700, stroke: '#16291f' });
    api.text('② 長おし または ◀ ▶ キーで 左右に ころがす', W / 2, 216, { size: 20, weight: 700, stroke: '#16291f' });
    if (!ready) {
      api.text(`森を育てています… ${Math.round((loaded / IMAGE_FILES.length) * 100)}%`, W / 2, 262, { size: 24 });
    } else if (Math.floor(t * 2) % 2 === 0) {
      api.text('タップ / スペース でスタート', W / 2, 262, { size: 30, color: '#ffe08a', stroke: '#2b2410' });
    }
    if (api.meta.requester) api.text(`お題: ${api.meta.requester}`, W / 2, H - 24, { size: 16, weight: 600, color: '#e8eedb', stroke: '#16291f' });
  },

  drawResult(g, api, info) {
    g.fillStyle = 'rgba(7,16,18,0.68)';
    g.fillRect(0, 0, W, H);
    if (ball) {
      const R = 122;
      const s = R / (ball.shown / 2);
      const appear = smooth(info.sceneTime / 0.7);
      g.save();
      g.translate(216, 276);
      g.scale(s * appear, s * appear);
      const keep = ball.rot;
      ball.rot = keep + clock * 0.5;
      drawBall(g, 0, 0, true);
      ball.rot = keep;
      g.restore();
    }
    const x = 448;
    api.text(cleared ? '世界樹まで のみこんだ！' : '森のかたまり、できあがり！', x, 66, { size: 34, align: 'left', color: '#ffe9a8' });
    api.text(ball ? formatSize(ball.D) : '-', x, 124, { size: 58, align: 'left', color: '#fff' });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    api.text(`くっつけた数 ${total}こ`, x, 176, { size: 24, weight: 700, align: 'left' });
    api.text(`SCORE ${api.score}`, x, 212, { size: 28, align: 'left', color: '#ffd36b' });
    api.text(info.newBest ? '🎉 ベスト更新！' : `BEST ${info.best}`, x + 270, 212, { size: 22, align: 'left', color: info.newBest ? '#8ff0b4' : '#d8cdb8' });

    const list = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => BY_ID[b[0]].d - BY_ID[a[0]].d)
      .slice(0, 14);
    list.forEach(([id, n], i) => {
      const cx = x + 32 + (i % 7) * 66;
      const cy = 276 + Math.floor(i / 7) * 80;
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.beginPath();
      g.arc(cx, cy, 29, 0, Math.PI * 2);
      g.fill();
      const im = img[id];
      if (im) {
        const sc = 46 / Math.max(im.naturalWidth, im.naturalHeight);
        g.drawImage(im, cx - (im.naturalWidth * sc) / 2, cy - (im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
      }
      api.text(`×${n}`, cx + 18, cy + 24, { size: 15, weight: 800 });
    });
    if (info.sceneTime > 0.8 && Math.floor(info.sceneTime * 2) % 2 === 0) {
      api.text('タップ / スペース で もう一度', x + 220, 490, { size: 26, color: '#ffe08a', stroke: '#2b2410' });
    }
  },
};

// ---------------- 演出の更新 ----------------
function tickEffects(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.age += dt;
    if (p.age >= p.life) {
      sparks.splice(i, 1);
      continue;
    }
    p.vx *= Math.exp(-2 * dt);
    p.vy = p.vy * Math.exp(-2 * dt) - (p.size * 2) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].age += dt;
    if (rings[i].age >= rings[i].life) rings.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].age += dt;
    if (floats[i].age >= floats[i].life) floats.splice(i, 1);
  }
  if (banner) {
    banner.age += dt;
    if (banner.age >= banner.life) banner = null;
  }
  bgMix += (STAGES[stage].backdrop - bgMix) * Math.min(1, dt * 1.1);
  treeAlpha += (STAGES[stage].trees - treeAlpha) * Math.min(1, dt * 1.6);

  const shift = ball ? ball.vx * zoom * dt : 0;
  for (const m of motes) {
    m.t += dt;
    m.x -= shift * m.z * 0.6 - Math.sin(m.t * 0.6) * 10 * dt;
    m.y += Math.sin(m.t * 0.9 + m.z * 4) * 12 * dt - 6 * dt;
    if (m.x < -10) m.x += W + 20;
    if (m.x > W + 10) m.x -= W + 20;
    if (m.y < -10) m.y = H + 5;
  }

  if (wisp) {
    wisp.t += dt;
    let tx;
    let ty;
    const viewW = W / zoom;
    if (phase === 'transfer' && transferTarget) {
      tx = transferTarget.x;
      ty = -(transferTarget.alt + transferTarget.h / 2);
      wisp.x += (tx - wisp.x) * Math.min(1, dt * 7);
      wisp.y += (ty - wisp.y) * Math.min(1, dt * 7);
    } else {
      tx = Math.sin(wisp.t * 0.55) * viewW * 0.36 + Math.sin(wisp.t * 1.7) * viewW * 0.06;
      ty = -(viewW * 0.22) - Math.sin(wisp.t * 1.1) * viewW * 0.07;
      if (hovered && phase === 'intro') {
        tx = hovered.x;
        ty = -(hovered.alt + hovered.h + viewW * 0.05);
      }
      wisp.x += (tx - wisp.x) * Math.min(1, dt * 2.2);
      wisp.y += (ty - wisp.y) * Math.min(1, dt * 2.2);
    }
    wisp.trail.push({ x: wisp.x, y: wisp.y, age: 0 });
    for (const p of wisp.trail) p.age += dt;
    while (wisp.trail.length && wisp.trail[0].age > 0.7) wisp.trail.shift();
  }
}

// ---------------- 描画 ----------------
function glowAt(g, tex, x, y, size, alpha = 1) {
  g.globalAlpha = clamp(alpha, 0, 1);
  g.drawImage(tex, x - size / 2, y - size / 2, size, size);
  g.globalAlpha = 1;
}

function drawLoading(g) {
  g.fillStyle = '#10241f';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(W / 2 - 160, H / 2 + 80, 320, 6);
  g.fillStyle = '#ffd98a';
  g.fillRect(W / 2 - 160, H / 2 + 80, (320 * loaded) / IMAGE_FILES.length, 6);
}

function drawCover(g, im, alpha) {
  if (!im || alpha <= 0.005) return;
  const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * 1.04;
  const iw = im.naturalWidth * s;
  const ih = im.naturalHeight * s;
  const y = (H - ih) / 2;
  const off = ((bgScroll % (iw * 2)) + iw * 2) % (iw * 2);
  g.globalAlpha = alpha;
  for (let i = -1; i <= 2; i++) {
    const x = i * iw - off + (W - iw) / 2;
    if (x > W || x + iw < 0) continue;
    if (i & 1) {
      g.save();
      g.translate(x + iw, y);
      g.scale(-1, 1);
      g.drawImage(im, 0, 0, iw + 1, ih);
      g.restore();
    } else {
      g.drawImage(im, x, y, iw + 1, ih);
    }
  }
  g.globalAlpha = 1;
}

function drawBackdrop(g) {
  const a = Math.floor(bgMix);
  const b = Math.min(2, a + 1);
  drawCover(g, img[`bg${a}`], 1);
  if (b !== a) drawCover(g, img[`bg${b}`], smooth(bgMix - a));
}

function drawOctave(g, im, worldW, alpha, anchor, parallax) {
  if (!im || alpha <= 0.01) return;
  const sw = worldW * zoom;
  const sh = (sw * im.naturalHeight) / im.naturalWidth;
  const origin = W / 2 - camX * parallax * zoom;
  const i0 = Math.floor(-origin / sw);
  const i1 = Math.floor((W - origin) / sw);
  const y = BASE_Y - sh * anchor;
  g.globalAlpha = alpha;
  for (let i = i0; i <= i1; i++) {
    const x = origin + i * sw;
    if (i & 1) {
      g.save();
      g.translate(x + sw, y);
      g.scale(-1, 1);
      g.drawImage(im, 0, 0, sw + 1, sh);
      g.restore();
    } else {
      g.drawImage(im, x, y, sw + 1, sh);
    }
  }
  g.globalAlpha = 1;
}

// 拡大率が変わっても途切れないよう、2倍ずつ大きさの違う層を重ねる
function drawOctaves(g, im, baseW, minScreen, anchor, parallax, alpha) {
  const k = Math.ceil(Math.log2(minScreen / (baseW * zoom)));
  const large = baseW * 2 ** k;
  const t = Math.log2((large * zoom) / minScreen);
  drawOctave(g, im, large / 2, smooth(t) * alpha, anchor, parallax);
  drawOctave(g, im, large, (1 - smooth((t - 0.5) / 0.5)) * alpha, anchor, parallax);
}

function drawTreeLayers(g) {
  drawOctaves(g, treeLayer, 60, 1000, 0.985, 0.55, treeAlpha);
}

function drawRays(g) {
  const strength = STAGES[stage].rays;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = 90 + i * 165 + Math.sin(clock * 0.2 + i) * 26;
    const a = strength * (0.55 + 0.45 * Math.sin(clock * 0.5 + i * 1.7));
    g.save();
    g.translate(x, -30);
    g.rotate(0.42);
    g.globalAlpha = clamp(a, 0, 1);
    g.drawImage(rayTex, -60 - i * 8, 0, 120 + i * 16, 640);
    g.restore();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawMist(g) {
  const gr = g.createLinearGradient(0, 240, 0, BASE_Y + 10);
  const tint = stage === 4 ? '255,190,150' : '226,244,214';
  gr.addColorStop(0, `rgba(${tint},0)`);
  gr.addColorStop(1, `rgba(${tint},0.3)`);
  g.fillStyle = gr;
  g.fillRect(0, 240, W, BASE_Y - 230);
}

function drawGround(g) {
  g.fillStyle = '#2e2013';
  g.fillRect(0, BASE_Y + 16, W, H - BASE_Y);
  drawOctaves(g, img.ground, 70, 820, 0.17, 1, 1);
}

function drawFront(g) {
  const im = img.front;
  if (!im) return;
  const h = 104;
  const w = (h * im.naturalWidth) / im.naturalHeight;
  const off = ((frontScroll % (w * 2)) + w * 2) % (w * 2);
  g.globalAlpha = 0.92;
  for (let i = -1; i * w - off < W; i++) {
    const x = i * w - off;
    if (i & 1) {
      g.save();
      g.translate(x + w, H - h + 8);
      g.scale(-1, 1);
      g.drawImage(im, 0, 0, w + 1, h);
      g.restore();
    } else {
      g.drawImage(im, x, H - h + 8, w + 1, h);
    }
  }
  g.globalAlpha = 1;
}

function drawMotes(g) {
  g.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const a = 0.3 + 0.35 * Math.sin(m.t * 1.4 + m.x * 0.01);
    glowAt(g, glow.gold, m.x, m.y, m.s * 3.4 * m.z, a);
  }
  g.globalCompositeOperation = 'source-over';
}

function drawSprite(g, id, x, y, w, h, rot = 0, flip = 1) {
  const im = img[id];
  if (!im) return;
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (flip < 0) g.scale(-1, 1);
  g.drawImage(im, -w / 2, -h / 2, w, h);
  g.restore();
}

function drawObjects(g) {
  const halfView = W / zoom / 2;
  const D = ball ? ball.D : START_D;
  for (const o of objs) {
    if (Math.abs(o.x - camX) > halfView + o.w) continue;
    const mv = o.def.move;
    let hop = 0;
    if (mv === 'hop') hop = Math.abs(Math.sin(o.t * 5)) * o.h * 0.16;
    if (mv === 'walk') hop = Math.abs(Math.sin(o.t * 8)) * o.h * 0.025;
    if (mv === 'fly') hop = Math.sin(o.t * 3) * o.h * 0.45;
    const bottom = -(o.alt + o.y + hop);

    // 影
    const shadowAlpha = o.alt > 0 ? 0.16 : 0.42;
    g.globalAlpha = shadowAlpha;
    g.drawImage(glow.shadow, o.x - o.w * 0.7, -o.w * 0.09, o.w * 1.4, o.w * 0.2);
    g.globalAlpha = 1;

    // くっつけられるものは、足もとがほのかに光る
    if (ball && canGrab(o.def, D) && o.def.d > D * 0.16) {
      g.globalCompositeOperation = 'lighter';
      glowAt(g, glow.gold, o.x, bottom - o.h * 0.45, Math.max(o.w, o.h) * 1.7, 0.2 + Math.sin(clock * 3 + o.t) * 0.07);
      g.globalCompositeOperation = 'source-over';
    }

    const sway = mv ? 0 : Math.sin(clock * 1.3 + o.t) * 0.018 + Math.sin(clock * 22) * o.wob * 0.1;
    g.save();
    g.translate(o.x, bottom);
    g.rotate(sway);
    if (mv && o.dir < 0) g.scale(-1, 1);
    const im = img[o.def.id];
    if (im) g.drawImage(im, -o.w / 2, -o.h, o.w, o.h);
    g.restore();

    // 選択中の印
    if (o === hovered && phase === 'intro') {
      const cy = bottom - o.h / 2;
      const r = Math.max(o.w, o.h) * 0.66 + 3 / zoom;
      g.globalCompositeOperation = 'lighter';
      glowAt(g, glow.gold, o.x, cy, r * 3, 0.5);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(255,236,170,0.95)';
      g.lineWidth = 2.5 / zoom;
      g.setLineDash([9 / zoom, 7 / zoom]);
      g.lineDashOffset = -clock * 26 / zoom;
      g.beginPath();
      g.arc(o.x, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
  }
}

function drawBall(g, cx, cy, resultView = false) {
  const R = ball.shown / 2;
  const breath = 0.5 + 0.5 * Math.sin(clock * 2.6);

  if (!resultView) {
    const groundGap = clamp(1 - (-cy - R) / R, 0.4, 1);
    g.globalAlpha = 0.55 * groundGap;
    g.drawImage(glow.shadow, cx - R * 1.5, -R * 0.2, R * 3, R * 0.42);
    g.globalAlpha = 1;
  }

  g.globalCompositeOperation = 'lighter';
  glowAt(g, glow.gold, cx, cy, R * 4.4, 0.34 + breath * 0.1 + ball.pulse * 0.3);
  g.globalCompositeOperation = 'source-over';

  // かたまりの芯
  const fill = smooth((ball.items.length - 1) / 6);
  if (fill > 0) {
    const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 0.98);
    gr.addColorStop(0, '#7f8f45');
    gr.addColorStop(0.55, '#46592f');
    gr.addColorStop(1, '#22301f');
    g.globalAlpha = fill;
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  for (const it of ball.items) {
    const e = 1 - (1 - it.t) ** 3;
    const dist = (it.fromR + (it.ratio - it.fromR) * e) * R;
    const ang = it.a + ball.rot;
    const size = itemScale(it, R) * (1 + (1 - e) * 0.3);
    drawSprite(g, it.id, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, it.w * size, it.h * size, it.rot + ball.rot, it.flip);
  }

  // 球らしい陰影
  if (fill > 0) {
    const shade = g.createRadialGradient(cx - R * 0.3, cy - R * 0.36, R * 0.25, cx, cy, R * 1.04);
    shade.addColorStop(0, 'rgba(255,244,205,0.1)');
    shade.addColorStop(0.5, 'rgba(10,18,24,0)');
    shade.addColorStop(0.9, 'rgba(8,14,26,0.34)');
    shade.addColorStop(1, 'rgba(8,14,26,0)');
    g.globalAlpha = fill;
    g.fillStyle = shade;
    g.beginPath();
    g.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // 宿った光
  g.globalCompositeOperation = 'lighter';
  glowAt(g, glow.white, cx, cy, R * (0.8 + breath * 0.16 + ball.pulse * 0.8), 0.34 + ball.pulse * 0.3);
  glowAt(g, glow.gold, cx, cy, R * 2.4, 0.14 + breath * 0.08);
  for (let i = 0; i < 3; i++) {
    const a = clock * 1.8 + (i * Math.PI * 2) / 3;
    glowAt(g, glow.white, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12, R * 0.34, 0.8);
  }
  g.globalCompositeOperation = 'source-over';
}

function drawEffects(g) {
  g.globalCompositeOperation = 'lighter';
  for (const p of sparks) {
    const k = 1 - p.age / p.life;
    glowAt(g, glow[p.kind] || glow.gold, p.x, p.y, p.size * (0.7 + k), k);
  }
  g.globalCompositeOperation = 'source-over';
  for (const r of rings) {
    const k = r.age / r.life;
    g.strokeStyle = `rgba(255,240,190,${(1 - k) * 0.8})`;
    g.lineWidth = (5 * (1 - k) + 1) / zoom;
    g.beginPath();
    g.arc(r.x, r.y, r.size * (0.2 + k * 0.8), 0, Math.PI * 2);
    g.stroke();
  }
}

function drawWisp(g) {
  if (!wisp) return;
  const unit = 1 / zoom;
  g.globalCompositeOperation = 'lighter';
  for (const p of wisp.trail) {
    const k = 1 - p.age / 0.7;
    glowAt(g, glow.gold, p.x, p.y, 34 * k * unit, 0.34 * k);
  }
  const breath = 0.5 + 0.5 * Math.sin(clock * 5);
  glowAt(g, glow.gold, wisp.x, wisp.y, (130 + breath * 34) * unit, 0.7);
  glowAt(g, glow.white, wisp.x, wisp.y, 46 * unit, 1);
  for (let i = 0; i < 3; i++) {
    const a = clock * 4 + (i * Math.PI * 2) / 3;
    glowAt(g, glow.white, wisp.x + Math.cos(a) * 24 * unit, wisp.y + Math.sin(a) * 11 * unit, 14 * unit, 0.9);
  }
  g.globalCompositeOperation = 'source-over';
}

function drawFloats(g, api) {
  for (const f of floats) {
    const k = f.age / f.life;
    const sx = clamp(W / 2 + (f.x - camX) * zoom, 90, W - 90);
    const sy = BASE_Y + f.y * zoom - k * 46 - f.lane * 30;
    g.globalAlpha = 1 - smooth((k - 0.6) / 0.4);
    api.text(f.text, sx, Math.max(100, sy), { size: f.size, color: f.color, stroke: '#14261d' });
  }
  g.globalAlpha = 1;
}

function pill(g, x, y, w, h) {
  g.fillStyle = 'rgba(10,26,24,0.5)';
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2.4);
  g.fill();
  g.strokeStyle = 'rgba(255,236,180,0.3)';
  g.lineWidth = 1.5;
  g.stroke();
}

function drawHud(g, api) {
  if (phase === 'intro' || phase === 'transfer') {
    api.text('光をやどす ものを えらぼう', W / 2, 70, { size: 38, color: '#fff0c2', stroke: '#1d3324' });
    api.text('クリック / タップ（キーボードは ◀ ▶ と スペース）', W / 2, 116, { size: 20, weight: 700, stroke: '#1d3324' });
    if (hovered && phase === 'intro') {
      const sx = clamp(W / 2 + (hovered.x - camX) * zoom, 90, W - 90);
      api.text(hovered.def.name, sx, BASE_Y + 34, { size: 22, color: '#ffe9a8', stroke: '#1d3324' });
    }
    return;
  }
  if (!ball) return;

  // 大きさと次の目標
  pill(g, 14, 12, 286, 92);
  api.text('光のかたまり', 34, 32, { size: 15, weight: 700, align: 'left', color: '#dfe9c8', stroke: null });
  api.text(formatSize(ball.shown), 34, 64, { size: 38, align: 'left', color: '#fff3c9', stroke: '#1d3324' });
  const nextDef = CATALOG.find((c) => c.d > ball.D * GRAB);
  const goal = nextDef || (ball.D < FINAL_D ? FINAL : null);
  if (goal) {
    const need = (goal.final ? FINAL_D : goal.d / GRAB) - ball.D;
    const im = img[goal.id];
    if (im) {
      const sc = 44 / Math.max(im.naturalWidth, im.naturalHeight);
      g.drawImage(im, 238 - (im.naturalWidth * sc) / 2, 46 - (im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
    }
    api.text(`つぎ: あと${formatSize(Math.max(0.1, need))}`, 34, 92, { size: 15, weight: 700, align: 'left', color: '#ffe08a', stroke: null });
  } else {
    api.text('世界樹に ぶつかろう！', 34, 92, { size: 15, weight: 700, align: 'left', color: '#ffe08a', stroke: null });
  }

  // 残り時間
  const urgent = timeLeft <= 15;
  const sec = Math.ceil(timeLeft);
  const label = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  pill(g, W / 2 - 74, 12, 148, 52);
  api.text(label, W / 2, 39, { size: urgent ? 36 + Math.sin(clock * 12) * 2 : 34, color: urgent ? '#ff9c7a' : '#fff3dc', stroke: '#1d3324' });
  api.text(`SCORE ${api.score}`, W / 2, 80, { size: 18, weight: 700, color: '#e9f0d8', stroke: '#1d3324' });

  if (rollHintT > 0 && phase === 'roll') {
    g.globalAlpha = smooth(rollHintT);
    api.text('長おしした方向へ ころがる  ◀ ▶', W / 2, 150, { size: 26, color: '#fff0c2', stroke: '#1d3324' });
    g.globalAlpha = 1;
  }

  // 世界樹の方向
  const tree = objs.find((o) => o.def.final);
  if (tree) {
    const sx = W / 2 + (tree.x - camX) * zoom;
    if (sx < 0 || sx > W) {
      const right = sx > W;
      const ax = right ? W - 90 : 90;
      api.text(right ? '世界樹 ▶' : '◀ 世界樹', ax, 200 + Math.sin(clock * 4) * 5, { size: 24, color: '#c8ffd8', stroke: '#14301f' });
    }
  }

  if (banner) {
    const k = banner.age / banner.life;
    const a = smooth(k / 0.14) * (1 - smooth((k - 0.72) / 0.28));
    g.globalAlpha = a;
    g.globalCompositeOperation = 'lighter';
    glowAt(g, glow.gold, W / 2, 214, 560, 0.34);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = a;
    api.text(banner.text, W / 2, 214, { size: 46, color: '#fff0c2', stroke: '#23331c' });
    g.globalAlpha = 1;
  }
}
