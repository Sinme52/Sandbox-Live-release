// ネオン・グラビティGP
// 真上から見たコースの絵（2048×2048）を、画面の1行ごとに「奥ほど小さく」拡大・回転して描く擬似3Dレース。
// 画像（空・マシン・街の地面）は gpt-image で作ったもの。読めなかったときは図形で代用する。

const BW = 640; // 地面を描く低解像度バッファ
const BH = 360;
const HY = 100; // バッファ上の地平線
const K = 960 / BW; // バッファ → 画面の倍率
const FOCAL = 380;
const CAM_H = 46; // カメラの高さ
const CAM_D = 110; // カメラはマシンのどれだけ後ろか
const MAP = 2048;
const HW = 58; // コースの半幅
const R = 11; // マシンの当たり半径
const MACH_W = 30; // マシンの見た目の幅（ワールド単位）
const LAPS = 3;
const STEP = 4;

// コースの形（時計回り）。Catmull-Rom 曲線でつなぐ
const CTRL = [
  [300, 1500], [300, 1100], [300, 700], [380, 420], [620, 300], [900, 330], [1000, 560],
  [960, 820], [1080, 1000], [1320, 960], [1430, 700], [1500, 420], [1700, 300], [1880, 420],
  [1880, 760], [1700, 960], [1640, 1180], [1820, 1400], [1820, 1700], [1600, 1860], [1300, 1820],
  [1150, 1600], [950, 1500], [750, 1700], [520, 1860], [340, 1780],
];
const RIVAL_COLORS = ['#ff5a6e', '#58d4ff', '#7dff7a', '#ffe14d', '#c58bff'];
const RIVAL_NAMES = ['レッド', 'アクア', 'ライム', 'ゴールド', 'バイオレット'];

let T; // コース
let mapPx, groundPx;
let bufCanvas, bctx, bufImg, bufPx;
let skyImg, playerSpr, rivalSprs;
let P, rivals, cam, phase, phaseT, raceT, lapStart, lapTimes, msg, rank, wrongT, engT, chargeT, finishRank;
let plates;
let RZ0, RZ1; // 回復レーンの範囲（サンプル番号）

// ---------------- 小道具 ----------------
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mkCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const loadImg = (src) =>
  new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${m}'${String(s).padStart(2, '0')}"${String(c).padStart(2, '0')}`;
};

// ---------------- コースづくり ----------------
function buildTrack() {
  const dense = [];
  const n = CTRL.length;
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i - 1 + n) % n], p1 = CTRL[i], p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n];
    for (let k = 0; k < 60; k++) {
      const t = k / 60, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(dense[0]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  const N = Math.round(total / STEP);
  const step = total / N;
  const x = new Float32Array(N), y = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i * step;
    while (cum[j + 1] < d) j++;
    const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * u;
    y[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * u;
  }
  const tx = new Float32Array(N), ty = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N), ang = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
    nx[i] = -ty[i]; // 進行方向の右
    ny[i] = tx[i];
    ang[i] = Math.atan2(ty[i], tx[i]);
  }
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) curv[i] = Math.abs(angDiff(ang[(i + 8) % N], ang[i]));
  T = { N, step, L: total, x, y, tx, ty, nx, ny, ang, curv };

  RZ0 = Math.round(220 / step);
  RZ1 = Math.round(620 / step);
  plates = [];
  [0.16, 0.36, 0.55, 0.72, 0.9].forEach((f, k) => {
    let i = Math.floor(f * N);
    for (let tries = 0; tries < N / 4 && T.curv[i] > 0.035; tries++) i = (i + 1) % N;
    plates.push({ i, lane: k % 2 ? 26 : -26 });
  });
}

function strokeOffset(m, off, from = 0, to = T.N, close = true) {
  m.beginPath();
  for (let k = from; k <= to; k++) {
    const i = k % T.N;
    const px = T.x[i] + T.nx[i] * off, py = T.y[i] + T.ny[i] * off;
    if (k === from) m.moveTo(px, py);
    else m.lineTo(px, py);
  }
  if (close) m.closePath();
  m.stroke();
}

// サンプル i の位置・向きを原点にした座標系（u: 進行方向, v: 右）
function alongTrack(m, i) {
  m.setTransform(T.tx[i], T.ty[i], T.nx[i], T.ny[i], T.x[i], T.y[i]);
}

function makeGroundTile(groundImg) {
  const c = mkCanvas(256, 256);
  const g = c.getContext('2d');
  if (groundImg) {
    g.drawImage(groundImg, 0, 0, 256, 256);
  } else {
    g.fillStyle = '#1d1840';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#3a2f7a';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(10, 6, 30, 0.38)';
  g.fillRect(0, 0, 256, 256);
  return c;
}

function buildMap(tile) {
  const mc = mkCanvas(MAP, MAP);
  const m = mc.getContext('2d');
  m.fillStyle = m.createPattern(tile, 'repeat');
  m.fillRect(0, 0, MAP, MAP);
  m.lineJoin = 'round';
  m.lineCap = 'round';

  // 浮いているコースの影
  m.save();
  m.translate(18, 26);
  m.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  m.lineWidth = HW * 2 + 34;
  strokeOffset(m, 0);
  m.restore();

  // ガードレール（光る柵）
  m.strokeStyle = 'rgba(40, 240, 255, 0.35)';
  m.lineWidth = HW * 2 + 28;
  strokeOffset(m, 0);
  m.strokeStyle = '#ff3fa4';
  m.lineWidth = HW * 2 + 14;
  strokeOffset(m, 0);
  m.setLineDash([22, 22]);
  m.strokeStyle = '#f4f0ff';
  strokeOffset(m, 0);
  m.setLineDash([]);

  // 路面
  m.strokeStyle = '#2b2f52';
  m.lineWidth = HW * 2;
  strokeOffset(m, 0);

  // スピード感のための横じま
  for (let i = 0; i < T.N; i += 6) {
    if ((i / 6) % 2) continue;
    alongTrack(m, i);
    m.fillStyle = 'rgba(120, 130, 220, 0.12)';
    m.fillRect(0, -HW, 6 * T.step + 0.5, HW * 2);
  }
  m.setTransform(1, 0, 0, 1, 0, 0);

  // 白線・センターライン
  m.strokeStyle = '#c9d2ff';
  m.lineWidth = 3;
  strokeOffset(m, HW - 5);
  strokeOffset(m, -HW + 5);
  m.setLineDash([26, 30]);
  m.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  strokeOffset(m, 0);
  m.setLineDash([]);

  // 回復レーン（左はし）
  m.strokeStyle = 'rgba(255, 70, 200, 0.6)';
  m.lineWidth = 30;
  m.lineCap = 'butt';
  strokeOffset(m, -HW + 20, RZ0, RZ1, false);
  for (let i = RZ0 + 4; i < RZ1 - 4; i += 10) {
    alongTrack(m, i);
    m.fillStyle = '#ffd1f4';
    m.fillRect(-2, -HW + 14, 4, 12);
    m.fillRect(-6, -HW + 18, 12, 4);
  }
  m.setTransform(1, 0, 0, 1, 0, 0);

  // ダッシュプレート
  for (const p of plates) {
    alongTrack(m, p.i);
    m.fillStyle = '#ff9a1f';
    m.fillRect(-22, p.lane - 15, 44, 30);
    m.strokeStyle = '#fff4b0';
    m.lineWidth = 4;
    m.lineCap = 'round';
    for (let c = -12; c <= 12; c += 12) {
      m.beginPath();
      m.moveTo(c - 6, p.lane - 9);
      m.lineTo(c + 4, p.lane);
      m.lineTo(c - 6, p.lane + 9);
      m.stroke();
    }
  }

  // スタートライン（市松模様）
  alongTrack(m, 0);
  const cell = (HW * 2) / 10;
  for (let c = 0; c < 10; c++) {
    for (let r = 0; r < 2; r++) {
      m.fillStyle = (c + r) % 2 ? '#111' : '#fff';
      m.fillRect(r * cell - cell, -HW + c * cell, cell, cell);
    }
  }
  m.setTransform(1, 0, 0, 1, 0, 0);

  mapPx = new Uint32Array(m.getImageData(0, 0, MAP, MAP).data.buffer);
}

// ---------------- スプライト ----------------
function tint(img, color) {
  const c = mkCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  return c;
}

function fallbackSprite(color) {
  const c = mkCanvas(160, 110);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(80, 6);
  g.lineTo(150, 80);
  g.lineTo(130, 104);
  g.lineTo(30, 104);
  g.lineTo(10, 80);
  g.closePath();
  g.fill();
  g.fillStyle = '#1a1a2e';
  g.beginPath();
  g.ellipse(80, 50, 18, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5ff';
  g.fillRect(36, 86, 26, 16);
  g.fillRect(98, 86, 26, 16);
  return c;
}

// ---------------- レースの準備 ----------------
function sampleAt(s) {
  s = ((s % T.L) + T.L) % T.L;
  const f = s / T.step;
  const i = Math.floor(f) % T.N;
  const j = (i + 1) % T.N;
  const u = f - Math.floor(f);
  return { i, x: T.x[i] + (T.x[j] - T.x[i]) * u, y: T.y[i] + (T.y[j] - T.y[i]) * u };
}

function setupRace() {
  const slot = (k) => ({ s: T.L - 40 - k * 38, lane: k % 2 ? 26 : -26 });
  const order = [0, 1, 2, 4, 5]; // 3番目のスロットがプレイヤー
  rivals = RIVAL_COLORS.map((color, k) => {
    const sl = slot(order[k]);
    return {
      s: sl.s, lane: sl.lane, tlane: sl.lane, v: 0, lap: 0, laneT: 2 + Math.random() * 2,
      base: [500, 520, 485, 535, 510][k], spr: rivalSprs[k], name: RIVAL_NAMES[k], color, x: 0, y: 0, a: 0, seed: k * 1.7,
    };
  });
  for (const r of rivals) placeRival(r);
  const ps = slot(3);
  const p = sampleAt(ps.s);
  P = {
    x: p.x + T.nx[p.i] * ps.lane, y: p.y + T.ny[p.i] * ps.lane, a: T.ang[p.i], vx: 0, vy: 0,
    idx: p.i, lap: 0, energy: 100, boost: 0, hitCd: 0, steer: 0, plateCd: 0, dead: false, sx: 480, sy: 400, charging: false,
  };
  cam = { x: 0, y: 0, a: P.a, f: FOCAL };
  updateCam(1);
  phase = 'count';
  phaseT = 0;
  raceT = 0;
  lapStart = 0;
  lapTimes = [];
  msg = null;
  rank = 4;
  wrongT = 0;
  engT = 0;
  chargeT = 0;
  finishRank = 0;
}

function placeRival(r) {
  const p = sampleAt(r.s);
  r.x = p.x + T.nx[p.i] * r.lane;
  r.y = p.y + T.ny[p.i] * r.lane;
  r.a = T.ang[p.i];
  r.idx = p.i;
}

function updateCam(k) {
  cam.a += angDiff(P.a, cam.a) * k;
  const fx = Math.cos(cam.a), fy = Math.sin(cam.a);
  cam.x = P.x - fx * CAM_D;
  cam.y = P.y - fy * CAM_D;
  cam.f = FOCAL * (1 - 0.12 * clamp(P.boost, 0, 1));
}

function locate(x, y, hint) {
  let best = hint, bd = Infinity;
  for (let k = -24; k <= 24; k++) {
    const i = (hint + k + T.N) % T.N;
    const dx = x - T.x[i], dy = y - T.y[i], d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (bd > (HW * 3) ** 2) {
    for (let i = 0; i < T.N; i++) {
      const dx = x - T.x[i], dy = y - T.y[i], d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return best;
}

const progressOf = (lap, s) => lap * T.L + s;
const playerProgress = () => progressOf(P.lap, P.idx * T.step);
const rivalProgress = (r) => progressOf(r.lap, r.s);

function showMsg(text, color = '#fff3dc', dur = 1.2, size = 56) {
  msg = { text, color, t: dur, size };
}

// ---------------- 毎フレームの処理 ----------------
function updatePlayer(dt, api, ctl) {
  P.hitCd -= dt;
  P.plateCd -= dt;
  P.boost = Math.max(0, P.boost - dt);
  P.steer += (ctl.steer - P.steer) * Math.min(1, dt * 10);

  let ca = Math.cos(P.a), sa = Math.sin(P.a);
  let fwd = P.vx * ca + P.vy * sa;
  const turn = 2.5 * (ctl.brake ? 1.4 : 1) * (0.35 + 0.65 * Math.min(1, Math.abs(fwd) / 250));
  P.a += P.steer * turn * dt;
  ca = Math.cos(P.a);
  sa = Math.sin(P.a);
  fwd = P.vx * ca + P.vy * sa;
  let lat = -P.vx * sa + P.vy * ca;

  const max = ctl.coast ? 220 : P.boost > 0 ? 790 : 545;
  if (ctl.brake) fwd = Math.max(0, fwd - 560 * dt);
  else if (fwd < max) fwd = Math.min(max, fwd + (fwd < 220 ? 430 : 250) * (1 - (fwd / max) * 0.55) * dt);
  else fwd -= (fwd - max) * 1.8 * dt;
  lat *= Math.exp(-(ctl.brake ? 3.2 : 7) * dt);
  P.vx = fwd * ca - lat * sa;
  P.vy = fwd * sa + lat * ca;
  P.x += P.vx * dt;
  P.y += P.vy * dt;

  // コースのどこにいるか
  const prev = P.idx;
  P.idx = locate(P.x, P.y, P.idx);
  const i = P.idx;
  const off = (P.x - T.x[i]) * T.nx[i] + (P.y - T.y[i]) * T.ny[i];
  const lim = HW - R;
  if (Math.abs(off) > lim) {
    const sg = Math.sign(off);
    const pen = Math.abs(off) - lim;
    P.x -= T.nx[i] * sg * pen;
    P.y -= T.ny[i] * sg * pen;
    const vn = P.vx * T.nx[i] + P.vy * T.ny[i];
    if (vn * sg > 0) {
      const impact = Math.abs(vn);
      P.vx -= T.nx[i] * vn * 1.5;
      P.vy -= T.ny[i] * vn * 1.5;
      P.vx *= 0.94;
      P.vy *= 0.94;
      if (impact > 40 && P.hitCd <= 0) {
        P.energy -= 2 + impact * 0.035;
        P.hitCd = 0.18;
        api.sfx('hit');
        api.shake(Math.min(16, 3 + impact * 0.03));
        api.burst(P.sx + sg * 50, P.sy - 20, '#ffe08a', 16, 260);
      }
    }
    // こすっている間もじわじわ減る
    P.energy -= 5 * dt;
    if (Math.random() < 0.5) api.burst(P.sx + sg * 55, P.sy - 14, '#ffd36b', 2, 180);
    // 壁に沿うように向きを少し直す
    if (Math.cos(angDiff(P.a, T.ang[i])) > 0) P.a += angDiff(T.ang[i], P.a) * Math.min(1, dt * 4);
  }

  // ラップ判定
  const d = P.idx - prev;
  if (d < -T.N / 2) onLap(api);
  else if (d > T.N / 2) P.lap -= 1;

  // 回復レーン
  P.charging = P.idx >= RZ0 && P.idx <= RZ1 && off < -HW + 40 && phase === 'race';
  if (P.charging) {
    P.energy = Math.min(100, P.energy + 24 * dt);
    chargeT -= dt;
    if (chargeT <= 0) {
      chargeT = 0.12;
      api.tone({ type: 'sine', from: 900 + P.energy * 6, dur: 0.06, vol: 0.05 });
    }
  }

  // ダッシュプレート
  if (P.plateCd <= 0) {
    for (const p of plates) {
      const di = Math.abs(((P.idx - p.i + T.N + T.N / 2) % T.N) - T.N / 2);
      if (di < 6 && Math.abs(off - p.lane) < 24) {
        P.boost = Math.max(P.boost, 1.0);
        P.vx += Math.cos(P.a) * 160;
        P.vy += Math.sin(P.a) * 160;
        P.plateCd = 0.5;
        api.sfx('jump');
        showMsg('DASH!', '#ffb54a', 0.6, 40);
      }
    }
  }

  // 逆走チェック
  const sp = Math.hypot(P.vx, P.vy);
  if (Math.cos(angDiff(P.a, T.ang[P.idx])) < -0.2 && sp > 40) wrongT += dt;
  else wrongT = 0;

  // エンジン音
  engT -= dt;
  if (engT <= 0 && phase !== 'title') {
    engT = 0.08;
    api.tone({ type: 'triangle', from: 70 + sp * 0.32, to: 74 + sp * 0.33, dur: 0.1, vol: 0.045 });
  }
}

function onLap(api) {
  P.lap += 1;
  if (P.lap <= 1) return;
  const lt = raceT - lapStart;
  lapStart = raceT;
  lapTimes.push(lt);
  if (P.lap > LAPS) {
    phase = 'goal';
    phaseT = 0;
    finishRank = rank;
    api.sfx('power');
    showMsg('FINISH!', '#49d98a', 3, 72);
  } else if (P.lap === LAPS) {
    api.sfx('power');
    showMsg('FINAL LAP', '#ffb54a', 1.6, 60);
  } else {
    api.sfx('coin');
    showMsg(`LAP ${P.lap}  ${fmt(lt)}`, '#fff3dc', 1.4, 44);
  }
}

function updateRivals(dt, api) {
  const pp = playerProgress();
  for (const r of rivals) {
    const i = Math.floor(r.s / T.step) % T.N;
    let c = 0;
    for (let k = 0; k < 50; k += 2) c = Math.max(c, T.curv[(i + k) % T.N]);
    let target = r.base * clamp(1.08 - c * 2.3, 0.58, 1.05);
    const diff = rivalProgress(r) - pp;
    if (diff > 700) target *= 0.9;
    else if (diff < -600) target *= 1.08;
    if (phase === 'count') target = 0;
    r.v += clamp(target - r.v, -420 * dt, 240 * dt);
    r.s += r.v * dt;
    if (r.s >= T.L) {
      r.s -= T.L;
      r.lap += 1;
    }
    r.laneT -= dt;
    if (r.laneT <= 0) {
      r.laneT = 1.5 + Math.random() * 2.5;
      r.tlane = (Math.random() * 2 - 1) * (HW - 18);
    }
    r.lane += clamp(r.tlane - r.lane, -36 * dt, 36 * dt);
    r.lane = clamp(r.lane, -HW + R + 2, HW - R - 2);
    placeRival(r);

    // プレイヤーとの接触
    if (!P.dead) {
      const dx = P.x - r.x, dy = P.y - r.y, d = Math.hypot(dx, dy);
      if (d < R * 2 && d > 0.01) {
        const nx = dx / d, ny = dy / d, pen = R * 2 - d;
        P.x += nx * pen;
        P.y += ny * pen;
        P.vx += nx * 110;
        P.vy += ny * 110;
        r.lane -= (nx * T.nx[r.idx] + ny * T.ny[r.idx]) * 8;
        r.tlane = r.lane;
        if (P.hitCd <= 0) {
          P.hitCd = 0.25;
          P.energy -= 3;
          api.sfx('hit');
          api.shake(6);
          api.burst(P.sx, P.sy - 30, r.color, 12, 220);
        }
      }
    }
  }
  // 順位
  if (phase === 'race') {
    let ahead = 0;
    for (const r of rivals) if (rivalProgress(r) > pp) ahead++;
    rank = ahead + 1;
  }
}

function autopilot() {
  const t = (P.idx + 14) % T.N;
  const want = Math.atan2(T.y[t] - P.y, T.x[t] - P.x);
  return { steer: clamp(angDiff(want, P.a) * 2.5, -1, 1), brake: false, coast: true };
}

// ---------------- 描画 ----------------
function renderFloor(cx, cy, a, f) {
  const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
  const out = bufPx, map = mapPx, gp = groundPx;
  for (let y = HY; y < BH; y++) {
    const z = (CAM_H * f) / (y - HY + 0.5);
    const sc = z / f;
    let wx = cx + fx * z - rx * (BW / 2) * sc;
    let wy = cy + fy * z - ry * (BW / 2) * sc;
    const dx = rx * sc, dy = ry * sc;
    let o = y * BW;
    for (let x = 0; x < BW; x++) {
      const ix = wx | 0, iy = wy | 0;
      out[o++] = ix >= 0 && iy >= 0 && ix < MAP && iy < MAP ? map[iy * MAP + ix] : gp[((iy & 255) << 8) | (ix & 255)];
      wx += dx;
      wy += dy;
    }
  }
  bctx.putImageData(bufImg, 0, 0);
}

function drawSky(g, a) {
  const hy = HY * K;
  if (!skyImg) {
    const gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#120a35');
    gr.addColorStop(1, '#b0307a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 960, hy + 2);
    return;
  }
  const th = 214, tw = (th * skyImg.width) / skyImg.height;
  let off = (-(a / (Math.PI * 2)) * tw * 4) % (tw * 2);
  if (off > 0) off -= tw * 2;
  let k = 0;
  for (let x = off; x < 960; x += tw, k++) {
    if (k % 2 === 0) g.drawImage(skyImg, x, hy - th + 4, tw, th);
    else {
      g.save();
      g.translate(x + tw, 0);
      g.scale(-1, 1);
      g.drawImage(skyImg, 0, hy - th + 4, tw, th);
      g.restore();
    }
  }
}

function project(wx, wy) {
  const dx = wx - cam.x, dy = wy - cam.y;
  const fx = Math.cos(cam.a), fy = Math.sin(cam.a);
  const z = dx * fx + dy * fy;
  if (z < 20) return null;
  const xr = -dx * fy + dy * fx;
  const s = cam.f / z;
  return { x: (BW / 2 + xr * s) * K, y: (HY + CAM_H * s) * K, s: s * K, z };
}

function drawMachine(g, spr, p, rot, t, seed, opts = {}) {
  const w = MACH_W * p.s;
  const h = (w * spr.height) / spr.width;
  const hov = (4 + Math.sin(t * 9 + seed) * 1.2) * p.s;
  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath();
  g.ellipse(p.x, p.y, w * 0.42, w * 0.09, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(p.x, p.y - hov - h / 2);
  g.rotate(rot);
  g.drawImage(spr, -w / 2, -h / 2, w, h);
  // 噴射の光
  const glow = opts.glow ?? 0.6;
  if (glow > 0) {
    g.globalCompositeOperation = 'lighter';
    for (const sx of [-0.27, 0.27]) {
      const gx = sx * w, gy = h * 0.32;
      const rr = w * (0.12 + glow * 0.1) * (0.85 + Math.random() * 0.3);
      const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
      gr.addColorStop(0, opts.boost ? 'rgba(255,240,180,0.95)' : 'rgba(200,255,255,0.8)');
      gr.addColorStop(1, opts.boost ? 'rgba(255,120,30,0)' : 'rgba(40,200,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(gx, gy, rr, 0, Math.PI * 2);
      g.fill();
      if (opts.boost) {
        g.fillStyle = 'rgba(255,170,60,0.55)';
        g.beginPath();
        g.moveTo(gx - rr * 0.5, gy);
        g.lineTo(gx, gy + rr * (2.2 + Math.random()));
        g.lineTo(gx + rr * 0.5, gy);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

function drawWorld(g, t, showPlayer) {
  drawSky(g, cam.a);
  renderFloor(cam.x, cam.y, cam.a, cam.f);
  g.imageSmoothingEnabled = false;
  g.drawImage(bufCanvas, 0, 0, BW, BH, 0, 0, 960, 540);
  g.imageSmoothingEnabled = true;
  // 遠くのもや
  const hy = HY * K;
  const haze = g.createLinearGradient(0, hy - 4, 0, hy + 90);
  haze.addColorStop(0, 'rgba(90, 30, 120, 0.95)');
  haze.addColorStop(1, 'rgba(90, 30, 120, 0)');
  g.fillStyle = haze;
  g.fillRect(0, hy - 4, 960, 94);

  // マシンを奥から順に
  const list = [];
  for (const r of rivals) {
    const p = project(r.x, r.y);
    if (p && p.z > 75 && p.z < 2600 && p.x > -200 && p.x < 1160) list.push({ p, spr: r.spr, rot: clamp(angDiff(r.a, cam.a) * 0.5, -0.4, 0.4), seed: r.seed, glow: 0.5 });
  }
  if (showPlayer && !P.dead) {
    const p = project(P.x, P.y);
    if (p) {
      P.sx = p.x;
      P.sy = p.y;
      const rot = clamp(angDiff(P.a, cam.a) * 0.7 + P.steer * 0.1, -0.4, 0.4);
      list.push({ p, spr: playerSpr, rot, seed: 0, glow: phase === 'count' ? 0.2 : P.boost > 0 ? 1 : 0.6, boost: P.boost > 0, player: true });
    }
  }
  list.sort((a, b) => b.p.z - a.p.z);
  for (const o of list) drawMachine(g, o.spr, o.p, o.rot, t, o.seed, o);
}

function drawSpeedLines(g, power) {
  g.save();
  g.strokeStyle = `rgba(255, 240, 210, ${0.25 * power})`;
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = 180 + Math.random() * 200;
    const len = 80 + Math.random() * 160;
    g.beginPath();
    g.moveTo(480 + Math.cos(a) * r0, 200 + Math.sin(a) * r0 * 0.6);
    g.lineTo(480 + Math.cos(a) * (r0 + len), 200 + Math.sin(a) * (r0 + len) * 0.6);
    g.stroke();
  }
  g.restore();
}

function drawMinimap(g) {
  const x0 = 812, y0 = 84, sz = 132, sc = sz / MAP;
  g.save();
  g.fillStyle = 'rgba(10, 8, 30, 0.55)';
  g.beginPath();
  g.roundRect(x0 - 6, y0 - 6, sz + 12, sz + 12, 10);
  g.fill();
  g.strokeStyle = 'rgba(200, 210, 255, 0.85)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= T.N; i += 8) {
    const k = i % T.N;
    const px = x0 + T.x[k] * sc, py = y0 + T.y[k] * sc;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.stroke();
  for (const r of rivals) {
    g.fillStyle = r.color;
    g.beginPath();
    g.arc(x0 + r.x * sc, y0 + r.y * sc, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ff8a2a';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x0 + P.x * sc, y0 + P.y * sc, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

function drawHud(g, api, t) {
  // 左上: ラップとタイム
  api.text(`LAP ${clamp(P.lap, 1, LAPS)}/${LAPS}`, 20, 30, { size: 30, align: 'left', color: '#ffb54a' });
  api.text(`TIME ${fmt(raceT)}`, 20, 64, { size: 22, align: 'left' });
  lapTimes.forEach((lt, k) => api.text(`L${k + 1} ${fmt(lt)}`, 20, 92 + k * 22, { size: 16, align: 'left', color: '#d8cdb8', weight: 600 }));
  // 順位
  const posColor = rank === 1 ? '#ffe14d' : rank <= 3 ? '#fff3dc' : '#c9c0d8';
  api.text(`${phase === 'goal' ? finishRank : rank}`, 34, 190, { size: 76, align: 'left', color: posColor });
  api.text(`位 / ${rivals.length + 1}`, 82, 205, { size: 22, align: 'left', color: posColor });

  // 上の真ん中: エネルギー
  const bx = 330, by = 16, bw = 300, bh = 18;
  const e = clamp(P.energy, 0, 100) / 100;
  const low = e < 0.25;
  g.fillStyle = 'rgba(10, 8, 30, 0.7)';
  g.beginPath();
  g.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8);
  g.fill();
  g.fillStyle = low ? (Math.floor(t * 6) % 2 ? '#ff3b5c' : '#7a1020') : P.charging ? '#ff7ad9' : e < 0.5 ? '#ffd14d' : '#49d98a';
  g.fillRect(bx, by, bw * e, bh);
  api.text('ENERGY', bx - 10, by + 9, { size: 16, align: 'right', weight: 700 });
  const sp = Math.hypot(P.vx, P.vy);
  api.text(`${Math.round(sp * 1.1)} km/h`, 480, 58, { size: 24, color: P.boost > 0 ? '#ffb54a' : '#fff3dc' });

  drawMinimap(g);

  // メッセージ
  if (phase === 'count') {
    const n = Math.ceil(3 - phaseT);
    api.text(n > 0 ? String(n) : 'GO!', 480, 250, { size: 110, color: n > 0 ? '#fff3dc' : '#49d98a' });
  }
  if (msg) api.text(msg.text, 480, 250, { size: msg.size, color: msg.color });
  if (wrongT > 0.6 && Math.floor(t * 3) % 2) api.text('⚠ 逆走中！', 480, 320, { size: 40, color: '#ff4f6a' });
  if (low && phase === 'race' && Math.floor(t * 2) % 2) api.text('エネルギー低下！ピンクのレーンで回復', 480, 320, { size: 24, color: '#ff7ad9' });
}

// ---------------- エンジンに渡すゲーム本体 ----------------
export default {
  title: 'ネオン・グラビティGP',
  howTo: '◀▶ ハンドル  ▼ ブレーキ  A/スペース ブースト  壁でエネルギー減',
  controls: ['left', 'right', 'down', 'action'],
  hud: false,

  async init() {
    const [sky, pl, rv, gr] = await Promise.all([
      loadImg('assets/sky.jpg'),
      loadImg('assets/player.webp'),
      loadImg('assets/rival.webp'),
      loadImg('assets/ground.jpg'),
    ]);
    skyImg = sky;
    playerSpr = pl || fallbackSprite('#ff8a2a');
    rivalSprs = RIVAL_COLORS.map((c) => (rv ? tint(rv, c) : fallbackSprite(c)));
    buildTrack();
    const tile = makeGroundTile(gr);
    groundPx = new Uint32Array(tile.getContext('2d').getImageData(0, 0, 256, 256).data.buffer);
    buildMap(tile);
    bufCanvas = mkCanvas(BW, BH);
    bctx = bufCanvas.getContext('2d');
    bufImg = bctx.createImageData(BW, BH);
    bufPx = new Uint32Array(bufImg.data.buffer);
    setupRace();
  },

  start() {
    setupRace();
  },

  update(dt, api) {
    const { input } = api;
    phaseT += dt;
    if (msg) {
      msg.t -= dt;
      if (msg.t <= 0) msg = null;
    }

    if (phase === 'count') {
      const before = Math.ceil(3 - (phaseT - dt));
      const now = Math.ceil(3 - phaseT);
      if (now !== before) api.tone({ type: 'square', from: now > 0 ? 520 : 1040, dur: now > 0 ? 0.15 : 0.4, vol: 0.12 });
      if (phaseT >= 3) {
        phase = 'race';
        phaseT = 0;
      }
    } else if (phase === 'race') {
      raceT += dt;
      // 操作（キー・ボタン、または画面の左右タッチ）
      let steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (!steer && input.pointer.down) steer = clamp((input.pointer.x - 480) / 220, -1, 1);
      const brake = input.down;
      if (input.pressed.action) {
        if (P.energy > 22 && P.boost <= 0.2) {
          P.boost = 1.6;
          P.energy -= 12;
          P.vx += Math.cos(P.a) * 120;
          P.vy += Math.sin(P.a) * 120;
          api.sfx('power');
          api.shake(4);
          showMsg('BOOST!', '#ffb54a', 0.6, 40);
        } else api.sfx('select');
      }
      updatePlayer(dt, api, { steer, brake });
      if (P.energy <= 0) {
        P.energy = 0;
        P.dead = true;
        phase = 'retire';
        phaseT = 0;
        api.sfx('explode');
        api.shake(22);
        api.burst(P.sx, P.sy - 30, '#ff7a3d', 50, 420);
        api.burst(P.sx, P.sy - 30, '#ffe14d', 30, 300);
        showMsg('CRASH!', '#ff4f6a', 2, 72);
      }
    } else if (phase === 'goal') {
      updatePlayer(dt, api, autopilot());
      if (phaseT > 3) {
        const posBonus = [10000, 7000, 5000, 3500, 2500, 1500][finishRank - 1];
        const timeBonus = Math.max(0, Math.round((170 - raceT) * 40));
        const energyBonus = Math.round(P.energy * 20);
        api.score = posBonus + timeBonus + energyBonus;
        api.gameOver({
          title: finishRank === 1 ? '🏆 1位でゴール！' : `${finishRank}位でゴール！`,
          sub: `タイム ${fmt(raceT)}　順位 +${posBonus}　タイム +${timeBonus}　エネルギー +${energyBonus}`,
          color: finishRank === 1 ? '#ffe14d' : '#49d98a',
          sound: 'power',
        });
      }
    } else if (phase === 'retire') {
      if (phaseT > 2) {
        api.score = Math.max(0, Math.round(playerProgress() / 10));
        api.gameOver({ title: 'リタイア…', sub: 'エネルギーが0になった。壁にぶつかりすぎに注意！', color: '#ff4f6a' });
      }
    }

    updateRivals(dt, api);
    if (phase !== 'retire') updateCam(Math.min(1, dt * 7));
  },

  draw(g, api, scene) {
    if (!T) return;
    const t = performance.now() / 1000;
    if (scene === 'title') {
      // タイトル画面: コースを自動で走るカメラ
      const s = (t * 300) % T.L;
      const p = sampleAt(s);
      let ax = 0, ay = 0;
      for (let k = 0; k < 40; k += 2) {
        ax += T.tx[(p.i + k) % T.N];
        ay += T.ty[(p.i + k) % T.N];
      }
      cam.a = Math.atan2(ay, ax);
      cam.x = p.x;
      cam.y = p.y;
      cam.f = FOCAL;
      drawWorld(g, t, false);
      return;
    }
    drawWorld(g, t, true);
    if (P.boost > 0 && scene === 'playing') drawSpeedLines(g, Math.min(1, P.boost));
    if (P.charging) {
      g.fillStyle = `rgba(255, 90, 210, ${0.08 + Math.sin(t * 12) * 0.04})`;
      g.fillRect(0, 0, 960, 540);
    }
    if (scene === 'playing') drawHud(g, api, t);
  },
};
