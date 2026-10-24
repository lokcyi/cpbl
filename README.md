# CPBL 比賽分析中心

目標：選擇中職比賽，取得官方原始逐球資料，計算投打與裁判相關指標，透過 Dashboard 檢視整場比賽，並下載 JSON / CSV。

第一版網站已實作，可依日期選場、連線官方資料、查看 Dashboard 並下載 JSON / CSV。已備妥 Vercel 部署設定；尚未完成 Vercel 正式上線。

## 已完成

- 日期與賽事篩選、官方單場 API 代理、快照與批次資料備援。
- 比分走勢、逐局得分、雙方比較、球點與球種分布、投打成績、得分事件與逐球搜尋。
- 原始 JSON、分析 JSON、符合篩選的逐球 CSV 下載。
- 缺漏提示、投球重建及官方用球／比分核對、手機版排版。
- Vercel 設定、GitHub Actions 驗證及手動批次收錄工作。
- 實際讀取中職公開單場 API，保存一軍、二軍與台灣大賽三場原始 JSON。
- 驗證逐球座標、投打者、捕手、主審與事件欄位。
- 紀錄球數為事件後狀態、非投球事件混入與 ABS 欄位缺漏等限制。
- 評估 GitHub Pages 與 Vercel 免費部署架構。

## 文件與樣本

- [原始資料驗證報告](research/cpbl_raw/README.md)
- [Dashboard 產品規劃](docs/product-plan.md)
- [免費部署與 Vercel 評估](docs/hosting-evaluation.md)
- [欄位檢查結果](research/cpbl_raw/audit.json)
- [可重跑的驗證程式](audit_cpbl.py)
- [操作與部署指南](docs/getting-started.md)
- [Dashboard 預覽截圖](docs/images/dashboard.jpg)

## 在本機使用

需要 Node.js 22 或更新版本，網站執行與建置不需第三方套件：

```sh
npm run dev
```

開啟 http://localhost:3000 。預設顯示台灣大賽第一場快照，可選擇日期查詢官方賽程。

```sh
npm test
npm run build
npm run refresh -- 2026-07-21
```

`refresh` 會收錄指定日期已完賽場次，保存在 `data/`；建置時合併為離線備援。測試不需要網路。`dist/` 是建置產物；單獨提供靜態檔案只支援已收錄資料，官方連線需要 `/api` 後端。

## 部署至 Vercel

在 Vercel 匯入 `lokcyi/cpbl`，Framework 選 Other，沿用 `vercel.json` 設定：`npm run build`、輸出目錄 `dist`。根目錄的 `api/` 為 Vercel Functions。不需要 API 金鑰；不要將 GitHub Token 放在前端。

完整登入及上線步驟見 [部署指南](docs/getting-started.md)。免費 Hobby 用於個人非商業專案並受配額限制。

## 重跑資料驗證

需要 Python 3，僅使用標準函式庫：

```sh
python audit_cpbl.py
```

程式會向官方 API 取得三場樣本並覆寫 `research/cpbl_raw/` 對應檔案。需要網路連線；這不是完整球季爬蟲。

原始資料來源：中華職棒進階數據站 https://stats.cpbl.com.tw/ 。本專案為非官方分析；資料與分析程式的權利應分開看待。
