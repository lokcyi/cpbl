# CPBL 單場原始資料驗證

驗證日期：2026-10-24（台北時間）。直接 HTTP GET 官方公開 API，保存未修改的回應。

來源：`https://stats.cpbl.com.tw/api/proxy/v1/games/{game_id}`

| 比賽 | 日期 | 主審 | LiveLog 事件 | 有座標事件 | StrikeCalled / BallCalled | 上述判決有座標 |
|---|---|---|---:|---:|---:|---:|
| 2026-A-211 台鋼雄鷹 vs 中信兄弟 | 2026-07-21 | 木內九二生 | 353 | 326 | 199 | 199 |
| 2026-D-166 中信兄弟二軍 vs 味全龍二軍 | 2026-07-21 | 范杞平 | 277 | 257 | 137 | 137 |
| 2026-C-1 中信兄弟 vs 味全龍 | 2026-10-17 | 張展榮 | 225 | 218 | 115 | 115 |

## 確認存在

- 根結構：Data.Game。
- 主審：Referee 陣列中 Job == 主審 的 Name。
- 每筆事件的投手、打者與捕手：PitcherAcnt/Name、HitterAcnt/Name、CatcherAcnt/Name。三場所有事件的 CatcherAcnt 均非空。
- 球點：LiveLog[].Trackman.Pitch.Location.PlateLocSide / PlateLocHeight。
- Trackman 投球結果：LiveLog[].Trackman.Play.PitchTag.PitchCall。
- 另有 IsBall、IsStrike、Content、InningSeq、VisitingHomeType、BallCnt、StrikeCnt、OutCnt、壘上跑者、比分。
- Trackman Release、SpinRate、球種與軌跡係數。

## 樣本中未找到

- 個人好球帶上下界、打者身高欄位。
- ABS 挑戰事件、發起者、成功/失敗、改判前後判決等明確欄位。
- 遞迴掃描全部欄位名稱及所有字串值，沒有找到 ABS、挑戰、改判、維持原判、電子好球相關文字。

這只代表本次三份回應沒有相關資料，不能推論所有賽事與其他端點皆沒有。二軍測試有實際挑戰，不代表公開 LiveLog 一定記錄該事件。

## 分析注意事項

- LiveLog 包含非投球事件，事件總數不可當成總投球數。座標缺少也不能一律解讀成儀器漏測。
- StrikeCalled / BallCalled 是本次明確計數的兩類；二軍樣本另有 BallinDirt、HitByPitch 等，正式評分需核對語義，不能直接把兩類當成所有未揮棒判決。
- 首球好球的 BallCnt/StrikeCnt 為 0/1，首球壞球為 1/0，表明樣本球數是該事件後狀態。投球前球數及出局/壘況必須按事件順序重建。
- 尚未驗證座標單位、正負視角、好球帶高度算法與測量誤差。具備座標不等於已能可靠重判。
- 沒有 challenge 欄位，不能用球點疑似誤判代替真實 ABS 推翻。

## 檔案

- 三個 game_id.json：原始回應。
- audit.json：欄位路徑、計數、文字檢索與事件樣本。
- ../../audit_cpbl.py：可重跑的下載與檢查程式。

結論：已驗證資料適合進一步建立逐球、捕手及裁判分析；要做好球帶相符率還需補齊好球帶基準，要做 abs-tracker 同樣的挑戰統計則仍缺挑戰事件來源。
