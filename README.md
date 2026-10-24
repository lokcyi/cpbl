# CPBL 比賽分析中心

目標：選擇中職比賽，取得官方原始逐球資料，計算投打與裁判相關指標，透過 Dashboard 檢視整場比賽，並下載 JSON / CSV。

目前階段：資料可行性研究。尚未實作或部署網站。

## 已完成

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

## 重跑資料驗證

需要 Python 3，僅使用標準函式庫：

```sh
python audit_cpbl.py
```

程式會向官方 API 取得三場樣本並覆寫 `research/cpbl_raw/` 對應檔案。需要網路連線；這不是完整球季爬蟲。

原始資料來源：中華職棒進階數據站 https://stats.cpbl.com.tw/ 。本專案為非官方分析；資料與分析程式的權利應分開看待。
