// 効果音とBGMは WebAudio でその場で作る（音声ファイルのダウンロードなし）。
// スマホの自動再生制限があるので、最初のタップ（unlock）のあとから鳴らす。音が出なくてもゲームは遊べる。
let ctx = null;
let master = null;
let sfxBus = null;
let bgmBus = null;
let muted = false;
let bgmTimer = null;
let bgmName = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      bgmBus = ctx.createGain(); bgmBus.gain.value = 0.16; bgmBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.03);
}
export const isMuted = () => muted;

const N = (name) => {
  // "C5" → 周波数
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (idx - 9) / 12 + (Number(m[3]) - 4));
};

function tone(freq, start, dur, { type = 'square', vol = 0.3, slide = 0, bus = sfxBus, attack = 0.005 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g); g.connect(bus);
  o.start(start); o.stop(start + dur + 0.02);
}

let noiseBuf = null;
function noise(start, dur, { vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', slide = 1, bus = sfxBus } = {}) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, start); f.Q.value = q;
  if (slide !== 1) f.frequency.exponentialRampToValueAtTime(freq * slide, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(start); s.stop(start + dur + 0.02);
}

const SFX = {
  tap(t) { tone(880, t, 0.06, { type: 'square', vol: 0.15 }); },
  select(t) { tone(660, t, 0.07, { vol: 0.18 }); tone(990, t + 0.06, 0.09, { vol: 0.18 }); },
  correct(t) {
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(N(n), t + i * 0.055, 0.16, { type: 'square', vol: 0.2 }));
    tone(N('C5'), t, 0.3, { type: 'triangle', vol: 0.25 });
  },
  wrong(t) { tone(220, t, 0.18, { type: 'sawtooth', vol: 0.2, slide: 0.7 }); tone(165, t + 0.16, 0.3, { type: 'sawtooth', vol: 0.2, slide: 0.6 }); },
  slash(t) { noise(t, 0.18, { vol: 0.5, freq: 3000, slide: 0.3, q: 1.2 }); tone(1200, t, 0.12, { type: 'sawtooth', vol: 0.08, slide: 0.3 }); },
  hit(t) { noise(t, 0.2, { vol: 0.6, freq: 500, type: 'lowpass', q: 0.5 }); tone(120, t, 0.18, { type: 'square', vol: 0.3, slide: 0.4 }); },
  crit(t) { SFX.hit(t); tone(N('A6'), t + 0.05, 0.12, { vol: 0.15 }); tone(N('E7'), t + 0.1, 0.18, { vol: 0.15 }); },
  hurt(t) { noise(t, 0.25, { vol: 0.5, freq: 300, type: 'lowpass' }); tone(200, t, 0.25, { type: 'square', vol: 0.2, slide: 0.5 }); },
  defeat(t) { noise(t, 0.6, { vol: 0.4, freq: 2000, slide: 0.1 }); [880, 660, 440, 330].forEach((f, i) => tone(f, t + i * 0.06, 0.12, { vol: 0.15 })); },
  combo(t) { tone(N('G6'), t, 0.08, { vol: 0.15 }); tone(N('D7'), t + 0.06, 0.12, { vol: 0.15 }); },
  max(t) {
    for (let i = 0; i < 10; i++) tone(N('C6') * Math.pow(2, i / 12 * 2), t + i * 0.035, 0.12, { vol: 0.13 });
    tone(N('C5'), t, 0.6, { type: 'sawtooth', vol: 0.12, slide: 2 });
  },
  special(t) {
    noise(t, 0.9, { vol: 0.35, freq: 400, slide: 8, q: 2 });
    [0, 4, 7, 12, 16].forEach((s, i) => tone(N('C5') * Math.pow(2, s / 12), t + 0.1 + i * 0.05, 0.4, { type: 'sawtooth', vol: 0.1 }));
  },
  levelup(t) { ['C6', 'E6', 'G6', 'C7', 'G6', 'C7'].forEach((n, i) => tone(N(n), t + i * 0.07, 0.14, { vol: 0.16 })); },
  chest(t) { tone(330, t, 0.1, { vol: 0.2 }); tone(392, t + 0.1, 0.1, { vol: 0.2 }); noise(t + 0.2, 0.4, { vol: 0.3, freq: 6000, slide: 0.5, type: 'highpass' }); },
  drum(t) { for (let i = 0; i < 8; i++) noise(t + i * 0.09, 0.07, { vol: 0.25 + i * 0.03, freq: 200, type: 'lowpass' }); },
  rare(t, rarity) {
    const top = { COMMON: 3, RARE: 5, EPIC: 7, LEGENDARY: 10 }[rarity] || 4;
    const scale = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7', 'C8'];
    for (let i = 0; i < top; i++) tone(N(scale[i]), t + i * 0.06, 0.25, { type: 'triangle', vol: 0.2 });
    if (rarity === 'LEGENDARY') { tone(N('C5'), t, 1.2, { type: 'sawtooth', vol: 0.1 }); tone(N('G5'), t, 1.2, { type: 'sawtooth', vol: 0.08 }); }
  },
  warning(t) { for (let i = 0; i < 3; i++) { tone(880, t + i * 0.42, 0.2, { type: 'square', vol: 0.18 }); tone(660, t + i * 0.42 + 0.2, 0.2, { type: 'square', vol: 0.18 }); } },
  bossAppear(t) { tone(55, t, 1.4, { type: 'sawtooth', vol: 0.35, slide: 0.8 }); noise(t, 1.2, { vol: 0.4, freq: 120, type: 'lowpass' }); tone(N('C3'), t + 0.3, 0.8, { type: 'square', vol: 0.15 }); tone(N('F#3'), t + 0.3, 0.8, { type: 'square', vol: 0.12 }); },
  victory(t) {
    const m = [['C5', 0.12], ['C5', 0.12], ['C5', 0.12], ['C5', 0.36], ['G#4', 0.36], ['A#4', 0.36], ['C5', 0.24], ['A#4', 0.12], ['C5', 0.7]];
    let x = t;
    for (const [n, d] of m) { tone(N(n), x, d * 0.95, { vol: 0.2 }); tone(N(n) / 2, x, d * 0.95, { type: 'triangle', vol: 0.2 }); x += d; }
  },
  fanfare(t) {
    const m = [['G5', 0.15], ['C6', 0.15], ['E6', 0.15], ['G6', 0.45], ['E6', 0.15], ['G6', 0.8]];
    let x = t;
    for (const [n, d] of m) { tone(N(n), x, d, { vol: 0.2 }); tone(N(n) / 2, x, d, { type: 'triangle', vol: 0.2 }); x += d; }
  },
  story(t) { tone(1320, t, 0.03, { type: 'square', vol: 0.05 }); },
};

export function sfx(name, arg) {
  if (!ctx || muted) return;
  try { SFX[name] && SFX[name](ctx.currentTime + 0.01, arg); } catch (e) { /* 音が出なくてもゲームは続ける */ }
}

// ---------- BGM（かんたんなチップチューン。8分音符で1小節ずつ予約していく） ----------
const SONGS = {
  title: { bpm: 132, bass: ['C3', 'C3', 'A2', 'A2', 'F2', 'F2', 'G2', 'G2'], lead: ['E5', 'G5', 'C6', 'G5', 'A5', 'C6', 'E6', 'C6', 'F5', 'A5', 'C6', 'A5', 'G5', 'B5', 'D6', 'B5'] },
  field: { bpm: 150, bass: ['C3', 'G2', 'A2', 'E2', 'F2', 'C3', 'F2', 'G2'], lead: ['C5', 'E5', 'G5', 'E5', 'B4', 'D5', 'G5', 'D5', 'A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'D5', 'B4', 'F4', 'A4', 'C5', 'F5', 'E5', 'C5', 'G4', 'C5', 'F4', 'A4', 'D5', 'F5', 'G5', 'F5', 'E5', 'D5'] },
  dungeon: { bpm: 140, bass: ['A2', 'A2', 'F2', 'F2', 'G2', 'G2', 'E2', 'E2'], lead: ['A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'G5', 'F4', 'A4', 'C5', 'A4', 'F4', 'A4', 'D5', 'C5', 'G4', 'B4', 'D5', 'B4', 'G4', 'B4', 'E5', 'D5', 'E4', 'G#4', 'B4', 'E5', 'D5', 'B4', 'G#4', 'E4'] },
  boss: { bpm: 168, bass: ['D2', 'D2', 'D2', 'D2', 'A#1', 'A#1', 'C2', 'C2'], lead: ['D5', 'D5', 'F5', 'D5', 'G5', 'D5', 'A5', 'G#5', 'A5', 'F5', 'D5', 'F5', 'E5', 'C5', 'A4', 'C#5', 'D5', 'D5', 'F5', 'D5', 'G5', 'D5', 'A#5', 'A5', 'G5', 'F5', 'E5', 'F5', 'E5', 'D5', 'C#5', 'E5'] },
  ending: { bpm: 112, bass: ['F2', 'G2', 'E2', 'A2', 'D2', 'G2', 'C3', 'C3'], lead: ['A5', 'G5', 'F5', 'G5', 'A5', 'C6', 'B5', 'G5', 'G5', 'F5', 'E5', 'F5', 'G5', 'A5', 'E5', 'C5', 'F5', 'E5', 'D5', 'E5', 'F5', 'A5', 'G5', 'D5', 'E5', 'G5', 'C6', 'B5', 'C6', 'E6', 'C6', 'G5'] },
};

export function playBgm(name) {
  if (bgmName === name && bgmTimer) return;
  stopBgm();
  bgmName = name;
  if (!ctx || !SONGS[name]) return;
  const song = SONGS[name];
  const step = 60 / song.bpm / 2; // 8分音符
  let next = ctx.currentTime + 0.1;
  let i = 0;
  const schedule = () => {
    if (!ctx || bgmName !== name) return;
    while (next < ctx.currentTime + 0.6) {
      const lead = song.lead[i % song.lead.length];
      const bass = song.bass[Math.floor(i / (song.lead.length / song.bass.length)) % song.bass.length];
      if (lead) tone(N(lead), next, step * 0.85, { type: 'square', vol: 0.22, bus: bgmBus });
      if (i % 2 === 0) tone(N(bass), next, step * 1.8, { type: 'triangle', vol: 0.5, bus: bgmBus });
      if (name === 'boss' || name === 'dungeon' || name === 'field') {
        if (i % 4 === 0) noise(next, 0.08, { vol: 0.35, freq: 150, type: 'lowpass', bus: bgmBus });
        if (i % 4 === 2) noise(next, 0.06, { vol: 0.18, freq: 5000, type: 'highpass', bus: bgmBus });
      }
      next += step;
      i++;
    }
  };
  schedule();
  bgmTimer = setInterval(schedule, 200);
}

export function stopBgm() {
  bgmName = null;
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
}

// タブを切りかえたら止める（バッテリー対策）
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume();
});
