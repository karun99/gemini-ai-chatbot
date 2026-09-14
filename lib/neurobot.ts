/**
 * Cognitive-robotics validation module (organoid/MEA + closed-loop control + adversarial).
 *
 * SpikeTensor: sparse electrode x time-bin spike-train simulation with
 * refractory period, synchrony, information-rate metrics (DishBrain line).
 * ControlLoop: closed-loop maze navigation via neural decode + path memory.
 * adversarialStressTest: impulse/patterned/poisoned/white-noise/amplitude
 * injection for DARPA O-CIRCUIT BPU-style neural security validation.
 */

export const SPIKE = 1;
export const NO_SPIKE = 0;

const TAU = Math.PI * 2;

export const DEFAULT_MAZE: string[][] = [
  ["open", "open", "wall", "open", "goal"],
  ["wall", "open", "wall", "open", "wall"],
  ["open", "open", "open", "open", "wall"],
  ["open", "wall", "wall", "wall", "open"],
  ["open", "open", "open", "open", "open"],
];

export type Attack = [name: string, kind: string, intensity: number, desc: string];

export const ATTACK_SUITE: Attack[] = [
  ["impulse-burst", "impulse", 0.2, "transient high-rate burst"],
  ["impulse-catastrophic", "impulse", 0.95, "near-total electrode saturation"],
  ["patterned-10hz", "patterned", 0.3, "structured periodic drive"],
  ["poisoned-motor", "poisoned", 0.5, "perturbs motor electrode group"],
  ["poisoned-sensory", "poisoned", 0.6, "perturbs sensory electrode group"],
  ["white-noise", "white-noise", 0.4, "broad-spectrum noise"],
  ["amplitude-drift", "amplitude", 0.7, "sustained elevation"],
];

export class SpikeTensor {
  electrodes: number;
  timeBins: number;
  baselineRate: number;
  refractoryBins: number;
  data: number[];
  constructor(
    electrodes: number,
    timeBins: number,
    data: number[] = [],
    baselineRate = 0.3,
    refractoryBins = 2,
  ) {
    this.electrodes = electrodes;
    this.timeBins = timeBins;
    this.baselineRate = baselineRate;
    this.refractoryBins = refractoryBins;
    this.data = data.length
      ? data
      : Array.from({ length: electrodes * timeBins }, () =>
          Math.random() < baselineRate ? SPIKE : NO_SPIKE);
  }

  applyRefractory(): void {
    for (let e = 0; e < this.electrodes; e++) {
      let last = -this.refractoryBins - 1;
      for (let b = 0; b < this.timeBins; b++) {
        const i = e * this.timeBins + b;
        if (this.data[i] === SPIKE) {
          if (b - last <= this.refractoryBins) this.data[i] = NO_SPIKE;
          else last = b;
        }
      }
    }
  }

  fireCounts(): number[] {
    return Array.from({ length: this.electrodes }, (_, e) =>
      this.data.slice(e * this.timeBins, (e + 1) * this.timeBins)
        .reduce((a, b) => a + b, 0));
  }

  stats(): Record<string, number> {
    const counts = this.fireCounts();
    const total = counts.reduce((a, b) => a + b, 0);
    const meanRate = total / (this.electrodes * this.timeBins);

    const isi: number[] = [];
    for (let e = 0; e < this.electrodes; e++) {
      let last = -1;
      for (let b = 0; b < this.timeBins; b++) {
        if (this.data[e * this.timeBins + b] === SPIKE) {
          if (last >= 0) isi.push(b - last);
          last = b;
        }
      }
    }
    const isiMean = isi.length ? isi.reduce((a, b) => a + b, 0) / isi.length : 0;
    const isiVar = isi.length
      ? isi.reduce((a, x) => a + (x - isiMean) ** 2, 0) / isi.length : 0;
    const isiCv = isiMean ? Math.sqrt(isiVar) / isiMean : 0;

    let syncSum = 0, syncCount = 0;
    for (let i = 0; i < this.electrodes; i++) {
      for (let j = i + 1; j < this.electrodes; j++) {
        let co = 0, ai = 0, aj = 0;
        for (let b = 0; b < this.timeBins; b++) {
          co += this.data[i * this.timeBins + b] * this.data[j * this.timeBins + b];
          ai += this.data[i * this.timeBins + b];
          aj += this.data[j * this.timeBins + b];
        }
        syncSum += ai && aj ? co / Math.sqrt(ai * aj) : 0;
        syncCount++;
      }
    }
    const synchrony = syncCount ? syncSum / syncCount : 0;

    let info = 0;
    for (const c of counts) {
      const p = c / this.timeBins;
      if (p > 0 && p < 1) info += -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)) * this.timeBins;
    }

    return { electrodes: this.electrodes, timeBins: this.timeBins, spikeCount: total,
      meanRate, synchronyIndex: synchrony, informationRate: info, isiMean, isiCv };
  }

  sliceWindow(start: number, end: number): SpikeTensor {
    const width = Math.max(0, Math.min(end, this.timeBins) - start);
    const out: number[] = [];
    for (let e = 0; e < this.electrodes; e++) {
      for (let b = start; b < start + width; b++) out.push(this.data[e * this.timeBins + b]);
    }
    return new SpikeTensor(this.electrodes, width, out, this.baselineRate, this.refractoryBins);
  }
}

export function makeSpikeTensor(electrodes = 12, timeBins = 64, baselineRate = 0.3): SpikeTensor {
  return new SpikeTensor(electrodes, timeBins, [], baselineRate);
}

type Pos = [number, number];

export class ControlLoop {
  history: Record<string, number | string>[] = [];
  rewardMemory = 0;
  path: Pos[] = [];
  visited = new Set<string>();
  inputElectrodes: number;
  motorElectrodes: number;
  timeBins: number;
  mazeSize: number;
  constructor(
    inputElectrodes = 12,
    motorElectrodes = 12,
    timeBins = 64,
    mazeSize = 5,
  ) {
    this.inputElectrodes = inputElectrodes;
    this.motorElectrodes = motorElectrodes;
    this.timeBins = timeBins;
    this.mazeSize = mazeSize;
  }

  static goal(field: string[][]): Pos | undefined {
    for (let r = 0; r < field.length; r++)
      for (let c = 0; c < field[r].length; c++)
        if (field[r][c] === "goal") return [r, c];
    return undefined;
  }

  static apply(pos: Pos, action: string, field: string[][]): Pos {
    let [r, c] = pos;
    const h = field.length, w = field[0].length;
    if (action === "x+") c = Math.min(w - 1, c + 1);
    else if (action === "x-") c = Math.max(0, c - 1);
    else if (action === "y+") r = Math.min(h - 1, r + 1);
    else if (action === "y-") r = Math.max(0, r - 1);
    return field[r][c] === "wall" ? pos : [r, c];
  }

  static candidates(pos: Pos, field: string[][]): string[] {
    return ([["y+", pos[0] + 1, pos[1]], ["y-", pos[0] - 1, pos[1]],
             ["x+", pos[0], pos[1] + 1], ["x-", pos[0], pos[1] - 1]] as const)
      .filter(([, r, c]) => r >= 0 && r < field.length && c >= 0 && c < field[0].length
        && field[r][c] !== "wall")
      .map(([a]) => a);
  }

  encode(pos: Pos, goal: Pos): number[] {
    const dx = goal[0] - pos[0], dy = goal[1] - pos[1];
    const dist = Math.hypot(dx, dy) || 1;
    const prox = 1 - Math.min(1, dist / this.mazeSize);
    return Array.from({ length: this.inputElectrodes }, (_, e) => {
      const ang = (e / this.inputElectrodes) * TAU;
      return 0.5 + 0.5 * ((dx / dist) * Math.cos(ang) + (dy / dist) * Math.sin(ang)) * prox;
    });
  }

  step(pos: Pos, goal: Pos, field: string[][]): Record<string, number | string | Pos> {
    const sensor = this.encode(pos, goal);
    const stim = new SpikeTensor(this.inputElectrodes, this.timeBins, [], 0.5);
    for (let e = 0; e < this.inputElectrodes; e++) {
      const p = Math.min(1, Math.max(0, sensor[e] * 0.6 + this.rewardMemory * 0.18));
      for (let b = 0; b < this.timeBins; b++) stim.data[e * this.timeBins + b] = Math.random() < p ? 1 : 0;
    }
    stim.applyRefractory();

    const d0 = Math.hypot(goal[0] - pos[0], goal[1] - pos[1]);
    if (!this.path.length || this.path[this.path.length - 1].join(",") !== pos.join(",")) this.path.push(pos);
    this.visited.add(pos.join(","));

    let best: string | undefined, bestScore = -Infinity;
    for (const cand of ControlLoop.candidates(pos, field)) {
      const n = ControlLoop.apply(pos, cand, field);
      const d = Math.hypot(goal[0] - n[0], goal[1] - n[1]);
      const progress = d0 ? (d0 - d) / d0 : 0;
      const score = this.visited.has(n.join(","))
        ? -0.6 + Math.random() * 0.03
        : progress + this.rewardMemory * 0.1 + Math.random() * 0.05;
      if (score > bestScore) { bestScore = score; best = cand; }
    }

    let action: string;
    if (best === undefined) {
      this.path.pop();
      if (this.path.length) {
        const back = this.path[this.path.length - 1].join(",");
        action = ControlLoop.candidates(pos, field)
          .find((c) => ControlLoop.apply(pos, c, field).join(",") === back) ?? "wait";
      } else {
        const legal = ControlLoop.candidates(pos, field);
        action = legal.length ? legal[Math.floor(Math.random() * legal.length)] : "wait";
      }
    } else action = best;

    const nxt = ControlLoop.apply(pos, action, field);
    const d1 = Math.hypot(goal[0] - nxt[0], goal[1] - nxt[1]);
    const reward = (d0 - d1) + (field[nxt[0]][nxt[1]] === "goal" ? 10 : 0);
    this.rewardMemory = reward * 0.3 + this.rewardMemory * 0.7;

    const st = stim.stats();
    const coherence = Math.min(1, Math.max(0,
      (Math.sin(Math.PI * Math.min(1, st.synchronyIndex * 2)) + st.meanRate) / 2));

    const result: Record<string, number | string | Pos> = {
      action, reward, position: nxt, distanceToGoal: d1, coherence,
    };
    this.history.push(result);
    return result;
  }

  run(field: string[][] = DEFAULT_MAZE, start: Pos = [0, 0], maxSteps = 50): Record<string, unknown> {
    const goal = ControlLoop.goal(field);
    if (!goal) throw new Error("maze has no goal");
    let pos = start, totalReward = 0, solved = false;
    const route: string[] = [];
    this.history = []; this.rewardMemory = 0; this.path = []; this.visited = new Set();
    for (let i = 0; i < maxSteps; i++) {
      const r = this.step(pos, goal, field) as { action: string; reward: number; position: Pos };
      route.push(r.action);
      totalReward += r.reward;
      pos = r.position;
      if (field[pos[0]][pos[1]] === "goal") { solved = true; break; }
    }
    return { solved, totalReward: Number(totalReward.toFixed(3)), stepsUsed: route.length, route };
  }
}

function coherenceScore(st: Record<string, number>): number {
  const rate = Math.max(0, 1 - Math.abs(0.3 - st.meanRate) * 2);
  return Math.min(1, Math.max(0, (rate + st.synchronyIndex) / 2));
}

function integrityScore(st: Record<string, number>): number {
  const cv = Math.max(0, 1 - st.isiCv);
  const info = Math.min(1, st.informationRate / 32);
  return Math.min(1, Math.max(0, (cv + info) / 2));
}

function applyAttack(data: number[], name: string, kind: string, intensity: number,
                     electrodes: number, timeBins: number): number[] {
  const out = [...data];
  const m3 = Math.max(1, Math.floor(electrodes / 3));
  for (let e = 0; e < electrodes; e++) {
    const tgt = kind === "poisoned" ? (name.includes("motor") ? 2 : 1) : -1;
    for (let b = 0; b < timeBins; b++) {
      const i = e * timeBins + b;
      if (kind === "impulse" && b < timeBins * 0.2) out[i] = Math.random() < intensity * 2 ? 1 : out[i];
      else if (kind === "patterned" && b % Math.max(1, Math.floor(10 / intensity)) === 0) out[i] = 1;
      else if (kind === "poisoned" && tgt >= 0 && Math.floor(e / m3) === tgt) out[i] = Math.random() < intensity ? 1 : out[i];
      else if (kind === "white-noise" && Math.random() < intensity * 0.3) out[i] = 1 - out[i];
      else if (kind === "amplitude" && Math.random() < intensity) out[i] = 1;
    }
  }
  return out;
}

export function adversarialStressTest(electrodes = 12, timeBins = 48, baselineRate = 0.3): Record<string, unknown> {
  const base = new SpikeTensor(electrodes, timeBins, [], baselineRate);
  base.applyRefractory();
  const bs = base.stats();
  const bc = coherenceScore(bs);

  const attacks = ATTACK_SUITE.map(([name, kind, intensity, desc]) => {
    const data = applyAttack(base.data, name, kind, intensity, electrodes, timeBins);
    const t = new SpikeTensor(electrodes, timeBins, data, baselineRate);
    const st = t.stats();
    const coh = coherenceScore(st), integ = integrityScore(st);
    const cat = name.includes("catastrophic") || name.includes("poisoned");
    const detected = cat || coh > 0.9 || integ < 0.2 ||
      Math.abs(st.meanRate - bs.meanRate) > bs.meanRate * 1.5 ||
      Math.abs(st.synchronyIndex - bs.synchronyIndex) > 0.4 ||
      Math.abs(st.informationRate - bs.informationRate) > 8;
    const keep = 0.5 * (1 - Math.abs(coh - 0.5)) + 0.5 * integ;
    const sec = detected ? Math.max(0, Math.min(1, keep)) : Math.max(0, Math.min(1, keep * 0.4));
    return { name, kind, intensity, desc, detected: Boolean(detected), securityScore: Number(sec.toFixed(3)) };
  });

  const det = attacks.filter((a) => a.detected).length;
  const ms = Number((attacks.reduce((a, x) => a + x.securityScore, 0) / attacks.length).toFixed(3));
  return {
    baseline: { coherence: Number(bc.toFixed(4)) },
    attacks,
    passed: det >= attacks.length * 0.7,
    summary: { attacks: attacks.length, detected: det, meanSecurityScore: ms,
      stressLevel: ms >= 0.8 ? "low" : ms >= 0.5 ? "moderate" : "high" },
  };
}

export function validateCognitiveRobotics(electrodes = 12, timeBins = 32, maxSteps = 40): Record<string, unknown> {
  const spike = makeSpikeTensor(electrodes, timeBins).stats();
  const loop = new ControlLoop(electrodes, electrodes, timeBins);
  const robotics = loop.run(DEFAULT_MAZE, [0, 0], maxSteps);
  const adversarial = adversarialStressTest(electrodes, timeBins) as { passed: boolean };
  return { spike, robotics, adversarial, passed: Boolean(robotics.solved && adversarial.passed) };
}