// ゲームの中身。AIはまずこのファイルを書き換える。
// いまは見本として「星あつめ」（落ちてくる星を取り、爆弾をよける）が入っている。
//
// 使える道具（api）:
//   api.W, api.H            画面の大きさ（960×540 固定。スマホでも自動で拡大縮小される）
//   api.input.left/right/up/down/action   押している間 true
//   api.input.pressed.action など           押した瞬間だけ true
//   api.input.pointer       { x, y, down, pressed, active }  タップ・マウス位置（ゲーム内座標）
//   api.addScore(n) / api.score / api.time
//   api.gameOver()          ゲームオーバー（リザルト画面へ）
//   api.sfx('coin'|'jump'|'shoot'|'hit'|'explode'|'power'|'select'|'gameover')
//   api.burst(x, y, color, count)   パーティクル
//   api.shake(power)        画面を揺らす
//   api.rand(a, b) / api.randInt(a, b) / api.pick(arr) / api.clamp(v, a, b)
//   api.hit(rectA, rectB) / api.hitCircle(circleA, circleB)   当たり判定
//   api.text(str, x, y, { size, color, align })                文字

let player;
let items;
let lives;
let spawnTimer;

export default {
  title: '動作確認テスト',
  howTo: '◀ ▶ で移動。⭐を集めて💣をよけよう',
  controls: ['left', 'right'], // スマホに出すボタン（left/right/up/down/action）

  start(api) {
    player = { x: api.W / 2 - 40, y: api.H - 60, w: 80, h: 18, speed: 520 };
    items = [];
    lives = 3;
    spawnTimer = 0;
  },

  update(dt, api) {
    const { input } = api;

    // 移動（キー・ボタン、またはタップした位置へ）
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!dir && input.pointer.down) {
      const center = player.x + player.w / 2;
      if (Math.abs(input.pointer.x - center) > 8) dir = Math.sign(input.pointer.x - center);
    }
    player.x = api.clamp(player.x + dir * player.speed * dt, 0, api.W - player.w);

    // だんだん難しく
    const level = 1 + api.time / 20;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = api.rand(0.35, 0.8) / level;
      const bomb = Math.random() < 0.25 + Math.min(0.2, api.time / 200);
      items.push({ x: api.rand(30, api.W - 30), y: -20, r: bomb ? 18 : 14, vy: api.rand(160, 240) * level, bomb });
    }

    for (const it of items) it.y += it.vy * dt;

    const body = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (const it of items) {
      if (it.dead) continue;
      if (api.hit({ x: it.x - it.r, y: it.y - it.r, w: it.r * 2, h: it.r * 2 }, body)) {
        it.dead = true;
        if (it.bomb) {
          lives -= 1;
          api.sfx('explode');
          api.shake(14);
          api.burst(it.x, it.y, '#ff4f6a', 30, 320);
          if (lives <= 0) api.gameOver();
        } else {
          api.addScore(10);
          api.sfx('coin');
          api.burst(it.x, it.y, '#ffd36b', 14);
        }
      }
    }
    items = items.filter((it) => !it.dead && it.y < api.H + 40);
  },

  draw(g, api) {
    // 背景
    const grad = g.createLinearGradient(0, 0, 0, api.H);
    grad.addColorStop(0, '#2a3470');
    grad.addColorStop(1, '#1c2140');
    g.fillStyle = grad;
    g.fillRect(0, 0, api.W, api.H);

    if (!player) return; // タイトル画面ではまだ未初期化

    // 落ちてくるもの
    for (const it of items) {
      g.font = `${it.r * 2}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(it.bomb ? '💣' : '⭐', it.x, it.y);
    }

    // プレイヤー
    g.fillStyle = '#ff7a3d';
    g.beginPath();
    g.roundRect(player.x, player.y, player.w, player.h, 9);
    g.fill();

    // 残りライフ
    api.text('❤'.repeat(Math.max(0, lives)), api.W / 2, 30, { size: 26, color: '#ff4f6a' });
  },
};
