// Sandbox Live! ゲームエンジン（土台）
// タイトル → プレイ → リザルト の流れ、入力（キーボード・タッチ）、効果音、パーティクル、画面揺れを用意している。
// ゲームの中身は src/game.js に書く。このファイルは基本的に触らなくてよい。

export const W = 960;
export const H = 540;

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'action', KeyZ: 'action', Enter: 'action', KeyJ: 'action',
};
const BUTTONS = ['left', 'right', 'up', 'down', 'action'];

// ---------------- 入力 ----------------
function createInput(canvas) {
  const held = Object.fromEntries(BUTTONS.map((b) => [b, 0])); // 押している数（キーとタッチの重複に対応）
  const pressedQueue = new Set();
  const pointer = { x: W / 2, y: H / 2, down: false, pressed: false, active: false };
  let pointerPressed = false;

  const press = (b) => {
    if (held[b] === 0) pressedQueue.add(b);
    held[b] += 1;
  };
  const release = (b) => {
    held[b] = Math.max(0, held[b] - 1);
  };

  const keysDown = new Set();
  addEventListener('keydown', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    if (keysDown.has(e.code)) return;
    keysDown.add(e.code);
    press(b);
  });
  addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (!b || !keysDown.has(e.code)) return;
    keysDown.delete(e.code);
    release(b);
  });
  addEventListener('blur', () => {
    keysDown.clear();
    for (const b of BUTTONS) held[b] = 0;
  });

  // 画面のタッチ・クリック（ゲーム内座標に変換）
  const toGame = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * W;
    pointer.y = ((e.clientY - r.top) / r.height) * H;
  };
  canvas.addEventListener('pointerdown', (e) => {
    toGame(e);
    pointer.down = true;
    pointer.active = true;
    pointerPressed = true;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    toGame(e);
    pointer.active = true;
  });
  const up = () => {
    pointer.down = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // スマホ用ボタン
  const pad = document.getElementById('pad');
  if (pad) {
    for (const btn of pad.querySelectorAll('button[data-key]')) {
      const b = btn.dataset.key;
      let ids = new Set();
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        if (!ids.size) press(b);
        ids.add(e.pointerId);
        btn.classList.add('held');
      });
      const off = (e) => {
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) {
          release(b);
          btn.classList.remove('held');
        }
      };
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  const state = { pointer };
  for (const b of BUTTONS) {
    Object.defineProperty(state, b, { get: () => held[b] > 0, enumerable: true });
  }
  state.pressed = {};
  // 毎フレームの最初に呼ぶ: 「このフレームで押された」を確定させる
  state.beginFrame = () => {
    for (const b of BUTTONS) state.pressed[b] = pressedQueue.has(b);
    pressedQueue.clear();
    pointer.pressed = pointerPressed;
    pointerPressed = false;
  };
  state.showPad = (controls) => {
    if (!pad) return;
    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    pad.hidden = !touch;
    const set = new Set(controls || BUTTONS);
    for (const btn of pad.querySelectorAll('button[data-key]')) btn.hidden = !set.has(btn.dataset.key);
  };
  return state;
}

// ---------------- 効果音（音声ファイル不要のシンセ） ----------------
function createAudio() {
  let ctx = null;
  let muted = false;
  const unlock = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx?.state === 'suspended') ctx.resume();
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  function tone({ type = 'square', from = 440, to = from, dur = 0.12, vol = 0.18, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function noise({ dur = 0.3, vol = 0.25 }) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  const SOUNDS = {
    coin: () => { tone({ from: 988, dur: 0.06 }); tone({ from: 1319, dur: 0.12, delay: 0.06 }); },
    jump: () => tone({ type: 'square', from: 300, to: 700, dur: 0.14 }),
    shoot: () => tone({ type: 'sawtooth', from: 900, to: 200, dur: 0.1, vol: 0.12 }),
    hit: () => tone({ type: 'square', from: 200, to: 60, dur: 0.22, vol: 0.22 }),
    explode: () => noise({ dur: 0.45 }),
    power: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.1, delay: i * 0.07 })),
    select: () => tone({ type: 'triangle', from: 660, dur: 0.08, vol: 0.15 }),
    gameover: () => [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.25, delay: i * 0.18 })),
  };
  return {
    play(name) {
      SOUNDS[name]?.();
    },
    tone,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
  };
}

// ---------------- パーティクル ----------------
function createParticles() {
  const list = [];
  return {
    burst(x, y, color = '#ffd36b', count = 16, speed = 220) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, age: 0, color, size: 2 + Math.random() * 3 });
      }
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list.splice(i, 1);
          continue;
        }
        p.vy += 400 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(g) {
      for (const p of list) {
        g.globalAlpha = 1 - p.age / p.life;
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.globalAlpha = 1;
    },
    clear() {
      list.length = 0;
    },
  };
}

// ---------------- 文字描画の小道具 ----------------
export function text(g, str, x, y, { size = 32, color = '#fff3dc', align = 'center', weight = 800, stroke = '#0f1222', baseline = 'middle' } = {}) {
  g.font = `${weight} ${size}px "Hiragino Maru Gothic ProN", "Hiragino Sans", "M PLUS Rounded 1c", system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = baseline;
  if (stroke) {
    g.lineWidth = Math.max(2, size / 7);
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.strokeText(str, x, y);
  }
  g.fillStyle = color;
  g.fillText(str, x, y);
}

function wrap(g, str, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of [...String(str)]) {
    if (g.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------- 本体 ----------------
export async function run(game) {
  const canvas = document.getElementById('screen');
  const g = canvas.getContext('2d');
  const view = { scale: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
    canvas.width = Math.floor(W * s * dpr);
    canvas.height = Math.floor(H * s * dpr);
    view.scale = s * dpr;
  }
  addEventListener('resize', resize);
  resize();

  let meta = { title: 'Sandbox Live!', requester: '', id: 'local' };
  try {
    meta = { ...meta, ...(await (await fetch('meta.json', { cache: 'no-store' })).json()) };
  } catch {
    // meta.json が無くても動く
  }
  if (game.title) meta.title = game.title;
  document.title = `${meta.title} | Sandbox Live!`;

  const input = createInput(canvas);
  input.showPad(game.controls);
  const audio = createAudio();
  const particles = createParticles();
  const bestKey = `sandbox-live:best:${meta.id}`;
  let best = 0;
  try {
    best = Number(localStorage.getItem(bestKey)) || 0;
  } catch {
    // 保存できない環境
  }

  let scene = 'title';
  let shakePower = 0;
  let sceneTime = 0;
  let newBest = false;

  const api = {
    W,
    H,
    input,
    meta,
    score: 0,
    time: 0, // プレイ開始からの秒数
    addScore(n = 1) {
      api.score += n;
    },
    gameOver() {
      if (scene !== 'playing') return;
      scene = 'result';
      sceneTime = 0;
      newBest = api.score > best;
      if (newBest) {
        best = api.score;
        try {
          localStorage.setItem(bestKey, String(best));
        } catch {
          // 無視
        }
      }
      audio.play('gameover');
    },
    sfx: (name) => audio.play(name),
    tone: (opts) => audio.tone(opts),
    burst: (...args) => particles.burst(...args),
    shake(power = 8) {
      shakePower = Math.max(shakePower, power);
    },
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    hit(a, b) {
      // 矩形どうしの当たり判定 {x, y, w, h}（x, y は左上）
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    hitCircle(a, b) {
      // 円どうしの当たり判定 {x, y, r}
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy < (a.r + b.r) ** 2;
    },
    text: (...args) => text(g, ...args),
  };

  function startGame() {
    scene = 'playing';
    sceneTime = 0;
    api.score = 0;
    api.time = 0;
    particles.clear();
    game.start?.(api);
  }

  await game.init?.(api);

  const startPressed = () => input.pressed.action || input.pointer.pressed;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.beginFrame();
    sceneTime += dt;

    if (scene === 'title' && sceneTime > 0.2 && startPressed()) {
      audio.play('select');
      startGame();
    } else if (scene === 'playing') {
      api.time += dt;
      game.update?.(dt, api);
    } else if (scene === 'result' && sceneTime > 0.8 && startPressed()) {
      audio.play('select');
      startGame();
    }
    particles.update(dt);
    shakePower *= Math.pow(0.001, dt);

    // 描画
    g.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    if (shakePower > 0.3) g.translate((Math.random() - 0.5) * shakePower, (Math.random() - 0.5) * shakePower);
    g.fillStyle = '#0f1222';
    g.fillRect(-20, -20, W + 40, H + 40);
    g.save();
    game.draw?.(g, api, scene);
    g.restore();
    particles.draw(g);
    g.setTransform(view.scale, 0, 0, view.scale, 0, 0);

    if (scene === 'playing') drawHud();
    else if (scene === 'title') drawTitle();
    else drawResult();

    requestAnimationFrame(frame);
  }

  function drawHud() {
    if (game.hud === false) return;
    api.text(`SCORE ${api.score}`, 20, 30, { size: 26, align: 'left' });
    api.text(`BEST ${Math.max(best, api.score)}`, W - 20, 30, { size: 20, align: 'right', color: '#d8cdb8' });
  }

  function overlay(alpha = 0.55) {
    g.fillStyle = `rgba(10, 12, 24, ${alpha})`;
    g.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    overlay(0.6);
    g.font = '800 54px system-ui, sans-serif';
    const lines = wrap(g, meta.title, W - 120).slice(0, 2);
    lines.forEach((l, i) => api.text(l, W / 2, 190 + i * 64 - (lines.length - 1) * 32, { size: 54, color: '#ffb54a' }));
    if (meta.requester) api.text(`お題: ${meta.requester} さん`, W / 2, 290, { size: 24, color: '#d8cdb8' });
    if (game.howTo) api.text(game.howTo, W / 2, 350, { size: 22, weight: 600 });
    const blink = Math.floor(sceneTime * 2) % 2 === 0;
    if (blink) api.text('スペース / タップ でスタート', W / 2, 420, { size: 28 });
    api.text('Sandbox Live! 〜コメントでつくるゲーム屋台〜', W / 2, H - 24, { size: 16, color: '#8f8a99', weight: 600, stroke: null });
  }

  function drawResult() {
    overlay(0.65);
    api.text('GAME OVER', W / 2, 170, { size: 64, color: '#ff7a3d' });
    api.text(`SCORE ${api.score}`, W / 2, 260, { size: 44 });
    api.text(newBest ? '🎉 ベスト更新！' : `BEST ${best}`, W / 2, 320, { size: 26, color: newBest ? '#49d98a' : '#d8cdb8' });
    if (sceneTime > 0.8 && Math.floor(sceneTime * 2) % 2 === 0) api.text('スペース / タップ でもう一度', W / 2, 410, { size: 28 });
  }

  requestAnimationFrame(frame);
  return api;
}
