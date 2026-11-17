// まわれ！ゆきだまリング
// 大きな輪っかの内側が雪の大地。◀▶ で大地をまわして雪玉を大きくし、
// 障害物と犬をジャンプでよける。ぶつかった時点で雪玉の大きさが決まり、
// 2つの雪玉で雪だるまを作る。大きいほど高得点。

const CX = 480; // 輪の中心（太陽）
const CY = 185;
const R = 315; // 雪の表面の半径（画面下 y=500 が足もと）
const PA = Math.PI / 2; // プレイヤーがいる画面上の角度（真下）
const TAU = Math.PI * 2;
const CIRC = TAU * R;
const BINS = 360;
const KID_H = 76;
const GRAV = 1300;

const OBST = {
  rock: { img: 'rock', w: 66, hw: 54, hh: 46 },
  stump: { img: 'stump', w: 68, hw: 56, hh: 44 },
  pine: { img: 'pine', w: 62, hw: 34, hh: 78 },
};

const IMG_FILES = {
  sky: 'assets/sky.jpg',
  rock: 'assets/rock.webp',
  stump: 'assets/stump.webp',
  pine: 'assets/pine.webp',
  dog: 'assets/dog.webp',
  kidStand: 'assets/kid-stand.webp',
  kidA: 'assets/kid-push-a.webp',
  kidB: 'assets/kid-push-b.webp',
  kidJump: 'assets/kid-jump.webp',
};
const img = {};

let S = null; // ゲームの状態
let titleRot = 0;
const deco = []; // 背景の小さな木
const flakes = [];

const wrapPI = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

function loadImages() {
  return Promise.all(
    Object.entries(IMG_FILES).map(
      ([k, src]) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            img[k] = im;
            res();
          };
          im.onerror = () => res();
          im.src = src;
        }),
    ),
  );
}

// ---------- 座標変換 ----------
// ローカル座標: x = 足もとからの地面に沿った距離（右が +）、h = 地面からの高さ
function toScreen(lx, h, rot = 0) {
  const phi = PA - lx / R;
  const rho = R - h;
  return { x: CX + rho * Math.cos(phi), y: CY + rho * Math.sin(phi), a: phi - PA };
}
// 世界の角度 → ローカル x
const localX = (wa, rot) => wrapPI(PA - (wa + rot)) * R;
// ローカル x → 世界の角度
const worldA = (lx, rot) => PA - lx / R - rot;
const binOf = (wa) => {
  let i = Math.floor(((wa % TAU) + TAU) % TAU / TAU * BINS);
  return Math.min(BINS - 1, Math.max(0, i));
};

// ---------- ラウンドの準備 ----------
function makeObstacles(rot, n) {
  const list = [];
  const types = Object.keys(OBST);
  const span = CIRC - 480;
  for (let i = 0; i < n; i++) {
    const lx = 240 + (span * i) / (n - 1) + (Math.random() - 0.5) * 90;
    const type = types[Math.floor(Math.random() * types.length)];
    list.push({ wa: worldA(lx, rot), type });
  }
  return list;
}

function makeDog(rot) {
  const side = Math.random() < 0.5 ? 1 : -1;
  const speed = (150 + Math.random() * 90) / R;
  return {
    wa: worldA(CIRC / 2 - 30, rot),
    v: speed * side,
    turnT: 3 + Math.random() * 4,
    barked: false,
    hop: 0,
    leg: Math.random() * 10,
  };
}

function startRound(api, round) {
  const rot = S ? S.rot : 0;
  S.round = round;
  S.phase = 'roll';
  S.r = 10;
  S.omega = 0;
  S.jumpY = 0;
  S.vy = 0;
  S.grounded = true;
  S.jumpBuf = 0;
  S.spin = 0;
  S.walkT = 0;
  S.facing = 1;
  S.kidX = -(S.r + 22);
  S.safe = 1.2;
  S.roundTime = 0;
  S.nextMark = 30;
  S.obstacles = makeObstacles(rot, round === 1 ? 4 : 5);
  S.dogs = [makeDog(rot)];
  S.dogTimer = 10;
  S.snow.fill(1);
  S.msg = { text: round === 1 ? '1こめの雪玉をつくろう！' : '2こめの雪玉！ もういっかい', t: 2 };
}

// ---------- 当たり判定 ----------
function circleRect(cx, cy, r, x0, y0, x1, y1) {
  const nx = Math.max(x0, Math.min(cx, x1));
  const ny = Math.max(y0, Math.min(cy, y1));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function crash(api, cause) {
  const d = Math.round(S.r * 2);
  S.balls.push(S.r);
  api.sfx('hit');
  api.shake(16);
  const p = toScreen(0, S.jumpY + S.r);
  api.burst(p.x, p.y, '#ffffff', 40, 320);
  api.burst(p.x, p.y, '#bfe3ff', 20, 200);
  S.phase = 'crash';
  S.crashT = 0;
  S.crashCause = cause;
  S.omega = 0;
  S.msg = { text: `${S.round}こめ決定！ 直径 ${d}cm`, t: 2.2, big: true };
}

// ---------- 雪だるま ----------
function snowmanResult() {
  const [a, b] = S.balls;
  const body = Math.max(a, b);
  const head = Math.min(a, b);
  const height = Math.round(body * 2 + head * 2 * 0.92);
  const ratio = head / body;
  const bonus = ratio >= 0.55 && ratio <= 0.82 ? 1.3 : 1;
  const score = Math.round(height * 10 * bonus);
  return { body, head, height, ratio, bonus, score };
}

function drawBall(g, x, y, r, spin, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#eef5ff');
  grad.addColorStop(1, '#b9cfe8');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.lineWidth = Math.max(2, r * 0.06);
  g.strokeStyle = '#7f9cc0';
  g.stroke();
  // 転がっているのがわかる模様
  g.rotate(spin);
  g.strokeStyle = 'rgba(140,170,210,0.55)';
  g.lineWidth = Math.max(1.5, r * 0.05);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * TAU;
    g.beginPath();
    g.arc(Math.cos(ang) * r * 0.55, Math.sin(ang) * r * 0.55, r * 0.22, ang, ang + 2);
    g.stroke();
  }
  g.restore();
}

function drawSprite(g, im, lx, h, height, face = 1, rot = 0, alpha = 1) {
  if (!im) return;
  const p = toScreen(lx, h);
  const w = (im.width / im.height) * height;
  g.save();
  g.globalAlpha = alpha;
  g.translate(p.x, p.y);
  g.rotate(p.a + rot);
  g.scale(face, 1);
  g.drawImage(im, -w / 2, -height, w, height);
  g.restore();
}

function kidImage() {
  if (!S || S.phase === 'build') return img.kidStand;
  if (!S.grounded) return img.kidJump || img.kidA;
  if (Math.abs(S.omega) * R > 30) return Math.floor(S.walkT) % 2 === 0 ? img.kidA : img.kidB;
  return img.kidA || img.kidStand;
}

export default {
  title: null,
  howTo: '◀ ▶ で大地をまわして雪玉を大きく！ スペース / A でジャンプ',
  controls: ['left', 'right', 'action'],
  hud: false,

  async init() {
    await loadImages();
    for (let i = 0; i < 14; i++) deco.push({ wa: (i / 14) * TAU + Math.random() * 0.2, s: 0.35 + Math.random() * 0.25 });
    for (let i = 0; i < 46; i++) flakes.push({ a: Math.random() * TAU, d: Math.random() * R, v: 12 + Math.random() * 22, s: 1 + Math.random() * 2 });
  },

  start(api) {
    S = { rot: titleRot, snow: new Float32Array(BINS).fill(1), balls: [], msg: null };
    startRound(api, 1);
  },

  update(dt, api) {
    const { input } = api;
    if (S.msg) {
      S.msg.t -= dt;
      if (S.msg.t <= 0) S.msg = null;
    }

    if (S.phase === 'crash') {
      S.crashT += dt;
      S.jumpY = Math.max(0, S.jumpY + S.vy * dt);
      S.vy -= GRAV * dt;
      if (S.crashT > 2.2) {
        if (S.balls.length < 2) startRound(api, 2);
        else {
          S.phase = 'build';
          S.buildT = 0;
          S.result = snowmanResult();
          S.counted = 0;
          S.dogs = [];
          S.jumpY = 0;
        }
      }
      return;
    }

    if (S.phase === 'build') {
      const prev = S.buildT;
      S.buildT += dt;
      const res = S.result;
      if (prev < 0.9 && S.buildT >= 0.9) {
        api.sfx('hit');
        api.shake(10);
        const p = toScreen(0, 0);
        api.burst(p.x, p.y - 40, '#ffffff', 30, 260);
      }
      if (prev < 1.5 && S.buildT >= 1.5) {
        api.sfx('power');
        const p = toScreen(0, 0);
        api.burst(p.x, p.y - 120, '#ffd36b', 30, 300);
      }
      if (S.buildT > 1.8 && S.counted < res.score) {
        const step = Math.max(1, Math.ceil(res.score * dt * 0.9));
        const add = Math.min(step, res.score - S.counted);
        S.counted += add;
        api.addScore(add);
        if (Math.random() < 0.3) api.tone({ type: 'triangle', from: 700 + Math.random() * 300, dur: 0.04, vol: 0.08 });
        if (S.counted >= res.score) api.sfx('coin');
      }
      const go = input.pressed.action || input.pointer.pressed;
      if (S.buildT > 2.5 && S.counted >= res.score && go) api.gameOver();
      return;
    }

    // ---------- 転がしフェーズ ----------
    S.roundTime += dt;
    S.safe = Math.max(0, S.safe - dt);

    // 入力（キー・ボタン、または画面の左右をおさえる）
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ptr = input.pointer;
    if (!dir && ptr.down) {
      if (ptr.x < 300) dir = -1;
      else if (ptr.x > 660) dir = 1;
    }
    let jumpPress = input.pressed.action || input.pressed.up;
    if (ptr.pressed && ptr.x >= 300 && ptr.x <= 660) jumpPress = true;
    if (jumpPress) S.jumpBuf = 0.12;
    else S.jumpBuf = Math.max(0, S.jumpBuf - dt);

    // 大地の回転（雪玉が大きいほど速く転がる）
    const vmax = 230 + S.r * 1.2;
    const target = (dir * vmax) / R;
    const k = dir ? 4 : 2.5;
    S.omega += (target - S.omega) * Math.min(1, dt * k);
    if (dir) S.facing = dir;
    const dRot = S.omega * dt;
    S.rot += dRot;
    const ds = Math.abs(dRot) * R;

    // 子供は雪玉のうしろ
    const kidTarget = -S.facing * (S.r + 22);
    S.kidX += (kidTarget - S.kidX) * Math.min(1, dt * 10);
    S.walkT += ds / 26;

    // ジャンプ（雪玉もいっしょに）
    if (S.grounded && S.jumpBuf > 0) {
      const hmax = api.clamp(165 - S.r * 0.4, 95, 165);
      S.vy = Math.sqrt(2 * GRAV * hmax);
      S.grounded = false;
      S.jumpBuf = 0;
      api.sfx('jump');
    }
    if (!S.grounded) {
      S.jumpY += S.vy * dt;
      S.vy -= GRAV * dt;
      if (S.jumpY <= 0) {
        S.jumpY = 0;
        S.vy = 0;
        S.grounded = true;
        const p = toScreen(0, 0);
        api.burst(p.x, p.y, '#ffffff', 8, 120);
      }
    }

    // 雪を集めて大きくなる
    S.spin += (S.omega * R * dt) / S.r;
    if (S.grounded && ds > 0) {
      const center = binOf(worldA(0, S.rot));
      const halfBins = Math.max(1, Math.round(((S.r * 0.5) / CIRC) * BINS));
      let sum = 0;
      for (let o = -halfBins; o <= halfBins; o++) {
        const i = (center + o + BINS) % BINS;
        sum += S.snow[i];
        S.snow[i] *= Math.exp((-ds / (halfBins * 2 * (CIRC / BINS))) * 0.35);
      }
      const depth = sum / (halfBins * 2 + 1);
      S.r += (0.55 * depth * ds) / S.r;
      if (Math.random() < ds * 0.05) {
        const p = toScreen(-S.facing * S.r * 0.8, 4);
        api.burst(p.x, p.y, '#ffffff', 2, 90);
      }
      if (S.r * 2 >= S.nextMark) {
        api.sfx('coin');
        const p = toScreen(0, S.r * 2);
        api.burst(p.x, p.y, '#bfe3ff', 10, 150);
        S.msg = { text: `${S.nextMark}cm!`, t: 0.8, small: true };
        S.nextMark += 30;
      }
    }
    // 雪はまた積もる
    for (let i = 0; i < BINS; i++) S.snow[i] = Math.min(1, S.snow[i] + dt * 0.06);

    // 犬
    S.dogTimer -= dt;
    if (S.dogTimer <= 0 && S.dogs.length < 3) {
      S.dogs.push(makeDog(S.rot));
      S.dogTimer = 12;
    }
    for (const d of S.dogs) {
      d.wa += d.v * dt;
      d.leg += dt * 14;
      d.turnT -= dt;
      const lx = localX(d.wa, S.rot);
      if (d.turnT <= 0) {
        d.turnT = 3 + Math.random() * 4;
        // 画面に見えていないときだけ向きを変える（急な折り返しは避ける）
        if (Math.abs(lx) > 500 && Math.random() < 0.5) d.v = -d.v;
      }
      // 犬は障害物のうしろ側を走りぬける（飛びこえない）
      d.hop = 0;
      if (!d.barked && Math.abs(lx) < 420) {
        d.barked = true;
        api.tone({ type: 'square', from: 620, to: 420, dur: 0.07, vol: 0.12 });
        api.tone({ type: 'square', from: 640, to: 430, dur: 0.07, vol: 0.12, delay: 0.12 });
      }
      if (Math.abs(lx) > 700) d.barked = false;
    }

    // 当たり判定（雪玉は障害物と犬、子供は犬）
    if (S.safe <= 0) {
      const br = S.r * 0.86;
      const by = S.jumpY + S.r;
      for (const o of S.obstacles) {
        const lx = localX(o.wa, S.rot);
        if (Math.abs(lx) > 400) continue;
        const t = OBST[o.type];
        if (circleRect(0, by, br, lx - t.hw / 2, 0, lx + t.hw / 2, t.hh)) return crash(api, 'obstacle');
      }
      for (const d of S.dogs) {
        const lx = localX(d.wa, S.rot);
        if (Math.abs(lx) > 400) continue;
        const x0 = lx - 26;
        const x1 = lx + 26;
        const y0 = d.hop;
        const y1 = d.hop + 36;
        if (circleRect(0, by, br, x0, y0, x1, y1)) return crash(api, 'dog');
        const kx0 = S.kidX - 14;
        const kx1 = S.kidX + 14;
        if (kx0 < x1 && kx1 > x0 && S.jumpY < y1 && S.jumpY + 60 > y0) return crash(api, 'dog');
      }
    }
  },

  draw(g, api, scene) {
    const t = performance.now() / 1000;
    if (!S || scene === 'title') titleRot = t * 0.15;
    const rot = S && scene !== 'title' ? S.rot : titleRot;
    const snow = S && scene !== 'title' ? S.snow : null;

    // ---- 大地（輪の外側） ----
    const eg = g.createRadialGradient(CX, CY, R, CX, CY, R + 420);
    eg.addColorStop(0, '#6b4a33');
    eg.addColorStop(0.25, '#4d3426');
    eg.addColorStop(1, '#22160f');
    g.fillStyle = eg;
    g.fillRect(0, 0, api.W, api.H);
    // 地層と石（回転が見えるように）
    g.save();
    g.translate(CX, CY);
    g.rotate(rot);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 6;
    for (const rr of [R + 70, R + 150, R + 260]) {
      g.beginPath();
      g.arc(0, 0, rr, 0, TAU);
      g.stroke();
    }
    g.fillStyle = 'rgba(160,130,100,0.35)';
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const rr = R + 40 + ((i * 53) % 330);
      g.beginPath();
      g.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 9 + (i % 4) * 4, 6 + (i % 3) * 3, a, 0, TAU);
      g.fill();
    }
    g.restore();

    // ---- 雪の層 ----
    g.fillStyle = '#f4f9ff';
    g.beginPath();
    g.arc(CX, CY, R + 18, 0, TAU);
    g.fill();
    g.strokeStyle = '#a9c3e0';
    g.lineWidth = 3;
    g.stroke();

    // 雪の表面（へこみ付き）の形
    const surf = new Path2D();
    for (let i = 0; i <= BINS; i++) {
      const wa = (i / BINS) * TAU;
      const dep = snow ? snow[i % BINS] : 1;
      const rr = R + (1 - dep) * 13;
      const phi = wa + rot;
      const x = CX + rr * Math.cos(phi);
      const y = CY + rr * Math.sin(phi);
      if (i === 0) surf.moveTo(x, y);
      else surf.lineTo(x, y);
    }
    surf.closePath();

    // ---- 空（輪の内側） ----
    g.save();
    g.clip(surf);
    if (img.sky) {
      g.save();
      g.translate(CX, CY);
      g.rotate(rot * 0.25);
      const s = (R + 20) * 2.1;
      g.drawImage(img.sky, -s / 2, -s / 2, s, s);
      g.restore();
    } else {
      g.fillStyle = '#7fb8ff';
      g.fillRect(0, 0, api.W, api.H);
    }
    // 太陽のきらめき
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const sg = g.createRadialGradient(CX, CY, 10, CX, CY, 130 + pulse * 20);
    sg.addColorStop(0, 'rgba(255,250,210,0.75)');
    sg.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(CX, CY, 160, 0, TAU);
    g.fill();
    // 雪がふる（中心から外へ）
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of flakes) {
      const d = (f.d + t * f.v) % R;
      const a = f.a + rot * 0.6 + Math.sin(t + f.a * 3) * 0.05;
      g.beginPath();
      g.arc(CX + Math.cos(a) * d, CY + Math.sin(a) * d, f.s, 0, TAU);
      g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(150,185,225,0.9)';
    g.lineWidth = 2.5;
    g.stroke(surf);

    // ---- 背景の小さな木 ----
    for (const d of deco) drawSprite(g, img.pine, localX(d.wa, rot), -2, 90 * d.s, 1, 0, 0.35);

    if (!S || scene === 'title') {
      // タイトル用の飾り
      drawBall(g, toScreen(0, 30).x, toScreen(0, 30).y, 30, t * 3);
      drawSprite(g, img.kidA, -52, 0, KID_H);
      return;
    }

    // ---- 犬（障害物のうしろ） ----
    for (const d of S.dogs) {
      const lx = localX(d.wa, rot);
      const face = d.v > 0 ? -1 : 1;
      const bob = Math.abs(Math.sin(d.leg)) * 5;
      const tilt = Math.sin(d.leg) * 0.08 * face;
      drawSprite(g, img.dog, lx, d.hop + bob - 2, 56, face, tilt);
    }

    // ---- 障害物 ----
    for (const o of S.obstacles) {
      const tdef = OBST[o.type];
      const im = img[tdef.img];
      if (!im) continue;
      const lx = localX(o.wa, rot);
      const h = o.type === 'pine' ? 92 : (im.height / im.width) * tdef.w;
      drawSprite(g, im, lx, -4, h);
    }

    if (S.phase === 'build') {
      drawSnowman(g, api, S);
      return;
    }

    // ---- 子供と雪玉 ----
    const kidBob = S.grounded && Math.abs(S.omega) * R > 30 ? Math.abs(Math.sin(S.walkT * Math.PI)) * 3 : 0;
    const kim = kidImage();
    const kidH = kim ? (kim.height * KID_H) / 200 : KID_H;
    let kidAlpha = 1;
    if (S.safe > 0) kidAlpha = Math.floor(S.safe * 10) % 2 ? 0.4 : 1;
    drawSprite(g, kim, S.kidX, S.jumpY + kidBob - 3, kidH, S.facing, 0, kidAlpha);
    const bp = toScreen(0, S.jumpY + S.r);
    // 影
    if (!S.grounded) {
      const sp = toScreen(0, 0);
      g.fillStyle = 'rgba(80,110,160,0.25)';
      g.beginPath();
      g.ellipse(sp.x, sp.y + 2, S.r * 0.8, 6, 0, 0, TAU);
      g.fill();
    }
    drawBall(g, bp.x, bp.y, S.r, S.spin, S.phase === 'crash' ? 0.85 : 1);
    if (S.phase === 'crash') {
      api.text('💥', bp.x + S.facing * S.r * 0.8, bp.y - S.r * 0.5, { size: 46, stroke: null });
    }

    // ---- HUD（左上） ----
    api.text(`${S.round}こめの雪玉`, 20, 30, { size: 24, align: 'left', color: '#ffe9a8' });
    api.text(`直径 ${Math.round(S.r * 2)} cm`, 20, 64, { size: 30, align: 'left' });
    if (S.balls.length) {
      drawBall(g, 34, 108, 14, 0);
      api.text(`1こめ ${Math.round(S.balls[0] * 2)} cm`, 56, 108, { size: 20, align: 'left', color: '#d8e8ff' });
    }

    // メッセージ
    if (S.msg) {
      const a = Math.min(1, S.msg.t * 2);
      g.globalAlpha = a;
      if (S.msg.small) api.text(S.msg.text, bp.x, bp.y - S.r - 40, { size: 26, color: '#bfe3ff' });
      else api.text(S.msg.text, CX, 300, { size: S.msg.big ? 40 : 30, color: S.msg.big ? '#ffb54a' : '#ffffff' });
      g.globalAlpha = 1;
    }
  },
};

function drawSnowman(g, api, S) {
  const res = S.result;
  const t = S.buildT;
  // 大きすぎるときは縮めて画面に収める
  const total = res.body * 2 + res.head * 2 * 0.92;
  const sc = Math.min(1, 420 / total);
  const rb = res.body * sc;
  const rh = res.head * sc;
  const base = toScreen(0, 0);

  // 子供
  drawSprite(g, img.kidStand, -(rb + 44), 0, KID_H, 1);

  // 胴体（ころがってくる）
  const inT = Math.min(1, t / 0.5);
  const bodyX = base.x - (1 - inT) * 300;
  drawBall(g, bodyX, base.y - rb, rb, (1 - inT) * -6);

  // 頭（上から落ちてくる）
  if (t > 0.5) {
    const k = Math.min(1, (t - 0.5) / 0.4);
    const landY = base.y - rb * 2 - rh * 0.92 + rh * 0.08;
    let y = landY - (1 - k * k) * 380;
    if (t > 0.9) y = landY - Math.abs(Math.sin((t - 0.9) * 12)) * 14 * Math.max(0, 1 - (t - 0.9) * 2.5);
    drawBall(g, base.x, y, rh, 0);

    // 顔と腕
    if (t > 1.5) {
      const hy = y;
      g.fillStyle = '#26252b';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(base.x + sx * rh * 0.32, hy - rh * 0.15, Math.max(2.5, rh * 0.1), 0, TAU);
        g.fill();
      }
      // にんじんの鼻
      g.fillStyle = '#ff8a2a';
      g.beginPath();
      g.moveTo(base.x, hy + rh * 0.02);
      g.lineTo(base.x + rh * 0.55, hy + rh * 0.12);
      g.lineTo(base.x, hy + rh * 0.22);
      g.closePath();
      g.fill();
      // 口
      g.fillStyle = '#26252b';
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.arc(base.x + i * rh * 0.15, hy + rh * 0.42 - Math.abs(i) * rh * -0.04 - Math.abs(i) * rh * 0.07, Math.max(1.5, rh * 0.05), 0, TAU);
        g.fill();
      }
      // 胴体のボタン
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(base.x, base.y - rb * 2 + rb * (0.55 + i * 0.4), Math.max(2.5, rb * 0.07), 0, TAU);
        g.fill();
      }
      // 枝の腕
      g.strokeStyle = '#6b4226';
      g.lineCap = 'round';
      g.lineWidth = Math.max(3, rb * 0.06);
      for (const sx of [-1, 1]) {
        const ax = base.x + sx * rb * 0.75;
        const ay = base.y - rb * 1.45;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(ax + sx * rb * 0.75, ay - rb * 0.55);
        g.moveTo(ax + sx * rb * 0.5, ay - rb * 0.36);
        g.lineTo(ax + sx * rb * 0.62, ay - rb * 0.7);
        g.stroke();
      }
      // バケツの帽子
      g.fillStyle = '#d6453d';
      const bw = rh * 0.9;
      g.beginPath();
      g.moveTo(base.x - bw * 0.5, hy - rh * 0.7);
      g.lineTo(base.x + bw * 0.5, hy - rh * 0.7);
      g.lineTo(base.x + bw * 0.38, hy - rh * 1.35);
      g.lineTo(base.x - bw * 0.38, hy - rh * 1.35);
      g.closePath();
      g.fill();
    }
  }

  // スコア表示
  if (t > 1.8) {
    api.text('⛄ ゆきだま かんせい！', CX, 70, { size: 34, color: '#ffe9a8' });
    api.text(`からだ ${Math.round(res.body * 2)}cm ＋ あたま ${Math.round(res.head * 2)}cm`, CX, 112, { size: 22 });
    api.text(`たかさ ${res.height}cm`, CX, 148, { size: 28, color: '#bfe3ff' });
    if (res.bonus > 1) api.text('バランスばつぐん！ ×1.3', CX, 182, { size: 22, color: '#49d98a' });
    api.text(`SCORE ${S.counted}`, CX, 222, { size: 36, color: '#ffb54a' });
    if (S.counted >= res.score && t > 2.5 && Math.floor(t * 2) % 2 === 0) {
      api.text('スペース / タップ で けっかへ', CX, 260, { size: 22 });
    }
  }
}
