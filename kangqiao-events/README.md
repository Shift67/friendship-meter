# 康橋大事件 · 證物網

> 把康橋從七年級到高中的事件，沿著時間軸攤成一張立體的證物網：
> 每個事件是一個節點，每個人是一條貫穿時間的線。
> 拖它、轉它、收合它，點一個人就看見他牽連了整條故事。

一個滿版、立體、可即時同步的互動關係圖。組織隱喻＝**時間軸上的案卷**。

---

## 快速開始

```bash
cd kangqiao-events
npm install
npm run dev        # 開發（http://localhost:5173）
npm run build      # 打包到 dist/
npm run preview    # 預覽打包結果
```

想離線看圖跑起來，用內建示例資料：開 `http://localhost:5173/?demo`
（示例資料明確標示為「示例」，不是康橋真實紀錄）。

---

## 資料從哪來（即時同步）

網站不吃靜態檔，直接抓試算表的即時資料，載入時抓一次、之後每 45 秒＋切回分頁時
重抓，用 diff 把**新事件用飛入動畫**加進來（不整頁重刷）。來源試算表**唯讀，永不寫入**。

兩條路，主推 A：

### 路線 A（主推）：Apps Script 當 JSON API，試算表保持私人
1. 把 `apps-script.gs` 的內容貼進試算表的 Apps Script，部署成「網頁應用程式」
   （執行身分：我／誰可存取：任何人），拿到 `/exec` 網址。
2. 用 `?api=你的/exec網址` 開啟本站一次（會記到瀏覽器 localStorage，之後免帶），
   或把網址填進 `src/config.js` 的 `DEFAULT_APPS_SCRIPT_URL`。

詳細步驟在 `apps-script.gs` 註解裡。

### 路線 B（零程式 fallback）：gviz 端點
不填 API 時自動改走 gviz。**前提**：試算表要設成「知道連結的人可檢視」。
本站用 JSONP 讀取以避開 CORS，剝掉外層包裝後解析。

> 隱私一句話：不管走哪條路，凡是上到網站的內容，拿到網址的人都讀得到。
> 若在意就別公開散佈那個 `/exec` 或網站網址。

### 欄位對應
以標題列對應（對不到就用位置 A–F fallback）：階段／學期／事件名稱／發生日期／發生人／事件內容。
- A、B 欄合併儲存格會**向下填補**。
- 「發生人」一格多人用空白／頓號／逗號切開；群體（如「G班全體」）當成一個人物節點。
- 排序以**試算表列序**為主（表已照時間排），日期格式再亂也不會排錯。
- 缺欄位就留空，面板顯示「無記錄」，**絕不編造**事件／日期／人名／故事。

改設定只需動 `src/config.js`（端點、輪詢秒數、學期順序、配色、力場調律）。

---

## 部署

`vite.config.js` 已設 `base: './'`（相對路徑），`npm run build` 後的 `dist/`
可以直接丟到任何靜態主機或子目錄。GitHub Pages 也可以放 `dist/` 的內容。
（`dist/` 因為含 CJK 字體子集共數百個小檔，預設不進版控；瀏覽器實際只會抓到用到的幾個子集。）

---

## 檔案結構

```
kangqiao-events/
  index.html
  apps-script.gs      # 路線 A 的 doGet，貼到試算表用
  src/
    main.js           # 進入點，組裝＋即時同步
    config.js         # 端點、輪詢秒數、學期順序、配色、力場調律
    data.js           # 抓端點＋解析＋正規化＋diff
    graph.js          # 3d-force-graph 建圖、時間軸力、節點材質、拖曳、orbit、待機漂移
    focus.js          # 招牌聚焦（GSAP＋鏡頭）
    clusters.js       # 學期叢集收合/展開
    panel.js          # 事件／人物面板
    styles.css        # design tokens＋版面
```

字體用 `@fontsource`（Noto Sans TC／Space Grotesk／JetBrains Mono）由 npm 安裝、
Vite 打包成本地檔，**自帶不外連**，取代規格裡的 `public/fonts/`。

---

## 技術棧
Vite + vanilla JS · three.js · 3d-force-graph（vasturiano）· d3-force-3d · GSAP ·
純 CSS 變數當 design tokens（無框架 / 無 Tailwind / 無 UI kit）。

## 設計取向（去 AI 味的核心）
- **空間即時間**：事件沿 Y 軸依學期分層，轉一轉就讀得出故事先後——這是主要的「方便閱讀」機制。
- **一個招牌動作**：點人物 → 其餘沉進景深霧、鏡頭聚焦、他牽連的線一條條被拉出。整站只在這砸膽量。
- **一個功能色**：暖橘只用在選中／活躍連線／聚焦高亮；其餘近中性冷調深底。
- 霧面實心材質、克制高光——不是發光球飄純黑底的科技 demo 芭樂。
- 動態只放在真實事件與立體感上；唯一的環境動畫是待機時慢到幾乎察覺不到的鏡頭漂移。

閱讀優先序：**方便閱讀 > 視覺效果 > 立體/可收合**。
