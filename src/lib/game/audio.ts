let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let muted = false;
let musicMode: "off" | "village" | "battle" = "off";
let nextBeat = 0;
let beatN = 0;
let timer: number | null = null;
let drone: OscillatorNode | null = null;
let droneGain: GainNode | null = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    music = ctx.createGain();
    sfx = ctx.createGain();
    master.gain.value = 0.72;
    music.gain.value = 0.16;
    sfx.gain.value = 0.55;
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.72, ctx.currentTime, 0.04);
}

export function isMuted() {
  return muted;
}

function envGain(duration: number, peak = 0.2, bus: GainNode | null = sfx): GainNode | null {
  if (!ctx || !bus) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  g.connect(bus);
  return g;
}

function tone(freq: number, type: OscillatorType, dur: number, peak = 0.12) {
  if (!ctx || muted) return;
  const g = envGain(dur, peak);
  if (!g) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  o.connect(g);
  o.start();
  o.stop(ctx.currentTime + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

export function sfxClick() {
  tone(420, "triangle", 0.07, 0.08);
}
export function sfxBuild() {
  tone(180, "square", 0.16, 0.1);
  window.setTimeout(() => tone(240, "triangle", 0.12, 0.08), 70);
}
export function sfxCoin() {
  tone(880, "sine", 0.1, 0.09);
  window.setTimeout(() => tone(1320, "sine", 0.12, 0.07), 60);
}
export function sfxHit() {
  tone(90 + Math.random() * 40, "sawtooth", 0.09, 0.12);
}
export function sfxBoom() {
  tone(60, "sawtooth", 0.22, 0.18);
  tone(140, "triangle", 0.16, 0.08);
}
export function sfxStar() {
  tone(523, "sine", 0.18, 0.1);
  window.setTimeout(() => tone(659, "sine", 0.18, 0.09), 90);
  window.setTimeout(() => tone(784, "sine", 0.22, 0.08), 180);
}
export function sfxError() {
  tone(140, "square", 0.12, 0.08);
}

export function sfxArrow() {
  if (!ctx || muted || !sfx) return;
  const now = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  g.connect(sfx);
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(1400 + Math.random() * 400, now);
  o.frequency.exponentialRampToValueAtTime(420, now + 0.12);
  o.connect(g);
  o.start(now);
  o.stop(now + 0.15);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

export function sfxSword() {
  tone(220 + Math.random() * 80, "square", 0.06, 0.07);
  tone(90, "sawtooth", 0.08, 0.06);
}

export function sfxHorn() {
  if (!ctx || muted) return;
  tone(196, "sawtooth", 0.45, 0.12);
  window.setTimeout(() => tone(147, "sawtooth", 0.55, 0.1), 180);
}

export function sfxCollectReady() {
  tone(660, "sine", 0.08, 0.05);
  window.setTimeout(() => tone(880, "sine", 0.1, 0.05), 70);
}

function noiseBuf(): AudioBuffer | null {
  if (!ctx) return null;
  const len = ctx.sampleRate * 0.2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

let noise: AudioBuffer | null = null;

function drum(when: number, kind: "kick" | "stick" | "snare") {
  if (!ctx || !music || muted) return;
  if (!noise) noise = noiseBuf();
  const g = ctx.createGain();
  g.connect(music);
  if (kind === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(108, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.2);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    return;
  }
  if (!noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = kind === "snare" ? "highpass" : "bandpass";
  f.frequency.value = kind === "snare" ? 1800 : 900;
  src.connect(f);
  f.connect(g);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(kind === "snare" ? 0.22 : 0.12, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + (kind === "snare" ? 0.14 : 0.07));
  src.start(when);
  src.stop(when + 0.16);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

function flute(when: number, freq: number, dur: number, peak = 0.11) {
  if (!ctx || !music || muted || freq <= 0) return;
  const g = ctx.createGain();
  g.connect(music);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.05);
  g.gain.setValueAtTime(peak * 0.85, when + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, when);
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(freq * 2.01, when);
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vg = ctx.createGain();
  vg.gain.value = freq * 0.006;
  vib.connect(vg);
  vg.connect(o.frequency);
  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  o.start(when);
  o2.start(when);
  vib.start(when);
  o.stop(when + dur + 0.02);
  o2.stop(when + dur + 0.02);
  vib.stop(when + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    o2.disconnect();
    vib.disconnect();
    g.disconnect();
    g2.disconnect();
    vg.disconnect();
  };
}

// D dorian-ish: grave, low, normal, high
const VILLAGE_FLUTE = [
  146.83, 0, 220.0, 0, 196.0, 220.0, 261.63, 0, 293.66, 0, 349.23, 329.63, 293.66, 0, 220.0, 0, 440.0, 392.0, 349.23,
  329.63, 293.66, 0, 440.0, 392.0, 293.66, 220.0, 196.0, 0, 146.83, 0, 110.0, 0,
];

const BATTLE_FLUTE = [
  146.83, 174.61, 196.0, 0, 220.0, 196.0, 174.61, 146.83, 293.66, 0, 261.63, 220.0, 196.0, 0, 146.83, 110.0, 329.63,
  293.66, 0, 246.94, 220.0, 0, 196.0, 146.83, 110.0, 146.83, 174.61, 196.0, 220.0, 0, 146.83, 0,
];

function ensureDrone() {
  if (!ctx || !music || drone) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = 73.4;
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = 110;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  o.connect(g);
  o2.connect(g);
  g.connect(music);
  o.start();
  o2.start();
  drone = o;
  droneGain = g;
}

function schedule() {
  if (!ctx || musicMode === "off") return;
  const now = ctx.currentTime;
  const bpm = musicMode === "battle" ? 116 : 74;
  const eighth = 60 / bpm / 2;
  const melody = musicMode === "battle" ? BATTLE_FLUTE : VILLAGE_FLUTE;
  while (nextBeat < now + 0.4) {
    const i = beatN % melody.length;
    const freq = melody[i]!;
    if (freq > 0) {
      const long = freq < 160 ? eighth * 1.8 : eighth * 1.35;
      const peak = freq < 160 ? 0.13 : freq > 380 ? 0.09 : 0.11;
      flute(nextBeat, freq, long, musicMode === "battle" ? peak * 0.75 : peak);
    }
    const step = beatN % 8;
    if (step === 0 || step === 4) drum(nextBeat, "kick");
    else if (step === 2 || step === 6) drum(nextBeat, "stick");
    if (musicMode === "battle" && (step === 1 || step === 5)) drum(nextBeat, "snare");
    nextBeat += eighth;
    beatN += 1;
  }
}

function pump() {
  if (musicMode === "off") return;
  schedule();
  timer = window.setTimeout(pump, 90);
}

export function setMusicMode(mode: "off" | "village" | "battle") {
  if (!ctx) unlockAudio();
  if (musicMode === mode) return;
  musicMode = mode;
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (mode === "off") return;
  ensureDrone();
  if (drone && ctx) {
    const f = mode === "battle" ? 98 : 73.4;
    drone.frequency.setTargetAtTime(f, ctx.currentTime, 0.2);
  }
  if (droneGain && ctx) {
    droneGain.gain.setTargetAtTime(mode === "battle" ? 0.32 : 0.2, ctx.currentTime, 0.2);
  }
  nextBeat = ctx ? ctx.currentTime + 0.05 : 0;
  pump();
}

export function startDrone() {
  setMusicMode("village");
}

export function startMusic(mode: "village" | "battle" = "village") {
  setMusicMode(mode);
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
