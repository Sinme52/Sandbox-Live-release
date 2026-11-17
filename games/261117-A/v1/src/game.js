// おばけ大なわとび
// 回し手のおばけと一緒に、ボタンで縄の回転（テンポ）を保つ。
// 遅すぎると縄が地面をこすり、沈んだおばけに引っかかって失敗。
// 速すぎるとおばけが浮かび、天から光がさし、さらに速いと成仏してしまう。
//
// 縄は「理想の形（目標）」＋「ばねで揺れるずれ」で動かし、地面に当たるとはね返る。

const GROUND = 470;
const HAND_Y = 300;
const LX = 205; // 左の手の位置
const RX = 755; // 右の手の位置
const CX = 480; // 跳ぶおばけの位置
const N = 26; // 縄の節の数
const TAU = Math.PI * 2;
const LAG = 0.4; // 縄の真ん中が手より遅れる量

// テンポ（1秒あたりの回転数）
const START = 1.0;
const LOW = 0.55; // これより遅いと引っかかる
const GOOD_LO = 0.8;
const GOOD_HI = 1.25;
const LIGHT = 1.45; // ここから光がさす
const HIGH = 1.9; // ここで成仏
const G_MIN = 0.3;
const G_MAX = 2.1;
const PUSH = 0.085; // 1回押したときに速くなる量

const R_MAIN = 46;
const R_TURN = 34;
const INK = '#2a2140';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

let S = null;
let stars = [];
let lastDraw = 0;

const GRAVES = [
  { x: 70, w: 38, h: 54 },
  { x: 268, w: 30, h: 40 },
  { x: 330, w: 42, h: 62 },
  { x: 612, w: 34, h: 46 },
  { x: 676, w: 26, h: 34 },
  { x: 900, w: 40, h: 58 },
];

function zoneOf(w) {
  if (w < LOW) return { name: '落ちる', pts: 0, color: '#ff4f6a' };
  if (w < GOOD_LO) return { name: 'あぶない', pts: 10, color: '#ff9a3d' };
  if (w < GOOD_HI) return { name: 'ゴキゲン', pts: 20, color: '#49d98a' };
  if (w < LIGHT) return { name: 'いい感じ', pts: 15, color: '#a6e36b' };
  return { name: 'ありがたい', pts: 50, color: '#ffe680' };
}

// ---------------- 縄 ----------------
function ropeTarget(s, phi, w) {
  const env = Math.sin(Math.PI * s);
  const A = (150 + 18 * clamp(w - 1, -0.6, 1)) * (0.25 + 0.75 * smooth(0.15, 0.6, w));
  const sag = clamp(55 / (w * w + 0.25) - 44, 0, 150); // 遅いほど重力でたるむ
  const amp = 16 + (A - 16) * env;
  const ph = phi - LAG * env;
  return {
    x: LX + (RX - LX) * s,
    y: HAND_Y - Math.cos(ph) * amp + sag * env,
    z: Math.sin(ph) * amp,
  };
}

function stepRope(dt, api) {
  const K = 140; // ばねの強さ
  const C = 7; // 減衰
  let under = 0;
  for (let i = 0; i < N; i++) {
    const p = S.rope[i];
    const T = ropeTarget(i / (N - 1), S.phi, S.omega);
    if (T.y > GROUND + 2) under++;
    if (i === 0 || i === N - 1) {
      p.x = T.x;
      p.y = T.y;
      p.z = T.z;
      continue;
    }
    p.vx += (-K * p.dx - C * p.vx) * dt;
    p.vy += (-K * p.dy - C * p.vy + 120) * dt;
    p.vz += (-K * p.dz - C * p.vz) * dt;
    p.dx += p.vx * dt;
    p.dy += p.vy * dt;
    p.dz += p.vz * dt;
    p.x = T.x + p.dx;
    p.y = T.y + p.dy;
    p.z = T.z + p.dz;
    if (p.y > GROUND) {
      // 地面にぶつかったらはね返る
      p.y = GROUND;
      p.dy = GROUND - T.y;
      if (p.vy > 0) p.vy *= -0.35;
      p.vx *= 0.8;
      p.vz *= 0.8;
    }
  }
  // 縄が地面をこすり始めた瞬間
  if (under > 0 && S.under === 0 && S.slapCD <= 0) {
    S.slapCD = 0.25;
    api.burst(CX + api.rand(-120, 120), GROUND, '#8f7fb8', 8, 140);
    if (!S.demo) api.tone({ type: 'square', from: 140, to: 50, dur: 0.1, vol: 0.14 });
  }
  S.under = under;
}

function kickRope(api, power = 1) {
  for (let i = 1; i < N - 1; i++) {
    const env = Math.sin((Math.PI * i) / (N - 1));
    const p = S.rope[i];
    p.vy -= env * api.rand(60, 130) * power;
    p.vz += env * api.rand(-70, 70) * power;
  }
}

// ---------------- 状態 ----------------
function reset(api, demo) {
  S = {
    demo,
    t: 0,
    omega: START,
    phi: Math.PI * 0.15,
    mode: 'play',
    modeT: 0,
    rope: [],
    under: 0,
    slapCD: 0,
    light: 0,
    base: 468 - 140 * ((START - LOW) / (HIGH - LOW)),
    pressFx: 0,
    jumps: 0,
    event: null,
    nextEvent: 12,
    banner: null,
    popups: [],
    sparkles: [],
    wind: [],
    landT: 0,
  };
  for (let i = 0; i < N; i++) {
    const T = ropeTarget(i / (N - 1), S.phi, S.omega);
    S.rope.push({ x: T.x, y: T.y, z: T.z, dx: 0, dy: 0, dz: 0, vx: 0, vy: 0, vz: 0 });
  }
}

function startFail(api) {
  if (S.mode !== 'play') return;
  S.mode = 'fail';
  S.modeT = 0;
  if (S.demo) return;
  api.sfx('hit');
  api.shake(16);
  api.burst(CX, GROUND - 40, '#f2c14e', 26, 280);
  api.burst(CX, GROUND - 40, '#ffffff', 14, 200);
}

function startJobutsu(api) {
  if (S.mode !== 'play') return;
  S.mode = 'jobutsu';
  S.modeT = 0;
  S.banner = null;
  if (S.demo) return;
  api.sfx('power');
  api.shake(5);
  [523, 659, 784, 1047].forEach((f, i) => api.tone({ type: 'sine', from: f, dur: 1.8, vol: 0.06, delay: 0.25 + i * 0.05 }));
}

function onBottom(api) {
  if (S.mode !== 'play') return;
  if (S.omega < LOW) {
    startFail(api);
    return;
  }
  S.landT = 0.25;
  if (S.demo) return;
  const z = zoneOf(S.omega);
  S.jumps++;
  api.addScore(z.pts);
  S.popups.push({ text: `+${z.pts}`, x: CX + 70, y: S.base - 90, age: 0, color: z.color });
  api.tone({ type: 'triangle', from: 380 + S.omega * 200, to: 600 + S.omega * 280, dur: 0.08, vol: 0.07 });
  if (S.light > 0.05) api.tone({ type: 'sine', from: 1320, to: 1318, dur: 0.35, vol: 0.05 * S.light });
}

function handleEvents(dt, api) {
  if (S.event) {
    S.event.t -= dt;
    if (S.event.t <= 0) S.event = null;
    return;
  }
  S.nextEvent -= dt;
  if (S.nextEvent > 0) return;
  const type = api.pick(['gust', 'yawn']);
  S.event = { type, t: 3.4, side: api.randInt(0, 1) };
  S.banner = {
    text: type === 'gust' ? '🌬️ 追い風！ 押しすぎ注意' : '😪 回し手があくび… 連打でささえて！',
    t: 2.4,
  };
  S.nextEvent = api.rand(8, 13);
  api.sfx('select');
}

function step(dt, api, pressed) {
  S.t += dt;
  S.modeT += dt;
  S.pressFx = Math.max(0, S.pressFx - dt);
  S.landT = Math.max(0, S.landT - dt);
  S.slapCD -= dt;

  if (S.mode === 'play') {
    if (!S.demo) handleEvents(dt, api);
    let decay = 0.13 + Math.min(0.25, S.t * 0.0035);
    if (S.t < 1.5) decay *= 0.4;
    if (S.event?.type === 'yawn') decay += 0.28;
    S.omega -= decay * (0.55 + 0.45 * S.omega) * dt;
    if (S.event?.type === 'gust') S.omega += 0.34 * dt;
    if (pressed) {
      S.omega += PUSH;
      S.pressFx = 0.18;
      kickRope(api, 0.6);
      if (!S.demo) api.tone({ type: 'triangle', from: 260 + S.omega * 160, to: 420 + S.omega * 260, dur: 0.06, vol: 0.06 });
    }
    S.omega = clamp(S.omega, 0, 2.4);
    if (S.omega >= HIGH) startJobutsu(api);
    else if (S.omega < 0.3) startFail(api);
  } else if (S.mode === 'fail') {
    S.omega *= Math.pow(0.04, dt);
    if (S.modeT > 1.6 && !S.demo) api.gameOver();
    if (S.demo && S.modeT > 2) reset(api, true);
  } else if (S.mode === 'jobutsu') {
    S.omega = HIGH;
    if (S.modeT > 2.7 && !S.demo) api.gameOver();
    if (S.demo && S.modeT > 3) reset(api, true);
  }

  // 回転と「真ん中が一番下を通った」判定
  const prevMid = S.phi - LAG - Math.PI;
  S.phi += TAU * S.omega * dt;
  const mid = S.phi - LAG - Math.PI;
  if (Math.floor(mid / TAU) > Math.floor(prevMid / TAU)) onBottom(api);

  // 縄（細かく分けて計算）
  const sub = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < sub; i++) stepRope(dt / sub, api);

  // おばけの高さはテンポで決まる
  const h = clamp((S.omega - LOW) / (HIGH - LOW), 0, 1);
  const baseTarget = S.mode === 'fail' ? GROUND - 2 : 468 - 140 * h;
  S.base += (baseTarget - S.base) * Math.min(1, dt * 5);

  // 光
  const lt = S.mode === 'jobutsu' ? 1 : smooth(LIGHT, HIGH, S.omega);
  S.light += (lt - S.light) * Math.min(1, dt * 5);
  if (S.light > 0.05 && Math.random() < S.light * dt * 30) {
    S.sparkles.push({ x: CX + api.rand(-110, 110), y: api.rand(-10, 200), vy: api.rand(30, 90), age: 0, life: api.rand(0.8, 1.6), r: api.rand(3, 7) });
  }
  for (const s of S.sparkles) {
    s.age += dt;
    s.y += s.vy * dt;
  }
  S.sparkles = S.sparkles.filter((s) => s.age < s.life);

  // 追い風の線
  if (S.event?.type === 'gust' && Math.random() < dt * 14) {
    S.wind.push({ x: -60, y: api.rand(60, 440), len: api.rand(50, 130), v: api.rand(700, 1000) });
  }
  for (const w of S.wind) w.x += w.v * dt;
  S.wind = S.wind.filter((w) => w.x < 1020);

  for (const p of S.popups) {
    p.age += dt;
    p.y -= 50 * dt;
  }
  S.popups = S.popups.filter((p) => p.age < 0.8);
  if (S.banner) {
    S.banner.t -= dt;
    if (S.banner.t <= 0) S.banner = null;
  }
}

// ---------------- 絵 ----------------
function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function drawFace(g, R, kind, t) {
  const ex = R * 0.36;
  const ey = -R * 0.08;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, R * 0.07);
  g.strokeStyle = INK;
  // ほっぺ
  g.fillStyle = kind === 'bliss' ? 'rgba(255,110,150,0.6)' : 'rgba(255,120,150,0.4)';
  ellipse(g, -R * 0.6, R * 0.2, R * 0.16, R * 0.09);
  g.fill();
  ellipse(g, R * 0.6, R * 0.2, R * 0.16, R * 0.09);
  g.fill();
  g.fillStyle = INK;

  const bigEyes = (pr) => {
    for (const sx of [-1, 1]) {
      g.fillStyle = '#fff';
      ellipse(g, sx * ex, ey, R * 0.17, R * 0.19);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      ellipse(g, sx * ex + Math.sin(t * 40 + sx) * R * 0.02, ey + R * 0.02, R * pr, R * pr);
      g.fill();
    }
  };
  const mouthO = (w, h) => {
    g.fillStyle = '#7a2a3a';
    ellipse(g, 0, R * 0.33, R * w, R * h);
    g.fill();
    g.stroke();
  };

  switch (kind) {
    case 'panic':
      bigEyes(0.06);
      mouthO(0.12, 0.17);
      g.fillStyle = '#7fd0ff';
      g.beginPath();
      g.moveTo(R * 0.78, -R * 0.62);
      g.quadraticCurveTo(R * 0.94, -R * 0.3, R * 0.78, -R * 0.26);
      g.quadraticCurveTo(R * 0.62, -R * 0.3, R * 0.78, -R * 0.62);
      g.fill();
      break;
    case 'shock':
      bigEyes(0.05);
      mouthO(0.16, 0.2);
      break;
    case 'bliss':
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(sx * ex, ey + R * 0.06, R * 0.12, Math.PI, TAU);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, R * 0.14, R * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      break;
    case 'sleepy':
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * ex - R * 0.12, ey + R * 0.02);
        g.lineTo(sx * ex + R * 0.12, ey + R * 0.02);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, R * 0.3, R * 0.08 + Math.sin(t * 3) * R * 0.03, 0, TAU);
      g.stroke();
      break;
    case 'dizzy':
      for (const sx of [-1, 1]) {
        g.beginPath();
        for (let a = 0; a < 4 * Math.PI; a += 0.3) {
          const r = (a / (4 * Math.PI)) * R * 0.17;
          const aa = a + t * 8 * sx;
          const px = sx * ex + Math.cos(aa) * r;
          const py = ey + Math.sin(aa) * r;
          if (a === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const px = -R * 0.22 + (R * 0.44 * i) / 6;
        const py = R * 0.32 + (i % 2 ? -1 : 1) * R * 0.05;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      break;
    case 'effort':
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * ex - sx * R * 0.12, ey - R * 0.1);
        g.lineTo(sx * ex + sx * R * 0.06, ey);
        g.lineTo(sx * ex - sx * R * 0.12, ey + R * 0.1);
        g.stroke();
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(-R * 0.2, R * 0.22, R * 0.4, R * 0.16, R * 0.05);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(-R * 0.2, R * 0.3);
      g.lineTo(R * 0.2, R * 0.3);
      g.stroke();
      break;
    default: // happy
      for (const sx of [-1, 1]) {
        g.fillStyle = INK;
        ellipse(g, sx * ex, ey, R * 0.1, R * 0.15);
        g.fill();
        g.fillStyle = '#fff';
        ellipse(g, sx * ex + R * 0.03, ey - R * 0.06, R * 0.035, R * 0.045);
        g.fill();
      }
      g.fillStyle = '#7a2a3a';
      g.beginPath();
      g.arc(0, R * 0.18, R * 0.19, 0, Math.PI);
      g.closePath();
      g.fill();
      g.stroke();
  }
}

// x, y は頭の中心。足元（すそ）は y + R*1.3 あたり
function drawGhost(g, x, y, R, o = {}) {
  const t = o.t ?? 0;
  const sq = o.sq ?? 0;
  g.save();
  g.globalAlpha = o.alpha ?? 1;
  g.translate(x, y + R * 1.3);
  g.rotate(o.rot ?? 0);
  g.scale((o.flip ? -1 : 1) * (1 + sq), 1 - sq);
  g.translate(0, -R * 1.3);

  const grad = g.createLinearGradient(0, -R, 0, R * 1.4);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, o.color ?? '#d9d4f5');
  g.fillStyle = grad;
  g.strokeStyle = INK;
  g.lineWidth = Math.max(2.5, R * 0.08);
  g.lineJoin = 'round';

  // 小さな手
  if (o.arms !== false) {
    const wave = Math.sin(t * 6) * 0.25 + (o.armUp ?? 0);
    for (const sx of [-1, 1]) {
      ellipse(g, sx * R * 0.98, R * 0.5 - (o.armUp ?? 0) * R * 0.4, R * 0.24, R * 0.13, sx * (-0.5 - wave));
      g.fill();
      g.stroke();
    }
  }

  g.beginPath();
  g.moveTo(-R * 1.02, R * 1.05);
  g.lineTo(-R, 0);
  g.arc(0, 0, R, Math.PI, 0);
  g.lineTo(R * 1.02, R * 1.05);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = R * 1.02 - 2.04 * R * (i / n);
    const x1 = R * 1.02 - 2.04 * R * ((i + 1) / n);
    const wob = Math.sin(t * 7 + i * 1.9) * R * 0.1;
    g.quadraticCurveTo((x0 + x1) / 2, R * 1.5 + wob, x1, R * 1.05);
  }
  g.closePath();
  if (o.glow) {
    g.shadowColor = 'rgba(255,240,180,0.95)';
    g.shadowBlur = 40 * o.glow;
  }
  g.fill();
  g.shadowBlur = 0;
  g.stroke();

  drawFace(g, R, o.face ?? 'happy', t);

  if (o.halo > 0.01) {
    g.globalAlpha = (o.alpha ?? 1) * clamp(o.halo, 0, 1);
    g.strokeStyle = '#ffd84a';
    g.lineWidth = R * 0.11;
    g.shadowColor = '#fff3a0';
    g.shadowBlur = 16;
    ellipse(g, 0, -R * 1.32 + Math.sin(t * 3) * 3, R * 0.55, R * 0.16);
    g.stroke();
    g.shadowBlur = 0;
  }
  g.restore();
}

function drawBackground(g, api) {
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#15123a');
  sky.addColorStop(1, '#3b2a60');
  g.fillStyle = sky;
  g.fillRect(0, 0, api.W, api.H);

  const t = S ? S.t : 0;
  for (const s of stars) {
    g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.tw + s.x));
    g.fillStyle = '#fff6d8';
    g.fillRect(s.x, s.y, s.r, s.r);
  }
  g.globalAlpha = 1;

  // 月
  g.save();
  g.shadowColor = 'rgba(255,240,190,0.7)';
  g.shadowBlur = 40;
  g.fillStyle = '#fff1bf';
  g.beginPath();
  g.arc(660, 96, 36, 0, TAU);
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(220,200,140,0.5)';
  ellipse(g, 648, 88, 8, 6);
  g.fill();
  ellipse(g, 672, 108, 5, 4);
  g.fill();

  // 遠くの丘
  g.fillStyle = '#271f4c';
  g.beginPath();
  g.moveTo(0, GROUND);
  for (let x = 0; x <= api.W; x += 40) g.lineTo(x, GROUND - 40 - Math.sin(x * 0.012) * 26 - Math.sin(x * 0.031) * 10);
  g.lineTo(api.W, GROUND);
  g.fill();

  // お墓
  for (const gr of GRAVES) {
    g.fillStyle = '#3a325e';
    g.strokeStyle = '#1b1636';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(gr.x - gr.w / 2, GROUND - gr.h, gr.w, gr.h + 4, [gr.w / 2, gr.w / 2, 3, 3]);
    g.fill();
    g.stroke();
    g.strokeStyle = '#272048';
    g.beginPath();
    g.moveTo(gr.x, GROUND - gr.h + 12);
    g.lineTo(gr.x, GROUND - gr.h + 30);
    g.moveTo(gr.x - 7, GROUND - gr.h + 18);
    g.lineTo(gr.x + 7, GROUND - gr.h + 18);
    g.stroke();
  }

  // 地面
  g.fillStyle = '#2b2247';
  g.fillRect(0, GROUND, api.W, api.H - GROUND);
  g.fillStyle = '#3d3166';
  g.fillRect(0, GROUND, api.W, 6);
  g.strokeStyle = '#4b3d78';
  g.lineWidth = 2;
  for (let x = 12; x < api.W; x += 47) {
    g.beginPath();
    g.moveTo(x, GROUND + 2);
    g.lineTo(x - 4, GROUND - 8);
    g.moveTo(x + 4, GROUND + 2);
    g.lineTo(x + 6, GROUND - 10);
    g.stroke();
  }
}

function drawLight(g, api) {
  const L = S.light;
  if (L < 0.01) return;
  const beam = g.createLinearGradient(0, 0, 0, GROUND);
  beam.addColorStop(0, `rgba(255,250,215,${0.65 * L})`);
  beam.addColorStop(1, `rgba(255,250,215,${0.12 * L})`);
  g.fillStyle = beam;
  const spread = 90 + 40 * Math.sin(S.t * 2);
  g.beginPath();
  g.moveTo(CX - 60, 0);
  g.lineTo(CX + 60, 0);
  g.lineTo(CX + spread + 40, GROUND);
  g.lineTo(CX - spread - 40, GROUND);
  g.fill();
  g.fillStyle = `rgba(255,255,235,${0.2 * L})`;
  g.fillRect(0, 0, api.W, api.H);
}

function ropeScreen() {
  return S.rope.map((p) => ({ x: p.x, y: p.y + p.z * 0.12, z: p.z }));
}

function drawRope(g, pts, front) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    g.lineWidth = pass === 0 ? 8 : 4.5;
    g.strokeStyle = pass === 0 ? INK : front ? '#f2c14e' : '#a8813a';
    g.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if ((a.z + b.z >= 0) !== front) continue;
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
  }
}

function turnerFace(side) {
  if (S.mode === 'jobutsu') return 'shock';
  if (S.mode === 'fail') return 'shock';
  if (S.event?.type === 'yawn' && S.event.side === side) return 'sleepy';
  if (S.pressFx > 0) return 'effort';
  if (S.omega < 0.75) return 'sleepy';
  if (S.omega > 1.55) return 'dizzy';
  return 'happy';
}

function drawTurner(g, side, hand) {
  const bx = side === 0 ? 146 : 814;
  const by = 292 + Math.sin(S.t * 3 + side) * 4;
  const sx = side === 0 ? 1 : -1;
  // 腕
  const ax = bx + sx * R_TURN * 0.85;
  const ay = by + R_TURN * 0.45;
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo((ax + hand.x) / 2, Math.max(ay, hand.y) + 10, hand.x, hand.y);
  g.stroke();
  g.strokeStyle = side === 0 ? '#cfe6ff' : '#e6d4ff';
  g.lineWidth = 8;
  g.stroke();
  // 影
  g.fillStyle = 'rgba(0,0,0,0.25)';
  ellipse(g, bx, GROUND + 6, 34, 7);
  g.fill();
  drawGhost(g, bx, by, R_TURN, {
    t: S.t + side,
    face: turnerFace(side),
    color: side === 0 ? '#b9dcff' : '#d8c2ff',
    arms: false,
    flip: side === 1,
  });
  // 手
  g.fillStyle = side === 0 ? '#e6f2ff' : '#f1e8ff';
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(hand.x, hand.y, 8, 0, TAU);
  g.fill();
  g.stroke();

  if (S.event?.type === 'yawn' && S.event.side === side) {
    const tx = bx + sx * 10;
    const ty = by - 70;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(tx - 44, ty - 18, 88, 34, 14);
    g.fill();
    g.stroke();
    g.font = '800 18px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    g.fillText('ふぁ〜…', tx, ty);
  }
}

function mainGhostPose() {
  const mid = S.phi - LAG - Math.PI;
  const b = ((1 + Math.cos(mid)) / 2) ** 4; // 縄が下を通るときに 1
  const h = clamp((S.omega - LOW) / (HIGH - LOW), 0, 1);
  const hopAmp = S.mode === 'play' ? 50 * smooth(LOW, 0.85, S.omega) * (1 - 0.6 * h) : 0;
  let bottom = S.base - hopAmp * b;
  let alpha = 1 - 0.3 * S.light;
  if (S.mode === 'jobutsu') {
    bottom -= S.modeT * S.modeT * 70 + S.modeT * 40;
    alpha = Math.max(0, 1 - S.modeT / 2.6);
  }
  const x = CX + Math.sin(S.t * 1.4) * 6;
  const y = bottom - R_MAIN * 1.3;
  let face = 'happy';
  if (S.mode === 'fail') face = 'dizzy';
  else if (S.mode === 'jobutsu' || S.light > 0.2) face = 'bliss';
  else if (S.omega < GOOD_LO) face = 'panic';
  let sq = -0.1 * b + (S.landT > 0 ? 0 : 0);
  let rot = Math.sin(S.t * 2) * 0.04;
  if (S.mode === 'fail') {
    sq = 0.22;
    rot = Math.sin(S.modeT * 18) * 0.12 * Math.max(0, 1 - S.modeT);
  }
  return { x, y, bottom, alpha, face, sq, rot, b };
}

function drawGauge(g, api) {
  const GX = 30;
  const GW = 22;
  const top = 92;
  const bot = 440;
  const gy = (w) => bot - ((clamp(w, G_MIN, G_MAX) - G_MIN) / (G_MAX - G_MIN)) * (bot - top);

  g.fillStyle = 'rgba(15,12,34,0.6)';
  g.beginPath();
  g.roundRect(GX - 14, top - 40, 104, bot - top + 56, 12);
  g.fill();
  api.text('テンポ', GX + 30, top - 22, { size: 17, color: '#fff3dc' });

  const bands = [
    [G_MIN, LOW, '#ff4f6a'],
    [LOW, GOOD_LO, '#ff9a3d'],
    [GOOD_LO, GOOD_HI, '#49d98a'],
    [GOOD_HI, LIGHT, '#a6e36b'],
    [LIGHT, HIGH, '#ffe680'],
    [HIGH, G_MAX, '#ffffff'],
  ];
  for (const [a, b, c] of bands) {
    g.fillStyle = c;
    g.fillRect(GX, gy(b), GW, gy(a) - gy(b));
  }
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(GX, top, GW, bot - top);

  const label = (str, w, color) => api.text(str, GX + GW + 6, gy(w), { size: 13, align: 'left', color, weight: 700 });
  label('成仏', (HIGH + G_MAX) / 2, '#ffffff');
  label('光', (LIGHT + HIGH) / 2, '#ffe680');
  label('ゴキゲン', (GOOD_LO + GOOD_HI) / 2, '#49d98a');
  label('落ちる', (G_MIN + LOW) / 2, '#ff4f6a');

  // 針
  const y = gy(S.omega);
  const pulse = S.pressFx > 0 ? 3 : 0;
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(GX - 6 - pulse, y - 3, GW + 12 + pulse * 2, 6, 3);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(GX - 6, y);
  g.lineTo(GX - 16, y - 8);
  g.lineTo(GX - 16, y + 8);
  g.closePath();
  g.fill();
  g.stroke();
}

export default {
  title: 'おばけ大なわとび 〜回しすぎると成仏〜',
  howTo: 'スペース / タップで縄を回そう。遅いと引っかかる、速すぎると成仏…',
  controls: ['action'],
  hud: false,

  init(api) {
    stars = Array.from({ length: 70 }, () => ({ x: api.rand(0, api.W), y: api.rand(0, 360), r: api.rand(1, 2.6), tw: api.rand(0.5, 2) }));
    reset(api, true);
  },

  start(api) {
    reset(api, false);
  },

  update(dt, api) {
    const pressed = api.input.pressed.action || api.input.pointer.pressed;
    step(dt, api, pressed);
  },

  draw(g, api, scene) {
    const now = performance.now();
    const ddt = Math.min(0.05, (now - (lastDraw || now)) / 1000);
    lastDraw = now;
    if (!S) reset(api, true);
    if (scene === 'title') {
      if (!S.demo) reset(api, true);
      step(ddt, api, S.omega < 1.02 && Math.random() < 0.25);
    }

    drawBackground(g, api);
    drawLight(g, api);

    const pts = ropeScreen();
    const pose = mainGhostPose();

    // 影
    const shadowScale = clamp(1 - (GROUND - pose.bottom) / 260, 0.3, 1);
    g.fillStyle = `rgba(0,0,0,${0.3 * shadowScale})`;
    ellipse(g, pose.x, GROUND + 6, 46 * shadowScale, 8 * shadowScale);
    g.fill();

    drawTurner(g, 0, pts[0]);
    drawTurner(g, 1, pts[N - 1]);
    drawRope(g, pts, false);
    drawGhost(g, pose.x, pose.y, R_MAIN, {
      t: S.t,
      face: pose.face,
      sq: pose.sq,
      rot: pose.rot,
      alpha: pose.alpha,
      halo: S.mode === 'jobutsu' ? 1 : smooth(0.25, 0.7, S.light),
      glow: S.light,
      armUp: pose.b * 0.6 + (S.mode === 'jobutsu' ? 0.8 : 0),
    });
    if (S.mode === 'fail') {
      // 縄がからまる
      g.strokeStyle = '#f2c14e';
      g.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        ellipse(g, pose.x, pose.y + 20 + i * 16, R_MAIN * 1.15, 12, (i - 1) * 0.25);
        g.stroke();
      }
    }
    drawRope(g, pts, true);

    // 光のきらきら
    for (const s of S.sparkles) {
      g.globalAlpha = 1 - s.age / s.life;
      g.fillStyle = '#fffbe0';
      g.beginPath();
      g.moveTo(s.x, s.y - s.r * 2);
      g.lineTo(s.x + s.r * 0.5, s.y);
      g.lineTo(s.x, s.y + s.r * 2);
      g.lineTo(s.x - s.r * 0.5, s.y);
      g.closePath();
      g.fill();
      g.fillRect(s.x - s.r * 1.6, s.y - 0.8, s.r * 3.2, 1.6);
    }
    g.globalAlpha = 1;

    // 追い風
    g.strokeStyle = 'rgba(220,235,255,0.55)';
    g.lineWidth = 3;
    for (const w of S.wind) {
      g.beginPath();
      g.moveTo(w.x, w.y);
      g.lineTo(w.x + w.len, w.y);
      g.stroke();
    }

    if (scene === 'title') return;

    // 遅すぎ警告（赤いふち）
    if (S.mode === 'play' && S.omega < GOOD_LO) {
      const a = (1 - smooth(LOW, GOOD_LO, S.omega)) * (0.35 + 0.25 * Math.sin(S.t * 12));
      const vg = g.createRadialGradient(api.W / 2, api.H / 2, 200, api.W / 2, api.H / 2, 560);
      vg.addColorStop(0, 'rgba(255,40,60,0)');
      vg.addColorStop(1, `rgba(255,40,60,${a})`);
      g.fillStyle = vg;
      g.fillRect(0, 0, api.W, api.H);
    }

    for (const p of S.popups) {
      g.globalAlpha = 1 - p.age / 0.8;
      api.text(p.text, p.x, p.y, { size: 24, color: p.color });
    }
    g.globalAlpha = 1;

    // セリフ
    let say = null;
    if (S.mode === 'fail') say = ['からまった〜！', '#ff7a8a'];
    else if (S.mode === 'jobutsu') say = ['成仏しました…🙏', '#fff6c0'];
    else if (S.omega < GOOD_LO) say = ['もっと回して〜！', '#ff9aa6'];
    else if (S.light > 0.6) say = ['ああ…ありがたい光が…', '#fff6c0'];
    else if (S.light > 0.15) say = ['なんだか まぶしい…', '#fff6c0'];
    if (say) api.text(say[0], CX, Math.max(S.mode === 'jobutsu' ? 230 : 150, pose.y - R_MAIN - 50), { size: 26, color: say[1] });

    // HUD
    api.text(`SCORE ${api.score}`, 20, 26, { size: 24, align: 'left' });
    api.text(`${S.jumps} 回`, CX, 34, { size: 34, color: '#ffd36b' });
    if (S.mode === 'play') {
      const z = zoneOf(S.omega);
      api.text(z.name, CX, 68, { size: 18, color: z.color });
    }
    if (S.banner) {
      g.globalAlpha = Math.min(1, S.banner.t * 3);
      api.text(S.banner.text, CX, 104, { size: 26, color: '#bfe3ff' });
      g.globalAlpha = 1;
    }
    drawGauge(g, api);
  },
};
