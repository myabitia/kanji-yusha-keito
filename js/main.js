// 漢字の勇者ケイト — ゲームの流れ（タイトル → 主人公 → 学年 → 王さま → 冒険40問 → 分岐 or 魔王城10問 → エンディング → リザルト）
import { unlockAudio, sfx, playBgm, stopBgm, setMuted, isMuted } from './audio.js';
import { loadQuestions, makeChoices, Deck } from './quiz.js';
import {
  $, wait, rand, randInt, pickOne, ruby, plain, img, restart, flash, shake, burstText, damage, particles,
  slash, bolts, learnChip, banner, cutin, gacha, sparkles, castleFx, speed,
} from './fx.js';

const LABEL = {
  reading: 'よみ', writing: 'かき', fill: 'あなうめ', kanjiUse: 'つかう ことば', wrongKanji: 'まちがいさがし',
  meaning: 'いみ', okurigana: 'おくりがな', sentenceReading: '文の中の よみ', sentenceWriting: '文の中の かき',
  similar: 'にた かんじ', combine: 'くみあわせ', usage: 'つかいかた',
};
const RANK = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const KIND_LABEL = { weapon: 'でんせつの ぶき', pet: 'なかま', element: 'ぞくせい' };
const isKanji = (s) => /[㐀-鿿]/.test(s);

let G = null; // data/game.json
let S = null; // 1回のプレイの状態（ブラウザを閉じたら消える）
let questionCache = { grade: 0, list: null };
const settings = { hero: 'keito', grade: 3 };

// ---------- 画面ユーティリティ ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}
function setBg(el, name) { el.style.backgroundImage = name ? `url(${img(name)})` : 'none'; }
function fitHeight() {
  // 古いブラウザ（dvh 非対応）向けに、見えている高さを CSS 変数に入れる
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
}
const hero = () => G.heroes[settings.hero];
const fill = (s) => s.replaceAll('{HERO}', hero().name).replaceAll('{I}', hero().I);

function preload(names, onEach) {
  return Promise.all(names.map((n) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { onEach && onEach(); res(); };
    im.src = img(n);
  })));
}

function tapAnywhere(el) {
  return new Promise((res) => {
    const h = (e) => { e.preventDefault(); el.removeEventListener('pointerup', h); res(); };
    setTimeout(() => el.addEventListener('pointerup', h), 220);
  });
}

// ---------- 起動 ----------
async function boot() {
  fitHeight();
  window.addEventListener('resize', fitHeight);
  const msgs = ['勇者を しょうかん中……', '漢字パワーを あつめています……', 'たからばこを かくしています……', 'モンスターが じゅんび中……'];
  let mi = 0;
  const msgTimer = setInterval(() => { $('#loading-text').textContent = msgs[++mi % msgs.length]; }, 900);
  try {
    G = await (await fetch('data/game.json')).json();
    const first = ['hero_keito', 'hero_yuuri', 'king', 'bg_plains', 'bg_throne', 'chest'];
    let done = 0;
    await preload(first, () => { $('#loading-fill').style.width = (++done / first.length) * 100 + '%'; });
  } catch (e) {
    $('#loading-text').textContent = 'よみこみに しっぱいしました。start.bat から ひらいてね。';
    clearInterval(msgTimer);
    console.error(e);
    return;
  }
  clearInterval(msgTimer);
  document.querySelectorAll('.bg[data-bg]').forEach((b) => setBg(b, b.dataset.bg));
  sparkles($('.title-sparkles'));
  bindUI();
  show('screen-title');
}

function bindUI() {
  // ボタンをおした感触（全部のボタン）
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) { unlockAudio(); sfx('tap'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {} }
  });

  $('#btn-start').addEventListener('click', () => {
    unlockAudio();
    playBgm('title');
    show('screen-hero');
  });
  document.querySelectorAll('.hero-card').forEach((c) => c.addEventListener('click', () => {
    settings.hero = c.dataset.hero;
    sfx('select');
    $('#grade-hero').src = img(hero().img);
    $('#grade-hero-name').textContent = hero().name;
    show('screen-grade');
  }));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show('screen-' + b.dataset.back)));
  document.querySelectorAll('.grade-btn').forEach((b) => b.addEventListener('click', () => {
    settings.grade = Number(b.dataset.grade);
    sfx('select');
    newGame(true);
  }));
  $('#btn-sound').addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    setMuted(!isMuted());
    $('#btn-sound').textContent = isMuted() ? '🔇' : '🔊';
    $('#btn-sound').classList.toggle('off', isMuted());
  });
  $('#btn-again').addEventListener('click', () => newGame(false));
  $('#btn-title').addEventListener('click', () => { stopBgm(); playBgm('title'); show('screen-title'); });

  // PCではキーボードでも遊べる（1〜4 / A〜D、Enter）
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? ['1', '2', '3', '4'].indexOf(k) : ['a', 'b', 'c', 'd'].indexOf(k);
    if (idx >= 0 && $('#screen-battle').classList.contains('active')) document.querySelectorAll('.ans')[idx]?.click();
    if (k === 'enter' || k === ' ') {
      if ($('#explain').classList.contains('show')) $('#btn-next').click();
      else if ($('#gacha').classList.contains('show')) $('#gacha').click();
    }
  });
}

// ---------- 会話シーン ----------
function speakerInfo(sp) {
  if (sp === 'hero') return { name: hero().name, img: hero().img };
  if (sp === 'boss') { const m = G.monsters[S.bossId]; return { name: m.name, img: m.img, boss: true }; }
  if (sp === 'narr') return { name: '', img: hero().img };
  return G.people[sp];
}

async function playStory(lines, bg) {
  show('screen-story');
  setBg($('#story-bg'), bg);
  const box = $('#screen-story');
  let prevImg = null;
  for (const [sp, text] of lines) {
    const info = speakerInfo(sp);
    const p = $('#story-portrait');
    if (info.img !== prevImg) {
      p.src = img(info.img);
      p.className = 'story-portrait' + (info.boss ? ' boss' : '');
      restart(p, 'pop');
      prevImg = info.img;
    }
    $('#story-name').style.display = info.name ? '' : 'none';
    $('#story-name').innerHTML = ruby(info.name || '');
    const t = $('#story-text');
    t.innerHTML = ruby(fill(text));
    t.style.opacity = 0;
    t.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 250, fill: 'forwards' });
    sfx('story');
    await tapAnywhere(box);
  }
}

// ---------- ゲーム開始 ----------
async function newGame(withIntro) {
  S = {
    log: [], shownQ: 1,
    n: 0, correct: 0, combo: 0, maxCombo: 0, power: 0, hp: 100, lv: 1,
    route: 'main', routeN: 0, missAt: null, branchAt: null, bossSpawned: false, bossId: null,
    areaIdx: -1, waveIdx: 0, monster: null, kills: 0, finalMiss: 0, sinceChest: 0,
    owned: { weapon: new Set(), pet: new Set(), element: new Set() }, best: { weapon: null, pet: null, element: null },
  };
  // 問題の読みこみは会話中に裏で進める
  const loading = questionCache.grade === settings.grade
    ? Promise.resolve(questionCache.list)
    : loadQuestions(settings.grade).then((list) => { questionCache = { grade: settings.grade, list }; return list; });
  loading.catch(() => {});
  if (withIntro) {
    playBgm('title');
    await playStory(G.intro, 'bg_throne');
  }
  let list;
  try { list = await loading; } catch (e) {
    alert('もんだいを よみこめませんでした。start.bat から ひらいてください。');
    show('screen-title');
    return;
  }
  S.deck = new Deck(list, settings.grade);
  // ほかの画像は裏で読んでおく
  preload(Object.values(G.monsters).map((m) => m.img).concat(['bg_village', 'bg_forest', 'bg_ruins', 'bg_cave', 'bg_castle', 'villager', 'p_fairy']));
  setupBattleScreen();
  show('screen-battle');
  runGame();
}

function setupBattleScreen() {
  $('#hero-img').src = img(hero().img);
  $('#pet-img').className = 'pet-img';
  $('#magic-circle').classList.remove('on');
  $('#battle-bg').style.filter = '';
  castleFx(false);
  $('#combo').innerHTML = '';
  $('#fx-layer').innerHTML = '';
  $('#explain').classList.remove('show');
  updateHud();
  updateEquip();
}

function updateHud() {
  const qno = S.shownQ || 1;
  $('#hud-qno').innerHTML = settings.grade <= 2 ? `<ruby>第<rt>だい</rt></ruby>${qno}<ruby>問<rt>もん</rt></ruby>` : `第${qno}問`;
  const lvl = Math.min(5, S.combo);
  $('#power-fill').style.width = (S.combo >= 5 ? 100 : lvl * 20) + '%';
  $('.power-bar').classList.toggle('max', S.combo >= 5);
  $('#power-num').textContent = S.power.toLocaleString();
  $('#hero-hp-fill').style.width = S.hp + '%';
  $('.hp-bar').classList.toggle('low', S.hp < 35);
  $('#hero-lv').textContent = 'Lv.' + S.lv;
}

function setArea(name) { $('#hud-area').innerHTML = ruby(name); }

// ---------- メインループ ----------
async function runGame() {
  for (;;) {
    const qno = S.n + 1;
    if (S.route === 'main') {
      if (S.branchAt && qno === S.branchAt) { await startBranch(); continue; }
      if (qno === 41) { await startMaou(); continue; }
      const area = Math.floor((qno - 1) / 10);
      if (area !== S.areaIdx) await enterArea(area);
      if (!S.monster || S.monster.hp <= 0) await spawnMainMonster();
      // たまに宝箱イベント
      if (qno > 3 && S.sinceChest >= 4 && Math.random() < 0.12) {
        await banner('たからばこを<br>みつけた！', { small: 'ラッキー！', cls: 'gold', ms: 1100 });
        await openChest({});
      }
    } else {
      if (S.routeN >= 10) { await finishRoute(); return; }
      await routeSpawn();
    }
    S.shownQ = qno;
    updateHud();
    const phase = S.route === 'main' ? 'main' : S.route === 'maou' ? 'final' : 'dungeon';
    const q = S.deck.pick(phase, S.route === 'main' ? qno : S.routeN + 1);
    const ok = await askQuestion(q);
    S.log.push({ no: qno, id: q.id, grade: q.grade, type: q.type, route: S.route, ok, pos: S.current.correctIndex });
    S.n++;
    if (S.route !== 'main') S.routeN++;
    S.sinceChest++;
    if (ok) await onCorrect(q);
    else await onWrong(q, qno);
  }
}

async function enterArea(i) {
  S.areaIdx = i;
  S.waveIdx = 0;
  const a = G.areas[i];
  setBg($('#battle-bg'), a.bg);
  setArea(a.name);
  playBgm(a.bgm);
  $('#enemy').style.visibility = 'hidden';
  $('#enemy-hud').style.opacity = 0;
  await banner(ruby(a.name), { small: `AREA ${i + 1}`, ms: 1500 });
}

function setMonster(id, hits, { boss = false, elite = false } = {}) {
  const m = G.monsters[id];
  S.monster = { id, name: m.name, hp: hits, max: hits, boss, elite };
  const en = $('#enemy');
  en.className = 'enemy' + (boss ? ' boss' : '');
  en.style.visibility = 'visible';
  const im = $('#enemy-img');
  im.src = img(m.img);
  // ザコは たまに色ちがい
  im.style.filter = !boss && !elite && Math.random() < 0.3 ? `hue-rotate(${randInt(60, 300)}deg)` : '';
  restart(en, 'appear');
  $('#enemy-name').innerHTML = (elite ? '★ ' : '') + ruby(m.name);
  const hud = $('#enemy-hud');
  hud.style.opacity = 1;
  hud.classList.toggle('boss', boss);
  $('#enemy-hp-segs').innerHTML = '<span></span>'.repeat(hits);
  updateEnemyHp();
}
function updateEnemyHp() {
  $('#enemy-hp-fill').style.width = (S.monster.hp / S.monster.max) * 100 + '%';
}

async function spawnMainMonster() {
  const a = G.areas[S.areaIdx];
  const wave = a.waves[Math.min(S.waveIdx, a.waves.length - 1)];
  const useWave = S.waveIdx >= a.waves.length ? a.waves[0] : wave;
  S.waveIdx++;
  setMonster(pickOne(useWave.pool), useWave.hits, { elite: !!useWave.elite && S.waveIdx <= a.waves.length });
  if (S.monster.elite) await banner('つよい てきが<br>あらわれた！', { small: '⚠ ちゅうい', cls: 'warning', ms: 1100 });
  else await wait(450);
}

// ---------- 1問 ----------
function renderQuestion(q) {
  const big = $('#q-big');
  const card = $('#q-card');
  $('#q-type').textContent = LABEL[q.type] || 'もんだい';
  let b = q.big || '';
  big.className = 'q-big';
  if (q.type === 'similar' || q.type === 'usage' || q.type === 'wrongKanji') b = '';
  if (!b) {
    big.classList.add('empty');
    big.innerHTML = '';
  } else if (q.type === 'sentenceReading' || q.type === 'sentenceWriting') {
    big.classList.add('sentence');
    big.innerHTML = escapeHtml(b).replace(/［(.+?)］/, '<mark>$1</mark>');
  } else if (q.type === 'fill') {
    big.innerHTML = escapeHtml(b).replace('□', '<span class="blank">□</span>');
  } else {
    if (!isKanji(b)) big.classList.add('kana');
    if ([...b].length > 7) big.classList.add('sentence');
    big.textContent = b;
  }
  $('#q-sub').textContent = q.sub || '';
  const pr = $('#q-prompt');
  pr.textContent = q.prompt;
  pr.classList.toggle('only', !b);
  restart(card, 'enter');
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function askQuestion(q) {
  renderQuestion(q);
  const { choices, correctIndex } = makeChoices(q);
  S.current = { q, choices, correctIndex };
  const btns = [...document.querySelectorAll('.ans')];
  const long = choices.some((c) => [...c].length > 7);
  btns.forEach((btn, i) => {
    btn.className = 'ans';
    const t = btn.querySelector('.ans-text');
    t.textContent = choices[i];
    t.className = 'ans-text' + (long ? ' long' : '') + (!isKanji(choices[i]) ? ' kana' : '');
  });
  const wrap = $('#answers');
  wrap.classList.remove('locked');
  return new Promise((resolve) => {
    btns.forEach((btn, i) => {
      btn.onclick = () => {
        if (wrap.classList.contains('locked')) return;
        wrap.classList.add('locked');
        S.current.chosen = i;
        const ok = i === correctIndex;
        btns[correctIndex].classList.add('correct');
        if (!ok) btn.classList.add('wrong');
        btns.forEach((b, j) => { if (j !== correctIndex && j !== i) b.classList.add('dim'); });
        resolve(ok);
      };
    });
  });
}

function heroAttackColor() { return S.best.element ? S.best.element.color : '#8ef'; }
function moveName() {
  const w = S.best.weapon;
  const e = S.best.element;
  const tail = pickOne(['スラッシュ', 'ブレイク', 'ストライク', 'バースト']);
  if (w && e) return `${ruby(w.name)}<br>${e.move}${tail}！`;
  if (w) return `${ruby(w.name)}<br>ゆうしゃ${tail}！`;
  if (e) return `${e.move}${tail}！`;
  return `ゆうしゃ${tail}！`;
}

async function onCorrect(q) {
  S.correct++;
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  sfx('correct');
  burstText('せいかい！', 'good');
  particles({ x: 50, y: 40, n: 12 });
  if (q.learn) learnChip(q.learn);
  const special = S.combo > 0 && S.combo % 5 === 0;
  let gain = 100 + S.combo * 20;
  if (special) gain += 500;
  S.power += gain;

  // コンボ表示
  if (S.combo >= 2) {
    $('#combo').innerHTML = `<b>${S.combo}</b><small>COMBO!</small>`;
    restart($('#combo'), 'bump');
    sfx('combo');
  }
  updateHud();
  await wait(380);

  if (special) {
    burstText('漢字パワー<br>MAX!!', 'max', 1300);
    sfx('max');
    await wait(700);
    await cutin({ heroImg: img(hero().img), name: moveName(), color: heroAttackColor() });
  }

  // こうげき
  const unit = $('.hero-unit');
  restart(unit, special ? 'special' : 'attack');
  await wait(special ? 420 : 160);
  sfx('slash');
  slash(heroAttackColor(), special || S.combo >= 3);
  if (special && S.best.element && S.best.element.id === 'thunder') bolts(4);
  await wait(120);
  const crit = special || Math.random() < 0.15;
  sfx(crit ? 'crit' : 'hit');
  restart($('#enemy'), 'hit');
  if (special) { flash(); shake($('#field')); }
  const base = randInt(60, 140) + S.lv * 12;
  damage(Math.round(base * (1 + S.combo * 0.15) * (crit ? 2.2 : 1)), { crit, x: randInt(48, 66), y: randInt(22, 38) });
  particles({ x: 58, y: 46, n: special ? 26 : 12, colors: [heroAttackColor(), '#fff', '#ffd54a'] });
  // 仲間もこうげき
  if (S.best.pet && (special || S.combo % 3 === 0)) {
    await wait(200);
    restart($('#pet-img'), 'attack');
    await wait(260);
    sfx('hit');
    damage(randInt(40, 120), { x: randInt(40, 70), y: randInt(30, 46) });
  }
  S.monster.hp = Math.max(0, S.monster.hp - 1);
  updateEnemyHp();
  if (S.route === 'maou' && S.monster.hp === Math.floor(S.monster.max / 2) && !S.raged) await maouRage();
  if (S.monster.hp <= 0 && !(S.monster.boss && S.route !== 'main')) await defeatMonster();
  else await wait(520);
}

async function onWrong(q, qno) {
  S.combo = 0;
  $('#combo').innerHTML = '';
  if (S.route === 'maou') S.finalMiss++;
  sfx('wrong');
  burstText('ざんねん！', 'bad');
  updateHud();
  await wait(450);
  // てきの こうげき
  restart($('#enemy'), 'attack');
  await wait(220);
  sfx('hurt');
  flash(true);
  shake($('#field'));
  restart($('.hero-unit'), 'hurt');
  const dmg = randInt(10, 18);
  S.hp = Math.max(12, S.hp - dmg);
  damage(dmg, { hurt: true, x: 18, y: 50 });
  updateHud();
  await wait(450);

  // 解説（ここで しっかり読めるように、タップするまで待つ）
  $('.explain-answer').firstChild.textContent = q.type === 'wrongKanji' ? 'まちがっているのは ' : 'せいかいは ';
  const ans = $('#explain-answer');
  ans.textContent = q.answer;
  ans.className = [...q.answer].length > 8 ? 'long' : '';
  const lines = [q.explain];
  if (q.meaning && q.type !== 'meaning') lines.push(`いみ：${q.meaning}`);
  $('#explain-text').innerHTML = lines.filter(Boolean).map(escapeHtml).join('<br>');
  $('#explain').classList.add('show');
  await new Promise((res) => { $('#btn-next').onclick = () => { $('#explain').classList.remove('show'); res(); }; });

  // 40問より前に はじめて まちがえたら、1〜2問あとに特別ダンジョンへ
  if (S.route === 'main' && S.missAt === null) {
    S.missAt = qno;
    S.branchAt = Math.min(qno + 1 + randInt(1, 2), 41);
    S.branchRoute = qno <= 13 ? 'goblin' : qno <= 27 ? 'forest' : 'ruins';
  }
}

async function defeatMonster() {
  const m = S.monster;
  await wait(250);
  sfx('defeat');
  restart($('#enemy'), 'dead');
  particles({ x: 58, y: 45, n: 30, colors: ['#fff', '#ffd54a', '#ff6fb5', '#38e1ff'], spread: 180 });
  await wait(500);
  burstText(`${ruby(m.name)}を<br>たおした！`, 'good', 1000);
  $('#enemy-hud').style.opacity = 0;
  S.kills++;
  S.lv++;
  S.hp = Math.min(100, S.hp + 12);
  updateHud();
  restart($('#hero-lv'), 'up');
  sfx('levelup');
  await wait(1000);
  $('#enemy').style.visibility = 'hidden';
  if (S.route !== 'main') return;
  // 宝箱
  if (S.kills === 1) await openChest({ kind: 'weapon' });
  else if (m.elite) await openChest({ minRarity: 'RARE', preferMissing: true });
  else if (Math.random() < 0.4) await openChest({});
}

// ---------- ごほうび（演出だけ。問題には影響しない） ----------
function rollRarity(min = 'COMMON') {
  const minI = RANK.indexOf(min);
  const options = RANK.slice(minI);
  const total = options.reduce((s, r) => s + G.rarities[r].weight, 0);
  let x = Math.random() * total;
  for (const r of options) { x -= G.rarities[r].weight; if (x <= 0) return r; }
  return options[options.length - 1];
}

async function openChest({ kind, minRarity = 'COMMON', preferMissing = true }) {
  S.sinceChest = 0;
  if (!kind) {
    const missing = ['weapon', 'pet', 'element'].filter((k) => !S.best[k]);
    kind = preferMissing && missing.length ? pickOne(missing) : pickOne(['weapon', 'pet', 'element']);
  }
  const list = kind === 'weapon' ? G.weapons : kind === 'pet' ? G.pets : G.elements;
  let rarity = rollRarity(minRarity);
  let pool = list.filter((x) => x.rarity === rarity);
  while (!pool.length) { rarity = RANK[RANK.indexOf(rarity) - 1] || 'RARE'; pool = list.filter((x) => x.rarity === rarity); }
  // まだ持っていないものを優先
  const fresh = pool.filter((x) => !S.owned[kind].has(x.id));
  const item = pickOne(fresh.length ? fresh : pool);
  const isNew = !S.owned[kind].has(item.id);
  S.owned[kind].add(item.id);
  const cur = S.best[kind];
  if (!cur || RANK.indexOf(item.rarity) >= RANK.indexOf(cur.rarity)) S.best[kind] = item;
  await gacha({ kindLabel: KIND_LABEL[kind] + 'を ゲット！', item, rarity: item.rarity, rarityInfo: G.rarities[item.rarity], isNew });
  updateEquip();
}

function updateEquip() {
  const el = $('#equip');
  el.innerHTML = '';
  for (const k of ['weapon', 'element']) {
    const it = S.best[k];
    if (!it) continue;
    const s = document.createElement('span');
    if (it.rarity === 'LEGENDARY') s.className = 'legend';
    s.innerHTML = it.img ? `<img src="${img(it.img)}" alt="">` : it.emoji;
    el.appendChild(s);
  }
  const pet = $('#pet-img');
  if (S.best.pet) { pet.src = img(S.best.pet.img); pet.classList.add('show'); }
}

// ---------- 分岐ダンジョン・魔王城 ----------
async function startBranch() {
  const key = S.branchRoute;
  const r = G.routes[key];
  S.route = key;
  S.routeN = 0;
  S.bossSpawned = false;
  S.bossId = r.boss;
  S.monster = null;
  await banner('とつぜん<br>ひめいが きこえた！', { small: '……！？', ms: 1300 });
  await playStory(r.intro, r.introBg);
  show('screen-battle');
  setBg($('#battle-bg'), r.bg);
  setArea(r.name);
  playBgm(r.bgm);
  $('#enemy').style.visibility = 'hidden';
  $('#enemy-hud').style.opacity = 0;
  await banner(ruby(r.name), { small: 'とくべつ ダンジョン', ms: 1500 });
}

async function routeSpawn() {
  const r = G.routes[S.route];
  if (S.route === 'maou') return; // 魔王は最初から出ている
  const bossTime = S.routeN >= 10 - r.bossHits;
  if (bossTime && !S.bossSpawned) {
    if (S.monster && S.monster.hp > 0) {
      burstText(`${ruby(S.monster.name)}は<br>にげだした！`, 'good', 900);
      restart($('#enemy'), 'dead');
      await wait(900);
    }
    S.bossSpawned = true;
    await bossEntrance(r);
    return;
  }
  if (!S.monster || S.monster.hp <= 0) {
    const w = r.minions[Math.min(S.kills % 2, r.minions.length - 1)];
    setMonster(pickOne(w.pool), w.hits);
    await wait(450);
  }
}

async function bossEntrance(r) {
  $('#enemy').style.visibility = 'hidden';
  $('#enemy-hud').style.opacity = 0;
  sfx('warning');
  await banner('WARNING', { small: 'ボスが あらわれる！', cls: 'warning', ms: 1500 });
  playBgm('boss');
  await playStory(r.bossTalk, r.bg);
  show('screen-battle');
  setMonster(r.boss, r.bossHits, { boss: true });
  sfx('bossAppear');
  flash();
  shake();
  await wait(700);
}

async function startMaou() {
  const r = G.routes.maou;
  S.route = 'maou';
  S.routeN = 0;
  S.bossId = r.boss;
  S.raged = false;
  $('#enemy-hud').style.opacity = 0;
  $('#enemy').style.visibility = 'hidden';
  sfx('fanfare');
  await banner('40問<br>ぜんもん せいかい!!', { small: 'すごすぎる！', cls: 'gold', ms: 2000 });
  await banner(`${ruby('{魔王城|まおうじょう}')}へ<br>とつにゅう！`, { small: 'さいごの たたかい', ms: 1600 });
  setBg($('#battle-bg'), r.bg);
  $('#battle-bg').style.filter = 'brightness(.7) saturate(1.3)';
  castleFx(true);
  setArea(r.name);
  stopBgm();
  sfx('warning');
  await banner('WARNING', { small: 'まおうが あらわれた！', cls: 'warning', ms: 1600 });
  playBgm('boss');
  await playStory(r.intro, r.bg);
  show('screen-battle');
  $('#magic-circle').classList.add('on');
  setMonster(r.boss, r.bossHits, { boss: true });
  sfx('bossAppear');
  flash(true);
  shake();
  await wait(800);
}

async function maouRage() {
  S.raged = true;
  await wait(300);
  flash(true);
  shake();
  sfx('bossAppear');
  $('#enemy').classList.add('rage');
  $('#battle-bg').style.filter = 'brightness(.5) saturate(1.6) hue-rotate(-20deg)';
  await banner(ruby(G.routes.maou.rage[0][1]), { small: '魔王が いかった！', cls: 'warning', ms: 1800 });
  $('#enemy').classList.add('rage');
}

async function finishRoute() {
  const r = G.routes[S.route];
  const m = S.monster;
  await wait(300);
  // 正解が足りなくても、仲間の力で かならず たおせる
  if (m.hp > 0) {
    const helper = S.best.pet ? S.best.pet : null;
    const helperName = helper ? helper.name : '{王|おう}さまの {光|ひかり}';
    await banner(`${ruby(helperName)}が<br>ちからを かしてくれた！`, { small: 'あきらめない こころ！', cls: 'gold', ms: 1600 });
    if (helper) { restart($('#pet-img'), 'attack'); await wait(300); }
  }
  await cutin({ heroImg: img(hero().img), name: S.route === 'maou' ? '{漢字|かんじ}の{勇者|ゆうしゃ}<br>きゅうきょく おうぎ！'.replace(/\{([^|{}]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>') : moveName(), small: 'とどめの いちげき', color: heroAttackColor() });
  restart($('.hero-unit'), 'special');
  await wait(400);
  sfx('slash'); slash(heroAttackColor(), true); bolts(3);
  await wait(150);
  sfx('crit'); flash(); shake();
  damage(9999, { crit: true, x: 56, y: 28 });
  m.hp = 0; updateEnemyHp();
  particles({ x: 58, y: 45, n: 40, spread: 220, colors: ['#fff', '#ffd54a', '#ff6fb5', '#38e1ff'] });
  await wait(500);

  if (S.route === 'maou') {
    await playStory(r.defeat, r.bg);
    show('screen-battle');
  }
  sfx('defeat');
  restart($('#enemy'), 'dead');
  flash();
  await wait(900);
  stopBgm();
  sfx('victory');
  $('#enemy-hud').style.opacity = 0;
  $('#magic-circle').classList.remove('on');
  await banner(`${ruby(m.name)}を<br>たおした！！`, { small: 'VICTORY', cls: 'gold', ms: 2200 });

  // ボスのごほうび。まだ持っていない種類（ぶき・なかま・ぞくせい）は ここで ぜんぶ そろえる
  const perfect = S.route === 'maou' && S.finalMiss === 0;
  await openChest({ minRarity: perfect ? 'LEGENDARY' : 'EPIC', preferMissing: true });
  for (const kind of ['weapon', 'pet', 'element']) if (!S.best[kind]) await openChest({ kind, minRarity: 'RARE' });
  castleFx(false);
  playBgm('ending');

  if (S.route === 'maou') {
    await playStory(r.ending, 'bg_throne');
    await bannerOn('screen-story', '{世界|せかい}に<br>{平和|へいわ}が おとずれた！');
  } else {
    await playStory(r.ending, r.endBg);
    await bannerOn('screen-story', r.endTitle);
    await playStory([['narr', '{世界|せかい}は まだ すくわれて いない。しかし {勇者|ゆうしゃ}{HERO}の {冒険|ぼうけん}は はじまった ばかりだ！']], r.endBg);
  }
  showResult();
}

async function bannerOn(screen, text) {
  show(screen);
  sfx('fanfare');
  await banner(ruby(text), { cls: 'gold', ms: 2300 });
}

// ---------- リザルト ----------
function showResult() {
  const total = S.n;
  const acc = total ? Math.round((S.correct / total) * 100) : 0;
  let end;
  let catchText;
  let title;
  if (S.route === 'maou' && S.finalMiss === 0) {
    end = 'TRUE END';
    catchText = '{世界|せかい}を すくった！';
    title = 'でんせつの 漢字マスター';
  } else if (S.route === 'maou') {
    end = 'BRAVE END';
    catchText = '{魔王|まおう}を たおして {世界|せかい}を すくった！';
    title = '漢字の 勇者';
  } else {
    const r = G.routes[S.route];
    end = 'HAPPY END';
    catchText = r.endTitle;
    title = { goblin: '村の ヒーロー', forest: '森の まもりびと', ruins: '町の まもりがみ' }[S.route];
  }
  const rank = acc >= 100 ? 'S' : acc >= 90 ? 'A' : acc >= 75 ? 'B' : acc >= 50 ? 'C' : 'D';
  const isTrue = end === 'TRUE END';
  const itemHtml = (kind, label, it) => {
    if (!it) return `<div class="r-item"><div class="ri-kind">${label}</div><div class="ri-icon">？</div><div class="ri-name">なし</div></div>`;
    const ri = G.rarities[it.rarity];
    const icon = it.img ? `<img src="${img(it.img)}" alt="">` : it.emoji;
    return `<div class="r-item" style="--rc:${ri.color};--rcg:${ri.color}66"><div class="ri-kind">${label}</div><div class="ri-icon">${icon}</div><div class="ri-name">${ruby(it.name)}</div><div class="ri-rar">${ri.label}</div></div>`;
  };
  const el = S.best.element;
  const elItem = el ? { ...el, name: el.name + 'ぞくせい' } : null;
  $('#result-card').className = 'result-card' + (isTrue ? ' true' : '');
  $('#result-card').innerHTML = `
    <div class="r-top">
      <div class="r-hero-title">⚔️ ${escapeHtml(title)} ${hero().name} ⚔️</div>
      <div class="r-end">${end}</div>
      <div class="r-catch">${ruby(catchText)}</div>
    </div>
    <div class="r-mid">
      <img class="r-hero" src="${img(hero().img)}" alt="">
      <div class="r-stats">
        <div class="r-stat">せいかい <b>${S.correct}<small> / ${total}</small></b></div>
        <div class="r-stat">せいかいりつ <b>${acc}<small>%</small></b></div>
        <div class="r-stat">さいだいコンボ <b>${S.maxCombo}</b></div>
        <div class="r-stat">漢字パワー <b>${isTrue ? 'MAX' : S.power.toLocaleString()}</b></div>
        <div class="r-rank"><small>ランク</small><span class="r-rank-badge">${rank}</span></div>
      </div>
    </div>
    <div class="r-items">
      ${itemHtml('weapon', 'ぶき', S.best.weapon)}
      ${itemHtml('pet', 'なかま', S.best.pet)}
      ${itemHtml('element', 'ぞくせい', elItem)}
    </div>
    <div class="r-foot">${isTrue ? '🌟 WORLD PEACE 🌟<br>' : ''}${ruby(isTrue ? '{世界|せかい}に {平和|へいわ}が おとずれた！' : end === 'BRAVE END' ? 'つぎは ぜんもん せいかいで TRUE END を めざそう！' : 'つぎは {魔王|まおう}を たおしに いこう！')}<br><span class="r-grade">${settings.grade}年生モード ・ 漢字の勇者ケイト</span></div>`;
  setBg($('#result-bg'), S.route === 'maou' ? 'bg_throne' : G.routes[S.route].endBg);
  show('screen-result');
  if (isTrue) {
    setTimeout(() => { sfx('fanfare'); }, 300);
  }
}

// テスト用（URLに #debug を付けたときだけ）。自動プレイで全ルートを確認するのに使う
if (location.hash.includes('debug')) window.__kanji = { get S() { return S; }, settings, speed, gacha, cutin, G: () => G };

boot();
