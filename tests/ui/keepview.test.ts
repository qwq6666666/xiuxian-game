// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { keepView } from "../../src/ui/keepview";

const build = (root: HTMLElement, open: boolean[] = [false, false]): void => {
  root.innerHTML = `
    <details><summary>說明</summary><p>甲</p></details>
    <div><button data-n="3">三</button><button data-n="5">五</button><button data-n="7">七</button></div>
    <details><summary>更多</summary><button>圖層</button><button>圖層</button></details>`;
  const ds = root.querySelectorAll("details");
  ds[0].open = open[0];
  ds[1].open = open[1];
};

describe("重建時保住位置", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById("root")!;
  });

  it("折疊區展開或收起的狀態會還原，沒有的不亂動", () => {
    build(root, [true, false]);
    const restore = keepView(root);
    build(root, [false, false]); // 重建後都蓋回預設
    restore();
    const ds = root.querySelectorAll("details");
    expect(ds[0].open).toBe(true);
    expect(ds[1].open).toBe(false);
  });

  it("鍵盤焦點回到同一顆按鈕，相同文字的按鈕依順序對應", () => {
    build(root);
    const buttons = root.querySelectorAll<HTMLButtonElement>("[data-n]");
    buttons[1].focus();
    const restore = keepView(root);
    build(root);
    restore();
    expect((document.activeElement as HTMLElement).dataset.n).toBe("5");

    // 同文字的第二顆
    const dup = root.querySelectorAll<HTMLButtonElement>("details:last-of-type button");
    dup[1].focus();
    const restore2 = keepView(root);
    build(root);
    restore2();
    const now = root.querySelectorAll<HTMLButtonElement>("details:last-of-type button");
    expect(document.activeElement).toBe(now[1]);
  });

  it("按鈕文字變了（例如價格更新）也回到同一個位置", () => {
    root.innerHTML = '<ul><li><button>提升（100）</button></li><li><button>提升（200）</button></li></ul>';
    root.querySelectorAll("button")[1].focus();
    const restore = keepView(root);
    root.innerHTML = '<ul><li><button>提升（100）</button></li><li><button>提升（260）</button></li></ul>';
    restore();
    expect(document.activeElement).toBe(root.querySelectorAll("button")[1]);
  });

  it("焦點不在範圍內時不搶焦點", () => {
    build(root);
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const restore = keepView(root);
    build(root);
    restore();
    expect(document.activeElement).toBe(outside);
  });

  it("捲動位置會還原（外層元素）", () => {
    build(root);
    const box = document.createElement("div");
    document.body.append(box);
    Object.defineProperty(box, "scrollTop", { value: 0, writable: true, configurable: true });
    box.scrollTop = 123;
    const restore = keepView(root, [box]);
    box.scrollTop = 0; // 重建把它歸零
    build(root);
    restore();
    expect(box.scrollTop).toBe(123);
  });

  it("折疊區標題相同但所在處不同時分開記", () => {
    root.innerHTML = '<section>甲區<details><summary>回看</summary>x</details></section><section>乙區<details><summary>回看</summary>y</details></section>';
    root.querySelectorAll("details")[1].open = true;
    const restore = keepView(root);
    root.innerHTML = '<section>甲區<details><summary>回看</summary>x</details></section><section>乙區<details><summary>回看</summary>y</details></section>';
    restore();
    const ds = root.querySelectorAll("details");
    expect(ds[0].open).toBe(false);
    expect(ds[1].open).toBe(true);
  });
});
