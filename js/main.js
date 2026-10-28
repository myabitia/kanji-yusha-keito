// 漢字の勇者ケイト — ゲームの流れ
// タイトル → 主人公 → 学年 → 王さま → 冒険40問 → 分岐ダンジョン or 魔王城 → （ノーミスなら）さいごの いちげき（8択）→ エンディング → リザルト
//
// ぶき・なかま・ぞくせいは こうかが ある：
//   ぶき   … ボス戦の はじめに かくりつで はつどう（ダメージ2ばい・せんたくし3つ・まちがい無効 など）
//   なかま … 毎問 かくりつで はつどう（レア度が高いほど かくりつが高い）
//   ぞくせい… ずっと きく パッシブ（1回だけ 2つから えらぶ。レア度の差は なし）
import { unlockAudio, sfx, playBgm, stopBgm, setMuted, isMuted } from './audio.js';
import { loadQuestions, loadHard, makeChoices, Deck } from './quiz.js';
import {
  $, wait, rand, randInt, pickOne, ruby, plain, img, restart, flash, shake, burstText, damage, particles,
  slash, bolts, learnChip, banner, cutin, gacha, sparkles, castleFx, speed, toast, choose,
} from './fx.js';

const LABEL = {
  reading: 'よみ', writing: 'かき', fill: 'あなうめ', kanjiUse: 'つかう ことば', wrongKanji: 'まちがいさがし',
  meaning: 'いみ', okurigana: 'おくりがな', sentenceReading: '文の中の よみ', sentenceWriting: '文の中の かき',
  similar: 'にた かんじ', combine: 'くみあわせ', usage: 'つかいかた',
};
const RANK = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const KIND_LABEL = { weapon: 'でんせつの ぶき', pet: 'なかま' };
const LETTERS = 'ABCDEFGH';
const isKanji = (s) => /[㐀-鿿]/.test(s);

let G = null; // data/game.json
let S = null; // 1回のプレイの状態（ブラウザを閉じたら消える）
let questionCache = { grade: 0, list: null, hard: null };
const settings = { hero: 'keito', grade: 3 };

// ---------- 画面ユーティリティ ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'screen-battle') requestAnimationFrame(fitQuiz);
}
function setBg(el, name) { el.style.backgroundImage = name ? `url(${img(name)})` : 'none'; }
function fitHeight() {
  // 古いブラウザ（dvh 非対応）向けに、見えている高さを CSS 変数に入れる
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  fitQuiz();
}
// 選択肢が画面の下にはみ出すときは、はみ出さなくなるまで 少しずつ つめる
function fitQuiz() {
  const scr = $('#screen-battle');
  if (!scr || !scr.classList.contains('active')) return;
  const levels = ['c1', 'c2', 'c3', 'c4', 'c5'];
  scr.classList.remove(...levels);
  const limit = () => Math.min($('#app').getBoundingClientRect().bottom, window.innerHeight, window.visualViewport ? window.visualViewport.height : 1e9);
  const last = () => { const b = $('#answers').lastElementChild; return b ? b.getBoundingClientRect().bottom : 0; };
  for (let i = 0; i < levels.length && last() > limit() - 2; i++) scr.classList.add(levels[i]);
}
const hero = () => G.heroes[settings.hero];
const fill = (s) => s.replaceAll('{HERO}', hero().name).replaceAll('{I}', hero().I);
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const chance = (p) => Math.random() < p;

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
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
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

  // PCではキーボードでも遊べる（1〜8 / A〜H、Enter）
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    let idx = '12345678'.indexOf(k);
    if (idx < 0 && k.length === 1) idx = 'abcdefgh'.indexOf(k);
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
    n: 0, correct: 0, misses: 0, saved: 0, combo: 0, maxCombo: 0, power: 0, hp: 100, lv: 1,
    route: 'main', routeN: 0, missAt: null, branchAt: null, bossSpawned: false, bossId: null, bossDown: false,
    areaIdx: -1, waveIdx: 0, monster: null, kills: 0, finalMiss: 0, sinceChest: 0, rareSeen: 0,
    owned: { weapon: new Set(), pet: new Set() }, best: { weapon: null, pet: null }, element: null,
    windLeft: 0, iceLeft: 0, armed: { dmg: 0, cut: 0, guard: 0 }, sealed: false, finalTried: false,
  };
  // 問題の読みこみは会話中に裏で進める
  const loading = questionCache.grade === settings.grade
    ? Promise.resolve(questionCache)
    : Promise.all([loadQuestions(settings.grade), loadHard(settings.grade)]).then(([list, hard]) => {
      questionCache = { grade: settings.grade, list, hard };
      return questionCache;
    });
  loading.catch(() => {});
  if (withIntro) {
    playBgm('title');
    await playStory(G.intro, 'bg_throne');
  }
  let data;
  try { data = await loading; } catch (e) {
    alert('もんだいを よみこめませんでした。start.bat から ひらいてください。');
    show('screen-title');
    return;
  }
  S.deck = new Deck(data.list, settings.grade);
  S.hardPool = data.hard;
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
  $('#skill-toasts').innerHTML = '';
  $('#answers').innerHTML = '';
  $('#explain').classList.remove('show');
  $('#screen-battle').classList.remove('final');
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
      if (qno > 3 && S.sinceChest >= 4 && chance(0.12)) {
        await banner('たからばこを<br>みつけた！', { small: 'ラッキー！', cls: 'gold', ms: 1100 });
        await openChest({});
      }
    } else {
      if (S.routeN >= 10 || S.bossDown) { await finishRoute(); return; }
      await routeSpawn();
    }
    S.shownQ = qno;
    updateHud();
    const phase = S.route === 'main' ? 'main' : S.route === 'maou' ? 'final' : 'dungeon';
    const q = S.deck.pick(phase, S.route === 'main' ? qno : S.routeN + 1);
    const res = await askQuestion(q);
    S.log.push({ no: qno, id: q.id, grade: q.grade, type: q.type, route: S.route, ok: res.ok, pos: S.current.correctIndex, n: S.current.choices.length });
    S.n++;
    if (S.route !== 'main') S.routeN++;
    S.sinceChest++;
    if (res.ok) await onCorrect(q, res);
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

function setMonster(id, hits, { boss = false, elite = false, rare = false } = {}) {
  const m = G.monsters[id];
  S.monster = { id, name: m.name, hp: hits, max: hits, boss, elite, rare };
  const en = $('#enemy');
  en.className = 'enemy' + (boss ? ' boss' : '') + (rare ? ' rare' : '');
  en.style.visibility = 'visible';
  const im = $('#enemy-img');
  im.src = img(m.img);
  // ザコは たまに色ちがい
  im.style.filter = !boss && !elite && !rare && chance(0.3) ? `hue-rotate(${randInt(60, 300)}deg)` : '';
  restart(en, 'appear');
  $('#enemy-name').innerHTML = (rare ? '✦ ' : elite ? '★ ' : '') + ruby(m.name);
  const hud = $('#enemy-hud');
  hud.style.opacity = 1;
  hud.classList.toggle('boss', boss);
  hud.classList.toggle('rare', rare);
  $('#enemy-hp-segs').innerHTML = '<span></span>'.repeat(hits);
  updateEnemyHp();
}
function updateEnemyHp() {
  $('#enemy-hp-fill').style.width = (Math.max(0, S.monster.hp) / S.monster.max) * 100 + '%';
}

async function spawnMainMonster() {
  const a = G.areas[S.areaIdx];
  const useWave = S.waveIdx >= a.waves.length ? a.waves[0] : a.waves[S.waveIdx];
  S.waveIdx++;
  const elite = !!useWave.elite && S.waveIdx <= a.waves.length;
  // レアモンスター（たおすと レアな たからばこ。まちがえると にげる）
  if (!elite && S.kills >= 1 && S.rareSeen < 2 && chance(G.rareMonsters.chance)) {
    S.rareSeen++;
    S.waveIdx--; // この波は あとで もう一度
    setMonster(pickOne(G.rareMonsters.pool), 1, { rare: true });
    sfx('rare', 'EPIC');
    await banner('レアモンスター<br>しゅつげん！', { small: '✦ チャンス ✦', cls: 'gold', ms: 1300 });
    return;
  }
  setMonster(pickOne(useWave.pool), useWave.hits, { elite });
  if (S.monster.elite) await banner('つよい てきが<br>あらわれた！', { small: '⚠ ちゅうい', cls: 'warning', ms: 1100 });
  else await wait(450);
}

// ---------- 1問 ----------
function renderQuestion(q, label) {
  const big = $('#q-big');
  const card = $('#q-card');
  $('#q-type').textContent = label || LABEL[q.type] || 'もんだい';
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

// せんたくしを へらす こうか（光・なかま・ボス戦のぶき）。いくつ へらすかを返す
function rollCut() {
  let cut = 0;
  const el = S.element;
  if (el && el.passive === 'cut' && chance(el.chance)) { cut++; toast(`${el.emoji} ${ruby(el.skill)}！ せんたくしが へった`, el.color); }
  const pet = S.best.pet;
  if (pet && pet.effect === 'cut' && chance(pet.chance)) { cut++; toast(`🐾 ${ruby(pet.skill)}！ せんたくしが へった`, '#7cf'); }
  if (S.monster && S.monster.boss && S.armed.cut > 0) { S.armed.cut--; cut++; toast(`⚔️ ${ruby(S.best.weapon.skill)}！ せんたくしが へった`, '#ffd54a'); }
  return Math.min(cut, 2);
}

// 1問こたえる。 { ok, retried } を返す。eight=true で 8択（さいごの いちげき）
function askQuestion(q, { eight = false, label = '' } = {}) {
  renderQuestion(q, label);
  let { choices, correctIndex } = makeChoices(q, eight ? 7 : 3);
  if (!eight) {
    // へらす せんたくしは まちがいの中から えらぶ
    const cut = rollCut();
    for (let i = 0; i < cut; i++) {
      const wrongIdx = choices.map((c, j) => j).filter((j) => j !== correctIndex);
      choices.splice(pickOne(wrongIdx), 1);
      correctIndex = choices.indexOf(q.answer);
    }
  }
  S.current = { q, choices, correctIndex };
  const wrap = $('#answers');
  wrap.className = 'answers' + (eight ? ' eight' : '') + (choices.length < 4 && !eight ? ' few' : '');
  const long = choices.some((c) => [...c].length > (eight ? 5 : 7));
  wrap.innerHTML = choices.map((c, i) => `<button class="ans"><span class="ans-mark">${LETTERS[i]}</span><span class="ans-text${long ? ' long' : ''}${!isKanji(c) ? ' kana' : ''}">${escapeHtml(c)}</span></button>`).join('');
  const btns = [...wrap.querySelectorAll('.ans')];
  fitQuiz();
  let retried = false;
  return new Promise((resolve) => {
    btns.forEach((btn, i) => {
      btn.onclick = () => {
        if (wrap.classList.contains('locked') || btn.classList.contains('wrong')) return;
        S.current.chosen = i;
        const ok = i === correctIndex;
        // 水：まちがえても もう一度 えらべる（8択では はつどうしない）
        const el = S.element;
        if (!ok && !eight && !retried && el && el.passive === 'retry' && chance(el.chance)) {
          retried = true;
          btn.classList.add('wrong');
          sfx('wrong');
          toast(`${el.emoji} ${ruby(el.skill)}！ もう一回 えらべるよ`, el.color, 2200);
          S.current.chosen = undefined;
          return;
        }
        wrap.classList.add('locked');
        btns[correctIndex].classList.add('correct');
        if (!ok) btn.classList.add('wrong');
        btns.forEach((b, j) => { if (j !== correctIndex && j !== i) b.classList.add('dim'); });
        resolve({ ok, retried });
      };
    });
  });
}

function heroAttackColor() { return S.element ? S.element.color : '#8ef'; }
// ひっさつわざの名前（ぞくせい ＋ わざ。ぶきが あれば 名前も そえる）
function moveName() {
  const e = S.element || { kanji: '{勇気|ゆうき}', kana: 'ブレイブ' };
  const t = pickOne(G.techniques);
  return { name: ruby(e.kanji + t.k), sub: `${e.kana}・${t.e}`, small: S.best.weapon ? `${plain(S.best.weapon.name)} ひっさつわざ` : 'ひっさつわざ' };
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

  // ダメージ（1 ＋ こうかの ぶん）
  let dmg = 1;
  let petHit = false;
  const el = S.element;
  if (special) dmg++;
  if (el && el.passive === 'dmg' && chance(el.chance)) { dmg++; toast(`${el.emoji} ${ruby(el.skill)}！ ダメージ2ばい`, el.color); }
  const pet = S.best.pet;
  if (pet && pet.effect === 'dmg' && chance(pet.chance)) { dmg++; petHit = true; toast(`🐾 ${ruby(pet.skill)}！ ダメージ2ばい`, '#7cf'); }
  if (S.monster.boss && S.armed.dmg > 0) { S.armed.dmg--; dmg++; toast(`⚔️ ${ruby(S.best.weapon.skill)}！ ダメージ2ばい`, '#ffd54a'); }

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
    const mv = moveName();
    await cutin({ heroImg: img(hero().img), name: mv.name, sub: mv.sub, small: mv.small, color: heroAttackColor() });
  }

  // こうげき
  const unit = $('.hero-unit');
  restart(unit, special ? 'special' : 'attack');
  await wait(special ? 420 : 160);
  sfx('slash');
  slash(heroAttackColor(), special || S.combo >= 3 || dmg > 1);
  if ((special || dmg > 1) && el && el.id === 'thunder') bolts(4);
  await wait(120);
  const crit = dmg > 1 || chance(0.12);
  sfx(crit ? 'crit' : 'hit');
  restart($('#enemy'), 'hit');
  if (special || dmg > 1) { flash(); shake($('#field')); }
  const base = randInt(60, 140) + S.lv * 12;
  damage(Math.round(base * (1 + S.combo * 0.15) * dmg * (crit ? 1.6 : 1)), { crit, x: randInt(48, 66), y: randInt(22, 38) });
  particles({ x: 58, y: 46, n: special ? 26 : 12, colors: [heroAttackColor(), '#fff', '#ffd54a'] });
  // 仲間の ついげき（演出）
  if (pet && (petHit || special || S.combo % 3 === 0)) {
    await wait(200);
    restart($('#pet-img'), 'attack');
    await wait(260);
    sfx('hit');
    damage(randInt(40, 120) * (petHit ? 2 : 1), { x: randInt(40, 70), y: randInt(30, 46) });
  }
  await hitMonster(dmg);
}

async function hitMonster(dmg) {
  const m = S.monster;
  m.hp = Math.max(0, m.hp - dmg);
  updateEnemyHp();
  if (S.route === 'maou' && m.hp <= Math.floor(m.max / 2) && !S.raged && m.hp > 0) await maouRage();
  if (m.hp <= 0 && m.boss && S.route !== 'main') { S.bossDown = true; await wait(520); return; }
  if (m.hp <= 0) await defeatMonster();
  else await wait(520);
}

// まちがいを なかったことに できるか（ぶき→なかま→闇→風 の じゅん）
function tryGuard() {
  if (S.monster && S.monster.boss && S.armed.guard > 0) { S.armed.guard--; return `⚔️ ${ruby(S.best.weapon.skill)}`; }
  const pet = S.best.pet;
  if (pet && pet.effect === 'guard' && chance(pet.chance)) return `🐾 ${ruby(pet.skill)}`;
  const el = S.element;
  if (el && el.passive === 'guard' && chance(el.chance)) return `${el.emoji} ${ruby(el.skill)}`;
  if (el && el.passive === 'guardOnce' && S.windLeft > 0) { S.windLeft--; return `${el.emoji} ${ruby(el.skill)}`; }
  return null;
}

async function showExplain(q, safe) {
  $('.explain-head').textContent = safe ? 'セーフ！' : 'ざんねん！';
  $('.explain-card').classList.toggle('safe', !!safe);
  $('.explain-answer').firstChild.textContent = q.type === 'wrongKanji' ? 'まちがっているのは ' : 'せいかいは ';
  const ans = $('#explain-answer');
  ans.textContent = q.answer;
  ans.className = [...q.answer].length > 8 ? 'long' : '';
  const lines = [];
  if (safe) lines.push(`${safe} の ちからで、まちがいが なかったことに なった！`);
  lines.push(escapeHtml(q.explain || ''));
  if (q.meaning && q.type !== 'meaning') lines.push(escapeHtml(`いみ：${q.meaning}`));
  $('#explain-text').innerHTML = lines.filter(Boolean).join('<br>');
  $('#explain').classList.add('show');
  await new Promise((res) => { $('#btn-next').onclick = () => { $('#explain').classList.remove('show'); res(); }; });
}

async function onWrong(q, qno) {
  const guard = tryGuard();
  if (guard) {
    // ミスに ならない（コンボも のこる）。でも 正しい答えは ちゃんと見せる
    S.saved++;
    sfx('levelup');
    burstText('セーフ！', 'good');
    toast(`${guard}！ まちがいを なかったことに`, '#9f9', 2400);
    await wait(700);
    await showExplain(q, guard);
    return;
  }
  S.misses++;
  const el = S.element;
  if (el && el.passive === 'keepCombo' && S.iceLeft > 0 && S.combo > 0) {
    S.iceLeft--;
    toast(`${el.emoji} ${ruby(el.skill)}！ コンボが こおって のこった`, el.color);
  } else {
    S.combo = 0;
    $('#combo').innerHTML = '';
  }
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
  await showExplain(q, null);

  // レアモンスターは まちがえると にげる
  if (S.monster && S.monster.rare && S.monster.hp > 0) {
    burstText(`${ruby(S.monster.name)}は<br>にげだした！`, 'bad', 1000);
    restart($('#enemy'), 'dead');
    $('#enemy-hud').style.opacity = 0;
    S.monster.hp = 0;
    S.monster = null;
    await wait(1000);
    $('#enemy').style.visibility = 'hidden';
  }

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
  if (m.rare) {
    await banner('レアな たからばこ！', { small: '✦ レアモンスターの おとしもの ✦', cls: 'gold', ms: 1200 });
    await openChest({ rarity: chance(G.rareMonsters.legendChance) ? 'LEGENDARY' : 'EPIC' });
  } else if (S.kills === 1) await openChest({ kind: 'weapon' });
  else if (m.elite) await openChest({ minRarity: 'RARE' });
  else if (chance(0.35)) await openChest({});
  // 2ひきめを たおしたら ぞくせいを えらぶ
  if (S.kills === 2 && !S.element) await chooseElement();
}

// ---------- ごほうび ----------
function rollRarity(min = 'COMMON') {
  const options = RANK.slice(RANK.indexOf(min));
  const total = options.reduce((s, r) => s + G.rarities[r].weight, 0);
  let x = Math.random() * total;
  for (const r of options) { x -= G.rarities[r].weight; if (x <= 0) return r; }
  return options[options.length - 1];
}

async function openChest({ kind, minRarity = 'COMMON', rarity }) {
  S.sinceChest = 0;
  if (!kind) {
    const missing = ['weapon', 'pet'].filter((k) => !S.best[k]);
    kind = missing.length ? pickOne(missing) : pickOne(['weapon', 'pet']);
  }
  const list = kind === 'weapon' ? G.weapons : G.pets;
  rarity = rarity || rollRarity(minRarity);
  let pool = list.filter((x) => x.rarity === rarity);
  while (!pool.length) { rarity = RANK[RANK.indexOf(rarity) - 1] || 'RARE'; pool = list.filter((x) => x.rarity === rarity); }
  // まだ持っていないものを優先
  const fresh = pool.filter((x) => !S.owned[kind].has(x.id));
  const item = pickOne(fresh.length ? fresh : pool);
  const isNew = !S.owned[kind].has(item.id);
  S.owned[kind].add(item.id);
  const cur = S.best[kind];
  const equip = !cur || RANK.indexOf(item.rarity) >= RANK.indexOf(cur.rarity);
  if (equip) S.best[kind] = item;
  const desc = `<b>${ruby(item.skill)}</b><br>${escapeHtml(item.desc)}${equip ? '' : '<br><small>（いまの そうびの ほうが つよいので しまっておく）</small>'}`;
  await gacha({ kindLabel: KIND_LABEL[kind] + 'を ゲット！', item, rarity: item.rarity, rarityInfo: G.rarities[item.rarity], isNew, desc });
  updateEquip();
}

async function chooseElement() {
  const two = [...G.elements].sort(() => Math.random() - 0.5).slice(0, 2);
  sfx('rare', 'RARE');
  const i = await choose({
    title: ruby('ぞくせいの {泉|いずみ}を みつけた！'),
    sub: 'どちらか 1つ えらんでね（あとから かえられないよ）',
    cards: two.map((e) => ({ icon: e.emoji, name: ruby(e.name) + 'ぞくせい', skill: ruby(e.skill), desc: escapeHtml(e.desc), color: e.color })),
  });
  const el = two[i];
  S.element = el;
  S.windLeft = el.passive === 'guardOnce' ? el.value : 0;
  S.iceLeft = el.passive === 'keepCombo' ? el.value : 0;
  sfx('levelup');
  flash();
  await banner(`${el.emoji} ${ruby(el.name)}ぞくせい`, { small: 'ちからが やどった！', cls: 'gold', ms: 1300 });
  updateEquip();
}

function updateEquip() {
  const box = $('#equip');
  box.innerHTML = '';
  const w = S.best.weapon;
  if (w) {
    const s = document.createElement('span');
    if (w.rarity === 'LEGENDARY') s.className = 'legend';
    s.innerHTML = w.img ? `<img src="${img(w.img)}" alt="">` : w.emoji;
    box.appendChild(s);
  }
  if (S.element) {
    const s = document.createElement('span');
    s.innerHTML = S.element.emoji;
    box.appendChild(s);
  }
  const pet = $('#pet-img');
  if (S.best.pet) { pet.src = img(S.best.pet.img); pet.classList.add('show'); }
}

// ボス戦の はじめ：ぶきの ちから・雷ぞくせい
async function armBoss() {
  S.armed = { dmg: 0, cut: 0, guard: 0 };
  let open = 0;
  const w = S.best.weapon;
  if (w && chance(w.chance)) {
    const ef = w.effect;
    if (ef.type === 'dmg') S.armed.dmg += ef.times;
    if (ef.type === 'cut') S.armed.cut += ef.times;
    if (ef.type === 'guard') S.armed.guard += ef.times;
    if (ef.type === 'open') open += ef.value;
    if (ef.dmg) S.armed.dmg += ef.dmg;
    if (ef.cut) S.armed.cut += ef.cut;
    await cutin({ heroImg: img(hero().img), name: ruby(w.skill), sub: plain(w.name), small: 'ぶきの ちから はつどう！', color: '#ffb800' });
    toast(`⚔️ ${escapeHtml(w.desc.replace(/^ボス戦で \d+%：/, ''))}`, '#ffd54a', 3000);
  } else if (w) {
    toast(`⚔️ ${ruby(w.skill)}は はつどう しなかった……`, '#aaa', 2000);
  }
  const el = S.element;
  if (el && el.passive === 'open') { open += el.value; toast(`${el.emoji} ${ruby(el.skill)}！`, el.color); }
  if (open) {
    await wait(300);
    sfx('crit');
    bolts(3);
    flash();
    restart($('#enemy'), 'hit');
    const m = S.monster;
    const d = Math.min(open, m.hp - 1); // さいしょの こうげきだけでは たおれない
    m.hp -= d;
    damage(d * 333, { crit: true, x: 56, y: 30 });
    updateEnemyHp();
    await wait(700);
  }
}

// ---------- 分岐ダンジョン・魔王城 ----------
async function startBranch() {
  const key = S.branchRoute;
  const r = G.routes[key];
  S.route = key;
  S.routeN = 0;
  S.bossSpawned = false;
  S.bossDown = false;
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
  if (!S.element) await chooseElement();
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
  await armBoss();
}

async function startMaou() {
  const r = G.routes.maou;
  S.route = 'maou';
  S.routeN = 0;
  S.bossId = r.boss;
  S.bossDown = false;
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
  await armBoss();
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
}

// とどめの いちげき（ボスの HP が のこっていたら 仲間が てつだう）
async function finishingBlow(m) {
  if (m.hp > 0) {
    const helper = S.best.pet;
    const helperName = helper ? helper.name : '{王|おう}さまの {光|ひかり}';
    await banner(`${ruby(helperName)}が<br>ちからを かしてくれた！`, { small: 'あきらめない こころ！', cls: 'gold', ms: 1600 });
    if (helper) { restart($('#pet-img'), 'attack'); await wait(300); }
  }
  const w = S.best.weapon;
  const mv = moveName();
  await cutin({ heroImg: img(hero().img), name: w ? ruby(w.ult) : mv.name, sub: w ? plain(w.name) : mv.sub, small: 'とどめの いちげき', color: heroAttackColor() });
  restart($('.hero-unit'), 'special');
  await wait(400);
  sfx('slash'); slash(heroAttackColor(), true); bolts(3);
  await wait(150);
  sfx('crit'); flash(); shake();
  damage(9999, { crit: true, x: 56, y: 28 });
  m.hp = 0; updateEnemyHp();
  particles({ x: 58, y: 45, n: 40, spread: 220, colors: ['#fff', '#ffd54a', '#ff6fb5', '#38e1ff'] });
  await wait(500);
}

async function finishRoute() {
  const r = G.routes[S.route];
  const m = S.monster;
  await wait(300);
  await finishingBlow(m);
  if (S.route === 'maou') { await finishMaou(); return; }

  sfx('defeat');
  restart($('#enemy'), 'dead');
  flash();
  await wait(900);
  stopBgm();
  sfx('victory');
  $('#enemy-hud').style.opacity = 0;
  await banner(`${ruby(m.name)}を<br>たおした！！`, { small: 'VICTORY', cls: 'gold', ms: 2200 });
  await openChest({ minRarity: 'EPIC' });
  if (!S.best.weapon) await openChest({ kind: 'weapon', minRarity: 'RARE' });
  if (!S.best.pet) await openChest({ kind: 'pet', minRarity: 'RARE' });
  playBgm('ending');
  await playStory(r.ending, r.endBg);
  await bannerOn('screen-story', r.endTitle);
  await playStory([['narr', '{世界|せかい}は まだ すくわれて いない。しかし {勇者|ゆうしゃ}{HERO}の {冒険|ぼうけん}は はじまった ばかりだ！']], r.endBg);
  showResult();
}

// 魔王：ノーミスなら「さいごの いちげき」（8択の高難度問題）。正解で ふういん、それ以外は にげられる
async function finishMaou() {
  const r = G.routes.maou;
  if (S.misses === 0) {
    S.finalTried = true;
    await wait(400);
    flash(true);
    shake();
    sfx('bossAppear');
    await playStory(r.finalTalk, r.bg);
    show('screen-battle');
    $('#screen-battle').classList.add('final');
    $('#enemy').classList.add('rage');
    sfx('warning');
    await banner('FINAL ATTACK', { small: '魔王の さいごの いちげき！ 8つから えらべ！', cls: 'warning', ms: 1800 });
    const hq = pickOne(S.hardPool);
    S.shownQ = S.n + 1;
    updateHud();
    const res = await askQuestion(hq, { eight: true, label: 'さいごの いちげき（8たく）' });
    S.log.push({ no: S.shownQ, id: hq.id, grade: hq.grade, type: hq.type, route: 'final', ok: res.ok, pos: S.current.correctIndex, n: 8 });
    S.n++;
    if (res.ok) {
      S.correct++;
      S.combo++;
      S.maxCombo = Math.max(S.maxCombo, S.combo);
      S.sealed = true;
      sfx('correct');
      burstText('せいかい！', 'good');
      await wait(700);
      await cutin({ heroImg: img(hero().img), name: ruby('{究極|きゅうきょく}{奥義|おうぎ}・{漢字|かんじ}{封印|ふういん}{陣|じん}'), sub: 'カンジ・シール・オブ・ゴッド', small: 'ふういんの いちげき', color: '#ffd54a' });
      $('#magic-circle').classList.add('on');
      flash(); shake(); bolts(5);
      particles({ x: 58, y: 45, n: 50, spread: 260, colors: ['#fff', '#ffd54a', '#ff6fb5', '#38e1ff'] });
      await wait(600);
      await playStory(r.sealTalk, r.bg);
      show('screen-battle');
    } else {
      S.misses++;
      S.finalMiss++;
      S.combo = 0;
      sfx('wrong');
      burstText('ざんねん！', 'bad');
      await wait(500);
      await showExplain(hq, null);
    }
    $('#screen-battle').classList.remove('final');
  }

  if (S.sealed) {
    sfx('defeat');
    restart($('#enemy'), 'dead');
    flash();
    await wait(900);
    stopBgm();
    sfx('victory');
    $('#enemy-hud').style.opacity = 0;
    $('#magic-circle').classList.remove('on');
    await banner(`${ruby('{魔王|まおう}')}を<br>ふういんした！！`, { small: 'PERFECT CLEAR', cls: 'gold', ms: 2400 });
    await openChest({ rarity: 'LEGENDARY' });
    castleFx(false);
    playBgm('ending');
    await playStory(r.ending, 'bg_throne');
    await bannerOn('screen-story', '{世界|せかい}に<br>{平和|へいわ}が おとずれた！');
  } else {
    await playStory(r.escapeTalk, r.bg);
    show('screen-battle');
    sfx('defeat');
    restart($('#enemy'), 'dead');
    await wait(900);
    stopBgm();
    $('#enemy-hud').style.opacity = 0;
    $('#magic-circle').classList.remove('on');
    await banner(`${ruby('{魔王|まおう}')}は<br>にげだした……！`, { small: 'でも 世界は まもられた！', cls: 'gold', ms: 2200 });
    await openChest({ minRarity: 'EPIC' });
    castleFx(false);
    playBgm('ending');
    await playStory(r.escapeEnding, 'bg_throne');
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
  let foot;
  if (S.route === 'maou' && S.sealed) {
    end = 'TRUE END';
    catchText = '{魔王|まおう}を ふういんした！ {完全|かんぜん}クリア！';
    title = 'でんせつの 漢字マスター';
    foot = '{世界|せかい}に {平和|へいわ}が おとずれた！';
  } else if (S.route === 'maou' && S.finalTried) {
    end = 'GREAT END';
    catchText = '{魔王|まおう}を たおした！ でも にげられた……';
    title = '漢字の 大勇者';
    foot = 'あと 1問！ さいごの いちげきを 見きって ふういんしよう！';
  } else if (S.route === 'maou') {
    end = 'BRAVE END';
    catchText = '{魔王|まおう}を おいはらって {世界|せかい}を まもった！';
    title = '漢字の 勇者';
    foot = 'ノーミスで さいごの いちげきに ちょうせんしよう！';
  } else {
    const r = G.routes[S.route];
    end = 'HAPPY END';
    catchText = r.endTitle;
    title = { goblin: '村の ヒーロー', forest: '森の まもりびと', ruins: '町の まもりがみ' }[S.route];
    foot = 'つぎは {魔王|まおう}を たおしに いこう！';
  }
  const rank = S.sealed ? 'S' : acc >= 95 ? 'A' : acc >= 80 ? 'B' : acc >= 60 ? 'C' : 'D';
  const isTrue = end === 'TRUE END';
  const itemHtml = (label, it, extra = {}) => {
    if (!it) return `<div class="r-item"><div class="ri-kind">${label}</div><div class="ri-icon">？</div><div class="ri-name">なし</div></div>`;
    const ri = it.rarity ? G.rarities[it.rarity] : { color: it.color, label: 'ぞくせい' };
    const icon = it.img ? `<img src="${img(it.img)}" alt="">` : it.emoji;
    return `<div class="r-item" style="--rc:${ri.color};--rcg:${ri.color}66"><div class="ri-kind">${label}</div><div class="ri-icon">${icon}</div><div class="ri-name">${ruby(extra.name || it.name)}</div><div class="ri-rar">${ri.label}</div></div>`;
  };
  const el = S.element;
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
        ${S.saved ? `<div class="r-stat">ふせいだ ミス <b>${S.saved}</b></div>` : ''}
        <div class="r-stat">漢字パワー <b>${isTrue ? 'MAX' : S.power.toLocaleString()}</b></div>
        <div class="r-rank"><small>ランク</small><span class="r-rank-badge">${rank}</span></div>
      </div>
    </div>
    <div class="r-items">
      ${itemHtml('ぶき', S.best.weapon)}
      ${itemHtml('なかま', S.best.pet)}
      ${itemHtml('ぞくせい', el, { name: el ? el.name + 'ぞくせい' : '' })}
    </div>
    <div class="r-foot">${isTrue ? '🌟 WORLD PEACE 🌟<br>' : ''}${ruby(foot)}<br><span class="r-grade">${settings.grade}年生モード ・ 漢字の勇者ケイト</span></div>`;
  setBg($('#result-bg'), S.route === 'maou' ? 'bg_throne' : G.routes[S.route].endBg);
  show('screen-result');
  if (isTrue) setTimeout(() => { sfx('fanfare'); }, 300);
}

// テスト用（URLに #debug を付けたときだけ）。自動プレイで全ルートを確認するのに使う
if (location.hash.includes('debug')) window.__kanji = { get S() { return S; }, settings, speed, gacha, cutin, choose, G: () => G };

boot();
