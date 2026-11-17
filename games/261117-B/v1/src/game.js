// 恐竜 × 迷路 × ボスしかいない
// ジャングルの迷路を進む冒険家。巨大な恐竜（ボス）がうろつく中、ゴールの遺跡の門を目指す。
//
// 使える道具（api）は engine.js を参照。画像は assets/ に置いたものを読み込む。

const T = 64; // 1マスの大きさ
const PLAYER_SPEED = 210;
const DASH_SPEED = 400;
const DASH_TIME = 0.5;
const DASH_COOLDOWN = 2.2;
const PLAYER_R = 14;
const DINO_R = 32;

const IMG = {};
const IMG_FILES = {
  floor: 'floor.jpg',
  wall: 'wall.jpg',
  dino: 'dino.webp',
  stand: 'explorer-stand.webp',
  walkA: 'explorer-walk-a.webp',
  walkB: 'explorer-walk-b.webp',
};

function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = new URL(`../assets/${file}`, import.meta.url).href;
  });
}

let patterns = null;
let stage;
let lives;
let grid; // grid[y][x] = 1 なら壁
let GW;
let GH;
let player;
let dinos;
let gems;
let goal;
let distMap;
let distTimer;
let stageTime;
let clearTimer; // >0 の間は「ステージクリア」演出
let hurtFlash;
let cam;
let titleT = 0;

// ---------------- 迷路づくり ----------------
function makeMaze(cw, ch) {
  GW = cw * 2 + 1;
  GH = ch * 2 + 1;
  const g = Array.from({ length: GH }, () => Array(GW).fill(1));
  const seen = Array.from({ length: ch }, () => Array(cw).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  g[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen[y][x]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = next[Math.floor(Math.random() * next.length)];
    seen[ny][nx] = true;
    g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
    g[ny * 2 + 1][nx * 2 + 1] = 0;
    stack.push([nx, ny]);
  }
  // 抜け道を少し開けて、恐竜から逃げ回れるようにする
  const walls = [];
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      if (!g[y][x]) continue;
      const h = !g[y][x - 1] && !g[y][x + 1] && g[y - 1][x] && g[y + 1][x];
      const v = !g[y - 1][x] && !g[y + 1][x] && g[y][x - 1] && g[y][x + 1];
      if (h || v) walls.push([x, y]);
    }
  }
  const open = Math.floor(walls.length * 0.14);
  for (let i = 0; i < open; i++) {
    const k = Math.floor(Math.random() * walls.length);
    const [x, y] = walls.splice(k, 1)[0];
    g[y][x] = 0;
  }
  return g;
}

function isWall(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
  return grid[ty][tx] === 1;
}

function bfs(sx, sy) {
  const d = Array.from({ length: GH }, () => Array(GW).fill(-1));
  const q = [[sx, sy]];
  d[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWall(nx, ny) && d[ny][nx] < 0) {
        d[ny][nx] = d[y][x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  return d;
}

const tileOf = (v) => Math.floor(v / T);
const center = (t) => t * T + T / 2;

// ---------------- ステージ ----------------
function buildStage(api) {
  const cw = Math.min(10 + stage * 2, 22);
  const ch = Math.min(6 + stage, 13);
  grid = makeMaze(cw, ch);

  const fromStart = bfs(1, 1);
  let far = [1, 1];
  let maxD = 0;
  const floors = [];
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (fromStart[y][x] >= 0) floors.push([x, y, fromStart[y][x]]);
      if (fromStart[y][x] > maxD) {
        maxD = fromStart[y][x];
        far = [x, y];
      }
    }
  }
  goal = { tx: far[0], ty: far[1], x: center(far[0]), y: center(far[1]) };

  player = {
    x: center(1), y: center(1), face: 1, moving: false, anim: 0,
    dash: 0, dashCd: 0, inv: 1.2,
  };

  // ボス恐竜：ステージが進むほど増える
  const count = Math.min(1 + Math.floor((stage - 1) * 0.8), 6);
  const spots = floors.filter(([, , d]) => d >= Math.max(10, maxD * 0.3));
  dinos = [];
  for (let i = 0; i < count && spots.length; i++) {
    const [x, y] = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
    const big = 1 + Math.min(0.35, (stage - 1) * 0.06) + (i === 0 ? 0.1 : 0);
    dinos.push({
      x: center(x), y: center(y), tx: x, ty: y, px: x, py: y,
      state: 'wander', lost: 0, alert: 0, step: Math.random() * 0.5,
      face: 1, scale: big, bob: Math.random() * 6,
    });
  }

  // 宝石
  gems = [];
  const gemSpots = floors.filter(([x, y, d]) => d > 4 && !(x === goal.tx && y === goal.ty));
  for (let i = 0; i < 5 + stage && gemSpots.length; i++) {
    const [x, y] = gemSpots.splice(Math.floor(Math.random() * gemSpots.length), 1)[0];
    gems.push({ x: center(x), y: center(y), t: Math.random() * 6 });
  }

  distMap = bfs(1, 1);
  distTimer = 0;
  stageTime = 0;
  clearTimer = 0;
  cam = { x: 0, y: 0 };
  updateCamera(api, true);
}

function updateCamera(api, snap) {
  const ww = GW * T;
  const wh = GH * T;
  let tx = player.x - api.W / 2;
  let ty = player.y - api.H / 2;
  tx = ww <= api.W ? (ww - api.W) / 2 : tx;
  ty = wh <= api.H ? (wh - api.H) / 2 : api.clamp(ty, -110, wh - api.H + 20);
  tx = ww <= api.W ? tx : api.clamp(tx, -20, ww - api.W + 20);
  if (snap) {
    cam.x = tx;
    cam.y = ty;
  } else {
    cam.x += (tx - cam.x) * 0.15;
    cam.y += (ty - cam.y) * 0.15;
  }
}

// ---------------- 移動と当たり判定 ----------------
function blocked(x, y, r) {
  const x0 = tileOf(x - r);
  const x1 = tileOf(x + r - 0.01);
  const y0 = tileOf(y - r);
  const y1 = tileOf(y + r - 0.01);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isWall(tx, ty)) return true;
  return false;
}

// ---------------- 音 ----------------
function thump(api, vol) {
  api.tone({ type: 'sine', from: 90, to: 38, dur: 0.22, vol: 0.32 * vol });
  api.tone({ type: 'triangle', from: 60, to: 30, dur: 0.18, vol: 0.18 * vol });
}
function roar(api) {
  api.tone({ type: 'sawtooth', from: 210, to: 70, dur: 0.75, vol: 0.16 });
  api.tone({ type: 'square', from: 150, to: 55, dur: 0.8, vol: 0.1, delay: 0.05 });
}

// ---------------- 恐竜のAI ----------------
function updateDino(d, dt, api) {
  const ptx = tileOf(player.x);
  const pty = tileOf(player.y);
  const pathD = distMap[d.ty]?.[d.tx] ?? -1;

  if (d.state === 'wander' && pathD >= 0 && pathD <= 5) {
    d.state = 'chase';
    d.alert = 1;
    d.lost = 0;
    roar(api);
    api.shake(10);
  } else if (d.state === 'chase') {
    if (pathD < 0 || pathD > 11) d.lost += dt;
    else d.lost = 0;
    if (d.lost > 2.5) d.state = 'wander';
  }
  d.alert = Math.max(0, d.alert - dt);

  const speed = d.state === 'chase' ? Math.min(150 + stage * 10, 205) : 70 + stage * 6;
  const tx = center(d.tx);
  const ty = center(d.ty);
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = speed * dt;

  if (dist <= stepLen) {
    d.x = tx;
    d.y = ty;
    // 次のマスを選ぶ
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([ox, oy]) => [d.tx + ox, d.ty + oy])
      .filter(([x, y]) => !isWall(x, y));
    let next;
    if (d.state === 'chase') {
      if (d.tx === ptx && d.ty === pty) next = [d.tx, d.ty];
      else {
        next = opts.reduce((best, o) => {
          const v = distMap[o[1]][o[0]];
          const bv = best ? distMap[best[1]][best[0]] : Infinity;
          return v >= 0 && v < bv ? o : best;
        }, null) || opts[0];
      }
    } else {
      const fwd = opts.filter(([x, y]) => !(x === d.px && y === d.py));
      next = (fwd.length ? fwd : opts)[Math.floor(Math.random() * (fwd.length || opts.length))];
    }
    d.px = d.tx;
    d.py = d.ty;
    [d.tx, d.ty] = next;
  } else {
    d.x += (dx / dist) * stepLen;
    d.y += (dy / dist) * stepLen;
    if (Math.abs(dx) > 1) d.face = dx > 0 ? -1 : 1;
  }

  // 足音と地響き
  d.step -= dt * (d.state === 'chase' ? 1.5 : 1);
  if (d.step <= 0) {
    d.step = 0.5;
    d.bob = 0;
    const far = Math.hypot(d.x - player.x, d.y - player.y);
    if (far < 650) {
      const k = 1 - far / 650;
      thump(api, k);
      api.shake(2 + k * 7);
    }
  }
  d.bob += dt;
}

export default {
  title: null,
  howTo: '矢印/WASDで移動・スペースでダッシュ。恐竜をかわして遺跡の門へ！',
  controls: ['left', 'right', 'up', 'down', 'action'],

  async init(api) {
    const entries = await Promise.all(Object.entries(IMG_FILES).map(async ([k, f]) => [k, await loadImage(f)]));
    for (const [k, v] of entries) IMG[k] = v;
  },

  start(api) {
    stage = 1;
    lives = 3;
    hurtFlash = 0;
    buildStage(api);
  },

  update(dt, api) {
    const { input } = api;
    hurtFlash = Math.max(0, hurtFlash - dt);

    if (clearTimer > 0) {
      clearTimer -= dt;
      if (clearTimer <= 0) {
        stage += 1;
        buildStage(api);
      }
      return;
    }
    stageTime += dt;

    // ---- 入力 ----
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    let fromPointer = false;
    if (!mx && !my && input.pointer.down) {
      const sx = input.pointer.x - (player.x - cam.x);
      const sy = input.pointer.y - (player.y - 20 - cam.y);
      const len = Math.hypot(sx, sy);
      if (len > 24) {
        mx = sx / len;
        my = sy / len;
        fromPointer = true;
      }
    }
    if (mx && my && !fromPointer) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }

    // ダッシュ（アクションボタン、または2本目の指でタップ）
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dash = Math.max(0, player.dash - dt);
    if (input.pressed.action && player.dashCd <= 0) {
      player.dash = DASH_TIME;
      player.dashCd = DASH_COOLDOWN;
      api.sfx('jump');
    }
    const speed = player.dash > 0 ? DASH_SPEED : PLAYER_SPEED;

    player.moving = !!(mx || my);
    if (player.moving) {
      if (Math.abs(mx) > 0.2) player.face = mx > 0 ? -1 : 1;
      player.anim += dt * (player.dash > 0 ? 14 : 8);
      // 曲がり角アシスト：1方向だけ押しているときは通路の中央に寄せる
      const step = speed * dt;
      if (mx && !my) {
        const cy = center(tileOf(player.y));
        const blockedAhead = blocked(player.x + Math.sign(mx) * step, player.y, PLAYER_R);
        if (blockedAhead || Math.abs(cy - player.y) > 0.5) {
          const fix = api.clamp(cy - player.y, -step, step);
          if (!blocked(player.x, player.y + fix, PLAYER_R)) player.y += fix;
        }
      } else if (my && !mx) {
        const cx = center(tileOf(player.x));
        const blockedAhead = blocked(player.x, player.y + Math.sign(my) * step, PLAYER_R);
        if (blockedAhead || Math.abs(cx - player.x) > 0.5) {
          const fix = api.clamp(cx - player.x, -step, step);
          if (!blocked(player.x + fix, player.y, PLAYER_R)) player.x += fix;
        }
      }
      // 少しずつ動かしてすり抜けを防ぐ
      const n = Math.ceil(step / 6);
      for (let i = 0; i < n; i++) {
        const sx = (mx * step) / n;
        const sy = (my * step) / n;
        if (!blocked(player.x + sx, player.y, PLAYER_R)) player.x += sx;
        if (!blocked(player.x, player.y + sy, PLAYER_R)) player.y += sy;
      }
      if (player.dash > 0 && Math.random() < 0.5) api.burst(player.x, player.y + 4, '#c9a46a', 1, 60);
    } else {
      player.anim = 0;
    }
    player.inv = Math.max(0, player.inv - dt);

    // ---- 恐竜 ----
    distTimer -= dt;
    if (distTimer <= 0) {
      distTimer = 0.2;
      distMap = bfs(tileOf(player.x), tileOf(player.y));
    }
    for (const d of dinos) {
      updateDino(d, dt, api);
      const r = DINO_R * d.scale + PLAYER_R;
      if (player.inv <= 0 && Math.hypot(d.x - player.x, d.y - player.y) < r) {
        lives -= 1;
        player.inv = 2;
        hurtFlash = 0.4;
        api.sfx('hit');
        api.shake(22);
        api.burst(player.x, player.y - 20, '#ff4f6a', 26, 300);
        roar(api);
        if (lives <= 0) {
          api.gameOver();
          return;
        }
        // 恐竜は少しのあいだ見失う
        d.state = 'wander';
        d.lost = 0;
      }
    }

    // ---- 宝石 ----
    for (const gm of gems) {
      gm.t += dt;
      if (!gm.got && Math.hypot(gm.x - player.x, gm.y - player.y) < 28) {
        gm.got = true;
        api.addScore(50);
        api.sfx('coin');
        api.burst(gm.x, gm.y, '#7fe8ff', 14);
      }
    }
    gems = gems.filter((gm) => !gm.got);

    // ---- ゴール ----
    if (tileOf(player.x) === goal.tx && tileOf(player.y) === goal.ty) {
      const bonus = 500 * stage + Math.max(0, Math.round((60 + stage * 15 - stageTime) * 10));
      api.addScore(bonus);
      api.sfx('power');
      api.burst(goal.x, goal.y - 20, '#ffd36b', 50, 360);
      clearTimer = 2;
      this.lastBonus = bonus;
    }

    updateCamera(api, false);
  },

  draw(g, api, scene) {
    if (scene === 'title' || !grid) {
      drawTitleBg(g, api);
      return;
    }
    if (!patterns) makePatterns(g);

    const cx = Math.round(cam.x);
    const cy = Math.round(cam.y);
    g.save();
    g.translate(-cx, -cy);

    // 迷路の外はジャングル、中は床
    g.fillStyle = patterns.wall || '#1f5a2a';
    g.fillRect(cx, cy, api.W, api.H);
    g.fillStyle = patterns.floor || '#6b4a2f';
    g.fillRect(0, 0, GW * T, GH * T);

    // 壁（ジャングルの茂み）と影
    const x0 = Math.max(0, tileOf(cx) - 1);
    const y0 = Math.max(0, tileOf(cy) - 1);
    const x1 = Math.min(GW - 1, tileOf(cx + api.W) + 1);
    const y1 = Math.min(GH - 1, tileOf(cy + api.H) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!grid[ty][tx]) {
          if (isWall(tx, ty - 1)) {
            const sh = g.createLinearGradient(0, ty * T, 0, ty * T + 22);
            sh.addColorStop(0, 'rgba(0,0,0,0.55)');
            sh.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = sh;
            g.fillRect(tx * T, ty * T, T, 22);
          }
          continue;
        }
      }
    }
    g.fillStyle = patterns.wall || '#1f5a2a';
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (grid[ty][tx]) g.fillRect(tx * T - 3, ty * T - 6, T + 6, T + 9);
      }
    }
    // 茂みのふち（下側を暗く）
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (grid[ty][tx] && !isWall(tx, ty + 1)) {
          g.fillStyle = 'rgba(8,30,10,0.55)';
          g.fillRect(tx * T - 3, ty * T + T - 4, T + 6, 7);
        }
      }
    }

    // ゴール（遺跡の門）
    drawGoal(g, goal.x, goal.y, api.time);

    // 宝石
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '26px system-ui, sans-serif';
    for (const gm of gems) g.fillText('💎', gm.x, gm.y - 6 + Math.sin(gm.t * 3) * 4);

    // キャラを奥から順に描く
    const ents = [...dinos.map((d) => ({ y: d.y, d })), { y: player.y, p: true }].sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.p) drawPlayer(g);
      else drawDino(g, e.d);
    }
    g.restore();

    // 暗いジャングル（視界）
    const psx = player.x - cx;
    const psy = player.y - 20 - cy;
    const fog = g.createRadialGradient(psx, psy, 150, psx, psy, 470);
    fog.addColorStop(0, 'rgba(4,16,8,0)');
    fog.addColorStop(1, 'rgba(4,16,8,0.82)');
    g.fillStyle = fog;
    g.fillRect(0, 0, api.W, api.H);

    // 暗闇の中の恐竜の目
    for (const d of dinos) {
      const ex = d.x - cx - 84 * d.scale * d.face;
      const ey = d.y - cy - 100 * d.scale;
      if (Math.hypot(ex - psx, ey - psy) > 300 && ex > -20 && ex < api.W + 20 && ey > -20 && ey < api.H + 20) {
        g.fillStyle = d.state === 'chase' ? '#ff5a3a' : '#ffd84a';
        g.shadowColor = g.fillStyle;
        g.shadowBlur = 12;
        g.beginPath();
        g.arc(ex, ey, 5, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    }

    // ゴールの方向
    const gsx = goal.x - cx;
    const gsy = goal.y - cy;
    if (gsx < 0 || gsx > api.W || gsy < 0 || gsy > api.H) {
      const a = Math.atan2(gsy - psy, gsx - psx);
      g.save();
      g.translate(psx + Math.cos(a) * 62, psy + Math.sin(a) * 62);
      g.rotate(a);
      g.fillStyle = 'rgba(255,211,107,0.85)';
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(-6, -8);
      g.lineTo(-2, 0);
      g.lineTo(-6, 8);
      g.closePath();
      g.fill();
      g.restore();
    }

    // ダッシュゲージ
    if (player.dashCd > 0) {
      const w = 44;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(psx - w / 2, psy + 42, w, 6);
      g.fillStyle = '#ffb54a';
      g.fillRect(psx - w / 2, psy + 42, w * (1 - player.dashCd / DASH_COOLDOWN), 6);
    }

    if (hurtFlash > 0) {
      g.fillStyle = `rgba(255,40,40,${hurtFlash * 0.6})`;
      g.fillRect(0, 0, api.W, api.H);
    }

    // HUD（上の中央）
    api.text(`STAGE ${stage}`, api.W / 2, 26, { size: 26, color: '#ffd36b' });
    api.text('❤'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives)), api.W / 2, 58, { size: 22, color: '#ff4f6a' });
    api.text(`ボス恐竜 ×${dinos.length}`, 20, 62, { size: 18, align: 'left', color: '#d8f5c0' });

    if (clearTimer > 0) {
      g.fillStyle = 'rgba(10,20,10,0.45)';
      g.fillRect(0, 0, api.W, api.H);
      api.text('STAGE CLEAR!', api.W / 2, api.H / 2 - 30, { size: 60, color: '#ffd36b' });
      api.text(`+${this.lastBonus || 0}`, api.W / 2, api.H / 2 + 34, { size: 34 });
      api.text(`つぎの迷路は恐竜が ${Math.min(1 + Math.floor(stage * 0.8), 6)} 頭…`, api.W / 2, api.H / 2 + 84, { size: 22, color: '#d8cdb8' });
    }
  },
};

// ---------------- 描画の小道具 ----------------
function makePatterns(g) {
  patterns = {
    floor: IMG.floor ? g.createPattern(IMG.floor, 'repeat') : null,
    wall: IMG.wall ? g.createPattern(IMG.wall, 'repeat') : null,
  };
}

function shadow(g, x, y, rx, ry) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function drawPlayer(g) {
  if (player.inv > 0 && Math.floor(player.inv * 12) % 2 === 0 && player.inv < 1.9) return;
  shadow(g, player.x, player.y + 10, 16, 6);
  const seq = [IMG.walkA, IMG.stand, IMG.walkB, IMG.stand];
  const img = player.moving ? seq[Math.floor(player.anim) % 4] : IMG.stand;
  const h = 78;
  if (img) {
    const w = (img.width / img.height) * h;
    g.save();
    g.translate(player.x, player.y + 12);
    g.scale(player.face, 1);
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
  } else {
    g.font = '48px system-ui, sans-serif';
    g.fillText('🧭', player.x, player.y - 20);
  }
}

function drawDino(g, d) {
  const s = d.scale;
  const w = 240 * s;
  const step = Math.min(1, d.bob / 0.5);
  const bob = Math.sin(step * Math.PI) * 6 * s;
  shadow(g, d.x, d.y + 18, 86 * s, 20 * s);
  const img = IMG.dino;
  g.save();
  g.translate(d.x, d.y + 22);
  g.scale(d.face, 1);
  g.rotate(Math.sin(step * Math.PI * 2) * 0.03);
  if (img) {
    const h = (img.height / img.width) * w;
    g.drawImage(img, -w / 2, -h - bob, w, h);
  } else {
    g.font = `${120 * s}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('🦖', 0, -60 * s);
  }
  g.restore();
  if (d.alert > 0 || d.state === 'chase') {
    const a = d.alert > 0 ? 1 : 0.7;
    g.globalAlpha = a;
    g.font = `${d.alert > 0 ? 40 : 26}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('❗', d.x, d.y - 150 * s -(d.alert > 0 ? (1 - d.alert) * 10 : 0));
    g.globalAlpha = 1;
  }
}

function drawGoal(g, x, y, t) {
  const glow = g.createRadialGradient(x, y - 20, 4, x, y - 20, 70);
  glow.addColorStop(0, `rgba(255,220,120,${0.55 + Math.sin(t * 3) * 0.15})`);
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = glow;
  g.fillRect(x - 80, y - 100, 160, 160);
  // 石の門
  g.fillStyle = '#8b8a7a';
  g.strokeStyle = '#3c3a30';
  g.lineWidth = 3;
  const pillar = (px) => {
    g.fillRect(px, y - 52, 14, 66);
    g.strokeRect(px, y - 52, 14, 66);
  };
  pillar(x - 28);
  pillar(x + 14);
  g.fillStyle = '#a19f8c';
  g.fillRect(x - 36, y - 64, 72, 16);
  g.strokeRect(x - 36, y - 64, 72, 16);
  g.fillStyle = 'rgba(255,236,160,0.9)';
  g.fillRect(x - 14, y - 46, 28, 58);
  // ツタ
  g.strokeStyle = '#2f7a34';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x - 34, y - 56);
  g.quadraticCurveTo(x - 20, y - 30, x - 26, y - 10);
  g.moveTo(x + 30, y - 58);
  g.quadraticCurveTo(x + 18, y - 40, x + 24, y - 20);
  g.stroke();
}

function drawTitleBg(g, api) {
  titleT += 1 / 60;
  if (!patterns) makePatterns(g);
  g.fillStyle = patterns.wall || '#1f5a2a';
  g.fillRect(0, 0, api.W, api.H);
  g.fillStyle = patterns.floor || '#6b4a2f';
  g.fillRect(0, 380, api.W, 160);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 380, api.W, 14);
  if (IMG.dino) {
    const w = 520;
    const h = (IMG.dino.height / IMG.dino.width) * w;
    const bob = Math.abs(Math.sin(titleT * 2)) * 8;
    g.drawImage(IMG.dino, api.W - w - 20, 470 - h - bob, w, h);
  }
  const seq = [IMG.walkA, IMG.stand, IMG.walkB, IMG.stand];
  const img = seq[Math.floor(titleT * 6) % 4];
  if (img) {
    const h = 150;
    const w = (img.width / img.height) * h;
    g.drawImage(img, 120, 500 - h, w, h);
  }
}
