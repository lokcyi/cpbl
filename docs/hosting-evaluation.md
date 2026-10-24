# 免費網站與 Vercel 評估

查核日期：2026-10-24。這是架構評估，尚未建立 Vercel 專案或上線網站。方案配額以官方當期文件為準。

## 建議

本專案以 Vercel Hobby 作為個人非商業網站的初期方案可行。由 GitHub 保存程式，連結 Vercel Git Integration，自動部署 main 並為 PR 建立預覽。

推薦分工：

```text
GitHub repo ── push ──> Vercel 網站與輕量 API
GitHub Actions ──> 批次擷取、核對、分析 ──> 可下載資料與分析結果
使用者選場 ──> 已有結果立即顯示 / 未收錄時受限的單場即時計算
```

前端與單場即時計算不必依賴 Vercel Cron。批次工作使用 Actions；真正的持久快取需另選儲存，不能假設函式寫入檔案可永久保存。初期可在部署產物附帶少量已分析場次；大量全季原始快照不要持續提交到 Git 歷史。

## 方案比較

| 項目 | GitHub Pages | Vercel Hobby |
|---|---|---|
| 免費用途 | 公開 repo 可用 Pages，受使用政策限制 | 個人非商業用途，受免費額度限制 |
| 靜態 Dashboard | 可行 | 可行 |
| 伺服器端抓取官方 API | Pages 本身沒有後端 | 可用 Functions |
| 任選未預先收錄場次 | 需別的 API 或瀏覽器直連且官方允許跨來源 | 可由後端即時取得，需限制請求量 |
| 批次分析 | 可用 GitHub Actions | 建議同樣交給 Actions |
| 持久儲存 | 靜態發布資料；另規劃大型資料儲存 | 需另規劃，Functions 本身不是資料庫 |

結論：只看預先算好的比賽，Pages 最單純；要符合任選場次、即時抓取與分析的完整需求，Vercel 較合適。

## Vercel 免費限制與對策

- Hobby 限個人非商業用途；將來收費或商業化需重新評估。
- 當期文件列出每月 Fast Data Transfer 100 GB、Function Invocations 100 萬次、Active CPU 4 小時；任一配額都可能先耗盡，不能只看流量。
- Functions 的 Hobby 執行時間當期文件列為最長 300 秒；大量歷史回補不要放在使用者請求內。
- Functions 請求／回應 payload 上限 4.5 MB。三場樣本原始回應約 0.36–0.55 MB，但不可據此保證每場都符合限制；大型原始檔應以靜態檔案或物件儲存下載。
- Hobby Cron 每個工作最多每天一次，可能在指定小時內延遲觸發，不適合賽事即時刷新。
- 免費額度超限可能暫停功能。採結果快取、去重、重試限制與受控的單場查詢，避免每位訪客重新抓同一份資料。

## GitHub Actions

此 repo 目前公開，標準 GitHub-hosted runner 的執行可免費使用，仍受服務使用限制；大型 runner、artifact 與其他儲存不應假定全部無限制免費。排程不是精準即時任務。

原始資料長期保存的零成本策略需依實際場數、壓縮大小、下載量與保留期限再決定，不先承諾永久免費儲存整季多版本。

## 後續部署步驟

1. 完成可建置的網站與 API、指標及資料品質驗證。
2. 在 Vercel 以 GitHub 登入，匯入 lokcyi/cpbl，選 Hobby。
3. 依實際框架設定建置及輸出；目前 repo 尚無網站程式，不能直接當成已可部署網站。
4. 部署並測試賽程、跨來源擷取、分析、下載、快取及錯誤狀態。
5. 再設定 Actions 批次更新與資料保存方式。GitHub 密鑰不放前端；公共頁面不提供可任意觸發 workflow 的憑證。

## 官方來源

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)
- [Functions limits](https://vercel.com/docs/functions/limitations)
- [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
