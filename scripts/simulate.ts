// 無介面模擬腳本。M0 只是空殼，真正的多局模擬在 M5 做。
import { createInitialState } from "../src/core/state";
import { tick } from "../src/core/tick";
import { splitAge } from "../src/core/formulas";
import { config } from "../src/data/load";

let state = createInitialState(12345, config.startAgeYears);
state = tick(state, 600);
const [y, m] = splitAge(state.ageMonths);
console.log(`模擬 600 個月後：${y} 歲 ${m} 個月`);
