/**
 * 康橋大事件 — 路線 A：Apps Script 當 JSON API
 *
 * 為什麼要用這個：gviz 免設定管道碰到「合併儲存格」會把資料讀歪，
 * 這支用 getDisplayValues() 原封不動讀整張表，合併格會變成空字串、
 * 位置不會跑掉，網站那邊再自己向下填補，最穩。
 *
 * 使用方式：
 * 1. 打開你的試算表 →「擴充功能」→「Apps Script」
 * 2. 把左邊原本的程式碼全部刪掉，整段貼上這個，存檔（Ctrl+S）
 * 3. 右上角「部署」→「新增部署」→ 類型選「網頁應用程式」
 *      說明：隨便打
 *      執行身分：我
 *      誰可以存取：任何人
 * 4. 按「部署」。第一次會跳出授權：
 *      → 選你的 Google 帳號
 *      → 出現「Google 尚未驗證這個應用程式」→ 點左下「進階」
 *      → 點「前往『專案名稱』(不安全)」→ 允許
 *      （這是你自己寫的程式，安全，那個警告只是因為沒送 Google 審核）
 * 5. 複製它給你的「網頁應用程式」網址（結尾是 /exec）
 * 6. 用這個網址開網站一次：
 *      https://shift67.github.io/friendship-meter/kangqiao/?api=你複製的/exec網址
 *      （它會記住，之後開一般網址就好）
 *
 * 這支只讀不寫；改一次試算表，端點立刻反映。
 */
function doGet() {
  // 綁在這張試算表上，不必填任何 ID
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  return ContentService
    .createTextOutput(JSON.stringify(values))
    .setMimeType(ContentService.MimeType.JSON);
}
