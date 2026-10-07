import { gameData } from "../../src/data/load";

export const runs = Number(process.argv[2] ?? 1000);
export const baseSeed = Number(process.argv[3] ?? 1);
export const lives = Number(process.argv[4] ?? 1);
// method:<心法 id> 是 mixed 加上指定心法
export const forcedMethod = process.argv[5]?.startsWith("method:") ? process.argv[5].slice(7) : null;
if (forcedMethod !== null && !gameData.methods.some((m) => m.id === forcedMethod)) throw new Error(`找不到心法 ${forcedMethod}`);
// stance:<行止 id> 是 mixed 加上每年固定選指定的行止（M64）
export const forcedStance = process.argv[5]?.startsWith("stance:") ? process.argv[5].slice(7) : null;
if (forcedStance !== null && !gameData.stances.stances.some((s) => s.id === forcedStance)) throw new Error(`找不到行止 ${forcedStance}`);
export const strategy = forcedMethod !== null || forcedStance !== null ? "mixed" : process.argv[5] === "mixed" ? "mixed" : process.argv[5] === "post" ? "post" : process.argv[5] === "herb" ? "herb" : process.argv[5] === "wander" ? "wander" : process.argv[5] === "sect" ? "sect" : process.argv[5] === "tribulation" ? "tribulation" : process.argv[5] === "alchemy" ? "alchemy" : process.argv[5] === "forge" ? "forge" : process.argv[5] === "focus" ? "focus" : process.argv[5] === "rotate" ? "rotate" : process.argv[5] === "chart" ? "chart" : process.argv[5] === "wish" ? "wish" : process.argv[5] === "omen" ? "omen" : process.argv[5] === "hunt" ? "hunt" : process.argv[5] === "trial" ? "trial" : "simple";

/** 模擬玩家的策略亂數，與遊戲本身的亂數分開；用物件包起來讓各檔共用同一份 */
export const policy = { seed: baseSeed + 7919 };
