# PHP 帳號服務

此資料夾是獨立的 PHP 8.1+ 帳號服務，不部署在前端網站中。它負責：

- 產生六位數亂數驗證碼，透過 Gmail + PHPMailer 寄送。
- 以 users.id 關聯 email_verification_codes.user_id。
- 使用資料庫 crypt 與 bcrypt 保存密碼及驗證碼雜湊。
- 僅允許 users.state 為 active 的帳號登入。
- 以 PHP Session 管理登入與已驗證的密碼重設流程。

## 安裝

    composer install --no-dev --optimize-autoloader
    cp config.local.php.example config.local.php

填妥 config.local.php：

1. supabase_url、supabase_secret_key：僅放於 PHP 主機；不得交給前端。
2. Gmail 帳號與 16 位 Google 應用程式密碼。
3. allowed_origins：加入前端正式網址。
4. 正式 HTTPS 主機使用 session_cookie_secure 為 true。

將 public/auth-api.php 對應為公開 HTTPS 網址，例如：

    https://api.example.com/range/auth-api.php

然後在前端環境變數設定：

    NEXT_PUBLIC_AUTH_API_URL=https://api.example.com/range

最後，在 Supabase SQL Editor 執行 ../supabase/phase1_auth.sql。本方案不需要 Supabase Authentication 的 SMTP、Email Hook 或 OTP 模板。

## 安全規則

- config.local.php 和 vendor 都不得公開或提交版本控制。
- PHP 主機必須啟用 HTTPS、cURL 與 Session。
- 驗證碼有效 10 分鐘；錯誤 5 次後必須重新寄送。
- 忘記密碼信件不會透露電子郵件是否已註冊。
