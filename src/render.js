// Three.js renderer: side-on arena, procedural low-poly fighters, FX.
import * as THREE from '../lib/three.module.js';
import { CARDS } from './cards.js';
import { ARENA_HALF } from './sim.js';

const P_COLORS = [0x3d8bff, 0xff4d4d];

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d16);
    this.scene.fog = new THREE.Fog(0x0b0d16, 18, 42);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camBase = new THREE.Vector3(0, 2.7, 10.5);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 1.4, 0);
    this.shake = 0; this.shakeV = new THREE.Vector3();
    this.time = 0;

    this.buildArena();
    this.fighters = [this.buildFighter(0), this.buildFighter(1)];
    this.fighters.forEach(f => this.scene.add(f.root));
    this.lastBuildKey = ['', ''];
    this.smoothX = [-3, 3];

    this.sparks = this.makeSparks(80);
    this.trails = [];
    this.flashLight = new THREE.PointLight(0xffffff, 0, 12);
    this.flashLight.position.set(0, 2, 2);
    this.scene.add(this.flashLight);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the full arena in view on narrow screens
    this.camera.fov = w / h < 1.3 ? 56 : 40;
    this.camera.updateProjectionMatrix();
  }

  buildArena() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0x8899ff, 0x3a2a18, 1.1); s.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
    key.position.set(-6, 12, 8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 10, bottom: -4, near: 1, far: 40 });
    s.add(key);
    const rim = new THREE.DirectionalLight(0x6688ff, 1.6); rim.position.set(6, 5, -8); s.add(rim);

    // floor
    const tex = makeFloorTexture();
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 2 + 2.4, 0.6, 6), floorMat);
    floor.position.y = -0.3; floor.receiveShadow = true; s.add(floor);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 1.6 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 6.2), edgeMat);
      e.position.set(sx * (ARENA_HALF + 1.2), -0.25, 0); s.add(e);
    }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x05060c, roughness: 1 }));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.61; under.receiveShadow = true; s.add(under);

    // backdrop pillars
    const pm = new THREE.MeshStandardMaterial({ color: 0x2c3352, roughness: 0.85 });
    for (let i = -4; i <= 4; i++) {
      const h = 6 + Math.abs(i) * 1.1;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.1), pm);
      p.position.set(i * 3.2, h / 2 - 0.6, -7 - Math.abs(i) * 0.6); p.castShadow = true; p.receiveShadow = true; s.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), edgeMat.clone());
      cap.material.emissiveIntensity = 0.12; cap.material.color.set(0x3a4266); cap.position.set(p.position.x, h - 0.45, p.position.z); s.add(cap);
    }
    // embers
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 9; pos[i * 3 + 2] = -2 - Math.random() * 10; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffa040, size: 0.06, transparent: true, opacity: 0.8 }));
    s.add(this.embers);
  }

  buildFighter(i) {
    const base = P_COLORS[i];
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15, ...o });
    const box = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.castShadow = true; return me; };

    const skin = mat(0xe3b58a), dark = mat(0x22242c), armorMat = mat(base);
    const torso = box(0.56, 0.66, 0.34, armorMat); torso.position.y = 1.28; body.add(torso);
    const belt = box(0.6, 0.12, 0.38, dark); belt.position.y = 0.97; body.add(belt);
    const head = new THREE.Group(); head.position.y = 1.78; body.add(head);
    const skull = box(0.36, 0.36, 0.36, skin); head.add(skull);
    const helm = box(0.4, 0.16, 0.4, armorMat); helm.position.y = 0.14; head.add(helm);
    const visor = box(0.2, 0.06, 0.1, dark); visor.position.set(0.16, 0.02, 0); head.add(visor);

    const mkLeg = (z) => { const g = new THREE.Group(); g.position.set(0, 0.95, z); const l = box(0.2, 0.92, 0.22, dark); l.position.y = -0.46; g.add(l); const boot = box(0.3, 0.14, 0.24, armorMat); boot.position.set(0.04, -0.88, 0); g.add(boot); body.add(g); return g; };
    const legB = mkLeg(-0.14), legF = mkLeg(0.14);
    const mkArm = (z) => { const g = new THREE.Group(); g.position.set(0, 1.55, z); const u = box(0.17, 0.62, 0.17, armorMat); u.position.y = -0.31; g.add(u); const hand = box(0.18, 0.16, 0.18, skin); hand.position.y = -0.66; g.add(hand); body.add(g); return g; };
    const armB = mkArm(-0.3), armF = mkArm(0.3);

    // sword mount at hand
    const swordPivot = new THREE.Group(); swordPivot.position.y = -0.66; armF.add(swordPivot);
    const sword = new THREE.Group(); swordPivot.add(sword);

    // extras toggled by armor
    const shoulderL = box(0.3, 0.18, 0.3, armorMat); shoulderL.position.set(0, 1.62, 0.33); body.add(shoulderL);
    const shoulderR = shoulderL.clone(); shoulderR.position.z = -0.33; body.add(shoulderR);
    const spikes = new THREE.Group(); body.add(spikes);
    const spikeMat = mat(0x1a2a1a, { metalness: 0.5 });
    for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), spikeMat); c.position.set(-0.1 + (k % 3) * 0.12, 1.1 + Math.floor(k / 3) * 0.3, (k < 3 ? 0.2 : -0.2)); c.rotation.x = k < 3 ? 0.6 : -0.6; spikes.add(c); }
    spikes.visible = false;
    const cloak = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), mat(0x6a0a22, { side: THREE.DoubleSide, roughness: 0.9 }));
    cloak.position.set(-0.3, 1.1, 0); cloak.rotation.y = Math.PI / 2; cloak.castShadow = true; cloak.visible = false; body.add(cloak);

    // shadow blob ring for readability
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; root.add(ring);

    const f = { root, body, torso, head, legB, legF, armB, armF, swordPivot, sword, spikes, cloak, ring, armorMat, mats: [armorMat, skin, dark], base, bladeMats: [], walkT: 0 };
    this.setSword(f, null);
    return f;
  }

  setSword(f, id) {
    f.sword.clear(); f.bladeMats = [];
    const c = id ? CARDS[id] : null;
    const b = c?.blade || { len: 1.45, wid: 0.12, thick: 0.06 };
    const mkBlade = (dz) => {
      const bm = new THREE.MeshStandardMaterial({ color: c?.color ?? 0xd8dde6, metalness: 0.35, roughness: 0.3, emissive: c?.emissive ?? (c?.color ?? 0xd8dde6), emissiveIntensity: c?.emissive ? 1.2 : 0.25 });
      f.bladeMats.push(bm);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 0.4, roughness: 0.4 }));
      guard.position.set(0, -0.08, dz); f.sword.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(b.wid, b.len, b.thick), bm);
      blade.position.set(0, -0.1 - b.len / 2, dz); blade.castShadow = true; f.sword.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(b.wid * 0.7, 0.2, 4), bm);
      tip.position.set(0, -0.2 - b.len, dz); tip.rotation.z = Math.PI; f.sword.add(tip);
    };
    mkBlade(0);
    if (b.twin) mkBlade(-0.18);
    f.bladeLen = b.len;
  }

  applyBuild(f, build, i) {
    const key = JSON.stringify(build);
    if (this.lastBuildKey[i] === key) return;
    this.lastBuildKey[i] = key;
    this.setSword(f, build.sword);
    const a = build.armor ? CARDS[build.armor] : null;
    f.armorMat.color.set(a ? a.color : f.base);
    f.armorMat.metalness = a ? 0.45 : 0.15;
    const bulk = a?.bulk ?? 1;
    f.torso.scale.set(bulk, 1, bulk);
    f.spikes.visible = !!a?.spikes;
    f.cloak.visible = !!a?.cloak;
    f.ring.material.color.set(a ? a.color : f.base);
  }

  // ---------------- per-frame fighter pose ----------------
  pose(f, s, o, dt, m) {
    const r = f.root;
    // smooth x for the remote client view; snap when far
    const sx = this.smoothX[s.i];
    const nx = Math.abs(sx - s.x) > 1.5 ? s.x : sx + (s.x - sx) * Math.min(1, dt * 30);
    this.smoothX[s.i] = nx;
    r.position.x = nx;
    r.rotation.y = s.face === 1 ? 0 : Math.PI;
    const body = f.body;
    body.rotation.z = 0; body.position.y = 0; body.rotation.x = 0;
    f.head.rotation.z = 0;
    let armF = 0.45, armB = 0.25, swordRot = 0.35, legA = 0, legB = 0;
    const t = this.time;

    const breathe = Math.sin(t * 2.2) * 0.02;
    switch (s.state) {
      case 'idle': body.position.y = breathe; armF = 0.5 + breathe * 2; legA = 0.12; legB = -0.12; break;
      case 'walk': {
        f.walkT += dt * 13; const w = Math.sin(f.walkT);
        legA = w * 0.55; legB = -w * 0.55; armB = 0.25 - w * 0.3; armF = 0.5 + w * 0.15;
        body.position.y = Math.abs(Math.cos(f.walkT)) * 0.06; break;
      }
      case 'block': armF = 1.15; swordRot = Math.PI - 1.15 + 0.2; armB = 0.9; body.rotation.z = 0.08; legA = 0.35; legB = -0.3; break;
      case 'dash': body.rotation.z = -0.55; armF = 1.3; armB = -0.8; legA = 0.9; legB = -0.7; swordRot = -0.3; break;
      case 'attack': {
        const total = s.wind + s.act + s.rec, el = total - s.t;
        const heavy = s.kind === 'heavy';
        const back = heavy ? 3.0 : 2.4, fwd = heavy ? 0.6 : 1.0;
        if (el < s.wind) { const p = ease(el / s.wind); armF = 0.5 + (back - 0.5) * p; body.rotation.z = 0.25 * p; swordRot = 0.35 - 0.6 * p; armB = 0.25 + 0.5 * p; legA = 0.25; legB = -0.35; }
        else if (el < s.wind + s.act) { const p = (el - s.wind) / s.act; armF = back + (fwd - back) * easeOut(p); body.rotation.z = 0.25 - 0.6 * p; swordRot = -0.25 + 0.6 * p; legA = 0.6; legB = -0.5; }
        else { const p = (el - s.wind - s.act) / s.rec; armF = fwd + (0.5 - fwd) * ease(p); body.rotation.z = -0.35 * (1 - p); swordRot = 0.35; legA = 0.5 * (1 - p); legB = -0.5 * (1 - p); }
        break;
      }
      case 'hitstun': body.rotation.z = 0.45; body.position.y = 0.05; f.head.rotation.z = 0.3; armF = -0.4; armB = -0.5; legA = -0.3; legB = 0.4; break;
      case 'blockstun': armF = 1.15; swordRot = Math.PI - 1.15 + 0.2; armB = 0.9; body.rotation.z = 0.3; break;
      case 'stagger': body.rotation.z = 0.7 + Math.sin(t * 25) * 0.08; body.position.y = -0.05; f.head.rotation.z = 0.5; armF = -0.9; armB = -0.9; legA = -0.6; legB = 0.5; break;
      case 'dead': { f.deadT = (f.deadT || 0) + dt; const p = Math.min(1, f.deadT * 3); body.rotation.z = 1.5 * ease(p); body.position.y = -0.35 * p; armF = -0.5; armB = -0.5; legA = 0.3; legB = -0.3; break; }
    }
    if (s.state !== 'dead') f.deadT = 0;
    f.armF.rotation.z = armF; f.armB.rotation.z = armB; f.sword.rotation.z = swordRot;
    f.legF.rotation.z = legA; f.legB.rotation.z = legB;

    // hit flash
    const flash = s.flash > 0;
    for (const mt of f.mats) { mt.emissive.set(flash ? 0xffffff : 0x000000); mt.emissiveIntensity = flash ? 0.8 : 0; }
    if (s.invulnT > 0) for (const mt of f.mats) { mt.emissive.set(0x8040ff); mt.emissiveIntensity = 0.7; }
    // status tints
    f.ring.material.color.set(s.burnT > 0 ? 0xff5a00 : s.slowT > 0 ? 0x66ccff : (m.builds[s.i].armor ? CARDS[m.builds[s.i].armor].color : f.base));
    f.ring.scale.setScalar(s.state === 'block' ? 1.25 : 1);
    // sword trail during active frames
    if (s.state === 'attack') {
      const total = s.wind + s.act + s.rec, el = total - s.t;
      if (el >= s.wind && el < s.wind + s.act && !f.trailed) { f.trailed = true; this.spawnTrail(s, f); }
      if (el < s.wind) f.trailed = false;
    } else f.trailed = false;
  }

  spawnTrail(s, f) {
    const heavy = s.kind === 'heavy';
    const rad = 0.66 + f.bladeLen + 0.15;
    const geo = new THREE.RingGeometry(rad * 0.45, rad, 24, 1, 0, heavy ? 2.6 : 2.1);
    const mat = new THREE.MeshBasicMaterial({ color: heavy ? 0xffb060 : 0xcfe8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, 1.55, 0.32 * s.face);
    // arc sweeps from behind-over-head to front-low; ring angle 0 is +x
    const L = heavy ? 2.6 : 2.1;
    mesh.rotation.z = s.face === 1 ? -0.7 : Math.PI + 0.7 - L;
    this.scene.add(mesh);
    this.trails.push({ mesh, life: 0.16, max: 0.16 });
  }

  makeSparks(n) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const pool = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false; this.scene.add(m);
      pool.push({ mesh: m, v: new THREE.Vector3(), life: 0 });
    }
    return pool;
  }

  burst(x, y, color, count, speed) {
    let n = 0;
    for (const p of this.sparks) {
      if (p.life > 0) continue;
      p.life = 0.25 + Math.random() * 0.25; p.mesh.visible = true;
      p.mesh.position.set(x, y, 0.4 + Math.random() * 0.4);
      p.mesh.material.color.set(color);
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random());
      p.v.set(Math.cos(a) * sp, Math.sin(a) * sp + 2, (Math.random() - 0.5) * 2);
      p.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
      if (++n >= count) break;
    }
  }

  // consume sim events for FX
  onEvent(e) {
    switch (e.k) {
      case 'hit':
        if (e.blocked) { this.burst(e.x, 1.4, 0x9fb3c8, 8, 4); this.shake = Math.max(this.shake, 0.08); }
        else { this.burst(e.x, 1.4, e.kind === 'heavy' ? 0xffb040 : 0xffe9a0, e.kind === 'heavy' ? 26 : 14, e.kind === 'heavy' ? 9 : 6); this.shake = Math.max(this.shake, e.kind === 'heavy' ? 0.38 : 0.18); this.flash(e.kind === 'heavy' ? 6 : 3); }
        break;
      case 'parry': this.burst(e.x, 1.5, 0x7fe8ff, 30, 8); this.shake = Math.max(this.shake, 0.25); this.flash(8, 0x7fe8ff); break;
      case 'thorns': this.burst(e.x, 1.3, 0x6fdc6f, 10, 5); break;
      case 'heal': this.burst(e.x, 1.3, 0x6fe0a0, 20, 4); break;
      case 'burn': this.burst(this.fighters[e.who].root.position.x, 1.2 + Math.random(), 0xff6a1a, 2, 1.5); break;
      case 'ko': this.burst(e.x, 1.4, 0xff3030, 40, 10); this.shake = 0.6; this.flash(10, 0xff4040); break;
      case 'dash': this.burst(e.x, 0.5, 0xb0c0ff, 6, 2); break;
    }
  }
  project(x, y) { const v = new THREE.Vector3(x, y, 0); v.project(this.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }
  flash(i, c = 0xffffff) { this.flashLight.intensity = i * 6; this.flashLight.color.set(c); }

  render(m, dt) {
    this.time += dt;
    for (let i = 0; i < 2; i++) {
      this.applyBuild(this.fighters[i], m.builds[i], i);
      this.pose(this.fighters[i], m.fighters[i], m.fighters[1 - i], dt, m);
    }
    // sparks
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.y -= 22 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.v.y *= -0.4; p.v.x *= 0.7; }
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i]; tr.life -= dt;
      tr.mesh.material.opacity = 0.75 * (tr.life / tr.max);
      if (tr.life <= 0) { this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose(); this.trails.splice(i, 1); }
    }
    this.flashLight.intensity *= Math.pow(0.001, dt);
    // embers drift
    const pos = this.embers.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) + dt * 0.35; if (y > 9) y = 0; pos.setY(i, y); pos.setX(i, pos.getX(i) + Math.sin(this.time + i) * dt * 0.1); }
    pos.needsUpdate = true;

    // camera: follow midpoint a little, shake
    const mid = (m.fighters[0].x + m.fighters[1].x) / 2;
    const spread = Math.abs(m.fighters[0].x - m.fighters[1].x);
    const targetZ = 9.2 + spread * 0.32;
    this.camBase.x += (mid * 0.35 - this.camBase.x) * Math.min(1, dt * 3);
    this.camBase.z += (targetZ - this.camBase.z) * Math.min(1, dt * 2);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * 2.2;
    this.shakeV.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0);
    this.camera.position.copy(this.camBase).add(this.shakeV);
    this.camera.lookAt(this.camBase.x * 0.6 + this.shakeV.x, 1.25 + this.shakeV.y, 0);
    this.renderer.render(this.scene, this.camera);
  }
}

function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

function makeFloorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1d2b'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#2a2f45'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); }
  g.fillStyle = 'rgba(255,160,60,0.15)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1.5); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
