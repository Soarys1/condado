let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let muted = false;
export type MusicMode = "off" | "village" | "battle" | "war";
let musicMode: MusicMode = "off";
let nextBeat = 0;
let beatN = 0;
let timer: number | null = null;

type AudioBag = { ctx: AudioContext; timer: number | null };
const bag = globalThis as typeof globalThis & { __condadoAudio?: AudioBag };
if (bag.__condadoAudio) {
  if (bag.__condadoAudio.timer != null) window.clearTimeout(bag.__condadoAudio.timer);
  void bag.__condadoAudio.ctx.close();
  bag.__condadoAudio = undefined;
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    music = ctx.createGain();
    sfx = ctx.createGain();
    master.gain.value = 0.72;
    music.gain.value = 0.18;
    sfx.gain.value = 0.55;
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
    bag.__condadoAudio = { ctx, timer: null };
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

function drum(when: number, kind: "kick" | "stick" | "snare" | "tom") {
  if (!ctx || !music || muted) return;
  if (!noise) noise = noiseBuf();
  const g = ctx.createGain();
  g.connect(music);
  const war = musicMode === "war";
  const battle = musicMode === "battle";
  if (kind === "kick" || kind === "tom") {
    const o = ctx.createOscillator();
    o.type = "sine";
    const startF = kind === "tom" ? (war ? 200 : 180) : war ? 78 : 92;
    const endF = kind === "tom" ? 90 : war ? 36 : 42;
    const dur = kind === "tom" ? 0.16 : war ? 0.2 : 0.16;
    const peak = kind === "tom" ? (war ? 0.34 : 0.28) : war ? 0.52 : battle ? 0.48 : 0.28;
    o.frequency.setValueAtTime(startF, when);
    o.frequency.exponentialRampToValueAtTime(endF, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    o.start(when);
    o.stop(when + dur + 0.02);
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
  f.frequency.value = kind === "snare" ? 1800 : 1100;
  src.connect(f);
  f.connect(g);
  const peak = kind === "snare" ? (war ? 0.32 : battle ? 0.28 : 0.12) : war ? 0.14 : 0.1;
  const tail = kind === "snare" ? 0.13 : 0.06;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + tail);
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
  g.gain.exponentialRampToValueAtTime(peak, when + 0.04);
  g.gain.setValueAtTime(peak * 0.82, when + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, when);
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(freq * 2, when);
  const g2 = ctx.createGain();
  g2.gain.value = musicMode === "battle" ? 0.12 : 0.08;
  const vib = ctx.createOscillator();
  vib.frequency.value = musicMode === "battle" ? 6.4 : 4.8;
  const vg = ctx.createGain();
  vg.gain.value = freq * (musicMode === "battle" ? 0.008 : 0.005);
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

/** Plucked lute for the county — second village voice besides the flute. */
function lute(when: number, freq: number, dur: number, peak = 0.07) {
  if (!ctx || !music || muted || freq <= 0) return;
  const g = ctx.createGain();
  g.connect(music);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, when + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(freq, when);
  o.frequency.exponentialRampToValueAtTime(freq * 0.985, when + dur);
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.setValueAtTime(freq * 2.002, when);
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  o.start(when);
  o2.start(when);
  o.stop(when + dur + 0.02);
  o2.stop(when + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    o2.disconnect();
    g.disconnect();
    g2.disconnect();
  };
}

/** Brass horn for Saturday alliance war. */
function horn(when: number, freq: number, dur: number, peak = 0.11) {
  if (!ctx || !music || muted || freq <= 0) return;
  const g = ctx.createGain();
  g.connect(music);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.05);
  g.gain.setValueAtTime(peak * 0.75, when + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(freq, when);
  const o2 = ctx.createOscillator();
  o2.type = "square";
  o2.frequency.setValueAtTime(freq * 0.5, when);
  const g2 = ctx.createGain();
  g2.gain.value = 0.22;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(900, when);
  f.frequency.linearRampToValueAtTime(1400, when + dur * 0.4);
  o.connect(f);
  o2.connect(g2);
  g2.connect(f);
  f.connect(g);
  o.start(when);
  o2.start(when);
  o.stop(when + dur + 0.02);
  o2.stop(when + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    o2.disconnect();
    f.disconnect();
    g.disconnect();
    g2.disconnect();
  };
}

// D dorian, only mid/high flute — no continuous bass drone
const VILLAGE_FLUTE = [
  220.0, 0, 246.94, 261.63, 293.66, 0, 329.63, 293.66, 261.63, 246.94, 220.0, 0, 293.66, 349.23, 392.0, 0, 440.0, 392.0,
  349.23, 329.63, 293.66, 0, 261.63, 246.94, 220.0, 196.0, 220.0, 0, 329.63, 293.66, 246.94, 220.0,
];

const VILLAGE_LUTE = [
  146.83, 220.0, 293.66, 220.0, 174.61, 220.0, 261.63, 220.0, 146.83, 196.0, 246.94, 196.0, 174.61, 220.0, 293.66, 349.23,
  146.83, 220.0, 261.63, 220.0, 196.0, 246.94, 293.66, 246.94, 146.83, 174.61, 220.0, 174.61, 130.81, 196.0, 246.94, 220.0,
];

const BATTLE_FLUTE = [
  293.66, 349.23, 392.0, 440.0, 466.16, 440.0, 392.0, 349.23, 293.66, 349.23, 440.0, 0, 523.25, 466.16, 392.0, 349.23,
  440.0, 466.16, 523.25, 587.33, 523.25, 466.16, 392.0, 0, 349.23, 392.0, 440.0, 349.23, 293.66, 233.08, 293.66, 349.23,
  392.0, 440.0, 587.33, 523.25, 466.16, 440.0, 392.0, 349.23, 293.66, 0, 440.0, 392.0, 349.23, 293.66, 246.94, 293.66,
];

const BATTLE_HARMONY = [
  220.0, 261.63, 293.66, 329.63, 349.23, 329.63, 293.66, 261.63, 220.0, 261.63, 329.63, 0, 392.0, 349.23, 293.66, 261.63,
  329.63, 349.23, 392.0, 440.0, 392.0, 349.23, 293.66, 0, 261.63, 293.66, 329.63, 261.63, 220.0, 174.61, 220.0, 261.63,
  293.66, 329.63, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63, 220.0, 0, 329.63, 293.66, 261.63, 220.0, 196.0, 220.0,
];

const WAR_HORN = [
  146.83, 0, 174.61, 196.0, 220.0, 196.0, 174.61, 0, 146.83, 174.61, 220.0, 0, 293.66, 261.63, 220.0, 196.0, 174.61, 196.0,
  220.0, 246.94, 220.0, 196.0, 174.61, 0, 146.83, 174.61, 196.0, 146.83, 130.81, 110.0, 146.83, 174.61,
];

const WAR_FIFTH = [
  220.0, 0, 261.63, 293.66, 329.63, 293.66, 261.63, 0, 220.0, 261.63, 329.63, 0, 440.0, 392.0, 329.63, 293.66, 261.63,
  293.66, 329.63, 349.23, 329.63, 293.66, 261.63, 0, 220.0, 261.63, 293.66, 220.0, 196.0, 164.81, 220.0, 261.63,
];

function schedule() {
  if (!ctx || musicMode === "off") return;
  const now = ctx.currentTime;
  const battle = musicMode === "battle";
  const war = musicMode === "war";
  const bpm = war ? 108 : battle ? 128 : 72;
  const eighth = 60 / bpm / 2;
  while (nextBeat < now + 0.45) {
    const step = beatN % 8;
    if (war) {
      const i = beatN % WAR_HORN.length;
      const freq = WAR_HORN[i]!;
      if (freq > 0) {
        horn(nextBeat, freq, eighth * 1.55, freq < 160 ? 0.12 : 0.1);
        const fifth = WAR_FIFTH[i] ?? 0;
        if (fifth > 0) horn(nextBeat, fifth, eighth * 1.35, 0.045);
      }
      if (step === 0 || step === 4) drum(nextBeat, "kick");
      if (step === 2 || step === 6) drum(nextBeat, "tom");
      if (step === 4 || step === 7) drum(nextBeat, "snare");
      if (step === 1 || step === 5) drum(nextBeat, "stick");
    } else if (battle) {
      const i = beatN % BATTLE_FLUTE.length;
      const freq = BATTLE_FLUTE[i]!;
      if (freq > 0) {
        const long = eighth * 1.15;
        const peak = freq > 480 ? 0.11 : 0.13;
        flute(nextBeat, freq, long, peak);
        const h = BATTLE_HARMONY[i] ?? 0;
        if (h > 0) flute(nextBeat, h, long * 0.95, peak * 0.45);
      }
      if (step === 0 || step === 3) drum(nextBeat, "kick");
      if (step === 4) drum(nextBeat, "tom");
      if (step === 2 || step === 6) drum(nextBeat, "stick");
      if (step === 4 || step === 7) drum(nextBeat, "snare");
      if (step === 1) drum(nextBeat, "stick");
    } else {
      const i = beatN % VILLAGE_FLUTE.length;
      const freq = VILLAGE_FLUTE[i]!;
      if (freq > 0) {
        const long = freq < 200 ? eighth * 1.7 : eighth * 1.4;
        const peak = freq > 380 ? 0.1 : 0.13;
        flute(nextBeat, freq, long, peak);
      }
      const luteFreq = VILLAGE_LUTE[i] ?? 0;
      if (luteFreq > 0 && (step === 0 || step === 2 || step === 4 || step === 6)) {
        lute(nextBeat, luteFreq, eighth * 1.8, 0.055);
      }
      if (step === 0) drum(nextBeat, "kick");
      if (step === 4) drum(nextBeat, "stick");
      if (step === 6 && beatN % 16 === 6) drum(nextBeat, "stick");
    }
    nextBeat += eighth;
    beatN += 1;
  }
}

function pump() {
  if (musicMode === "off") return;
  schedule();
  timer = window.setTimeout(pump, 90);
  if (bag.__condadoAudio) bag.__condadoAudio.timer = timer;
}

export function setMusicMode(mode: MusicMode) {
  if (!ctx) unlockAudio();
  if (musicMode === mode) return;
  musicMode = mode;
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (mode === "off") return;
  nextBeat = ctx ? ctx.currentTime + 0.05 : 0;
  beatN = 0;
  pump();
}

export function startDrone() {
  setMusicMode("village");
}

export function startMusic(mode: MusicMode = "village") {
  setMusicMode(mode);
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
