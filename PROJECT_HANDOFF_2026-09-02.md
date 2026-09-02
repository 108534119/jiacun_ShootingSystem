# 賈村戰技體驗場定點射擊遊玩系統｜交接文件

更新日期：2026-09-02  
目前網站：[賈村戰技體驗場｜定點射擊](https://jiacun-shooting-range.mythic-lemur-0953.chatgpt.site)

## 1. 專案目標

提供手機優先的定點射擊遊玩系統。玩家可註冊、登入、選擇空閒靶機、進行最多 30 發的射擊、查看靶紙落點與單發／累計分數，並在結束後查詢最近三個月的遊玩紀錄。

正式流程應為：

```text
玩家手機 → 選擇靶機 → ESP32 偵測射擊 → V4.0 模型 API 計分與預測落點
→ 寫入資料庫 → 即時回傳手機靶紙與分數 → 結束場次保存
```

## 2. 目前已完成

### 網頁與玩家功能

- 手機優先的首頁、註冊、登入與登出確認。
- 註冊需填寫完整資料、電子郵件格式與重複檢查、兩次密碼確認。
- Supabase Auth 的電子郵件驗證與重設密碼流程；驗證碼目前為 6 碼。
- 中文化的操作與錯誤提示。
- 會員專區：
  - 帳號唯讀顯示。
  - 手機號碼預設遮蔽，只顯示末三碼；需先驗證既有密碼才可查看及修改。
  - 可修改暱稱。
  - 需先輸入舊密碼，才可修改密碼。
- 遊玩專區：6 台靶機卡片、在線／離線／使用中／可使用狀態、單一玩家占用鎖。
- 玩家提示已改為：先連線現場賈村 Wi‑Fi，再選擇顯示「可使用」的靶機；使用中的靶機需稍候。
- 開始場次後顯示 30 × 40 cm 靶紙、單發分數列表、單發／累計分數與目前發數。
- 單場上限：30 發、300 分。
- 結束場次後保存總發數與總分；可查詢自己的最近三個月已完成場次。
- 使用提供的正式靶紙 PDF 轉製 `public/target-paper-v4.png` 作為網頁靶紙。

### 靶機在線與使用鎖

- 靶機資料表已預先規劃 6 台：靶機 1～6；目前 ESP32-01、ESP32-02 為已使用中的實體裝置。
- ESP32 每秒送出心跳；超過 3 秒未收到心跳，資料庫會判定靶機離線。
- 一台靶機開始場次後會被占用；每次成功記錄射擊會將占用租約延長至 20 分鐘。
- 網頁會每秒更新靶機狀態。

### V4.0 計分模型

- 正式模型為 **V4.0**，本質上是凍結的 V3.22／468 發候選模型。
- 模型檔與推論程式位於：
  - `D:\gpt_codex\shooting_target_R21_analysis_20260825\V4_0_Formal_Release_20260826_revision2\ShootingTarget_V4_0_Formal_Release_20260826.zip`
- 模型由 Python、`joblib`、`numpy`、`pandas` 及既有特徵萃取程式執行。
- 模型**尚未部署為 API，也尚未與 ESP32 的實際射擊資料串接**。

## 3. 現況與重要限制

### 已可測試的部分

- 使用者可完成註冊、驗證、登入、選靶、建立場次、以「測試入彈」寫入一發、結束場次及查看紀錄。
- 靶機心跳與占用鎖的資料庫流程已建立。

### 尚不可視為正式射擊計分的部分

目前遊玩畫面的「測試入彈（保存一發）」是用於驗證靶紙畫面、資料庫寫入與場次流程的測試功能，**不是 ESP32 真實射擊資料**。

正式啟用前必須完成：

1. 建立常駐的 V4.0 Python 推論 API。
2. 定義 ESP32 上傳的完整事件格式（P1～P4、Peak Time、Energy、waveform／summary 特徵、裝置 ID、事件 ID）。
3. API 驗證裝置身分、執行特徵萃取與 V4.0 推論，回傳分數、XY 落點、壓線、信心等級與模型版本。
4. API 將結果安全地寫入 `shots`，並推送／提供手機即時更新。
5. 移除或僅限管理員保留「測試入彈」功能。
6. 以實體靶機完成端對端測試：ESP32 → API → 資料庫 → 玩家手機。

## 4. 目前暫用資料庫：Supabase

目前以 Supabase 暫代正式資料庫與帳號系統，暫時不需要另建資料庫伺服器。

### Supabase 目前負責

- Supabase Auth：帳號、登入 Session、Email 驗證碼、重設密碼。
- PostgreSQL：玩家、靶機、場次、射擊紀錄。
- Edge Function：靶機心跳與一次性內部帳號建立。
- RPC：會員資料、靶機列表、建立／記錄／結束場次、玩家紀錄。

### 主要資料表

| 資料表 | 用途 |
|---|---|
| `users` | 玩家及內部帳號資料；`auth_user_id` 對應 Supabase Auth；狀態為 `pending`／`active`／`disabled`。 |
| `roles` | 角色：1 遊客、2 員工、3 管理員、4 總管理員。 |
| `lanes` | 6 台靶機的名稱、裝置 ID、啟用狀態及最後心跳時間。 |
| `game_sessions` | 一場遊玩的玩家、靶機、開始／結束時間、總發數、總分、場次狀態與租約。 |
| `shots` | 每發分數、XY 落點、壓線、信心、模型版本。 |
| `email_verification_codes` | 曾建立作為驗證碼關聯表；目前實際 OTP 由 Supabase Auth 管理。 |

### SQL 執行順序

在 Supabase SQL Editor 依序執行：

1. `supabase/phase1_auth.sql`
2. `supabase/phase2_member_game.sql`
3. `supabase/phase3_lane_realtime.sql`

`phase3_lane_realtime.sql` 已包含舊版函式的刪除與重建，避免 `structure of query does not match function result type` 類錯誤。若調整資料表或 RPC，必須同步更新此文件與 SQL。

### 重要安全規則

- Supabase Publishable Key 可在前端使用；**Secret／Service Role Key 絕不可放在網頁、Git 或 ESP32**。
- V4.0 模型 API 使用 Service Role Key 時，僅能存放在伺服器環境變數。
- `users.password` 會保存 bcrypt 雜湊，以 `crypt(明文密碼, gen_salt('bf'))` 寫入；不可保存明文密碼。
- 上線前由下一位開發者檢查並補齊所有資料表的 RLS 政策與 API 裝置金鑰驗證。

## 5. ESP32 狀態

### 現有程式

- ESP32-01：
  `ShootingTarget_V4_6_OnlineLane.ino`
每個靶機(EPS32)程式碼大致上都一樣，唯有以下兩個資料不同
LANE_DEVICE_ID = "esp32-03"; // 依靶機編號修改
LANE_DEVICE_KEY = "此台專屬隨機金鑰";

### 已完成

- 透過 `lane-heartbeat` Edge Function 每秒回報裝置在線狀態。
- 以 `device_id` 與裝置專屬 `x-device-key` 驗證。

### 待完成

- 除心跳外，ESP32 尚未把每次真實射擊的完整資料送至 V4.0 模型 API。
- 需設計失敗重送、事件去重（使用裝置 ID + 事件 ID）、網路中斷暫存與重送機制。
- 靶機 3～6 尚未接入／設定。

## 6. 正式伺服器需求（最高優先）

### 推薦方案

建議先使用：

| 項目 | 最低建議 |
|---|---|
| 作業系統 | Ubuntu Server 22.04 LTS 或 24.04 LTS（ARM64） |
| CPU／記憶體 | 1 OCPU、6 GB RAM |
| 磁碟 | 50 GB SSD boot volume |
| 對外連線 | 固定 Public IPv4、HTTPS 網域或暫用 IP |
| Web API | Python 3.11、FastAPI、Uvicorn／Gunicorn |
| 反向代理與 TLS | Caddy 或 Nginx + Let's Encrypt |
| 常駐與更新 | Docker Compose 或 systemd；重開機自動啟動 |
| 模型依賴 | `joblib`、`numpy`、`pandas`、`scikit-learn` 與 V4.0 特徵萃取程式 |

### API 必要功能

- `GET /health`：健康檢查。
- `POST /v1/shots`：只接受已驗證的 ESP32 裝置。
- 讀取並常駐載入 V4.0 模型，避免每發重新載入。
- 驗證欄位、去重與限流。
- 執行特徵萃取與模型推論。
- 回傳並保存：`score_final`、XY、`line_shot`、`confidence`、`model_version`。
- 對 Supabase 使用伺服器端環境變數，寫入正確的進行中場次與 `shots`。
- 統一記錄錯誤日誌；不得記錄密碼、Service Role Key 或完整敏感金鑰。

### 網路與防火牆

- 對外只開放 `80`、`443`；SSH `22` 僅限管理者來源或使用 SSH Key。
- 不直接對外開放 Python 的 `8000` 埠。
- ESP32 僅需要透過 HTTPS 對外 POST，不需要從外網主動連入 ESP32。
- 網站、ESP32、模型 API 與 Supabase 都必須使用 HTTPS。

## 7. 程式位置

主要網站程式：

```
賈村戰技體驗場定點射擊遊玩系統\web
```

主要檔案：

| 檔案／資料夾 | 用途 |
|---|---|
| `app/page.tsx` | 首頁與遊玩／紀錄／會員分頁整合。 |
| `components/auth-panel.tsx` | 註冊、登入、驗證碼與重設密碼。 |
| `components/member-area.tsx` | 會員資料、手機驗證修改、密碼修改。 |
| `components/play-area.tsx` | 靶機選擇、遊玩場次、靶紙、測試入彈與結束場次。 |
| `components/target-paper.tsx` | 靶紙背景與落點編號呈現。 |
| `components/game-history.tsx` | 最近三個月玩家紀錄。 |
| `supabase/phase1_auth.sql` | 帳號、驗證、密碼雜湊及登入解析。 |
| `supabase/phase2_member_game.sql` | 會員與場次基礎功能。 |
| `supabase/phase3_lane_realtime.sql` | 靶機心跳、占用鎖、30 發限制與紀錄查詢。 |
| `supabase/functions/lane-heartbeat/` | ESP32 心跳 Edge Function。 |
| `supabase/functions/seed-internal-users/` | 一次性建立員工／管理員／總管理員帳號。 |

## 8. 下一位開發者建議執行順序

1. **建立 Oracle Always Free VM**，完成 HTTPS、Docker／systemd、備份與基本監控。
2. **解壓並驗證 V4.0 模型**，在 VM 以實際一筆已知資料確認推論結果。
3. **建立模型 API**，先完成 `/health` 與單筆推論；再完成寫入 Supabase `shots`。
4. **修改 ESP32**，將完整射擊事件送至模型 API；完成事件去重與離線重送。
5. **修改網頁**，以 Supabase Realtime 或安全輪詢取得新射擊結果，移除玩家可用的測試入彈。
6. 用 ESP32-01 與 ESP32-02 進行完整端對端驗收；之後複製設定至靶機 3～6。
7. 進行安全稽核：RLS、裝置金鑰輪替、HTTPS、日誌遮罩、備份與復原演練。
8. 若日後停止使用 Supabase，再規劃遷移至正式 PostgreSQL；遷移前不可移除 Auth 與資料庫功能。

## 9. 給下一位開發者的工作原則

- 不要把 Supabase Secret／Service Role Key、ESP32 裝置金鑰、SMTP 密碼或使用者密碼寫入前端、Git 或交接文件。
- 真實射擊分數必須由 V4.0 模型 API 產生，不能沿用網頁的測試入彈邏輯。
- 場次必須保留「單一靶機同一時間僅一名玩家」與「最多 30 發」限制。
- 維持手機優先介面、中文防呆訊息與使用者可理解的靶機狀態。
- 新增任何 SQL 函式回傳欄位時，先 `DROP FUNCTION` 再重建，避免 PostgreSQL 回傳型別衝突。
