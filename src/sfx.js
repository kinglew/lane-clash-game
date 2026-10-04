export function createSfx() {
  return new Sfx();
}

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastShoot = 0;
    try {
      this.muted = localStorage.getItem('lanerush-mute') === '1';
    } catch (err) {
      this.muted = false;
    }
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('lanerush-mute', this.muted ? '1' : '0');
    } catch (err) { /* private mode */ }
    return this.muted;
  }

  ensure() {
    if (this.muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      try { this.ctx = new AC(); } catch (err) { return null; }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted || !(gain > 0)) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(Math.max(40, freq), t0);
      if (slideTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
      }
      amp.gain.setValueAtTime(gain, t0);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, dur));
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (err) { /* audio backend missing */ }
  }

  clash(nowMs) {
    if (!this.ctx || this.muted) return;
    if (nowMs - (this.lastClash || 0) < 110) return;
    this.lastClash = nowMs;
    this.tone(160 + Math.random() * 30, 0.045, 'square', 0.018, 0, 70);
  }

  shoot(nowMs) {
    if (!this.ctx || this.muted) return;
    if (nowMs - this.lastShoot < 120) return;
    this.lastShoot = nowMs;
    this.tone(640 + Math.random() * 70, 0.035, 'square', 0.012, 0, 220);
  }

  gate(good) {
    this.ensure();
    if (good) {
      this.tone(620, 0.07, 'triangle', 0.05, 0);
      this.tone(940, 0.11, 'triangle', 0.045, 0.06);
    } else {
      this.tone(180, 0.16, 'square', 0.045, 0, 80);
    }
  }

  jet() {
    this.ensure();
    this.tone(720, 0.07, 'square', 0.04, 0);
    this.tone(980, 0.08, 'square', 0.04, 0.07);
    this.tone(1280, 0.14, 'square', 0.035, 0.14);
  }

  win() {
    this.ensure();
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.04, i * 0.08));
  }

  lose() {
    this.ensure();
    [330, 247, 185, 123].forEach((f, i) => this.tone(f, 0.18, 'square', 0.04, i * 0.09, f * 0.75));
  }
}
