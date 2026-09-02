# 一次性建立內部帳號

這支 Edge Function 供第一次建立「總管理員、管理員、員工」帳號使用。密碼只在呼叫時傳入，絕不寫進 SQL、網頁原始碼或 Git；它會同步寫入 Supabase Auth 與 users.password 的 bcrypt 雜湊。角色直接使用 roles 資料表的 id：2 是員工、3 是管理員、4 是總管理員。

## 事前條件

1. 已執行 supabase/phase1_auth.sql。
2. roles 資料表角色 id 已固定為：1 遊客、2 員工、3 管理員、4 總管理員。
3. 已安裝 Supabase CLI，並登入及連結專案。

    supabase login
    supabase link --project-ref pwrsokknkdkwifnmmjbp

## 設定呼叫密鑰

在 Supabase Dashboard 的 Edge Functions -> Secrets 新增 INTERNAL_SEED_TOKEN。請產生一段長且隨機的字串，不能使用任何帳號密碼。

也可使用 CLI 設定：

    supabase secrets set INTERNAL_SEED_TOKEN="請換成你的長隨機字串"

## 部署

    supabase functions deploy seed-internal-users --no-verify-jwt

本函式以 INTERNAL_SEED_TOKEN 自行驗證呼叫者，因此使用 --no-verify-jwt 是預期設定。

## 建立帳號

在本資料夾建立 seed-internal-users.json；此檔已加入 .gitignore。auth_email 必須是有效電子郵件，建議使用自己 Gmail 的加號別名，例如 yourname+superadmin@gmail.com。職員實際登入時則輸入 login_id，例如 superadmin。

    {
      "users": [
        {
          "login_id": "superadmin",
          "auth_email": "yourname+superadmin@gmail.com",
          "password": "請填至少8碼且安全的密碼",
          "name": "總管理員",
          "nick_name": "總管理員",
          "phone": "系統管理",
          "role_id": 4
        },
        {
          "login_id": "admin001",
          "auth_email": "yourname+admin001@gmail.com",
          "password": "請填另一組至少8碼且安全的密碼",
          "name": "管理員",
          "nick_name": "管理員",
          "phone": "系統管理",
          "role_id": 3
        }
      ]
    }

從專案根目錄，以 PowerShell 呼叫：

    $token = "請填 INTERNAL_SEED_TOKEN"
    $body = Get-Content .\supabase\functions\seed-internal-users\seed-internal-users.json -Raw
    Invoke-RestMethod -Method Post -Uri "https://pwrsokknkdkwifnmmjbp.supabase.co/functions/v1/seed-internal-users" -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $body

成功後，請刪除 seed-internal-users.json，並至 users 資料表確認帳號角色與 state 均正確。這是一次性建帳工具；不可重複呼叫相同帳號。
