// Deterministic fixed-step simulation. No Math.sin/cos here — only + - * /
// so host and client (and replays) stay bit-identical. Runs at 60 Hz.
import { buildStats, emptyBuild, applyCard, rollOffer } from './cards.js';

export const TICK = 1 / 60;
export const ARENA_HALF = 7;
export const IN = { LEFT: 1, RIGHT: 2, LIGHT: 4, HEAVY: 8, BLOCK: 16, DASH: 32 };
export const ROUNDS_TO_WIN = 3;
export const ROUND_TICKS = 60 * 45;
export const DRAFT_TICKS = 60 * 15;

const SPEED = 5.6;
const BODY_R = 0.45;
const ATK = {
  light: { wind: 8, act: 5, rec: 14, dmg: 11, reach: 1.7, stun: 14, bstun: 6, stop: 4, push: 1.1 },
  heavy: { wind: 20, act: 7, rec: 24, dmg: 26, reach: 2.0, stun: 24, bstun: 14, stop: 8, push: 2.2 },
};
const PARRY_WIN = 9;
const PARRY_STAGGER = 42;
const DASH_T = 10, DASH_V = 15, DASH_CD = 45;
const BUFFER = 8;

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function newMatch(seed, names) {
  const m = {
    seed, rngState: seed, names: names || ['P1', 'P2'],
    phase: 'countdown', phaseT: 150, round: 1, wins: [0, 0],
    builds: [emptyBuild(), emptyBuild()],
    fighters: [null, null], roundT: ROUND_TICKS, hitstop: 0,
    offers: null, picks: [null, null], lastRoundWinner: -1, winner: -1,
    events: [], tick: 0,
  };
  m.fighters = [newFighter(0, m.builds[0]), newFighter(1, m.builds[1])];
  return m;
}

function newFighter(i, build) {
  const st = buildStats(build);
  return {
    i, x: i === 0 ? -3 : 3, face: i === 0 ? 1 : -1,
    hp: 100 + st.maxHp, maxHp: 100 + st.maxHp,
    state: 'idle', t: 0, kind: null, wind: 0, act: 0, rec: 0, landed: false,
    vx: 0, dashCd: 0, slowT: 0, burnT: 0, invulnT: 0, blockT: 0, prev: 0, inp: 0,
    bufL: 0, bufH: 0, sw: false, flash: 0,
  };
}

function rng(m) { const r = mulberry32(m.rngState); const v = r(); m.rngState = (m.rngState + 0x9E3779B9) | 0; return v; }

export function startRound(m) {
  m.fighters = [newFighter(0, m.builds[0]), newFighter(1, m.builds[1])];
  m.roundT = ROUND_TICKS; m.hitstop = 0;
  m.phase = 'countdown'; m.phaseT = 150; m.offers = null; m.picks = [null, null];
}

export function beginDraft(m) {
  m.phase = 'draft'; m.phaseT = DRAFT_TICKS;
  const r = mulberry32((m.seed ^ (m.round * 7919)) | 0);
  m.offers = [rollOffer(r, m.builds[0]), rollOffer(r, m.builds[1])];
  m.picks = [null, null];
}

export function submitPick(m, who, idx) {
  if (m.phase !== 'draft' || m.picks[who] !== null) return;
  if (!m.offers[who][idx]) return;
  m.picks[who] = idx;
}

export function rematch(m) {
  m.round = 1; m.wins = [0, 0]; m.builds = [emptyBuild(), emptyBuild()]; m.winner = -1;
  startRound(m);
}

// ---------------- main step ----------------
export function step(m, inputs) {
  m.events = [];
  m.tick++;
  const [a, b] = m.fighters;
  a.inp = inputs[0] | 0; b.inp = inputs[1] | 0;

  switch (m.phase) {
    case 'countdown':
      m.phaseT--;
      if (m.phaseT <= 0) { m.phase = 'fight'; m.events.push({ k: 'fight' }); }
      break;
    case 'fight':
      if (m.hitstop > 0) { m.hitstop--; break; }
      m.roundT--;
      stepFighter(m, a, b); stepFighter(m, b, a);
      resolveHits(m, a, b); resolveHits(m, b, a);
      separate(a, b);
      checkRoundEnd(m);
      break;
    case 'roundEnd':
      m.phaseT--;
      if (m.phaseT <= 0) {
        if (m.wins[0] >= ROUNDS_TO_WIN || m.wins[1] >= ROUNDS_TO_WIN) {
          m.phase = 'matchEnd'; m.winner = m.wins[0] >= ROUNDS_TO_WIN ? 0 : 1;
          m.events.push({ k: 'matchEnd', who: m.winner });
        } else { m.round++; beginDraft(m); }
      }
      break;
    case 'draft':
      m.phaseT--;
      if (m.phaseT <= 0) { if (m.picks[0] === null) m.picks[0] = 0; if (m.picks[1] === null) m.picks[1] = 0; }
      if (m.picks[0] !== null && m.picks[1] !== null) {
        applyCard(m.builds[0], m.offers[0][m.picks[0]]);
        applyCard(m.builds[1], m.offers[1][m.picks[1]]);
        startRound(m);
      }
      break;
    case 'matchEnd': break;
  }
  a.prev = a.inp; b.prev = b.inp;
}

function pressed(f, bit) { return (f.inp & bit) && !(f.prev & bit); }
function free(f) { return f.state === 'idle' || f.state === 'walk'; }

function stepFighter(m, f, o) {
  const st = buildStats(m.builds[f.i]);
  if (f.state === 'dead') return;
  f.t--;
  if (f.dashCd > 0) f.dashCd--;
  if (f.slowT > 0) f.slowT--;
  if (f.invulnT > 0) f.invulnT--;
  if (f.flash > 0) f.flash--;
  if (f.bufL > 0) f.bufL--;
  if (f.bufH > 0) f.bufH--;

  // burn
  if (f.burnT > 0) {
    f.burnT--;
    if (f.burnT % 15 === 0) { damage(m, f, o, 1, { pure: true }); m.events.push({ k: 'burn', who: f.i }); }
    if (f.state === 'dead') return;
  }

  // buffer attack presses while busy
  if (pressed(f, IN.LIGHT)) f.bufL = BUFFER;
  if (pressed(f, IN.HEAVY)) f.bufH = BUFFER;

  // state exits
  if (f.t <= 0 && (f.state === 'hitstun' || f.state === 'stagger' || f.state === 'blockstun' || f.state === 'dash' || f.state === 'attack')) {
    f.state = 'idle'; f.vx = 0;
  }
  if (f.state === 'block' && !(f.inp & IN.BLOCK)) f.state = 'idle';

  const lowHp = f.hp <= f.maxHp * 0.4;
  const spdMul = (st.adrenaline && lowHp) ? 0.7 : 1;

  if (free(f)) {
    // face opponent
    if (o.x > f.x + 0.01) f.face = 1; else if (o.x < f.x - 0.01) f.face = -1;

    if (f.bufH > 0) { startAttack(m, f, 'heavy', st, spdMul); }
    else if (f.bufL > 0) { startAttack(m, f, 'light', st, spdMul); }
    else if (pressed(f, IN.DASH) && f.dashCd <= 0) {
      const dir = (f.inp & IN.LEFT) ? -1 : (f.inp & IN.RIGHT) ? 1 : f.face;
      f.state = 'dash'; f.t = DASH_T; f.vx = DASH_V * dir; f.dashCd = Math.round(DASH_CD * st.dashCd);
      if (st.phantom) f.invulnT = DASH_T;
      m.events.push({ k: 'dash', who: f.i, x: f.x });
    }
    else if (f.inp & IN.BLOCK) { f.state = 'block'; f.blockT = 0; f.vx = 0; }
    else {
      let dir = 0;
      if (f.inp & IN.LEFT) dir -= 1;
      if (f.inp & IN.RIGHT) dir += 1;
      let sp = SPEED * st.speed * (f.slowT > 0 ? 0.65 : 1);
      f.vx = dir * sp;
      f.state = dir ? 'walk' : 'idle';
    }
  } else if (f.state === 'block') {
    f.blockT++; f.vx = 0;
    if (o.x > f.x + 0.01) f.face = 1; else if (o.x < f.x - 0.01) f.face = -1;
  } else if (f.state === 'attack') {
    // small forward step during active frames
    const total = f.wind + f.act + f.rec;
    const elapsed = total - f.t;
    f.vx = (elapsed >= f.wind && elapsed < f.wind + f.act) ? f.face * 2.5 : 0;
  } else if (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'stagger') {
    f.vx *= 0.85;
  }

  f.x += f.vx * TICK;
  if (f.x < -ARENA_HALF) f.x = -ARENA_HALF;
  if (f.x > ARENA_HALF) f.x = ARENA_HALF;
}

function startAttack(m, f, kind, st, spdMul) {
  const A = ATK[kind];
  f.bufL = 0; f.bufH = 0;
  const ls = kind === 'light' ? st.lightSpeed : 1;
  const hw = kind === 'heavy' ? st.heavyWindup : 1;
  f.wind = Math.max(3, Math.round(A.wind * ls * hw * spdMul));
  f.act = Math.max(2, Math.round(A.act * ls * spdMul));
  f.rec = Math.max(4, Math.round(A.rec * ls * st.recovery * spdMul));
  f.state = 'attack'; f.kind = kind; f.t = f.wind + f.act + f.rec; f.landed = false; f.vx = 0;
  m.events.push({ k: 'swing', who: f.i, kind, x: f.x });
}

function resolveHits(m, f, o) {
  if (f.state !== 'attack' || f.landed || o.state === 'dead') return;
  const total = f.wind + f.act + f.rec;
  const elapsed = total - f.t;
  if (elapsed < f.wind || elapsed >= f.wind + f.act) return;
  const st = buildStats(m.builds[f.i]);
  const ost = buildStats(m.builds[o.i]);
  const A = ATK[f.kind];
  const reach = A.reach + (f.kind === 'heavy' ? st.heavyReach : st.lightReach);
  const dx = o.x - f.x;
  const inFront = (dx > 0 && f.face === 1) || (dx < 0 && f.face === -1) || (dx > -0.3 && dx < 0.3);
  const dist = dx < 0 ? -dx : dx;
  if (!inFront || dist > reach + BODY_R) return;
  if (o.invulnT > 0) return;
  f.landed = true;
  const hx = f.x + f.face * (dist < reach ? dist : reach) * 0.8;

  // Parry?
  const facingAttacker = (dx < 0 && o.face === 1) || (dx > 0 && o.face === -1);
  if (o.state === 'block' && facingAttacker && o.blockT <= PARRY_WIN * ost.parryWin) {
    f.state = 'stagger'; f.t = PARRY_STAGGER; f.vx = -f.face * 4; f.landed = true;
    m.hitstop = 10;
    m.events.push({ k: 'parry', who: o.i, x: hx });
    if (ost.riposte) damage(m, f, o, ost.riposte, { pure: true });
    return;
  }

  let base = A.dmg * st.dmg * (f.kind === 'light' ? st.lightDmg : st.heavyDmg);
  if (o.state === 'block' && facingAttacker) {
    const chip = base * 0.25 * ost.chip;
    damage(m, o, f, chip, { pure: true });
    if (o.state !== 'dead') { o.state = 'blockstun'; o.t = A.bstun; o.vx = f.face * A.push * 3; }
    m.hitstop = 3;
    m.events.push({ k: 'hit', who: o.i, x: hx, kind: f.kind, blocked: true });
    if (ost.thorns) { damage(m, f, o, ost.thorns, { pure: true }); m.events.push({ k: 'thorns', who: f.i, x: f.x }); }
    return;
  }

  const dealt = damage(m, o, f, base, {});
  if (st.lifesteal && dealt > 0) f.hp = Math.min(f.maxHp, f.hp + dealt * st.lifesteal);
  if (st.burn) o.burnT = 180;
  if (st.frost) o.slowT = 90;
  if (st.lightChain && f.kind === 'light') f.t -= Math.floor(f.rec * 0.5);
  m.hitstop = A.stop;
  m.events.push({ k: 'hit', who: o.i, x: hx, kind: f.kind, blocked: false });
  if (o.state !== 'dead') {
    const armored = ost.superArmor && o.state === 'attack' && o.kind === 'heavy';
    if (!armored) { o.state = 'hitstun'; o.t = Math.round(A.stun * st.hitstun * ost.hitstunTaken); o.vx = f.face * A.push * 4; o.flash = 6; }
    else o.flash = 6;
  }
}

// returns damage actually applied. opts.pure skips the victim's dmgTaken multiplier.
function damage(m, v, src, amt, opts) {
  if (v.state === 'dead' || amt <= 0) return 0;
  const vst = buildStats(m.builds[v.i]);
  let d = opts.pure ? amt : amt * vst.dmgTaken;
  d = Math.round(d * 10) / 10;
  v.hp -= d;
  if (v.hp <= 0) {
    if (vst.secondWind && !v.sw) { v.sw = true; v.hp = 25; m.events.push({ k: 'heal', who: v.i, x: v.x }); }
    else { v.hp = 0; v.state = 'dead'; v.t = 0; v.vx = 0; m.events.push({ k: 'ko', who: v.i, x: v.x }); }
  } else if (vst.secondWind && !v.sw && v.hp < v.maxHp * 0.3) {
    v.sw = true; v.hp = Math.min(v.maxHp, v.hp + 25); m.events.push({ k: 'heal', who: v.i, x: v.x });
  }
  return d;
}

function separate(a, b) {
  if (a.state === 'dead' || b.state === 'dead') return;
  const dx = b.x - a.x;
  const d = dx < 0 ? -dx : dx;
  const minD = BODY_R * 2;
  if (d < minD) {
    const push = (minD - d) / 2;
    const s = dx >= 0 ? 1 : -1;
    a.x -= push * s; b.x += push * s;
    if (a.x < -ARENA_HALF) { a.x = -ARENA_HALF; b.x = a.x + minD * s; }
    if (b.x > ARENA_HALF) { b.x = ARENA_HALF; a.x = b.x - minD * s; }
    if (b.x < -ARENA_HALF) { b.x = -ARENA_HALF; a.x = b.x + minD; }
    if (a.x > ARENA_HALF) { a.x = ARENA_HALF; b.x = a.x - minD; }
  }
}

function checkRoundEnd(m) {
  const [a, b] = m.fighters;
  let w = -1;
  if (a.state === 'dead' && b.state === 'dead') w = a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : -2;
  else if (a.state === 'dead') w = 1;
  else if (b.state === 'dead') w = 0;
  else if (m.roundT <= 0) w = a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : -2;
  if (w === -1) return;
  m.phase = 'roundEnd'; m.phaseT = 150; m.lastRoundWinner = w;
  if (w >= 0) m.wins[w]++;
  m.events.push({ k: 'roundEnd', who: w });
}

// ---------------- simple bot ----------------
export function botInput(m, i, brain) {
  const f = m.fighters[i], o = m.fighters[1 - i];
  if (m.phase !== 'fight' || !f || f.state === 'dead') return 0;
  brain.t = (brain.t || 0) + 1;
  if (brain.t % 6 !== 0 && brain.last !== undefined) return brain.last; // react at ~10 Hz
  const r = brain.rng || (brain.rng = mulberry32(1234 + i));
  const dx = o.x - f.x, dist = dx < 0 ? -dx : dx, toward = dx > 0 ? IN.RIGHT : IN.LEFT, away = dx > 0 ? IN.LEFT : IN.RIGHT;
  let out = 0;
  const oWinding = o.state === 'attack' && (o.wind + o.act + o.rec - o.t) < o.wind;
  if (oWinding && dist < 2.8) {
    const roll = r();
    if (roll < brain.parry) out = IN.BLOCK;           // try to parry/block
    else if (roll < brain.parry + 0.25) out = IN.DASH | away;
    else out = toward | (r() < 0.5 ? IN.LIGHT : 0);
  } else if (o.state === 'stagger' || o.state === 'hitstun') {
    out = dist < 2.0 ? (r() < 0.6 ? IN.HEAVY : IN.LIGHT) : toward;
  } else if (dist > 2.2) {
    out = toward; if (r() < 0.08 && f.dashCd <= 0) out |= IN.DASH;
  } else if (dist < 1.0) {
    out = r() < 0.5 ? away : (r() < 0.5 ? IN.LIGHT : IN.HEAVY);
  } else {
    const roll = r();
    if (roll < brain.aggro) out = r() < 0.7 ? IN.LIGHT : IN.HEAVY;
    else if (roll < brain.aggro + 0.15) out = IN.BLOCK;
    else if (roll < brain.aggro + 0.3) out = away;
    else out = 0;
  }
  brain.last = out;
  return out;
}

export function botPick(m, i, brain) {
  const r = brain.rng || (brain.rng = mulberry32(99 + i));
  return Math.floor(r() * (m.offers[i].length));
}
