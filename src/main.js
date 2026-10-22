import { Renderer } from './render.js';
import { Sfx } from './audio.js';
import { Net, makeCode } from './net.js';
import { CARDS } from './cards.js';
import { newMatch, step, submitPick, rematch, botInput, botPick, TICK, IN, ROUNDS_TO_WIN } from './sim.js';

const $ = id => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

const sfx = new Sfx();
const R = new Renderer($('c'));
let net = null;
let mode = null;          // 'local' | 'host' | 'client'
let me = 0;               // my fighter index
let match = null;
let remoteInput = 0;
let names = ['P1', 'P2'];
const bot = { brain: { parry: 0.35, aggro: 0.45 }, pickAt: 0 };
let acc = 0, last = performance.now();
let lastPhase = '', lastRound = 0, prevHp = [100, 100];

// ---------------- input ----------------
let keys = 0, touchBits = 0;
const KEYMAP = { KeyA: IN.LEFT, ArrowLeft: IN.LEFT, KeyD: IN.RIGHT, ArrowRight: IN.RIGHT, KeyJ: IN.LIGHT, KeyZ: IN.LIGHT, KeyK: IN.HEAVY, KeyX: IN.HEAVY, KeyL: IN.BLOCK, KeyC: IN.BLOCK, ShiftLeft: IN.BLOCK, ShiftRight: IN.BLOCK, Space: IN.DASH, ArrowUp: IN.DASH };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  sfx.unlock();
  const b = KEYMAP[e.code]; if (b) { keys |= b; e.preventDefault(); }
  if (match && match.phase === 'draft' && e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < 3) pickCard(i); }
  if (match && match.phase === 'matchEnd' && e.code === 'Enter') doRematch();
});
addEventListener('keyup', e => { const b = KEYMAP[e.code]; if (b) keys &= ~b; });
addEventListener('blur', () => { keys = 0; });
for (const el of document.querySelectorAll('.tb')) {
  const b = +el.dataset.b;
  const on = ev => { ev.preventDefault(); sfx.unlock(); touchBits |= b; };
  const off = ev => { ev.preventDefault(); touchBits &= ~b; };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
const localInput = () => keys | touchBits;

// ---------------- UI wiring ----------------
$('name').value = localStorage.getItem('fl_name') || '';
const myName = () => ($('name').value.trim() || 'Fighter').slice(0, 12);
$('btnHost').onclick = () => { sfx.unlock(); startHost(); };
$('btnJoin').onclick = () => { sfx.unlock(); startJoin($('joinCode').value.trim()); };
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnBot').onclick = () => { sfx.unlock(); startLocal(); };
$('btnCancel').onclick = () => leave();
$('btnLeave').onclick = () => leave();
$('btnRematch').onclick = () => doRematch();
$('btnCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?join=${$('roomCode').textContent}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied!', false); } catch (_) { prompt('Copy this link:', url); }
};
const q = new URLSearchParams(location.search);
if (q.get('join')) { $('joinCode').value = q.get('join').toUpperCase(); }

function toast(msg, err = true) { const t = $('toast'); t.textContent = msg; t.style.background = err ? '#ff4d4d' : '#17c964'; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200); }

// ---------------- modes ----------------
function startLocal() {
  localStorage.setItem('fl_name', myName());
  mode = 'local'; me = 0; names = [myName(), 'TRAINING BOT'];
  beginMatch((Math.random() * 2 ** 31) | 0);
}
function startHost() {
  localStorage.setItem('fl_name', myName());
  mode = 'host'; me = 0;
  const code = makeCode();
  show('menu', false); show('lobby'); $('roomCode').textContent = code; $('lobbyMsg').textContent = 'Connecting to matchmaking…';
  net = new Net({
    onOpen: () => { $('lobbyMsg').textContent = 'Waiting for an opponent to join…'; },
    onPeer: () => { net.send({ t: 'hello', name: myName(), seed: (Math.random() * 2 ** 31) | 0 }); },
    onData: onHostData,
    onClose: reason => { toast(reason); leave(); },
    onError: e => { onNetError(e); },
  });
  net.host(code);
}
function startJoin(code) {
  if (!/^[A-Z0-9]{4}$/i.test(code)) { toast('Enter the 4-character room code.'); return; }
  localStorage.setItem('fl_name', myName());
  mode = 'client'; me = 1;
  show('menu', false); show('lobby'); $('roomCode').textContent = code.toUpperCase(); $('lobbyMsg').textContent = 'Joining room…';
  net = new Net({
    onOpen: () => { },
    onPeer: () => { $('lobbyMsg').textContent = 'Connected! Starting…'; },
    onData: onClientData,
    onClose: reason => { toast(reason); leave(); },
    onError: e => { onNetError(e); },
  });
  net.join(code);
}
function onNetError(e) {
  console.warn('net error', e);
  const t = e?.type;
  let msg = e?.message || 'Connection error.';
  if (t === 'peer-unavailable') msg = 'No room with that code is open.';
  if (t === 'unavailable-id') msg = 'That room code is taken, try hosting again.';
  if (t === 'network' || t === 'server-error') msg = 'Could not reach the matchmaking server.';
  toast(msg);
  if (!match) leave();
}
function leave() {
  net?.destroy(); net = null; match = null; mode = null;
  ['lobby', 'hud', 'draft', 'end'].forEach(id => show(id, false)); show('menu');
  history.replaceState(null, '', location.pathname);
}
function beginMatch(seed) {
  match = newMatch(seed, names);
  prevHp = [match.fighters[0].maxHp, match.fighters[1].maxHp];
  lastPhase = ''; lastRound = 0;
  ['menu', 'lobby', 'draft', 'end'].forEach(id => show(id, false)); show('hud');
  $('n0').textContent = names[0]; $('n1').textContent = names[1];
  $('you0').style.visibility = me === 0 ? 'visible' : 'hidden';
  $('you1').style.visibility = me === 1 ? 'visible' : 'hidden';
  R.smoothX = [-3, 3];
  acc = 0; last = performance.now();
}

// host receives
function onHostData(d) {
  switch (d.t) {
    case 'hello': names = [myName(), String(d.name || 'P2').slice(0, 12)]; beginMatch(d.seed); break;
    case 'i': remoteInput = d.b | 0; break;
    case 'p': if (match) submitPick(match, 1, d.i | 0); break;
    case 'r': if (match && match.phase === 'matchEnd') rematch(match); break;
  }
}
// client receives
function onClientData(d) {
  switch (d.t) {
    case 'hello':
      names = [String(d.name || 'P1').slice(0, 12), myName()];
      net.send({ t: 'hello', name: myName(), seed: d.seed });
      beginMatch(d.seed);
      break;
    case 's':
      if (!match) return;
      match = d.m; match.names = names;
      for (const e of match.events) handleEvent(e);
      break;
  }
}

// ---------------- draft / end UI ----------------
function pickCard(i) {
  if (!match || match.phase !== 'draft' || match.picks[me] !== null) return;
  sfx.pick();
  if (mode === 'client') net.send({ t: 'p', i });
  else submitPick(match, me, i);
  renderDraft(true);
}
function doRematch() {
  if (!match || match.phase !== 'matchEnd') return;
  sfx.click();
  if (mode === 'client') net.send({ t: 'r' }); else rematch(match);
}
const ICON = { sword: '⚔️', armor: '🛡️', effect: '✨' };
function renderDraft(force) {
  const m = match;
  const key = m.round + ':' + m.offers[me].join(',') + ':' + m.picks[me];
  if (!force && $('cards').dataset.key === key) return;
  $('cards').dataset.key = key;
  $('draftMeta').textContent = `ROUND ${m.round} · ${m.wins[0]} — ${m.wins[1]} · FIRST TO ${ROUNDS_TO_WIN}`;
  const wrap = $('cards'); wrap.innerHTML = '';
  m.offers[me].forEach((id, i) => {
    const c = CARDS[id];
    const el = document.createElement('div');
    el.className = 'card' + (m.picks[me] !== null ? (m.picks[me] === i ? ' chosen' : ' locked') : '');
    el.style.setProperty('--cc', '#' + c.color.toString(16).padStart(6, '0'));
    el.innerHTML = `<span class="key">${i + 1}</span><div class="type">${c.type}${c.type !== 'effect' ? ' · replaces' : ' · stacks'}</div><div class="icon">${ICON[c.type]}</div><div class="cname">${c.name}</div><div class="desc">${c.desc}</div>`;
    el.onclick = () => pickCard(i);
    wrap.appendChild(el);
  });
}

// ---------------- HUD ----------------
let bannerT = 0;
function banner(text, sub = '', hold = 0.9) {
  const b = $('banner'); b.textContent = text; b.classList.remove('out', 'show'); void b.offsetWidth; b.classList.add('show');
  $('subbanner').textContent = sub; $('subbanner').classList.toggle('show', !!sub);
  bannerT = hold;
}
function popup(x, text, color) {
  const p = R.project(x, 2.4);
  const el = document.createElement('div'); el.className = 'pop'; el.textContent = text; el.style.color = color; el.style.textShadow = `0 0 12px ${color}, 0 2px 0 #000`;
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  $('hud').appendChild(el); setTimeout(() => el.remove(), 750);
}
function updateHud(m) {
  for (let i = 0; i < 2; i++) {
    const f = m.fighters[i];
    const pct = Math.max(0, f.hp / f.maxHp * 100);
    $('hp' + i).style.width = pct + '%';
    if (f.hp > prevHp[i]) $('lag' + i).style.width = pct + '%';
    else setTimeout(() => { $('lag' + i).style.width = pct + '%'; }, 0);
    prevHp[i] = f.hp;
    const pips = $('pips' + i);
    if (pips.childElementCount !== ROUNDS_TO_WIN) { pips.innerHTML = ''; for (let k = 0; k < ROUNDS_TO_WIN; k++) pips.appendChild(Object.assign(document.createElement('div'), { className: 'pip' })); }
    [...pips.children].forEach((p, k) => p.classList.toggle('on', k < m.wins[i]));
    const chips = $('chips' + i);
    const ids = [m.builds[i].sword, m.builds[i].armor, ...m.builds[i].effects].filter(Boolean);
    const ck = ids.join(',');
    if (chips.dataset.k !== ck) { chips.dataset.k = ck; chips.innerHTML = ids.map(id => `<span class="chip" style="border-color:#${CARDS[id].color.toString(16).padStart(6, '0')};color:#${CARDS[id].color.toString(16).padStart(6, '0')}">${CARDS[id].name}</span>`).join(''); }
  }
  $('timer').textContent = m.phase === 'fight' || m.phase === 'countdown' ? Math.ceil(m.roundT / 60) : '';
  $('roundLbl').textContent = `ROUND ${m.round}`;
  $('ping').textContent = net ? `${Math.round(net.rtt)} ms` : '';
}

function handleEvent(e) {
  R.onEvent(e);
  switch (e.k) {
    case 'swing': sfx.swing(e.kind === 'heavy'); break;
    case 'hit': if (e.blocked) sfx.block(); else sfx.hit(e.kind === 'heavy'); break;
    case 'parry': sfx.parry(); popup(e.x, 'PARRY!', '#7fe8ff'); break;
    case 'dash': sfx.dash(); break;
    case 'heal': sfx.heal(); popup(e.x, 'SECOND WIND', '#6fe0a0'); break;
    case 'ko': sfx.ko(); break;
    case 'fight': sfx.fight(); banner('FIGHT!', '', 0.6); break;
    case 'roundEnd': {
      const w = e.who;
      const ko = match.fighters.some(f => f.state === 'dead');
      banner(ko ? 'K.O.' : w === -2 ? 'DRAW' : 'TIME', w >= 0 ? `${names[w]} TAKES THE ROUND` : 'NO ONE SCORES', 2.5);
      break;
    }
    case 'matchEnd': (e.who === me) ? sfx.win() : sfx.lose(); break;
  }
}

function onPhase(m) {
  if (m.phase === lastPhase && m.round === lastRound) return;
  const prev = lastPhase; lastPhase = m.phase; lastRound = m.round;
  show('draft', m.phase === 'draft'); show('end', m.phase === 'matchEnd');
  if (m.phase === 'countdown') { banner(`ROUND ${m.round}`, m.round === 1 ? 'FIRST TO 3' : `${m.wins[0]} — ${m.wins[1]}`, 1.6); prevHp = [m.fighters[0].maxHp, m.fighters[1].maxHp]; $('lag0').style.width = $('lag1').style.width = '100%'; }
  if (m.phase === 'draft') { renderDraft(true); bot.pickAt = performance.now() + 1500 + Math.random() * 2500; }
  if (m.phase === 'matchEnd') {
    const won = m.winner === me;
    $('endTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    $('endTitle').style.color = won ? '#ffd27a' : '#ff6a6a';
    $('endDetail').textContent = `${names[m.winner]} wins ${m.wins[m.winner]} — ${m.wins[1 - m.winner]}`;
    $('btnRematch').textContent = 'REMATCH';
  }
}

// ---------------- main loop ----------------
let cdBeep = -1;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!match) { R.render(idleMatch, dt); return; }

  if (mode !== 'client') {
    acc += dt;
    let n = 0;
    while (acc >= TICK && n < 6) {
      acc -= TICK; n++;
      let other = 0;
      if (mode === 'local') {
        other = botInput(match, 1, bot.brain);
        if (match.phase === 'draft' && match.picks[1] === null && now > bot.pickAt) submitPick(match, 1, botPick(match, 1, bot.brain));
      } else other = remoteInput;
      step(match, me === 0 ? [localInput(), other] : [other, localInput()]);
      for (const e of match.events) handleEvent(e);
      if (mode === 'host' && net?.open) net.send({ t: 's', m: match });
    }
  } else if (net?.open) {
    acc += dt;
    while (acc >= TICK) { acc -= TICK; net.send({ t: 'i', b: localInput() }); }
  }

  const m = match;
  onPhase(m);
  if (m.phase === 'countdown') { const s = Math.ceil(m.phaseT / 60); if (s !== cdBeep && s <= 3) { cdBeep = s; sfx.beep(false); } } else cdBeep = -1;
  if (m.phase === 'draft') { renderDraft(false); $('draftStatus').textContent = m.picks[1 - me] !== null ? 'Opponent locked in.' : `Opponent is choosing… ${Math.ceil(m.phaseT / 60)}s`; if (m.picks[me] !== null) $('draftStatus').textContent += '  ✓ You picked'; }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { $('banner').classList.add('out'); $('subbanner').classList.remove('show'); } }
  updateHud(m);
  R.render(m, dt);
}
window.__dbg = () => match && ({ mode, phase: match.phase, round: match.round, wins: match.wins, hp: match.fighters.map(f => f.hp), x: match.fighters.map(f => +f.x.toFixed(2)), st: match.fighters.map(f => f.state), builds: match.builds, tick: match.tick, rtt: net?.rtt });
const idleMatch = newMatch(1, ['', '']);
idleMatch.fighters[0].x = -1.6; idleMatch.fighters[1].x = 1.6;
requestAnimationFrame(frame);

// auto-join from invite link once a name is typed / immediately if saved
if (q.get('join') && $('name').value) setTimeout(() => $('btnJoin').click(), 300);
