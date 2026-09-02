# 資料庫設定

在 Supabase SQL Editor 執行 phase1_auth.sql。

此 SQL 將 users.state 統一為 pending、active、disabled，並以觸發器將 Supabase Auth 帳號同步到 public.users。

帳號密碼、登入 Session 與六位數驗證碼由 Supabase Auth 處理；public.users 以 auth_user_id 對應 Supabase Auth 的 UUID，並保留原本的 users.id 給遊戲、射擊紀錄等資料表關聯。

請在 Supabase Dashboard：

1. Authentication → Providers → Email：啟用 Confirm email。
2. Authentication → Email Templates：將 Confirm signup 與 Reset password 模板內容加入 `{{ .Token }}`，使使用者收到六位數驗證碼。
3. Authentication → URL Configuration：把正式網站網址加入 Site URL 與 Redirect URLs。
