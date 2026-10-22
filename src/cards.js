// Pick-3 draft cards. Each card is a sword, an armor, or an effect.
// Swords and armor REPLACE the current one; effects STACK.

export const CARDS = {
  // ---------------- SWORDS ----------------
  claymore: {
    type: 'sword', name: 'Claymore', color: 0xc9d4e0,
    desc: 'Heavy hits +45% damage and +0.5 reach. Heavy windup is slower.',
    stats: { heavyDmg: 1.45, heavyReach: 0.5, heavyWindup: 1.3 },
    blade: { len: 2.1, wid: 0.22, thick: 0.08 },
  },
  rapier: {
    type: 'sword', name: 'Rapier', color: 0xe8e8ff,
    desc: 'Light attacks are 30% faster and reach further. Lights do a little less damage.',
    stats: { lightSpeed: 0.7, lightReach: 0.4, lightDmg: 0.85 },
    blade: { len: 1.9, wid: 0.07, thick: 0.05 },
  },
  cleaver: {
    type: 'sword', name: 'Cleaver', color: 0x8a8f99,
    desc: 'All attacks deal +20% damage and inflict longer hitstun.',
    stats: { dmg: 1.2, hitstun: 1.4 },
    blade: { len: 1.3, wid: 0.4, thick: 0.1 },
  },
  flameblade: {
    type: 'sword', name: 'Flameblade', color: 0xff6a1a, emissive: 0xff3300,
    desc: 'Every hit sets the enemy on fire: 4 damage per second for 3 seconds.',
    stats: { burn: 1 },
    blade: { len: 1.6, wid: 0.16, thick: 0.06 },
  },
  frostbrand: {
    type: 'sword', name: 'Frostbrand', color: 0x7fd8ff, emissive: 0x1a66ff,
    desc: 'Every hit slows the enemy by 35% for 1.5 seconds.',
    stats: { frost: 1 },
    blade: { len: 1.6, wid: 0.14, thick: 0.06 },
  },
  twinfang: {
    type: 'sword', name: 'Twinfang', color: 0xd9c35a,
    desc: 'Landing a light attack cuts its recovery in half. Chain them.',
    stats: { lightChain: 1 },
    blade: { len: 1.2, wid: 0.1, thick: 0.05, twin: true },
  },

  // ---------------- ARMOR ----------------
  plate: {
    type: 'armor', name: 'Plate Armor', color: 0x9aa3ad,
    desc: 'Take 25% less damage. Move 15% slower.',
    stats: { dmgTaken: 0.75, speed: 0.85 }, bulk: 1.25,
  },
  leather: {
    type: 'armor', name: 'Leather Harness', color: 0x7a4a26,
    desc: 'Move 20% faster, dash cooldown halved.',
    stats: { speed: 1.2, dashCd: 0.5 }, bulk: 0.95,
  },
  thornmail: {
    type: 'armor', name: 'Thornmail', color: 0x3c6b3a,
    desc: 'Attackers take 8 damage whenever you block their hit.',
    stats: { thorns: 8 }, bulk: 1.1, spikes: true,
  },
  ironwill: {
    type: 'armor', name: 'Iron Will', color: 0x4a4e6a,
    desc: 'Hitstun on you is 50% shorter. You recover fast.',
    stats: { hitstunTaken: 0.5 }, bulk: 1.05,
  },
  bloodcloak: {
    type: 'armor', name: 'Blood Cloak', color: 0x8a1030,
    desc: 'Heal 35% of the damage you deal.',
    stats: { lifesteal: 0.35 }, bulk: 1.0, cloak: true,
  },
  gilded: {
    type: 'armor', name: 'Gilded Mail', color: 0xd4a017,
    desc: '+30 max HP.',
    stats: { maxHp: 30 }, bulk: 1.1,
  },

  // ---------------- EFFECTS ----------------
  secondwind: {
    type: 'effect', name: 'Second Wind', color: 0x6fe0a0,
    desc: 'Once per round, dropping below 30% HP instantly heals 25.',
    stats: { secondWind: 1 },
  },
  adrenaline: {
    type: 'effect', name: 'Adrenaline', color: 0xff5577,
    desc: 'Below 40% HP, all attacks are 30% faster.',
    stats: { adrenaline: 1 },
  },
  riposte: {
    type: 'effect', name: 'Riposte', color: 0xffd36a,
    desc: 'A successful parry deals 18 damage to the attacker.',
    stats: { riposte: 18 },
  },
  phantom: {
    type: 'effect', name: 'Phantom Step', color: 0xb080ff,
    desc: 'You are invulnerable during dashes.',
    stats: { phantom: 1 },
  },
  juggernaut: {
    type: 'effect', name: 'Juggernaut', color: 0xff9a3a,
    desc: 'Heavy attacks cannot be interrupted once started.',
    stats: { superArmor: 1 },
  },
  berserk: {
    type: 'effect', name: 'Berserk', color: 0xff2a2a,
    desc: 'Deal 25% more damage, take 20% more damage.',
    stats: { dmg: 1.25, dmgTaken: 1.2 },
  },
  swift: {
    type: 'effect', name: 'Swift Hands', color: 0x6ad8ff,
    desc: 'Attack recovery is 30% shorter.',
    stats: { recovery: 0.7 },
  },
  bulwark: {
    type: 'effect', name: 'Bulwark', color: 0xa0a8ff,
    desc: 'Blocking costs nothing: chip damage removed, parry window 50% longer.',
    stats: { chip: 0, parryWin: 1.5 },
  },
};

export const CARD_IDS = Object.keys(CARDS);

export function emptyBuild() {
  return { sword: null, armor: null, effects: [] };
}

export function applyCard(build, id) {
  const c = CARDS[id];
  if (!c) return build;
  if (c.type === 'sword') build.sword = id;
  else if (c.type === 'armor') build.armor = id;
  else if (!build.effects.includes(id)) build.effects.push(id);
  return build;
}

// Merge every card's stats into one stat block. Multipliers multiply, flats add.
const FLAT = new Set(['heavyReach', 'lightReach', 'burn', 'frost', 'lightChain', 'thorns', 'lifesteal',
  'maxHp', 'secondWind', 'adrenaline', 'riposte', 'phantom', 'superArmor']);

export function buildStats(build) {
  const s = {
    dmg: 1, lightDmg: 1, heavyDmg: 1, dmgTaken: 1, speed: 1, dashCd: 1, hitstun: 1, hitstunTaken: 1,
    lightSpeed: 1, heavyWindup: 1, recovery: 1, parryWin: 1, chip: 1,
    heavyReach: 0, lightReach: 0, burn: 0, frost: 0, lightChain: 0, thorns: 0, lifesteal: 0, maxHp: 0,
    secondWind: 0, adrenaline: 0, riposte: 0, phantom: 0, superArmor: 0,
  };
  const ids = [build.sword, build.armor, ...build.effects].filter(Boolean);
  for (const id of ids) {
    const st = CARDS[id].stats;
    for (const k in st) {
      if (FLAT.has(k)) s[k] += st[k];
      else s[k] *= st[k];
    }
  }
  return s;
}

// Offer 3 cards the player can actually use: never a card they already hold,
// and prefer a spread of types.
export function rollOffer(rng, build) {
  const held = new Set([build.sword, build.armor, ...build.effects].filter(Boolean));
  const pool = CARD_IDS.filter(id => !held.has(id));
  const byType = { sword: [], armor: [], effect: [] };
  for (const id of pool) byType[CARDS[id].type].push(id);
  const pick = arr => arr.length ? arr.splice(Math.floor(rng() * arr.length), 1)[0] : null;
  const types = ['sword', 'armor', 'effect'];
  // shuffle type order so the UI position varies
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const out = [];
  for (const t of types) { const c = pick(byType[t]); if (c) out.push(c); }
  while (out.length < 3) { const rest = pool.filter(id => !out.includes(id)); if (!rest.length) break; out.push(pick(rest)); }
  return out;
}
