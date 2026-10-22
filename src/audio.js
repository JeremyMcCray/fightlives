// Tiny WebAudio synth for punchy combat sounds. No assets needed.
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.5; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  tone(freq, dur, type = 'sine', gain = 0.3, slide = 1, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, gain = 0.3, hp = 800, lp = 6000, slide = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(lp, t); f2.frequency.exponentialRampToValueAtTime(Math.max(100, lp * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  swing(heavy) { this.noise(heavy ? 0.22 : 0.13, heavy ? 0.25 : 0.18, 400, heavy ? 3000 : 5000, 0.3); }
  hit(heavy) { this.noise(heavy ? 0.25 : 0.14, 0.5, 200, 2500, 0.2); this.tone(heavy ? 90 : 140, heavy ? 0.3 : 0.15, 'square', 0.35, 0.4); }
  block() { this.tone(1800, 0.12, 'square', 0.12, 0.6); this.noise(0.1, 0.25, 2000, 8000, 0.5); }
  parry() { this.tone(1200, 0.35, 'sine', 0.3, 1.6); this.tone(1800, 0.45, 'triangle', 0.2, 1.3, 0.04); this.noise(0.15, 0.3, 3000, 9000, 0.6); }
  dash() { this.noise(0.12, 0.12, 300, 1500, 3); }
  ko() { this.tone(70, 0.9, 'sawtooth', 0.5, 0.3); this.noise(0.6, 0.6, 60, 1200, 0.1); }
  beep(hi) { this.tone(hi ? 880 : 440, 0.12, 'square', 0.15, 1); }
  fight() { this.tone(660, 0.1, 'square', 0.2); this.tone(990, 0.3, 'square', 0.2, 1, 0.1); }
  heal() { this.tone(520, 0.25, 'sine', 0.2, 1.5); this.tone(780, 0.3, 'sine', 0.15, 1.3, 0.1); }
  click() { this.tone(900, 0.05, 'square', 0.08, 0.8); }
  pick() { this.tone(440, 0.1, 'triangle', 0.2, 1.5); this.tone(660, 0.2, 'triangle', 0.15, 1.2, 0.08); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, 1, i * 0.12)); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.12, 1, i * 0.15)); }
}
