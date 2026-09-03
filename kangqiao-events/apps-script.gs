/**
 * 康橋大事件 — 路線 A：Apps Script 當 JSON API（試算表保持私人）
 *
 * 使用方式：
 * 1. 打開來源試算表 → 擴充功能 → Apps Script
 * 2. 把整段貼上、存檔
 * 3. 部署 → 新增部署 → 類型選「網頁應用程式」
 *      執行身分：我
 *      誰可以存取：任何人
 * 4. 複製拿到的 /exec 網址
 * 5. 用 ?api=你的/exec網址 開啟本站一次（會記到瀏覽器，之後免帶），
 *    或把網址填進 src/config.js 的 DEFAULT_APPS_SCRIPT_URL
 *
 * 這支只讀不寫；改一次試算表，端點立刻反映。
 */
function doGet() {
  const ID = '1kkqjX0Lnbh_ajRe0Pe1bWAQTPBG3AUbJjV1hVKjzNTM';
  const sheet = SpreadsheetApp.openById(ID).getSheets()[0];
  const values = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify(values))
    .setMimeType(ContentService.MimeType.JSON);
}
