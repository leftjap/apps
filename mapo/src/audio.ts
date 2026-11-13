// 잔잔한 도시 소리. 외부 파일 없이 Web Audio 로 잡음을 걸러 만든다.
// 바람(띠 거르기한 갈색 잡음, 천천히 세기가 바뀐다), 도시 웅웅거림(낮은 음), 비(높은 대역 잡음과 빗방울), 먼 전철(낮게 울렸다 사라지는 소리).
export interface AmbienceState {
  /** 0 낮 ~ 1 밤 */
  night: number;
  /** 0 ~ 1 */
  rain: number;
}

function noise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export function makeAmbience() {
  let ctx: AudioContext | null = null;
  let on = false;
  let nodes: { master: GainNode; wind: GainNode; windF: BiquadFilterNode; hum: GainNode; rain: GainNode; drops: GainNode; brown: AudioBuffer } | null = null;

  function loop(buf: AudioBuffer, ...chain: AudioNode[]) {
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    let prev: AudioNode = src;
    for (const n of chain) (prev.connect(n), (prev = n));
    src.start();
  }

  function build() {
    ctx = new AudioContext();
    const c = ctx;
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    const brown = noise(c, 6, true);
    const white = noise(c, 4, false);

    const windF = c.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 420;
    windF.Q.value = 0.7;
    const wind = c.createGain();
    wind.gain.value = 0.35;
    loop(brown, windF, wind, master);

    const humF = c.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 160;
    const hum = c.createGain();
    hum.gain.value = 0.25;
    loop(brown, humF, hum, master);

    const rainHi = c.createBiquadFilter();
    rainHi.type = 'highpass';
    rainHi.frequency.value = 900;
    const rainLo = c.createBiquadFilter();
    rainLo.type = 'lowpass';
    rainLo.frequency.value = 7000;
    const rain = c.createGain();
    rain.gain.value = 0;
    loop(white, rainHi, rainLo, rain, master);

    const drops = c.createGain();
    drops.gain.value = 0;
    drops.connect(master);
    nodes = { master, wind, windF, hum, rain, drops, brown };
  }

  /** 빗방울 하나: 짧은 잡음 조각을 띠 거르기해 톡 소리를 낸다 */
  function drop() {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nodes.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800 + Math.random() * 2500;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(f).connect(g).connect(nodes.drops);
    src.start(t, Math.random() * 5, 0.08);
  }

  let windT = 0;
  return {
    get on() {
      return on;
    },
    /** 켜고 끈다. 브라우저 정책상 사용자가 누른 버튼 안에서 불러야 소리가 난다 */
    toggle(): boolean {
      if (!ctx) build();
      on = !on;
      void (on ? ctx!.resume() : ctx!.suspend());
      if (nodes) nodes.master.gain.setTargetAtTime(on ? 0.5 : 0, ctx!.currentTime, 0.4);
      return on;
    },
    update(s: AmbienceState, dt: number) {
      if (!on || !ctx || !nodes) return;
      const t = ctx.currentTime;
      windT += dt;
      // 바람은 몇 초마다 일었다 잦아든다
      const gust = 0.5 + 0.5 * Math.sin(windT * 0.23) * Math.sin(windT * 0.071 + 1.3);
      nodes.wind.gain.setTargetAtTime(0.12 + 0.3 * gust * (0.6 + 0.4 * s.night) + 0.15 * s.rain, t, 0.8);
      nodes.windF.frequency.setTargetAtTime(300 + 380 * gust, t, 0.8);
      nodes.hum.gain.setTargetAtTime(0.32 - 0.14 * s.night, t, 1.5);
      nodes.rain.gain.setTargetAtTime(0.22 * s.rain, t, 1);
      nodes.drops.gain.setTargetAtTime(0.25 * s.rain, t, 1);
      if (s.rain > 0.05 && Math.random() < dt * 22 * s.rain) drop();
    },
    /** 먼 전철 소리. strength 0~1 */
    train(strength: number) {
      if (!on || !ctx || !nodes || strength <= 0.02) return;
      const c = ctx;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = nodes.brown;
      src.loop = true;
      const lo = c.createBiquadFilter();
      lo.type = 'lowpass';
      lo.frequency.setValueAtTime(90, t);
      lo.frequency.linearRampToValueAtTime(170, t + 3);
      lo.frequency.linearRampToValueAtTime(80, t + 8);
      const g = c.createGain();
      const peak = 0.9 * strength;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 2.5);
      g.gain.setValueAtTime(peak, t + 4);
      g.gain.linearRampToValueAtTime(0, t + 9);
      src.connect(lo).connect(g).connect(nodes.master);
      src.start(t, Math.random() * 3);
      src.stop(t + 9.5);
      // 레일 끼익 소리: 아주 작게
      const sq = c.createBufferSource();
      sq.buffer = nodes.brown;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400 + Math.random() * 800;
      bp.Q.value = 18;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0, t + 1.5);
      sg.gain.linearRampToValueAtTime(0.25 * strength, t + 2.6);
      sg.gain.linearRampToValueAtTime(0, t + 4.2);
      sq.connect(bp).connect(sg).connect(nodes.master);
      sq.start(t + 1.5, Math.random() * 3, 3);
    },
  };
}
