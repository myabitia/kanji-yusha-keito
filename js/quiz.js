// 問題の読みこみと出題えらび。
// ・えらんだ学年までのファイル（data/questions/g1〜gN.json）だけを読む
// ・q.grade は「画面に出る漢字の最高学年」なので、grade > えらんだ学年 の問題は絶対に出さない
// ・選択肢は毎回 まちがい候補から3つえらび、正解とまぜてシャッフルする（正解の位置は毎回ちがう）

export async function loadQuestions(maxGrade, onProgress) {
  const files = [];
  for (let g = 1; g <= maxGrade; g++) files.push(`data/questions/g${g}.json`);
  let done = 0;
  const lists = await Promise.all(files.map(async (f) => {
    const res = await fetch(f);
    if (!res.ok) throw new Error(`${f} を 読みこめませんでした`);
    const json = await res.json();
    done++;
    onProgress && onProgress(done / files.length);
    return json.questions;
  }));
  return lists.flat().filter((q) => q.grade <= maxGrade);
}

export const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function makeChoices(q) {
  const wrong = shuffle(q.wrong).slice(0, 3);
  const choices = shuffle([q.answer, ...wrong]);
  return { choices, correctIndex: choices.indexOf(q.answer) };
}

export class Deck {
  constructor(questions, grade) {
    this.all = questions;
    this.grade = grade;
    this.usedKeys = new Set();
    this.usedIds = new Set();
    this.recentTypes = [];
  }

  // phase: 'main'（1〜40問） / 'dungeon'（まちがえた後の10問） / 'final'（魔王城の10問）
  // n: そのフェーズの中で何問目か（main は通しの問題番号）
  pick(phase, n) {
    const G = this.grade;
    let target;
    let maxDiff = 3;
    if (phase === 'main') {
      const t = Math.min(1, Math.max(0, (n - 1) / 39));
      target = G <= 2 ? G - 0.3 + 0.3 * t : Math.max(1, G - 2) + (2 - 0.3) * t; // 後半ほど むずかしく
      maxDiff = n <= 8 ? 2 : 3;
    } else if (phase === 'dungeon') {
      target = Math.max(1, G - 0.5);
    } else {
      target = G; // 魔王城は えらんだ学年の漢字が中心
    }
    let pool = this.all.filter((q) => !this.usedKeys.has(q.key) && !this.usedIds.has(q.id));
    if (phase === 'final') {
      const top = pool.filter((q) => q.grade === G);
      if (top.length >= 12) pool = top;
      else pool = pool.filter((q) => q.grade >= G - 1);
    }
    if (!pool.length) pool = this.all.filter((q) => !this.usedIds.has(q.id));
    if (!pool.length) { this.usedIds.clear(); pool = this.all; }

    const last = this.recentTypes[this.recentTypes.length - 1];
    let total = 0;
    const weights = pool.map((q) => {
      const d = q.grade - target;
      let w = Math.exp(-(d * d) / (2 * 0.7 * 0.7));
      if (q.diff > maxDiff) w *= 0.25;
      if (phase === 'final') w *= q.diff >= 2 ? 1.6 : 0.5;
      if (phase === 'main' && n <= 5 && q.diff >= 3) w *= 0.3;
      if (q.type === last) w *= 0.08;
      else if (this.recentTypes.includes(q.type)) w *= 0.45;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    let picked = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { picked = pool[i]; break; }
    }
    this.usedKeys.add(picked.key);
    this.usedIds.add(picked.id);
    this.recentTypes.push(picked.type);
    if (this.recentTypes.length > 3) this.recentTypes.shift();
    return picked;
  }
}
