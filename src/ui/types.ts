import type { WaveChoice } from "../core/character/breakthrough";
import type { HuntChoice } from "../core/combat/encounter";
import type { GameState } from "../core/state";
import type { SlotInfo } from "../slots";
import type { ArtifactSlot } from "../data/types";

// 介面共用的型別：事件處理器、對外介面、側欄分頁與修行畫面的節點集合。
/** 存檔槽（M68）：沒提供就不顯示入口 */
export interface SlotHandlers {
  list(): SlotInfo[];
  onSwitch(slot: number): void;
  onClear(slot: number): void;
}

export interface UiHandlers {
  slots?: SlotHandlers;
  onBuyTalent(talentId: string): void;
  onAutoChoice(enabled: boolean): void;
  onChoose(choiceIndex: number): void;
  onPeek(choiceIndex: number): void;
  onPickChart(index: number): void;
  onSetWish(goalId: string | null): void;
  onSetNations(count: number): void;
  onSpeed(speed: number): void;
  onHold(enabled: boolean): void;
  onReset(): void;
  onExport(): void;
  onImport(text: string): void;
  onReroll(): void;
  onRename(name: string): void;
  onStart(): void;
  onNewLife(): void;
  onSchedule(scheduleId: string): void;
  onBreakthrough(usePill: boolean): void;
  onUseItem(itemId: string): void;
  onUseAll(itemId: string): void;
  onBuyItem(itemId: string): void;
  onZuohua(): void;
  onTravel(targetId: string): void;
  onWave(choice: WaveChoice, focused: boolean): void;
  onHunt(choice: HuntChoice): void;
  onTrialContinue(): void;
  onTrialRest(): void;
  onTrialRetreat(): void;
  onEnterTrial(trialId: string): void;
  onStance(stanceId: string): void;
  onFocus(): void;
  onMethod(methodId: string): void;
  onForge(recipeId: string): void;
  onEquip(itemId: string): void;
  onUnequip(slot: ArtifactSlot): void;
  onStartBrew(recipeId: string): void;
  onCancelBrew(): void;
  onJoinSect(): void;
  onLeaveSect(): void;
  onPromoteSect(): void;
}

export interface Ui {
  render(state: GameState): void;
  /** action：提示列上多一個按鈕（例如「繼續」）；按它或關閉提示都會執行 */
  notice(message: string, action?: { label: string; run(): void }): void;
  /** 玩家正在讀彈窗或抽屜（天下圖、殘卷錄、行囊等）：主迴圈據此暫停歲月 */
  reading(): boolean;
}

/** 側欄的分頁；每個區塊以 data-tab 歸屬其中一頁 */
export const SIDE_TABS = [
  { id: "play", label: "修行" },
  { id: "make", label: "煉製" },
  { id: "pack", label: "行囊" },
  { id: "me", label: "角色" },
] as const;
export type SideTab = (typeof SIDE_TABS)[number]["id"];

export interface LifeEls {
  name: HTMLElement;
  realm: HTMLElement;
  age: HTMLElement;
  stones: HTMLElement;
  fill: HTMLElement;
  barText: HTMLElement;
  progress: HTMLElement;
  sched: HTMLElement;
  travelOpen: HTMLButtonElement;
  pace: HTMLElement;
  paceFix: HTMLElement;
  todo: HTMLElement;
  todoText: HTMLElement;
  todoGo: HTMLButtonElement;
  live: HTMLElement;
  log: HTMLElement;
  eventModal: HTMLElement;
  tribModal: HTMLElement;
  tribTitle: HTMLElement;
  tribText: HTMLElement;
  tribInfo: HTMLElement;
  tribChoices: HTMLElement;
  huntModal: HTMLElement;
  huntArt: HTMLElement;
  huntTitle: HTMLElement;
  huntText: HTMLElement;
  huntBars: HTMLElement;
  huntInfo: HTMLElement;
  huntChoices: HTMLElement;
  huntTrial: HTMLElement;
  trialResultModal: HTMLElement;
  trialResultMark: HTMLElement;
  trialResultTitle: HTMLElement;
  trialResultText: HTMLElement;
  trialResultRewards: HTMLElement;
  trialResultClose: HTMLButtonElement;
  eventTitle: HTMLElement;
  eventText: HTMLElement;
  eventHistory: HTMLElement;
  eventChoices: HTMLElement;
  life: HTMLElement;
  goalsFold: HTMLElement;
  goals: HTMLElement;
  goalHint: HTMLElement;
  goalGo: HTMLButtonElement;
  modal: HTMLElement;
  modalBody: HTMLElement;
  schedules: { id: string; b: HTMLButtonElement; facts: HTMLElement; hint: HTMLElement }[];
  zuohuaBox: HTMLElement;
  sectBox: HTMLElement;
  stanceBox: HTMLElement;
  trialBox: HTMLElement;
  alchemyBox: HTMLElement;
  zuohuaInfo: HTMLElement;
  btSection: HTMLElement;
  btInfo: HTMLElement;
  btButton: HTMLButtonElement;
  pillRow: HTMLElement;
  pill: HTMLInputElement;
  pillText: HTMLElement;
  bag: HTMLElement;
  market: { id: string; price: HTMLElement; owned: HTMLElement; b: HTMLButtonElement }[];
  marketNote: HTMLElement;
  marketLink: HTMLButtonElement;
}
