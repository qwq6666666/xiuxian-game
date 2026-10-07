// 音效：用 Web Audio 現場合成的短音，不帶任何音檔。預設關閉，偏好存在瀏覽器（不進存檔）。
// 沒有 AudioContext（舊瀏覽器、測試環境）或使用者還沒操作過頁面時，什麼都不做。
import type { HapticKind } from "./haptics";

export type SoundKind = HapticKind;

/** 一個音：頻率（Hz）、開始時間（秒，相對於現在）、長度（秒）、音量（0–1） */
export interface Note {
  freq: number;
  at: number;
  dur: number;
  gain: number;
}

/** 各種回饋的音符：點按是短促木魚，好事是上行的兩音（五聲音階），壞事是低沉一聲 */
export const SOUND_NOTES: Record<SoundKind, Note[]> = {
  tap: [{ freq: 660, at: 0, dur: 0.05, gain: 0.04 }],
  good: [
    { freq: 523.25, at: 0, dur: 0.16, gain: 0.07 },
    { freq: 783.99, at: 0.09, dur: 0.28, gain: 0.07 },
  ],
  bad: [{ freq: 110, at: 0, dur: 0.32, gain: 0.1 }],
};

const KEY = "xiuxian-sound";

/** 預設關閉：音效要玩家自己在「更多」打開 */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* 無法儲存也不影響本次 */
  }
}

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function playSound(kind: SoundKind = "tap"): void {
  if (!soundEnabled()) return;
  // 使用者還沒操作過頁面時瀏覽器不允許出聲
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const start = ac.currentTime;
  for (const n of SOUND_NOTES[kind]) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = kind === "bad" ? "triangle" : "sine";
    osc.frequency.value = n.freq;
    // 快起慢收，避免爆音
    amp.gain.setValueAtTime(0.0001, start + n.at);
    amp.gain.exponentialRampToValueAtTime(n.gain, start + n.at + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(start + n.at);
    osc.stop(start + n.at + n.dur + 0.02);
  }
}
