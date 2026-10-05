// 名稱欄位：玩家看得到的文字不得寫死會每世重抽的名字，一律用 {guard} 這類欄位，顯示時填入當世名稱。
// 這個檔案不依賴 core，載入資料時也用它檢查。

export const SLOT_NAMES = ["guard", "merchant", "wanderers", "village", "market", "mountain", "country"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];
export type SlotValues = Record<SlotName, string>;

/** 世界觀第 1–17 節使用的參考名。遊戲內每世重抽，資料檔裡不得直接出現。 */
export const REFERENCE_NAMES: readonly string[] = ["太衡宗", "通濟行", "野渡", "垣下", "渡頭集", "青垣山"];

/** 沒有世界可用時（單元測試、模擬腳本）的預設名稱，就是參考名本身 */
export const DEFAULT_SLOTS: SlotValues = {
  guard: "太衡宗",
  merchant: "通濟行",
  wanderers: "野渡",
  village: "垣下",
  market: "渡頭集",
  mountain: "青垣山",
  country: "玄朔",
};

const SLOT_PATTERN = /\{([^}]*)\}/g;

/** 文字中的問題：直接寫了參考名，或用了不認得的欄位。沒有問題回傳空陣列。 */
export function slotProblems(text: string, allowSlots = true): string[] {
  const problems: string[] = [];
  for (const name of REFERENCE_NAMES) {
    if (text.includes(name)) problems.push(`直接寫了「${name}」，請改用名稱欄位（見 docs/WORLD.md 第 20 節）`);
  }
  if (allowSlots) {
    for (const m of text.matchAll(SLOT_PATTERN)) {
      if (!(SLOT_NAMES as readonly string[]).includes(m[1])) {
        problems.push(`出現不認得的名稱欄位 {${m[1]}}，可用：${SLOT_NAMES.map((s) => `{${s}}`).join("、")}`);
      }
    }
  }
  return problems;
}

/** 把名稱欄位換成當世的名字。遇到不認得的欄位直接丟錯，不默默顯示原文。 */
export function fillSlots(text: string, slots: SlotValues): string {
  return text.replace(SLOT_PATTERN, (_, key: string) => {
    if (!(SLOT_NAMES as readonly string[]).includes(key)) throw new Error(`文字「${text}」裡的名稱欄位 {${key}} 不存在`);
    return slots[key as SlotName];
  });
}
