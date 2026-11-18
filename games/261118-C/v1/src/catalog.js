// 森にあるものの一覧。d は一番長い辺の大きさ（cm）。
// move: fly=飛ぶ / walk=歩く / hop=はねる
export const CATALOG = [
  // tier 0: 足もとの小さなもの
  { id: 'ladybug', name: 'てんとう虫', d: 2.6, tier: 0, move: 'walk', speed: 0.5 },
  { id: 'acorn', name: 'どんぐり', d: 3, tier: 0 },
  { id: 'bee', name: 'マルハナバチ', d: 3.6, tier: 0, move: 'fly', speed: 1.2 },
  { id: 'pebble', name: 'こけ石', d: 4.2, tier: 0 },
  { id: 'clover', name: 'クローバー', d: 5, tier: 0 },
  { id: 'snail', name: 'カタツムリ', d: 5.4, tier: 0, move: 'walk', speed: 0.18 },
  { id: 'caterpillar', name: 'イモムシ', d: 6, tier: 0, move: 'walk', speed: 0.25 },
  { id: 'pinecone', name: 'まつぼっくり', d: 7.5, tier: 0 },
  { id: 'butterfly', name: '青いチョウ', d: 9, tier: 0, move: 'fly', speed: 0.8 },
  { id: 'toadstool', name: '赤いキノコ', d: 10, tier: 0 },
  { id: 'wildflower', name: '野ばら', d: 12, tier: 0 },
  { id: 'dandelion', name: 'タンポポ', d: 14, tier: 0 },
  // tier 1: 小さな住人たち
  { id: 'frog', name: 'アマガエル', d: 13, tier: 1, move: 'hop', speed: 0.8 },
  { id: 'robin', name: 'コマドリ', d: 15, tier: 1, move: 'hop', speed: 0.7 },
  { id: 'hedgehog', name: 'ハリネズミ', d: 21, tier: 1, move: 'walk', speed: 0.5 },
  { id: 'mushrooms', name: 'キノコのむれ', d: 24, tier: 1 },
  { id: 'bluebell', name: 'ブルーベル', d: 29, tier: 1 },
  { id: 'squirrel', name: 'リス', d: 30, tier: 1, move: 'hop', speed: 0.9 },
  { id: 'owl', name: 'フクロウ', d: 33, tier: 1 },
  { id: 'branch', name: 'こけむした枝', d: 36, tier: 1 },
  { id: 'rabbit', name: 'ウサギ', d: 38, tier: 1, move: 'hop', speed: 0.9 },
  { id: 'beehive', name: 'ミツバチの巣', d: 40, tier: 1 },
  { id: 'fern', name: 'シダ', d: 46, tier: 1 },
  { id: 'berrybush', name: '木いちごの茂み', d: 52, tier: 1 },
  // tier 2: 切り株やけものたち
  { id: 'badger', name: 'アナグマ', d: 76, tier: 2, move: 'walk', speed: 0.45 },
  { id: 'stump', name: '切り株', d: 82, tier: 2 },
  { id: 'barrel', name: 'たる', d: 88, tier: 2 },
  { id: 'fox', name: 'キツネ', d: 95, tier: 2, move: 'walk', speed: 0.8 },
  { id: 'fawn', name: '子ジカ', d: 112, tier: 2, move: 'walk', speed: 0.6 },
  { id: 'bush', name: 'まるい茂み', d: 120, tier: 2 },
  { id: 'boar', name: 'イノシシ', d: 130, tier: 2, move: 'walk', speed: 0.7 },
  { id: 'boulder', name: 'こけむした岩', d: 135, tier: 2 },
  { id: 'wolf', name: 'オオカミ', d: 145, tier: 2, move: 'walk', speed: 0.9 },
  { id: 'wheelbarrow', name: '手おし車', d: 150, tier: 2 },
  { id: 'signpost', name: '森の道しるべ', d: 165, tier: 2 },
  { id: 'log', name: '倒木', d: 180, tier: 2 },
  // tier 3: 大きな動物と若木
  { id: 'bear', name: 'クマ', d: 245, tier: 3, move: 'walk', speed: 0.4 },
  { id: 'stag', name: '大ジカ', d: 270, tier: 3, move: 'walk', speed: 0.6 },
  { id: 'well', name: '古井戸', d: 290, tier: 3 },
  { id: 'cart', name: '荷車', d: 350, tier: 3 },
  { id: 'giantshroom', name: '光る大キノコ', d: 390, tier: 3 },
  { id: 'birch', name: 'シラカバの若木', d: 430, tier: 3 },
  { id: 'pine', name: '若いマツ', d: 490, tier: 3 },
  { id: 'rocks', name: '岩山', d: 540, tier: 3 },
  // tier 4: 小屋と大木
  { id: 'cabin', name: '森の小屋', d: 820, tier: 4 },
  { id: 'arch', name: '石のアーチ', d: 950, tier: 4 },
  { id: 'watermill', name: '水車小屋', d: 1150, tier: 4 },
  { id: 'oak', name: '大きなカシの木', d: 1450, tier: 4 },
  { id: 'tower', name: '見はり台', d: 1600, tier: 4 },
  { id: 'fir', name: '大モミの木', d: 2100, tier: 4 },
];

// 最後の目標
export const FINAL = { id: 'worldtree', name: '世界樹', d: 6000, tier: 5, final: true };
export const FINAL_D = 2600; // この大きさになると世界樹をくっつけられる

export const BY_ID = Object.fromEntries([...CATALOG, FINAL].map((c) => [c.id, c]));

// ステージ（かたまりの直径 cm で切り替わる）
export const STAGES = [
  { from: 0, to: 18, name: '木もれびの足もと', backdrop: 0, trees: 1, rays: 0.3 },
  { from: 18, to: 60, name: '小さな住人の庭', backdrop: 0, trees: 1, rays: 0.26 },
  { from: 60, to: 200, name: 'けものたちの小道', backdrop: 1, trees: 1, rays: 0.2 },
  { from: 200, to: 700, name: '若木の森', backdrop: 1, trees: 0, rays: 0.14 },
  { from: 700, to: 4000, name: 'はるかな谷', backdrop: 2, trees: 0, rays: 0.08 },
];

export const IMAGE_FILES = [
  ...[...CATALOG, FINAL].map((c) => [c.id, `${c.id}.webp`]),
  ['bg0', 'bg_morning.jpg'],
  ['bg1', 'bg_glade.jpg'],
  ['bg2', 'bg_valley.jpg'],
  ['trees', 'layer_trees.webp'],
  ['ground', 'layer_ground.webp'],
  ['front', 'layer_front.webp'],
];
