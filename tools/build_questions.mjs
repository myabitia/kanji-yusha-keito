// 問題ソース（data/source/g1〜g6.txt）から data/questions.json を作る。
// 使い方: node tools/build_questions.mjs
//
// ・出てくる漢字をすべて「学年別漢字配当表」(data/kanji_grades.json) と照合し、
//   問題の学年 = 問題文・選択肢・解説に出てくる漢字の最高学年 として自動で決める。
//   → 選んだ学年より上の漢字が画面に出る問題は、そもそも出題対象にならない。
// ・配当表にない漢字（教育漢字以外）が出てきたらエラーにして止める。
// ・選択肢は「正解」と「まちがい候補（最大5つ）」を分けて保存し、ゲーム側で毎回3つ選んでシャッフルする。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- 配当表 ----------
const table = JSON.parse(read('data/kanji_grades.json'));
const EXPECT = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
const GRADE = {};
for (let g = 1; g <= 6; g++) {
  const chars = [...table[g]];
  if (chars.length !== EXPECT[g]) throw new Error(`配当表 ${g}年の字数が ${chars.length}（正しくは ${EXPECT[g]}）`);
  for (const c of chars) {
    if (GRADE[c]) throw new Error(`配当表に重複: ${c}`);
    GRADE[c] = g;
  }
}
// 部首の説明に使う字（氵など）は漢字としては数えない
const RADICALS = new Set([..."氵衤礻巾攵"]);
const isKanji = (c) => /[㐀-鿿豈-﫿]/.test(c) && !RADICALS.has(c);
const errors = [];
const warnings = [];
function gradeOf(text, where) {
  let g = 1;
  for (const c of text) {
    if (!isKanji(c)) continue;
    if (!GRADE[c]) { errors.push(`${where}: 教育漢字ではない「${c}」（${text}）`); continue; }
    g = Math.max(g, GRADE[c]);
  }
  return g;
}
const kanjiIn = (s) => [...new Set([...s].filter(isKanji))];

// ---------- 乱数（ビルド結果を毎回同じにするため固定シード） ----------
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (const ch of seedStr) { h = Math.imul(h ^ ch.codePointAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const shuffle = (a, r) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- 読みのまちがい候補（にごり・のばす音・小さい「っ」などを1か所だけ変える） ----------
const DAK = ['かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ'];
const DAKMAP = {};
for (const set of DAK) for (const c of set) DAKMAP[c] = [...set].filter((x) => x !== c);
const OU = new Set([...'おこそとのほもよろごぞどぼぽうくすつぬふむゆるぐずぶぷょゅ']);
const ER = new Set([...'えけせてねへめれげぜでべぺ']);
const SOKU_NEXT = new Set([...'かきくけこさしすせそたちつてとぱぴぷぺぽ']);
const SMALL = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ' };
// よくある まちがい ほど 前に来るように、変え方ごとに分けて返す
function mutations(r) {
  const a = [...r];
  const tiers = [new Set(), new Set(), new Set()];
  const put = (t, arr) => tiers[t].add(arr.join(''));
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    for (const d of DAKMAP[c] || []) { const b = [...a]; b[i] = d; put(0, b); }
    if (a[i + 1] === 'う' && OU.has(c)) { const b = [...a]; b.splice(i + 1, 1); put(0, b); }
    else if (i > 0 && OU.has(c) && c !== 'う' && a[i + 1] !== 'う' && !SMALL[a[i + 1]] && a[i + 1] !== 'っ') { const b = [...a]; b.splice(i + 1, 0, 'う'); put(1, b); }
    if (a[i + 1] === 'い' && ER.has(c)) { const b = [...a]; b.splice(i + 1, 1); put(0, b); }
    if (c === 'っ') { const b = [...a]; b.splice(i, 1); put(0, b); }
    if (i > 0 && i < a.length - 1 && SOKU_NEXT.has(c) && a[i - 1] !== 'っ' && a[i - 1] !== 'ん' && !SMALL[a[i - 1]] && a.length >= 3) { const b = [...a]; b.splice(i, 0, 'っ'); put(2, b); }
    if (SMALL[c]) {
      const b = [...a]; b[i] = SMALL[c]; put(1, b);
      const s = [...a]; s[i] = c === 'ゅ' ? 'ょ' : 'ゅ'; put(0, s);
    }
    if (c === 'ん' && i > 0) { const b = [...a]; b.splice(i, 1); put(1, b); }
  }
  const ok = (x) => x !== r && x.length > 0 && !/^[っんゃゅょう]/.test(x) && !x.includes('っっ') && !x.includes('うう');
  return tiers.map((t) => [...t].filter(ok));
}

// ---------- ソース読み込み ----------
const realWords = new Set(read('data/source/real_words.txt').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).flatMap((l) => l.split(/[ ,、]+/)));
const entries = [];
for (let g = 1; g <= 6; g++) {
  const file = `data/source/g${g}.txt`;
  read(file).split(/\r?\n/).forEach((line, idx) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const f = line.split('|');
    const where = `g${g}.txt:${idx + 1}`;
    const list = (s) => (s || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '-');
    if (f[0] === 'W') entries.push({ kind: 'W', src: g, where, word: f[1], readings: f[2].split('/'), meaning: f[3] || '', ww: list(f[4]), rw: list(f[5]) });
    else if (f[0] === 'S') entries.push({ kind: 'S', src: g, where, sentence: f[1], readings: f[2].split('/'), ww: list(f[3]), rw: list(f[4]) });
    else if (f[0] === 'O') entries.push({ kind: 'O', src: g, where, answer: f[1], reading: f[2], wrong: list(f[3]), meaning: f[4] || '' });
    else if (f[0] === 'Q') entries.push({ kind: 'Q', src: g, where, type: f[1], big: f[2] === '-' ? '' : f[2], prompt: f[3], answer: f[4], wrong: list(f[5]), explain: f[6] || '', diff: Number(f[7]) || 2 });
    else errors.push(`${where}: 行の種類が不明「${line}」`);
  });
}
const W = entries.filter((e) => e.kind === 'W');

// ---------- 問題を作る ----------
const LABEL = {
  reading: 'よみ', writing: 'かき', fill: 'あなうめ', kanjiUse: 'つかう ことば', wrongKanji: 'まちがいさがし',
  meaning: 'いみ', okurigana: 'おくりがな', sentenceReading: '文の 中の よみ', sentenceWriting: '文の 中の かき',
  similar: 'にた かんじ', combine: 'くみあわせ', usage: 'つかいかた',
};
const questions = [];
let serial = 0;
function add(q, where) {
  q.wrong = [...new Set(q.wrong)].filter((w) => w !== q.answer);
  if (q.wrong.length < 3) { warnings.push(`${where}: まちがい候補が3つ未満なので ${q.type} をスキップ（${q.answer}）`); return; }
  q.wrong = q.wrong.slice(0, 5);
  const all = [q.big, q.prompt, q.sub, q.answer, ...q.wrong, q.explain].filter(Boolean).join('');
  q.grade = gradeOf(all, where);
  q.id = `q${String(++serial).padStart(4, '0')}`;
  questions.push(q);
}
// まちがい候補を「その学年までの漢字」だけにしぼる。足りなければ上の学年の候補もまぜる
function splitByGrade(list, g, where) {
  const inG = list.filter((w) => gradeOf(w, where) <= g);
  const over = list.filter((w) => gradeOf(w, where) > g);
  return { inG, over };
}
function readingWrongs(e, reading, alts, r) {
  const ex = new Set(alts);
  const hand = e.rw.filter((x) => !ex.has(x));
  const muts = mutations(reading).flatMap((tier) => shuffle(tier.filter((x) => !ex.has(x)), r));
  const others = shuffle(W.filter((o) => o !== e && Math.abs(o.src - e.src) <= 1 && Math.abs([...o.readings[0]].length - [...reading].length) <= 1)
    .map((o) => o.readings[0]).filter((x) => !ex.has(x)), r);
  const pool = [...hand];
  // 手書きの候補 → のばす音などの変化 → ほかの言葉の読み の順に、まざるように入れる
  while (pool.length < 5 && (muts.length || others.length)) {
    if (muts.length) pool.push(muts.shift());
    if (pool.length < 5 && muts.length && r() < 0.6) pool.push(muts.shift());
    if (pool.length < 5 && others.length) pool.push(others.shift());
  }
  return pool;
}

for (const e of W) {
  const r = rng(e.word + e.where);
  const reading = e.readings[0];
  const gw = gradeOf(e.word, e.where);
  const key = `w:${e.word}`;
  const kj = kanjiIn(e.word);
  const diffBase = ([...reading].length >= 5 ? 1 : 0) + (e.rw.length ? 1 : 0);

  // よみ
  add({ type: 'reading', key, big: e.word, prompt: 'の よみかたは？', answer: reading, wrong: readingWrongs(e, reading, e.readings, r),
    explain: `「${e.word}」は「${reading}」と よむよ。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: Math.min(3, 1 + diffBase) }, e.where);

  if (e.ww.length >= 3) {
    const { inG, over } = splitByGrade(e.ww, gw, e.where);
    const hintOK = e.meaning && !kj.some((k) => e.meaning.includes(k));
    const base = { type: 'writing', key, big: reading, prompt: 'を かんじで かくと？', sub: hintOK ? `（${e.meaning}）` : '', answer: e.word,
      explain: `「${reading}」は「${e.word}」と かくよ。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: 2 };
    if (inG.length >= 3) add({ ...base, wrong: inG }, e.where);
    if (over.length && (inG.length < 3 || over.length >= 1)) add({ ...base, wrong: [...over, ...inG] }, e.where); // 上の学年向けのむずかしい版

    // あなうめ（1文字だけちがう まちがい から、その文字を候補にする）
    const chars = [...e.word];
    if (kj.length >= 2) {
      let best = null;
      chars.forEach((c, pos) => {
        if (!isKanji(c)) return;
        const ds = [...new Set(e.ww.map((w) => [...w]).filter((w) => w.length === chars.length && w.every((x, i) => i === pos || x === chars[i])).map((w) => w[pos]).filter(isKanji))];
        if (!best || ds.length > best.ds.length || (ds.length === best.ds.length && GRADE[c] > GRADE[chars[best.pos]])) best = { pos, ds };
      });
      if (best && best.ds.length >= 1) {
        const ans = chars[best.pos];
        const ga = GRADE[ans];
        const filler = shuffle(Object.keys(GRADE).filter((k) => GRADE[k] === ga && !chars.includes(k) && !best.ds.includes(k)), r);
        const wrong = [...best.ds.filter((d) => GRADE[d] <= gw)];
        while (wrong.length < 4) wrong.push(filler.shift());
        const masked = chars.map((c, i) => (i === best.pos ? '□' : c)).join('');
        add({ type: 'fill', key, big: masked, sub: `（${reading}）`, prompt: '□に はいる かんじは？', answer: ans, wrong,
          explain: `ただしくは「${e.word}（${reading}）」。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: 2 }, e.where);
      }
    }

    // まちがいさがし（本当にある言葉は「まちがい」にならないので使わない）
    if ([...e.word].length >= 2) {
      const bad = inG.filter((w) => !realWords.has(w) && !W.some((o) => o.word === w));
      if (bad.length) {
        const wrongForm = bad[Math.floor(r() * bad.length)];
        const others = shuffle(W.filter((o) => o !== e && Math.abs(o.src - e.src) <= 1 && [...o.word].length >= 2 && Math.abs([...o.word].length - chars.length) <= 1 && gradeOf(o.word, o.where) <= gw), r)
          .slice(0, 5).map((o) => o.word);
        add({ type: 'wrongKanji', key, big: '', prompt: 'まちがった かんじが ある ことばは どれ？', answer: wrongForm, wrong: others,
          explain: `「${wrongForm}」は まちがい！ ただしくは「${e.word}（${reading}）」。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: 2 }, e.where);
      }
    }
  }

  // つかう ことば（この漢字を使う言葉の読みをえらぶ）
  if (kj.length >= 1 && [...e.word].length >= 2) {
    const target = kj.reduce((a, b) => (GRADE[b] > GRADE[a] ? b : a));
    const others = shuffle(W.filter((o) => o !== e && o.src === e.src && !o.word.includes(target) && !e.readings.includes(o.readings[0])), r)
      .slice(0, 5).map((o) => o.readings[0]);
    add({ type: 'kanjiUse', key, big: target, prompt: 'を つかう ことばは どれ？', answer: reading, wrong: others,
      explain: `「${reading}」は「${e.word}」。「${target}」を つかうよ。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: 3 }, e.where);
  }

  // いみ（県名などの「〜地方の県」は答えが重なるので作らない）
  if (e.meaning && !/[県府]$/.test(e.meaning) && [...e.word].length >= 2) {
    const others = shuffle(W.filter((o) => o !== e && o.src === e.src && o.meaning && o.meaning !== e.meaning && !/[県府]$/.test(o.meaning)), r)
      .slice(0, 5).map((o) => o.meaning);
    add({ type: 'meaning', key, big: e.word, prompt: 'の いみは？', answer: e.meaning, wrong: others,
      explain: `「${e.word}（${reading}）」は「${e.meaning}」と いう いみ。`, kanji: kj, reading, meaning: e.meaning, learn: `${e.word}（${reading}）`, diff: 2 }, e.where);
  }
}

for (const e of entries.filter((x) => x.kind === 'S')) {
  const r = rng(e.sentence + e.where);
  const m = e.sentence.match(/［(.+?)］/);
  if (!m) { errors.push(`${e.where}: ［ ］が ない`); continue; }
  const target = m[1];
  const reading = e.readings[0];
  const key = `s:${target}`;
  const kj = kanjiIn(target);
  add({ type: 'sentenceReading', key, big: e.sentence, prompt: '［ ］の よみかたは？', answer: reading, wrong: readingWrongs(e, reading, e.readings, r),
    explain: `「${target}」は「${reading}」と よむよ。`, kanji: kj, reading, learn: `${target}（${reading}）`, example: e.sentence, diff: 1 + (e.rw.length ? 1 : 0) }, e.where);
  if (e.ww.length >= 3) {
    const hidden = e.sentence.replace(`［${target}］`, `［${reading}］`);
    const gw = gradeOf(hidden + target, e.where);
    const { inG, over } = splitByGrade(e.ww, gw, e.where);
    const wrong = inG.length >= 3 ? inG : [...inG, ...over];
    add({ type: 'sentenceWriting', key, big: hidden, prompt: '［ ］を かんじで かくと？', answer: target, wrong,
      explain: `「${reading}」は「${target}」と かくよ。`, kanji: kj, reading, learn: `${target}（${reading}）`, example: e.sentence.replace(/［|］/g, ''), diff: 2 }, e.where);
  }
}

for (const e of entries.filter((x) => x.kind === 'O')) {
  add({ type: 'okurigana', key: `o:${e.answer}`, big: e.reading, prompt: 'ただしい おくりがなは どれ？', sub: e.meaning ? `（${e.meaning}）` : '',
    answer: e.answer, wrong: e.wrong, explain: `「${e.reading}」は「${e.answer}」と かくよ。`, kanji: kanjiIn(e.answer), reading: e.reading, meaning: e.meaning, learn: `${e.answer}（${e.reading}）`, diff: 2 }, e.where);
}

for (const e of entries.filter((x) => x.kind === 'Q')) {
  if (!LABEL[e.type]) { errors.push(`${e.where}: 不明なタイプ ${e.type}`); continue; }
  add({ type: e.type, key: `q:${e.where}`, big: e.big, prompt: e.prompt, answer: e.answer, wrong: e.wrong, explain: e.explain,
    kanji: kanjiIn(e.big + e.answer), learn: [...e.answer].length <= 8 ? e.answer : '', diff: e.diff }, e.where);
}

// ---------- 出力 ----------
for (const q of questions) for (const k of Object.keys(q)) if (q[k] === '' || q[k] === undefined || (Array.isArray(q[k]) && !q[k].length && k !== 'wrong')) delete q[k];
const byGrade = {};
for (const q of questions) byGrade[q.grade] = (byGrade[q.grade] || 0) + 1;
const byType = {};
for (const q of questions) byType[q.type] = (byType[q.type] || 0) + 1;

if (warnings.length) console.log(`注意 ${warnings.length}件:\n  ` + warnings.slice(0, 40).join('\n  ') + (warnings.length > 40 ? '\n  …' : ''));
if (errors.length) {
  console.error(`\nエラー ${errors.length}件（questions.json は更新していません）:\n  ` + errors.join('\n  '));
  process.exit(1);
}
// 学年ごとにファイルを分ける（えらんだ学年までのファイルだけ読みこむので、スマホでも軽い）
const NOTE = 'tools/build_questions.mjs が data/source/*.txt から自動生成。直接編集せず source を直して再生成してください。';
const dir = path.join(ROOT, 'data/questions');
fs.mkdirSync(dir, { recursive: true });
for (let g = 1; g <= 6; g++) {
  const list = questions.filter((q) => q.grade === g);
  const body = list.map((q) => JSON.stringify(q)).join(',\n');
  fs.writeFileSync(path.join(dir, `g${g}.json`), `{"note":${JSON.stringify(NOTE)},"grade":${g},"count":${list.length},"questions":[\n${body}\n]}\n`);
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ note: NOTE, count: questions.length, byGrade, byType }, null, 1));
console.log(`OK: ${questions.length}問を書き出しました`);
console.log('学年別:', byGrade);
console.log('タイプ別:', byType);
let cum = 0;
for (let g = 1; g <= 6; g++) { cum += byGrade[g] || 0; console.log(`  ${g}年生をえらんだときに出せる問題: ${cum}問`); }
