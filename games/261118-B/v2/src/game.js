// たこ焼き × クイズ × 分身する
// 8×8 のたこ焼きのうち、おいしいのは1つだけ。クイズ2問の答え（よこ・たて）の場所を食べる。
// 当てると、残りのワサビ入りのどれかが「分身したおいしいたこ焼き」に変わる。全部食べればクリア。

import { pickQuiz } from './quiz.js';

const N = 8;
const CELL = 60;
const BX = 44; // 鉄板の左上
const BY = 44;
const PX = 544; // 右側パネル
const PW = 400;
const MAX_TEARS = 5;
const HEAT_TIME = 12; // アツアツボーナスが尽きるまでの秒数
const BITE = 0.32;
const FLY = 0.38;
const MOUTH = { x: PX + 72, y: 460 };
const FACE = { x: PX + 66, y: 447, size: 150 };
const ART = {
  bg: 'bg.jpg',
  iron: 'iron.jpg',
  tako1: 'tako1.webp',
  tako2: 'tako2.webp',
  wasabi: 'wasabi.webp',
  think: 'face-think.webp',
  yum: 'face-yum.webp',
  open: 'face-open.webp',
  cry: 'face-cry.webp',
};
const ORANGE = '#e8702a';
const BLUE = '#2f7fc9';
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "M PLUS Rounded 1c", system-ui, sans-serif';

let art = {};
let sprites = [];
let plate = null;

function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `assets/${file}`;
  });
}

let cells, target, quiz, used, combo, tears, phase, phaseT;
let cursor, armed, lastPx, lastPy, heat;
let flyer, clones, drops, popups, banner, say, flash, reveal, splash, fireT;

const center = (cell) => ({ x: BX + (cell.c + 0.5) * CELL, y: BY + (cell.r + 0.5) * CELL });
const remaining = () => cells.filter((cell) => !cell.eaten);
const cellOf = (c, r) => cells[r * N + c];

function cellAt(x, y) {
  const c = Math.floor((x - BX) / CELL);
  const r = Math.floor((y - BY) / CELL);
  return c >= 0 && c < N && r >= 0 && r < N ? cellOf(c, r) : null;
}

function setPhase(name) {
  phase = name;
  phaseT = 0;
}

function setup(api) {
  cells = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      cells.push({ c, r, eaten: false, hidden: false, pop: 0, seed: Math.random() * 6.28, rot: api.rand(-0.35, 0.35), v: api.randInt(0, sprites.length - 1) });
    }
  }
  used = new Set();
  combo = 0;
  tears = 0;
  cursor = { c: 3, r: 3, show: false };
  armed = null;
  lastPx = null;
  lastPy = null;
  flyer = null;
  clones = [];
  drops = [];
  popups = [];
  banner = null;
  say = null;
  flash = 0;
  reveal = false;
  splash = null;
  fireT = 0;
  nextRound(api, null);
}

// おいしいたこ焼きの場所を決めて、クイズを2問出す
function nextRound(api, avoid) {
  const list = remaining();
  const choices = list.length > 1 ? list.filter((cell) => cell !== avoid) : list;
  target = api.pick(choices);
  const level = N * N - list.length;
  quiz = [pickQuiz(target.c + 1, level, used), pickQuiz(target.r + 1, level, used)];
  heat = HEAT_TIME;
  armed = null;
  setPhase('ask');
}

// 残っている全部のたこ焼きへ分身を飛ばす（どれが本物か分からないように全部へ）
function spawnClones(from, api) {
  clones = remaining().map((cell) => ({ cell, from, t: 0, delay: api.rand(0, 0.32), done: false }));
  for (let i = 0; i < 7; i++) api.tone({ type: 'triangle', from: 480 + i * 120, dur: 0.06, vol: 0.1, delay: 0.1 + i * 0.07 });
}

function eat(cell, api) {
  armed = null;
  cursor.show = false;
  const good = cell === target;
  if (good) cell.eaten = true;
  else cell.hidden = true;
  flyer = { cell, from: center(cell), good, t: 0 };
  api.sfx('jump');
  setPhase('bite');
}

function onGood(api) {
  const { cell, from } = flyer;
  flyer = null;
  combo += 1;
  const bonus = Math.round((heat / HEAT_TIME) * 100);
  const points = 100 + bonus + Math.min(combo, 20) * 10;
  api.addScore(points);
  api.sfx('coin');
  api.tone({ type: 'triangle', from: 660 + Math.min(combo, 16) * 40, dur: 0.16, vol: 0.14, delay: 0.1 });
  api.burst(MOUTH.x, MOUTH.y, '#ffd36b', 18, 240);
  popups.push({ x: from.x, y: from.y, text: `+${points}`, color: '#ffd36b', t: 0 });
  say = { text: api.pick(['うまーい！', 'はふはふ、最高！', 'トロトロだ〜！', 'これは当たり！']), t: 1.2 };

  // 5連続で正解すると、お茶で涙が1つ引く
  if (combo % 5 === 0 && tears > 0) {
    tears -= 1;
    say = { text: '🍵 お茶で涙が1つ引いた！', t: 1.6 };
    api.sfx('power');
  }

  if (remaining().length === 0) {
    api.addScore(1000 + (MAX_TEARS - tears) * 200);
    banner = { text: 'ごちそうさま！', color: '#ffd36b', t: 0 };
    api.sfx('power');
    setPhase('clear');
    return;
  }
  banner = { text: '分身！', color: '#ffd36b', t: 0 };
  spawnClones(center(cell), api);
  setPhase('split');
}

function onBad(api) {
  const { cell, from } = flyer;
  flyer = null;
  combo = 0;
  tears += 1;
  flash = 1;
  reveal = true;
  splash = { ...from, cell };
  api.sfx('explode');
  api.sfx('hit');
  api.tone({ type: 'sawtooth', from: 1800, to: 300, dur: 0.6, vol: 0.12 });
  api.shake(20);
  api.burst(MOUTH.x, MOUTH.y, '#8fe04a', 40, 340);
  api.burst(from.x, from.y, '#8fe04a', 24, 220);
  for (let i = 0; i < 26; i++) addDrop(api, api.rand(-300, 0));
  banner = { text: 'ワサビだーっ！', color: '#a6ee5a', t: 0 };
  say = { text: api.pick(['鼻がツーンとする！', '涙が止まらない…', 'か、からいーっ！']), t: 2 };
  setPhase(tears >= MAX_TEARS ? 'dead' : 'tears');
}

function endTears(api) {
  reveal = false;
  splash = null;
  flyer = null;
  for (const cell of cells) {
    if (cell.hidden) {
      cell.hidden = false;
      cell.pop = 1;
    }
  }
  banner = { text: 'シャッフル！', color: '#9fd8ff', t: 0 };
  spawnClones(center(target), api);
  setPhase('shuffle');
}

function addDrop(api, y = -14) {
  if (drops.length > 90) return;
  drops.push({ x: api.rand(0, api.W), y, vy: api.rand(260, 430), s: api.rand(3.5, 8) });
}

function handleInput(api) {
  const { input } = api;
  const p = input.pointer;
  const dx = (input.pressed.right ? 1 : 0) - (input.pressed.left ? 1 : 0);
  const dy = (input.pressed.down ? 1 : 0) - (input.pressed.up ? 1 : 0);
  if (dx || dy) {
    if (cursor.show) {
      cursor.c = api.clamp(cursor.c + dx, 0, N - 1);
      cursor.r = api.clamp(cursor.r + dy, 0, N - 1);
    }
    cursor.show = true;
    armed = null;
    api.sfx('select');
  }

  if (p.active && (p.x !== lastPx || p.y !== lastPy)) {
    lastPx = p.x;
    lastPy = p.y;
    const over = cellAt(p.x, p.y);
    if (over) {
      cursor.c = over.c;
      cursor.r = over.r;
    }
    cursor.show = Boolean(over);
  }

  if (p.pressed) {
    const cell = cellAt(p.x, p.y);
    if (!cell || cell.eaten) return;
    // 画面が小さくてマスが押しにくいときは、2回タップで確定する
    const small = CELL * Math.min(innerWidth / api.W, innerHeight / api.H) < 34;
    if (small && armed !== cell) {
      armed = cell;
      api.sfx('select');
      return;
    }
    eat(cell, api);
    return;
  }

  if (input.pressed.action) {
    if (!cursor.show) {
      cursor.show = true;
      return;
    }
    const cell = cellOf(cursor.c, cursor.r);
    if (!cell.eaten) eat(cell, api);
  }
}

export default {
  title: null,
  howTo: 'クイズ2問の答え（よこ・たて）の場所のたこ焼きを食べよう！',
  controls: [], // タップで直接えらぶのでボタンは出さない
  hud: false, // 右上を空けるため、スコアはパネルに自分で描く

  async init(api) {
    const loaded = await Promise.all(Object.entries(ART).map(async ([key, file]) => [key, await loadImage(file)]));
    art = Object.fromEntries(loaded);
    sprites = [art.tako1, art.tako2];
    plate = makePlate();
    setup(api);
  },

  start(api) {
    setup(api);
  },

  update(dt, api) {
    phaseT += dt;
    flash = Math.max(0, flash - dt * 1.6);
    for (const cell of cells) cell.pop = Math.max(0, cell.pop - dt * 4);
    for (const p of popups) p.t += dt;
    popups = popups.filter((p) => p.t < 1);
    if (banner) {
      banner.t += dt;
      if (banner.t > 1) banner = null;
    }
    if (say) {
      say.t -= dt;
      if (say.t <= 0) say = null;
    }

    // 涙は間違えた数だけ降り続ける
    const rate = phase === 'tears' || phase === 'dead' ? 34 : tears * 1.8;
    if (Math.random() < rate * dt) addDrop(api);
    for (const d of drops) d.y += d.vy * dt;
    drops = drops.filter((d) => d.y < api.H + 20);

    for (const cl of clones) {
      cl.t += dt;
      if (!cl.done && cl.t >= cl.delay + FLY) {
        cl.done = true;
        cl.cell.pop = 1;
        const at = center(cl.cell);
        api.burst(at.x, at.y, '#ffd36b', 3, 90);
      }
    }
    clones = clones.filter((cl) => !cl.done);

    const tapped = api.input.pointer.pressed || api.input.pressed.action;
    switch (phase) {
      case 'ask':
        heat = Math.max(0, heat - dt);
        handleInput(api);
        break;
      case 'bite':
        flyer.t += dt;
        if (flyer.t >= BITE) (flyer.good ? onGood : onBad)(api);
        break;
      case 'split':
      case 'shuffle':
        if (phaseT >= 0.76) nextRound(api, phase === 'shuffle' ? target : null);
        break;
      case 'tears':
        if (phaseT >= 2.2 || (phaseT > 0.9 && tapped)) endTears(api);
        break;
      case 'dead':
        if (phaseT >= 2) api.gameOver({ title: '涙が止まらない…', color: '#7fd4ff' });
        break;
      case 'clear':
        fireT -= dt;
        if (fireT <= 0) {
          fireT = 0.22;
          api.burst(api.rand(80, 880), api.rand(70, 380), api.pick(['#ffd36b', '#ff7a3d', '#8fe04a', '#7fd4ff']), 34, 300);
          api.sfx('coin');
        }
        if (phaseT >= 3) api.gameOver({ title: '全部おいしく完食！', color: '#ffd36b', sound: 'power' });
        break;
      default:
        break;
    }
  },

  draw(g, api) {
    const t = performance.now() / 1000;
    drawBackground(g, api);
    if (!cells) return;
    drawBoard(g, api, t);
    drawPanel(g, api, t);

    // 口へ飛んでいくたこ焼き
    if (flyer) {
      const p = Math.min(1, flyer.t / BITE);
      const x = flyer.from.x + (MOUTH.x - flyer.from.x) * p;
      const y = flyer.from.y + (MOUTH.y - flyer.from.y) * p - Math.sin(p * Math.PI) * 70;
      drawSprite(g, sprites[flyer.cell.v], x, y, 60 * (1 - p * 0.55), flyer.cell.rot);
    }

    // 流れ続ける涙
    g.fillStyle = 'rgba(130, 205, 255, 0.5)';
    for (const d of drops) tearShape(g, d.x, d.y, d.s);

    if (flash > 0) {
      g.fillStyle = `rgba(140, 225, 70, ${flash * 0.42})`;
      g.fillRect(0, 0, api.W, api.H);
    }

    for (const p of popups) {
      g.globalAlpha = 1 - p.t;
      api.text(p.text, p.x, p.y - p.t * 54, { size: 30, color: p.color });
      g.globalAlpha = 1;
    }

    if (banner) {
      const s = Math.min(1, banner.t * 7);
      g.globalAlpha = Math.min(1, (1 - banner.t) * 4);
      // ワサビを食べた瞬間は、中身を大きく見せる
      if (phase === 'tears' || phase === 'dead') {
        drawSprite(g, art.wasabi, BX + (N * CELL) / 2, BY + (N * CELL) / 2 - 92, 90 + s * 130, Math.sin(t * 30) * 0.04);
      }
      api.text(banner.text, BX + (N * CELL) / 2, BY + (N * CELL) / 2 + (phase === 'tears' || phase === 'dead' ? 66 : 0), { size: 40 + s * 22, color: banner.color });
      g.globalAlpha = 1;
    }
  },
};

// ---------------- 描画 ----------------

function drawBackground(g, api) {
  const grad = g.createLinearGradient(0, 0, 0, api.H);
  grad.addColorStop(0, '#3a1f14');
  grad.addColorStop(1, '#1a0e0a');
  g.fillStyle = grad;
  g.fillRect(0, 0, api.W, api.H);
  if (art.bg) {
    g.drawImage(art.bg, 0, 0, api.W, api.H);
    g.fillStyle = 'rgba(18, 9, 6, 0.5)'; // 文字が読めるように少し暗くする
    g.fillRect(0, 0, api.W, api.H);
  }
}

function drawSprite(g, img, x, y, size, rot = 0) {
  if (!img) {
    g.fillStyle = '#c9782e';
    g.beginPath();
    g.arc(x, y, size * 0.46, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.drawImage(img, -size / 2, -size / 2, size, size);
  g.restore();
}

function drawBoard(g, api, t) {
  g.drawImage(plate, BX - 12, BY - 12, N * CELL + 24, N * CELL + 24);

  // 選んでいる行と列を帯で示す
  const showCross = phase === 'ask' && cursor.show;
  const markC = reveal ? target.c : showCross ? cursor.c : -1;
  const markR = reveal ? target.r : showCross ? cursor.r : -1;
  if (markC >= 0) {
    g.fillStyle = reveal ? 'rgba(255, 211, 107, 0.2)' : 'rgba(255, 255, 255, 0.09)';
    g.fillRect(BX + markC * CELL, BY, CELL, N * CELL);
    g.fillRect(BX, BY + markR * CELL, N * CELL, CELL);
  }

  for (let i = 0; i < N; i++) {
    const hotC = i === markC;
    const hotR = i === markR;
    api.text(String(i + 1), BX + (i + 0.5) * CELL, 20, { size: hotC ? 28 : 21, color: hotC ? '#ffd36b' : '#ffa066' });
    api.text(String(i + 1), 18, BY + (i + 0.5) * CELL, { size: hotR ? 28 : 21, color: hotR ? '#ffd36b' : '#86c6ff' });
  }

  if (splash) drawSprite(g, art.wasabi, splash.x, splash.y, 62);

  for (const cell of cells) {
    if (cell.eaten || cell.hidden) continue;
    const at = center(cell);
    const bob = Math.sin(t * 2.2 + cell.seed) * 1.2;
    drawSprite(g, sprites[cell.v], at.x, at.y + bob, 60 * (1 + cell.pop * 0.28), cell.rot);
  }

  // 湯気
  g.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) {
    const life = (t * 0.22 + i * 0.083) % 1;
    g.globalAlpha = Math.sin(life * Math.PI) * 0.07;
    g.beginPath();
    g.arc(BX + ((i * 197) % 460) + 10 + Math.sin(t + i) * 10, BY + N * CELL - 30 - life * 380, 12 + life * 20, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 飛んでいく分身
  for (const cl of clones) {
    const p = api.clamp((cl.t - cl.delay) / FLY, 0, 1);
    if (p <= 0) continue;
    const to = center(cl.cell);
    const x = cl.from.x + (to.x - cl.from.x) * p;
    const y = cl.from.y + (to.y - cl.from.y) * p - Math.sin(p * Math.PI) * 46;
    g.globalAlpha = 0.85;
    drawSprite(g, sprites[cl.cell.v], x, y, 28 + p * 18, cl.cell.rot);
    g.globalAlpha = 1;
  }

  if (showCross) {
    const at = center(cellOf(cursor.c, cursor.r));
    const hot = armed === cellOf(cursor.c, cursor.r);
    g.strokeStyle = hot ? '#ff5a3c' : '#ffd36b';
    g.lineWidth = hot ? 5 + Math.sin(t * 10) * 1.5 : 4;
    g.beginPath();
    g.arc(at.x, at.y, 29, 0, Math.PI * 2);
    g.stroke();
  }

  if (reveal) {
    const at = center(target);
    g.strokeStyle = '#ffd36b';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(at.x, at.y, 29 + Math.sin(t * 9) * 2, 0, Math.PI * 2);
    g.stroke();
    api.text('⭐', at.x, at.y - 2, { size: 30, stroke: null });
  }
}

function layoutQuestion(g, q, maxW) {
  if (q.lines) return;
  for (const size of [27, 25, 23, 21, 19, 17]) {
    g.font = `800 ${size}px ${FONT}`;
    const lines = [];
    for (const part of q.text.split('\n')) {
      let line = '';
      for (const ch of part) {
        const noBreak = '、。？！）」ー'.includes(ch);
        if (line && !noBreak && g.measureText(line + ch).width > maxW) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
      lines.push(line);
    }
    q.lines = lines;
    q.size = size;
    if (lines.length <= 3 && lines.every((l) => g.measureText(l).width <= maxW + 6)) return;
  }
}

function drawCard(g, api, i, y) {
  const h = 130;
  const tab = 84;
  const color = i === 0 ? ORANGE : BLUE;
  g.fillStyle = '#fff3dc';
  g.beginPath();
  g.roundRect(PX, y, PW, h, 14);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(PX, y, tab, h, [14, 0, 0, 14]);
  g.fill();

  const cx = PX + tab / 2;
  if (reveal) {
    api.text('こたえ', cx, y + 28, { size: 17, stroke: null });
    api.text(String(quiz[i].answer), cx, y + 76, { size: 56, color: '#ffe48a', stroke: null });
  } else {
    api.text(`${i + 1}問目`, cx, y + 26, { size: 16, stroke: null });
    api.text(i === 0 ? 'よこ' : 'たて', cx, y + 64, { size: 31, stroke: null });
    api.text(i === 0 ? '左から→' : '上から↓', cx, y + 104, { size: 15, stroke: null });
  }

  const textX = PX + tab + 14;
  const maxW = PW - tab - 26;
  const waiting = phase === 'split' || phase === 'shuffle' || phase === 'clear';
  if (waiting) {
    api.text(phase === 'clear' ? 'ごちそうさま！' : 'つぎの問題を焼いています…', textX, y + h / 2, { size: 19, color: '#a58a6c', align: 'left', stroke: null });
    return;
  }
  layoutQuestion(g, quiz[i], maxW);
  const q = quiz[i];
  const lh = q.size * 1.3;
  q.lines.forEach((line, n) => {
    api.text(line, textX, y + h / 2 + (n - (q.lines.length - 1) / 2) * lh, { size: q.size, color: '#3a2415', align: 'left', stroke: null });
  });
}

function drawPanel(g, api, t) {
  api.text(`SCORE ${api.score}`, PX, 24, { size: 26, align: 'left' });
  drawCard(g, api, 0, 44);
  drawCard(g, api, 1, 182);

  // アツアツボーナス
  const y = 322;
  const rate = heat / HEAT_TIME;
  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath();
  g.roundRect(PX, y, PW, 22, 11);
  g.fill();
  if (rate > 0.01) {
    g.fillStyle = rate > 0.5 ? '#ff7a3d' : rate > 0.2 ? '#f0a23a' : '#9a8a78';
    g.beginPath();
    g.roundRect(PX, y, Math.max(22, PW * rate), 22, 11);
    g.fill();
  }
  api.text(`アツアツボーナス +${Math.round(rate * 100)}`, PX + PW / 2, y + 12, { size: 15 });

  // 下段の土台（背景の絵の上でも文字が読めるように）
  g.fillStyle = 'rgba(20, 10, 7, 0.68)';
  g.beginPath();
  g.roundRect(PX - 4, 350, PW + 8, 184, 14);
  g.fill();

  // 食べる人
  const mood = phase === 'tears' || phase === 'dead' ? 'cry' : phase === 'split' || phase === 'clear' ? 'yum' : phase === 'bite' ? 'open' : 'think';
  drawFace(g, mood, t);

  // ふきだし
  const bx = PX + 148;
  const line = say ? say.text : phase === 'ask' ? (armed ? 'もう一度タップで食べる！' : 'おいしいのはどれだ…？') : phase === 'shuffle' ? '当たりが移動した！' : 'もぐもぐ…';
  g.fillStyle = '#fff3dc';
  g.beginPath();
  g.roundRect(bx, 358, PW - 148, 44, 12);
  g.fill();
  g.beginPath();
  g.moveTo(bx + 2, 372);
  g.lineTo(bx - 12, 382);
  g.lineTo(bx + 2, 390);
  g.fill();
  api.text(line, bx + (PW - 148) / 2, 381, { size: 18, color: '#3a2415', stroke: null });

  // 涙ゲージ
  api.text('涙', bx + 2, 430, { size: 22, align: 'left', color: '#9fd8ff' });
  for (let i = 0; i < MAX_TEARS; i++) {
    g.fillStyle = i < tears ? '#59b8ff' : 'rgba(255, 255, 255, 0.18)';
    tearShape(g, bx + 50 + i * 36, 433, 11);
  }

  const left = remaining().length;
  api.text(`のこり ${left}個`, bx + 2, 472, { size: 22, align: 'left' });
  if (combo >= 2) api.text(`🔥${combo}れんぞく`, PX + PW, 472, { size: 20, align: 'right', color: '#ffd36b' });

  const info = phase === 'ask' && cursor.show ? `えらび中: よこ ${cursor.c + 1}・たて ${cursor.r + 1}` : 'タップ / 矢印キー＋スペース';
  api.text(info, bx + 2, 510, { size: 17, align: 'left', color: '#d8cdb8', weight: 600 });
}

function tearShape(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - s * 1.7);
  g.bezierCurveTo(x + s * 0.4, y - s * 0.8, x + s, y - s * 0.4, x + s, y);
  g.arc(x, y, s, 0, Math.PI);
  g.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s * 0.8, x, y - s * 1.7);
  g.fill();
}

// はちまきを巻いた、たこ焼き屋台のお客さん
function drawFace(g, mood, t) {
  const x = FACE.x + (mood === 'cry' ? Math.sin(t * 38) * 3 : 0);
  const y = FACE.y + (mood === 'yum' ? -Math.abs(Math.sin(t * 7)) * 5 : Math.sin(t * 1.6) * 1.5);
  drawSprite(g, art[mood], x, y, FACE.size);

  // 間違えた数だけ涙が太くなり、止まらない
  if (mood !== 'think' || tears <= 0) return;
  const left = x - FACE.size / 2;
  const top = y - FACE.size / 2;
  const width = 1.5 + tears * 1.1;
  g.fillStyle = 'rgba(120, 200, 255, 0.85)';
  for (const [ex, ey] of [[0.39, 0.46], [0.6, 0.42]]) {
    const px = left + ex * FACE.size;
    const py = top + ey * FACE.size;
    g.fillRect(px - width / 2, py, width, 26);
    tearShape(g, px, py + 30 + ((t * 60 + ex * 100) % 20), 2.5 + tears * 0.5);
  }
}

// ---------------- 絵の下ごしらえ ----------------

function makePlate() {
  const scale = 2;
  const size = N * CELL + 24;
  const c = document.createElement('canvas');
  c.width = size * scale;
  c.height = size * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);

  g.save();
  g.beginPath();
  g.roundRect(0, 0, size, size, 16);
  g.clip();
  g.fillStyle = '#2b2b30';
  g.fillRect(0, 0, size, size);
  if (art.iron) {
    g.drawImage(art.iron, 0, 0, size, size);
    g.fillStyle = 'rgba(12, 12, 16, 0.3)';
    g.fillRect(0, 0, size, size);
  }
  g.restore();
  g.strokeStyle = '#7a6a5c';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(1.5, 1.5, size - 3, size - 3, 15);
  g.stroke();

  for (let r = 0; r < N; r++) {
    for (let col = 0; col < N; col++) {
      const x = 12 + (col + 0.5) * CELL;
      const y = 12 + (r + 0.5) * CELL;
      const hole = g.createRadialGradient(x, y, 4, x, y, 29);
      hole.addColorStop(0, '#0b0b0e');
      hole.addColorStop(0.8, '#141417');
      hole.addColorStop(1, '#6a4428');
      g.fillStyle = hole;
      g.beginPath();
      g.arc(x, y, 29, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}
