// パンパン！もりのポスト
// 動物たちがポストに手紙を入れていく。ボタンでヤギの郵便屋さんが回収に出発。
// 一度にたくさん回収するほど高得点（通数の2乗）。入れすぎるとポストが破裂してゲームオーバー。

const CAP = 30; // これを超えると破裂
const RATE_PER_TRIP = 0.3; // 出発するたびに森がにぎやかになる（連打が得にならないように）
const POST = { x: 570, y: 398 };
const SLOT = { x: POST.x, y: 199 };
const HOME_X = 150;
const STOP_X = POST.x - 100;
const GOAT_Y = 420;
const BUTTON = { x: 330, y: 460, w: 300, h: 66 };

const KINDS = [
  { key: 'squirrel', letters: 1, h: 70 },
  { key: 'rabbit', letters: 1, h: 82 },
  { key: 'fox', letters: 1, h: 84 },
  { key: 'raccoon', letters: 2, h: 86 },
  { key: 'badger', letters: 2, h: 88 },
  { key: 'bear', letters: 3, h: 100 },
];

const TIERS = [
  { min: 28, name: 'ギリギリ!!', mult: 2, color: '#ff5a4f' },
  { min: 22, name: 'パンパン!', mult: 1, color: '#ff9a3d' },
  { min: 12, name: 'どっさり', mult: 1, color: '#ffd36b' },
  { min: 0, name: 'こつこつ', mult: 1, color: '#a9e08f' },
];
const tierOf = (n) => TIERS.find((t) => n >= t.min);
const payout = (n) => n * n * tierOf(n).mult;

const images = {};
function load(name, file) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      images[name] = im;
      resolve();
    };
    im.onerror = () => resolve();
    im.src = new URL(`../assets/${file}`, import.meta.url).href;
  });
}

function fresh() {
  return {
    n: 0,
    squash: 0,
    animals: [],
    flights: [],
    debris: [],
    popups: [],
    goat: { x: HOME_X, phase: 'home', t: 0, carry: 0, walk: 0 },
    spawnT: 0.5,
    rushT: 22,
    rushLeft: 0,
    rushGap: 0,
    alarmT: 0,
    banner: null,
    burstT: 0,
    flash: 0,
    maxBatch: 0,
    trips: 0,
    best: 0,
    press: 0,
  };
}

let s = fresh();

function readBest(api) {
  try {
    return Number(localStorage.getItem(`sandbox-live:best:${api.meta.id}`)) || 0;
  } catch {
    return 0;
  }
}

function popup(text, x, y, color = '#fff3dc', size = 28, life = 1.1) {
  s.popups.push({ text, x, y, color, size, life, age: 0 });
}

function spawnAnimal(api) {
  const kind = api.pick(KINDS);
  s.animals.push({
    kind,
    x: api.W + api.rand(40, 90),
    y: api.rand(392, 442),
    speed: api.rand(140, 180),
    stopX: POST.x + api.rand(78, 130),
    phase: 'in',
    t: 0,
    walk: api.rand(0, 6),
    alpha: 1,
  });
  return kind;
}

function deposit(api, count) {
  s.n += count;
  s.squash = 1;
  api.tone({ type: 'triangle', from: 260 + s.n * 24, dur: 0.08, vol: 0.13 });
  if (count > 1) popup(`+${count}`, POST.x + 62, SLOT.y - 14, '#ffe9a8', 26, 0.7);
  if (s.n > CAP && s.burstT === 0) startBurst(api);
}

function collect(api) {
  const n = s.n;
  const goat = s.goat;
  s.n = 0;
  goat.carry = n;
  goat.phase = 'take';
  goat.t = 0;
  if (n === 0) {
    popup('からっぽ…', STOP_X, 250, '#d8cdb8', 28);
    api.sfx('hit');
    return;
  }
  const tier = tierOf(n);
  const gain = payout(n);
  api.addScore(gain);
  s.maxBatch = Math.max(s.maxBatch, n);
  for (let i = 0; i < Math.min(n, 16); i++) {
    s.flights.push({
      x0: SLOT.x, y0: SLOT.y, x1: goat.x, y1: GOAT_Y - 110,
      t: -i * 0.022, dur: 0.3, arc: 50, rot: api.rand(-1, 1), count: 0,
    });
  }
  popup(`${n}通！ ${tier.name}${tier.mult > 1 ? ' ×2' : ''}`, 270, 190, tier.color, n >= 22 ? 40 : 32, 1.5);
  popup(`+${gain}`, 270, 240, '#fff3dc', n >= 22 ? 50 : 38, 1.5);
  api.sfx('coin');
  if (n >= 12) [0, 1, 2].forEach((i) => api.tone({ type: 'triangle', from: 660 + i * 220, dur: 0.1, delay: 0.1 + i * 0.07 }));
  if (n >= 28) {
    api.sfx('power');
    api.shake(12);
    api.burst(STOP_X, GOAT_Y - 80, '#ffd36b', 46, 360);
  } else if (n >= 12) {
    api.burst(STOP_X, GOAT_Y - 80, '#ffd36b', 18);
  }
}

function startBurst(api) {
  s.burstT = 0.0001;
  s.flash = 1;
  s.flights = [];
  s.banner = null;
  api.shake(36);
  api.sfx('explode');
  api.tone({ type: 'sawtooth', from: 220, to: 40, dur: 0.6, vol: 0.2 });
  api.burst(POST.x, 230, '#ff4f3d', 70, 520);
  api.burst(POST.x, 230, '#fffaf0', 60, 460);
  for (let i = 0; i < 56; i++) {
    const a = api.rand(0, Math.PI * 2);
    const v = api.rand(180, 760);
    s.debris.push({
      x: POST.x, y: 230, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 240,
      rot: api.rand(0, 6), vr: api.rand(-12, 12),
    });
  }
  for (const a of s.animals) {
    a.phase = 'out';
    a.speed = 460;
  }
}

function drawEnvelope(g, x, y, rot = 0, scale = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(scale, scale);
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#a98f68';
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(-12, -8, 24, 16, 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(-12, -8);
  g.lineTo(0, 2);
  g.lineTo(12, -8);
  g.stroke();
  g.restore();
}

function shadow(g, x, y, rx) {
  g.fillStyle = 'rgba(40, 28, 10, 0.28)';
  g.beginPath();
  g.ellipse(x, y, rx, rx * 0.26, 0, 0, Math.PI * 2);
  g.fill();
}

function drawPost(g, now) {
  const r = s.n / CAP;
  shadow(g, POST.x, POST.y, 62);
  if (s.burstT > 0) {
    const im = images.post1;
    if (im) {
      const cut = im.height * 0.71;
      g.drawImage(im, 0, cut, im.width, im.height - cut, POST.x - 150, POST.y - 287 + 300 * 0.71, 300, 300 * 0.29);
    }
    return;
  }
  if (s.n >= 22) {
    const pulse = 0.35 + 0.25 * Math.sin(now * (s.n >= 28 ? 16 : 8));
    const glow = g.createRadialGradient(POST.x, 240, 20, POST.x, 240, 210);
    glow.addColorStop(0, `rgba(255, 90, 40, ${pulse})`);
    glow.addColorStop(1, 'rgba(255, 90, 40, 0)');
    g.fillStyle = glow;
    g.fillRect(POST.x - 220, 30, 440, 420);
  }
  const im = s.n >= 22 ? images.post3 : s.n >= 12 ? images.post2 : images.post1;
  if (!im) return;
  const shake = s.n >= 22 ? (s.n - 20) * 0.45 : 0;
  g.save();
  g.translate(POST.x + (Math.random() - 0.5) * shake, POST.y + (Math.random() - 0.5) * shake * 0.5);
  g.scale(1 + r * 0.06 + s.squash * 0.09, 1 + r * 0.03 - s.squash * 0.07);
  g.drawImage(im, -150, -287, 300, 300);
  g.restore();
}

function drawGoat(g) {
  const goat = s.goat;
  const im = images.goat;
  shadow(g, goat.x, GOAT_Y, 42);
  if (!im) return;
  const moving = goat.phase === 'go' || goat.phase === 'back';
  const hop = moving ? Math.abs(Math.sin(goat.walk)) * 7 : 0;
  const tilt = moving ? Math.sin(goat.walk) * 0.05 : 0;
  const h = 132;
  const w = (h * im.width) / im.height;
  g.save();
  g.translate(goat.x, GOAT_Y - hop);
  if (goat.phase === 'back') g.scale(-1, 1);
  g.rotate(tilt);
  g.drawImage(im, -w / 2, -h, w, h);
  g.restore();
  if (goat.carry > 0 && goat.phase !== 'take') {
    const stack = Math.min(goat.carry, 12);
    for (let i = 0; i < stack; i++) {
      const sway = Math.sin(goat.walk + i * 0.5) * i * 0.7;
      drawEnvelope(g, goat.x + sway, GOAT_Y - hop - h - 2 - i * 8, ((i * 37) % 7) * 0.03 - 0.1, 1.05);
    }
  }
}

function drawAnimal(g, a, api) {
  const im = images[a.kind.key];
  if (!im) return;
  const h = a.kind.h;
  const w = (h * im.width) / im.height;
  const hop = a.phase === 'post' ? 0 : Math.abs(Math.sin(a.walk)) * 6;
  g.save();
  g.globalAlpha = a.alpha;
  shadow(g, a.x, a.y, w * 0.34);
  g.translate(a.x, a.y - hop);
  if (a.phase === 'out') g.scale(-1, 1);
  g.drawImage(im, -w / 2, -h, w, h);
  g.restore();
  if (a.phase === 'in' && a.kind.letters > 1) {
    const by = a.y - hop - h - 14;
    g.fillStyle = a.kind.letters === 3 ? '#d8452f' : '#c9832a';
    g.beginPath();
    g.arc(a.x, by, 15, 0, Math.PI * 2);
    g.fill();
    api.text(`×${a.kind.letters}`, a.x, by + 1, { size: 16, stroke: null });
  }
}

function drawHud(g, api, now) {
  api.text(`SCORE ${api.score}`, 20, 30, { size: 26, align: 'left' });
  api.text(`BEST ${Math.max(s.best, api.score)}`, 20, 60, { size: 18, align: 'left', color: '#e9dfc9' });
  api.text(`${s.trips} 便目`, 20, 86, { size: 18, align: 'left', color: '#e9dfc9' });

  const x = 310;
  const y = 16;
  const w = 340;
  const h = 28;
  const ratio = Math.min(1, s.n / CAP);
  const tier = tierOf(s.n);
  g.fillStyle = 'rgba(20, 16, 10, 0.72)';
  g.beginPath();
  g.roundRect(x - 4, y - 4, w + 8, h + 8, 10);
  g.fill();
  g.fillStyle = 'rgba(255, 70, 50, 0.35)';
  g.fillRect(x + (w * 28) / CAP, y, (w * 2) / CAP, h);
  g.fillStyle = tier.color;
  g.fillRect(x, y, w * ratio, h);
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (const mark of [12, 22, 28]) g.fillRect(x + (w * mark) / CAP - 1, y, 2, h);
  api.text(`${s.n} / ${CAP} 通`, x + w / 2, y + h / 2 + 1, { size: 19 });

  if (s.n > 0 && s.burstT === 0) {
    const label = `いま回収 +${payout(s.n)}${tier.mult > 1 ? ' (×2)' : ''}`;
    api.text(label, x + w / 2, 66, { size: 19, color: tier.color });
  }

  // 大きなボタン（破裂したら消す）
  if (s.burstT > 0) return;
  const goat = s.goat;
  const ready = goat.phase === 'home';
  const b = BUTTON;
  const sink = s.press * 4;
  g.fillStyle = 'rgba(30, 20, 8, 0.55)';
  g.beginPath();
  g.roundRect(b.x, b.y + 6, b.w, b.h, 22);
  g.fill();
  g.fillStyle = ready ? (s.n >= 22 && Math.sin(now * 12) > 0 ? '#ff6a3d' : '#e8562f') : '#7d7468';
  g.beginPath();
  g.roundRect(b.x, b.y + sink, b.w, b.h, 22);
  g.fill();
  g.strokeStyle = 'rgba(255, 244, 220, 0.8)';
  g.lineWidth = 3;
  g.stroke();
  const label = ready ? '回収にいく！' : goat.phase === 'back' ? 'もどり中…' : 'いってきます…';
  api.text(label, b.x + b.w / 2, b.y + 26 + sink, { size: 28 });
  api.text('スペース / タップ', b.x + b.w / 2, b.y + 52 + sink, { size: 13, color: '#ffe9c9', weight: 600 });
}

export default {
  title: 'パンパン！もりのポスト',
  howTo: 'ボタンでヤギが回収へ！ ためるほど高得点、入れすぎると破裂',
  controls: [], // 画面のどこをタップしても出発するのでスマホ用ボタンは出さない
  hud: false, // 右上の隅を空けるためスコアは自前で左上に描く

  async init() {
    await Promise.all([
      load('bg', 'bg.jpg'),
      load('post1', 'post1.webp'),
      load('post2', 'post2.webp'),
      load('post3', 'post3.webp'),
      load('goat', 'goat.webp'),
      ...KINDS.map((k) => load(k.key, `${k.key}.webp`)),
    ]);
  },

  start(api) {
    s = fresh();
    s.best = readBest(api);
  },

  update(dt, api) {
    const goat = s.goat;
    s.squash = Math.max(0, s.squash - dt * 5);
    s.press = Math.max(0, s.press - dt * 6);
    s.flash = Math.max(0, s.flash - dt * 2.4);

    for (const p of s.popups) {
      p.age += dt;
      p.y -= 26 * dt;
    }
    s.popups = s.popups.filter((p) => p.age < p.life);
    if (s.banner) {
      s.banner.t -= dt;
      if (s.banner.t <= 0) s.banner = null;
    }

    // 動物
    for (const a of s.animals) {
      a.t += dt;
      if (a.phase === 'in') {
        a.x -= a.speed * dt;
        a.walk += dt * 11;
        if (a.x <= a.stopX) {
          a.phase = 'post';
          a.t = 0;
        }
      } else if (a.phase === 'post') {
        if (!a.thrown && a.t >= 0.14) {
          a.thrown = true;
          s.flights.push({
            x0: a.x - 20, y0: a.y - a.kind.h * 0.5, x1: SLOT.x, y1: SLOT.y,
            t: 0, dur: 0.3, arc: 70, rot: 0, count: a.kind.letters,
          });
          api.sfx('select');
        }
        if (a.t >= 0.32) {
          a.phase = 'out';
          a.t = 0;
        }
      } else {
        a.x += a.speed * 1.25 * dt;
        a.walk += dt * 13;
        a.alpha = Math.max(0, a.alpha - dt * 1.5);
      }
    }
    s.animals = s.animals.filter((a) => a.alpha > 0 && a.x < api.W + 120);

    // 破裂の演出中
    if (s.burstT > 0) {
      s.burstT += dt;
      for (const d of s.debris) {
        d.vy += 620 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.vr * dt;
      }
      if (s.burstT > 1.8) api.gameOver();
      return;
    }

    // 飛んでいる手紙
    for (const f of s.flights) {
      f.t += dt;
      if (f.t >= f.dur && !f.done) {
        f.done = true;
        if (f.count > 0) deposit(api, f.count);
      }
    }
    if (s.burstT > 0) return;
    s.flights = s.flights.filter((f) => !f.done);

    // だんだん手紙のペースが上がる
    const rate = Math.min(11, 1.4 + s.trips * RATE_PER_TRIP + api.time * 0.01);
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      const kind = spawnAnimal(api);
      s.spawnT = (kind.letters / rate) * api.rand(0.7, 1.3);
    }
    s.rushT -= dt;
    if (s.rushT <= 0) {
      s.rushT = api.rand(16, 24);
      s.rushLeft = api.randInt(4, 6) + Math.floor(s.trips / 6);
      s.banner = { text: '団体さんが来た！', t: 1.8 };
      api.sfx('power');
    }
    if (s.rushLeft > 0) {
      s.rushGap -= dt;
      if (s.rushGap <= 0) {
        s.rushGap = 0.2;
        s.rushLeft -= 1;
        spawnAnimal(api);
      }
    }

    // 危険なときの警告音
    if (s.n >= 22) {
      s.alarmT -= dt;
      if (s.alarmT <= 0) {
        s.alarmT = s.n >= 28 ? 0.26 : 0.58;
        api.tone({ type: 'square', from: s.n >= 28 ? 880 : 520, dur: 0.06, vol: 0.07 });
      }
    }

    // ボタン1つ: 出発
    if (api.input.pressed.action || api.input.pointer.pressed) {
      s.press = 1;
      if (goat.phase === 'home') {
        goat.phase = 'go';
        s.trips += 1;
        if (s.trips % 5 === 0) s.banner = { text: '森がにぎやかになってきた！', t: 1.8 };
        api.sfx('jump');
      } else {
        api.tone({ type: 'square', from: 150, dur: 0.05, vol: 0.06 });
      }
    }

    // ヤギの郵便屋さん（たくさん持つほど帰りが遅い）
    goat.t += dt;
    if (goat.phase === 'go') {
      goat.x += 270 * dt;
      goat.walk += dt * 13;
      if (goat.x >= STOP_X) {
        goat.x = STOP_X;
        collect(api);
      }
    } else if (goat.phase === 'take') {
      if (goat.t >= 0.36) goat.phase = 'back';
    } else if (goat.phase === 'back') {
      goat.x -= api.clamp(330 - goat.carry * 5, 180, 330) * dt;
      goat.walk += dt * 11;
      if (goat.x <= HOME_X) {
        goat.x = HOME_X;
        goat.carry = 0;
        goat.phase = 'home';
        api.sfx('select');
      }
    }
  },

  draw(g, api, scene) {
    const now = performance.now() / 1000;
    if (images.bg) g.drawImage(images.bg, 0, 0, api.W, api.H);
    else {
      g.fillStyle = '#5d7f4a';
      g.fillRect(0, 0, api.W, api.H);
    }

    // 手前のものが上に重なるよう足元の高さ順に描く
    const layers = [
      { y: POST.y, draw: () => drawPost(g, now) },
      { y: GOAT_Y, draw: () => drawGoat(g) },
      ...s.animals.map((a) => ({ y: a.y, draw: () => drawAnimal(g, a, api) })),
    ];
    layers.sort((a, b) => a.y - b.y);
    for (const layer of layers) layer.draw();

    for (const f of s.flights) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      const x = f.x0 + (f.x1 - f.x0) * k;
      const y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * f.arc;
      drawEnvelope(g, x, y, f.rot + k * 3);
    }
    for (const d of s.debris) drawEnvelope(g, d.x, d.y, d.rot, 1.2);

    // 破裂寸前は画面のふちが赤く脈打つ
    if (s.n >= 22 && s.burstT === 0) {
      const a = (s.n >= 28 ? 0.42 : 0.22) + 0.14 * Math.sin(now * (s.n >= 28 ? 14 : 7));
      const edge = g.createRadialGradient(api.W / 2, api.H / 2, 240, api.W / 2, api.H / 2, 620);
      edge.addColorStop(0, 'rgba(220, 30, 20, 0)');
      edge.addColorStop(1, `rgba(220, 30, 20, ${a})`);
      g.fillStyle = edge;
      g.fillRect(0, 0, api.W, api.H);
    }

    for (const p of s.popups) {
      g.globalAlpha = Math.min(1, (p.life - p.age) * 3);
      api.text(p.text, p.x, p.y, { size: p.size, color: p.color });
    }
    g.globalAlpha = 1;

    if (s.banner) api.text(s.banner.text, 300, 120, { size: 34, color: '#ffd36b' });

    if (s.flash > 0) {
      g.fillStyle = `rgba(255, 244, 220, ${s.flash})`;
      g.fillRect(0, 0, api.W, api.H);
    }

    if (scene !== 'playing') return;
    drawHud(g, api, now);
    if (s.burstT > 0) {
      api.text('ポスト破裂！！', api.W / 2, 200, { size: 68, color: '#ff5a4f' });
      if (s.maxBatch > 0) api.text(`最高 ${s.maxBatch} 通まとめて回収`, api.W / 2, 268, { size: 30 });
    }
  },
};
