// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playSound, setSoundEnabled, soundEnabled, SOUND_NOTES } from "../../src/ui/sound";

describe("音效", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("預設關閉，偏好存在瀏覽器", () => {
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
  });

  it("每種音都有音符，音量不大且長度合理", () => {
    for (const notes of Object.values(SOUND_NOTES)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(50);
        expect(n.gain).toBeLessThanOrEqual(0.12);
        expect(n.at + n.dur).toBeLessThan(1);
      }
    }
  });

  it("沒有 AudioContext 或沒開啟時不報錯也不出聲", () => {
    expect(() => playSound("good")).not.toThrow();
    setSoundEnabled(true);
    expect(() => playSound("bad")).not.toThrow();
  });

  it("開啟時依音符建立振盪器", () => {
    const started: number[] = [];
    const node = () => ({ connect: (x: unknown) => x, frequency: { value: 0 }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start: (t: number) => started.push(t), stop() {}, type: "" });
    class FakeContext {
      state = "running";
      currentTime = 1;
      destination = {};
      createOscillator = node;
      createGain = node;
      resume() {}
    }
    vi.stubGlobal("AudioContext", FakeContext);
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    setSoundEnabled(true);
    playSound("good");
    expect(started).toHaveLength(SOUND_NOTES.good.length);
    setSoundEnabled(false);
    playSound("good");
    expect(started).toHaveLength(SOUND_NOTES.good.length);
  });
});
