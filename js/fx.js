// 画面演出（パーティクル・ダメージ数字・カットイン・バナー・ガチャ）とちょっとしたDOMヘルパー
import { sfx } from './audio.js';

export const $ = (s) => document.querySelector(s);
// #debug の自動テスト時だけ演出を早送りできるようにする
export const speed = { x: 1 };
export const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed.x));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "{漢字|かんじ}" → <ruby>
export const ruby = (s) => esc(s).replace(/\{([^|{}]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
export const plain = (s) => String(s).replace(/\{([^|{}]+)\|([^{}]+)\}/g, '$1');

export const img = (name) => `assets/img/${name}.webp`;

export function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // アニメーションを最初からやりなおす
  el.classList.add(cls);
}

export function flash(red = false) {
  const f = $('#flash');
  f.classList.toggle('red', red);
  restart(f, 'go');
}

export function shake(el = $('#app')) { restart(el, 'shake'); }

function layer() { return $('#fx-layer'); }

export function burstText(text, cls = 'good', ms = 900) {
  const d = document.createElement('div');
  d.className = `burst-text ${cls}`;
  d.innerHTML = text;
  layer().appendChild(d);
  setTimeout(() => d.remove(), ms + 500);
}

export function damage(n, { crit = false, x = 58, y = 30, hurt = false } = {}) {
  const d = document.createElement('div');
  d.className = 'dmg' + (crit ? ' crit' : '') + (hurt ? ' hurt' : '');
  d.style.left = x + '%';
  d.style.top = y + '%';
  d.innerHTML = (crit ? '<small>CRITICAL!</small>' : '') + n;
  layer().appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

export function particles({ x = 58, y = 45, n = 16, colors = ['#fff', '#ffd54a', '#38e1ff'], spread = 140, star = true } = {}) {
  const L = layer();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'particle' + (star && Math.random() < 0.4 ? ' star' : '');
    const a = Math.random() * Math.PI * 2;
    const r = rand(spread * 0.4, spread);
    p.style.left = x + '%';
    p.style.top = y + '%';
    p.style.setProperty('--c', pickOne(colors));
    p.style.setProperty('--dx', Math.cos(a) * r + 'px');
    p.style.setProperty('--dy', Math.sin(a) * r + 'px');
    L.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }
}

export function slash(color = '#8ef', double = false) {
  const L = layer();
  const mk = (rot, delay) => {
    const s = document.createElement('div');
    s.className = 'slash';
    s.style.setProperty('--c', color);
    s.style.setProperty('--r', rot + 'deg');
    s.style.animationDelay = delay + 's';
    L.appendChild(s);
    setTimeout(() => s.remove(), 700);
  };
  mk(rand(-40, -20), 0);
  if (double) mk(rand(20, 40), 0.08);
}

export function bolts(n = 3) {
  const L = layer();
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = 'bolt';
    b.style.left = rand(30, 75) + '%';
    b.style.animationDelay = i * 0.08 + 's';
    L.appendChild(b);
    setTimeout(() => b.remove(), 800);
  }
}

export function learnChip(main, sub) {
  const d = document.createElement('div');
  d.className = 'learn-chip';
  d.innerHTML = `${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  layer().appendChild(d);
  setTimeout(() => d.remove(), 1300);
}

export async function banner(htmlBig, { small = '', cls = '', ms = 1700 } = {}) {
  const b = $('#banner');
  b.className = 'overlay banner ' + cls;
  $('#banner-inner').innerHTML = (small ? `<div class="b-small">${small}</div>` : '') + `<div class="b-big">${htmlBig}</div>`;
  restart(b, 'show');
  await wait(ms);
  b.classList.remove('show');
}

export async function cutin({ heroImg, name, small = 'ひっさつわざ', sub = '', color = '#ff3d7f' }) {
  const c = $('#cutin');
  $('#cutin-hero').src = heroImg;
  $('#cutin-name').innerHTML = name;
  $('#cutin-sub').textContent = sub;
  $('#cutin-small').textContent = small;
  c.style.setProperty('--cc', color);
  sfx('special');
  restart(c, 'show');
  await wait(1300);
  c.classList.remove('show');
}

// ガチャ（宝箱）演出。タップか時間で閉じる
export function gacha({ kindLabel, item, rarity, rarityInfo, isNew, desc = '' }) {
  return new Promise((resolve) => {
    const g = $('#gacha');
    g.className = 'overlay show';
    g.dataset.rarity = rarity;
    g.style.setProperty('--rc', rarityInfo.color);
    $('#gacha-kind').textContent = kindLabel;
    const itemEl = $('#gacha-item');
    itemEl.innerHTML = item.img ? `<img src="${img(item.img)}" alt="">` : `<span>${item.emoji || '🎁'}</span>`;
    $('#gacha-rarity').innerHTML = `<span class="stars">${'★'.repeat(rarityInfo.stars)}</span>${rarityInfo.label}${rarity === 'LEGENDARY' ? '!!' : ''}`;
    $('#gacha-name').innerHTML = ruby(item.name);
    $('#gacha-desc').innerHTML = desc;
    const chest = $('#gacha-chest');
    restart(chest, 'x');
    sfx('chest');
    let closed = false;
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      g.classList.remove('shaking');
      g.classList.add('open');
      if (isNew) g.classList.add('new');
      flash();
      sfx('rare', rarity);
      setTimeout(() => {
        const r = g.getBoundingClientRect();
        burstAt(g, r.width / 2, r.height * 0.42, rarity === 'LEGENDARY' ? 40 : rarity === 'EPIC' ? 26 : 14, rarityInfo.color);
      }, 150);
      setTimeout(close, rarity === 'LEGENDARY' ? 3200 : 2400);
    };
    const close = () => {
      if (closed || !opened) return;
      closed = true;
      g.classList.remove('show', 'open', 'new', 'shaking');
      g.onclick = null;
      resolve();
    };
    setTimeout(() => { g.classList.add('shaking'); sfx('drum'); }, 450);
    setTimeout(open, 450 + (rarity === 'LEGENDARY' || rarity === 'EPIC' ? 900 : 600));
    g.onclick = () => { if (opened) close(); else open(); };
  });
}

function burstAt(parent, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'particle' + (Math.random() < 0.5 ? ' star' : '');
    const a = Math.random() * Math.PI * 2;
    const r = rand(80, 220);
    Object.assign(p.style, { left: x + 'px', top: y + 'px', position: 'absolute', zIndex: 3 });
    p.style.setProperty('--c', Math.random() < 0.5 ? color : '#fff');
    p.style.setProperty('--dx', Math.cos(a) * r + 'px');
    p.style.setProperty('--dy', Math.sin(a) * r + 'px');
    parent.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

// タイトルなどのキラキラ
export function sparkles(el, n = 18) {
  el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.left = rand(2, 98) + '%';
    s.style.top = rand(2, 70) + '%';
    s.style.animationDelay = rand(0, 2.4) + 's';
    el.appendChild(s);
  }
}

// 魔王城の 火の粉・かみなり
export function castleFx(on) {
  const el = $('#battle-fx-bg');
  el.innerHTML = '';
  if (!on) return;
  for (let i = 0; i < 22; i++) {
    const e = document.createElement('i');
    e.className = 'ember';
    e.style.left = rand(0, 100) + '%';
    e.style.animationDuration = rand(3, 7) + 's';
    e.style.animationDelay = rand(0, 6) + 's';
    e.style.setProperty('--sway', rand(-60, 60) + 'px');
    el.appendChild(e);
  }
  const b = document.createElement('div');
  b.className = 'screen-bolt';
  el.appendChild(b);
}

// スキル発動のお知らせ（フィールドの上に 小さく つみかさなる）
export function toast(html, color = '#ffd54a', ms = 1800) {
  const box = $('#skill-toasts');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'skill-toast';
  d.style.setProperty('--tc', color);
  d.innerHTML = html;
  box.appendChild(d);
  setTimeout(() => d.remove(), ms / speed.x);
}

// 2つから1つ えらぶ（ぞくせい）。えらんだ index を返す
export function choose({ title, sub, cards }) {
  return new Promise((resolve) => {
    const o = $('#choose');
    $('#choose-title').innerHTML = title;
    $('#choose-sub').innerHTML = sub || '';
    const wrap = $('#choose-cards');
    wrap.innerHTML = '';
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choose-card';
      b.style.setProperty('--cc', c.color || '#fff');
      b.innerHTML = `<div class="cc-icon">${c.icon}</div><div class="cc-name">${c.name}</div><div class="cc-skill">${c.skill}</div><div class="cc-desc">${c.desc}</div>`;
      b.onclick = () => { o.classList.remove('show'); resolve(i); };
      wrap.appendChild(b);
    });
    restart(o, 'show');
  });
}
