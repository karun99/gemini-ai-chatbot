import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpikeTensor, makeSpikeTensor, ControlLoop, DEFAULT_MAZE,
         adversarialStressTest, validateCognitiveRobotics, ATTACK_SUITE } from "../neurobot.ts";

describe("SpikeTensor (organoid/MEA)", () => {
  it("produces a valid spike tensor with stats", () => {
    const t = makeSpikeTensor(8, 64, 0.3);
    const s = t.stats();
    assert.equal(s.electrodes, 8);
    assert.equal(s.timeBins, 64);
    assert.ok(s.spikeCount <= 8 * 64);
    assert.ok(s.meanRate >= 0 && s.meanRate <= 1);
  });
  it("enforces refractory period", () => {
    const t = new SpikeTensor(2, 10, [], 1.0, 3);
    t.applyRefractory();
    for (let e = 0; e < 2; e++) {
      let last = -99;
      for (let b = 0; b < 10; b++) {
        if (t.data[e * 10 + b] === 1) {
          assert.ok(b - last >= 3);
          last = b;
        }
      }
    }
  });
});

describe("ControlLoop (closed-loop robotic control)", () => {
  it("solves the default maze", () => {
    const loop = new ControlLoop(6, 6, 32);
    const result = loop.run(DEFAULT_MAZE, [0, 0], 40);
    assert.equal(result.solved, true);
    assert.ok(Number(result.stepsUsed) >= 1);
  });
  it("returns a step result with coherence", () => {
    const loop = new ControlLoop(4, 4, 16);
    const r = loop.step([0, 0], [4, 4], DEFAULT_MAZE) as { coherence: number };
    assert.ok(r.coherence >= 0 && r.coherence <= 1);
  });
});

describe("adversarialStressTest (neural security layers)", () => {
  it("runs the full suite", () => {
    const report = adversarialStressTest(8, 48) as Record<string, unknown>;
    assert.ok(report.attacks);
    assert.ok((report.attacks as unknown[]).length === ATTACK_SUITE.length);
  });
  it("flags the catastrophic class as detected", () => {
    const report = adversarialStressTest(8, 32) as { attacks: { name: string; detected: boolean }[] };
    const cat = report.attacks.find((a) => a.name === "impulse-catastrophic");
    assert.equal(cat?.detected, true);
  });
});

describe("validateCognitiveRobotics (integration harness)", () => {
  it("produces a full validation result", () => {
    const result = validateCognitiveRobotics(8, 32);
    assert.ok(result.spike);
    assert.ok(result.robotics);
    assert.ok(result.adversarial);
    assert.equal(typeof result.passed, "boolean");
  });
});