<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

$root = dirname(__DIR__);
$configPath = $root . '/config.local.php';
$autoloadPath = $root . '/vendor/autoload.php';
if (!is_file($configPath) || !is_file($autoloadPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => '伺服器尚未完成帳號服務設定。'], JSON_UNESCAPED_UNICODE);
    exit;
}
require $autoloadPath;
/** @var array<string, mixed> $config */
$config = require $configPath;

function respond(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}
function textValue(mixed $value): string { return trim(is_string($value) ? $value : ''); }
function validEmail(string $email): bool { return filter_var($email, FILTER_VALIDATE_EMAIL) !== false; }
function setting(array $config, string $key): string {
    $value = $config[$key] ?? '';
    if (!is_string($value) || trim($value) === '' || str_contains($value, '填入')) {
        throw new RuntimeException('伺服器設定缺少 ' . $key);
    }
    return trim($value);
}
function rpc(array $config, string $function, array $payload): mixed {
    $url = rtrim(setting($config, 'supabase_url'), '/') . '/rest/v1/rpc/' . rawurlencode($function);
    $secret = setting($config, 'supabase_secret_key');
    $request = curl_init($url);
    curl_setopt_array($request, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'apikey: ' . $secret, 'Authorization: Bearer ' . $secret],
    ]);
    $body = curl_exec($request);
    $status = (int)curl_getinfo($request, CURLINFO_HTTP_CODE);
    $error = curl_error($request);
    curl_close($request);
    if ($body === false || $error !== '') throw new RuntimeException('資料庫連線暫時失敗。');
    $data = json_decode($body, true);
    if ($status < 200 || $status >= 300) {
        $message = is_array($data) ? (string)($data['message'] ?? '') : '';
        throw new RuntimeException($message !== '' ? $message : '資料庫操作失敗。');
    }
    return $data;
}
function sendCodeEmail(array $config, string $email, string $code, string $purpose): void {
    $isReset = $purpose === 'recovery';
    $title = $isReset ? '重設密碼驗證碼' : '註冊帳號驗證碼';
    $intro = $isReset ? '你正在申請重設密碼。' : '感謝你註冊賈村戰技體驗場。';
    $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $html = "<!doctype html><html lang=\"zh-Hant\"><body style=\"margin:0;background:#f5f5f4;font-family:Arial,'Noto Sans TC',sans-serif;color:#292524\"><main style=\"max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:18px\"><p style=\"margin:0;color:#ea580c;font-weight:700;letter-spacing:1px\">賈村戰技體驗場</p><h1 style=\"margin:20px 0 8px;font-size:24px\">{$title}</h1><p style=\"line-height:1.7\">{$intro} 請在網頁輸入下方六位數驗證碼。</p><div style=\"margin:24px 0;padding:18px;text-align:center;background:#fff4ed;border-radius:12px;color:#ea580c;font-size:32px;font-weight:700;letter-spacing:8px\">{$safeCode}</div><p style=\"line-height:1.7;color:#57534e\">驗證碼有效期限為 10 分鐘。若不是你本人操作，請忽略此信件，切勿將驗證碼提供給他人。</p></main></body></html>";
    $mail = new PHPMailer(true);
    $mail->isSMTP(); $mail->Host = setting($config, 'smtp_host'); $mail->SMTPAuth = true;
    $mail->Username = setting($config, 'smtp_username'); $mail->Password = setting($config, 'smtp_password');
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; $mail->Port = (int)($config['smtp_port'] ?? 587);
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->setFrom(setting($config, 'from_email'), setting($config, 'from_name'));
    $mail->addAddress($email); $mail->isHTML(true); $mail->Subject = "賈村戰技體驗場｜{$title}";
    $mail->Body = $html; $mail->AltBody = "{$title}\n{$intro}\n驗證碼：{$code}\n有效期限：10 分鐘。";
    $mail->send();
}
function setAccountSession(array $user): void {
    session_regenerate_id(true);
    $_SESSION['account'] = ['id' => (int)$user['user_id'], 'email' => (string)$user['user_email'], 'name' => (string)$user['user_name']];
}
function newCode(): string { return (string)random_int(100000, 999999); }

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = $config['allowed_origins'] ?? [];
if ($origin !== '') {
    if (!is_array($allowedOrigins) || !in_array($origin, $allowedOrigins, true)) respond(403, ['ok' => false, 'message' => '此網站來源未獲授權。']);
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['ok' => false, 'message' => '僅支援 POST 請求。']);

session_name((string)($config['session_name'] ?? 'jiacun_range_session'));
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => (bool)($config['session_cookie_secure'] ?? true), 'httponly' => true, 'samesite' => 'None']);
session_start();
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) respond(400, ['ok' => false, 'message' => '請求格式不正確。']);
$action = (string)($input['action'] ?? '');

try {
    if ($action === 'session') respond(200, ['ok' => true, 'account' => $_SESSION['account'] ?? null]);
    if ($action === 'logout') { $_SESSION = []; session_destroy(); respond(200, ['ok' => true]); }
    $email = strtolower(textValue($input['email'] ?? ''));

    if ($action === 'email-available') {
        $available = validEmail($email) && rpc($config, 'auth_email_available', ['p_email' => $email]) === true;
        respond(200, ['ok' => true, 'available' => $available]);
    }
    if ($action === 'register') {
        $name = textValue($input['name'] ?? ''); $nickname = textValue($input['nickname'] ?? '');
        $phone = textValue($input['phone'] ?? ''); $password = (string)($input['password'] ?? '');
        if ($name === '' || $nickname === '' || $phone === '' || $email === '' || $password === '') respond(422, ['ok' => false, 'message' => '所有註冊資料皆為必填。']);
        if (!validEmail($email)) respond(422, ['ok' => false, 'message' => '電子郵件格式不正確。']);
        if (strlen($password) < 8) respond(422, ['ok' => false, 'message' => '密碼至少需要 8 碼。']);
        $code = newCode();
        rpc($config, 'auth_register_pending', ['p_name' => $name, 'p_email' => $email, 'p_nick_name' => $nickname, 'p_phone' => $phone, 'p_password' => $password, 'p_code' => $code]);
        sendCodeEmail($config, $email, $code, 'signup');
        respond(200, ['ok' => true, 'message' => '驗證碼已寄至你的電子信箱。']);
    }
    if ($action === 'resend-signup' || $action === 'request-reset') {
        if (!validEmail($email)) respond(422, ['ok' => false, 'message' => '電子郵件格式不正確。']);
        $purpose = $action === 'request-reset' ? 'recovery' : 'signup'; $code = newCode();
        $issued = rpc($config, 'auth_issue_email_code', ['p_email' => $email, 'p_purpose' => $purpose, 'p_code' => $code]);
        if ($issued === true) sendCodeEmail($config, $email, $code, $purpose);
        respond(200, ['ok' => true, 'message' => $purpose === 'recovery' ? '若此信箱可使用，驗證碼已寄出。' : '新的驗證碼已寄出。']);
    }
    if ($action === 'verify-signup' || $action === 'verify-reset') {
        $purpose = $action === 'verify-reset' ? 'recovery' : 'signup';
        $result = rpc($config, 'auth_verify_email_code', ['p_email' => $email, 'p_purpose' => $purpose, 'p_code' => textValue($input['code'] ?? '')]);
        $row = is_array($result) ? ($result[0] ?? null) : null;
        if (!is_array($row) || ($row['verified'] ?? false) !== true) {
            $reason = is_array($row) ? (string)($row['reason'] ?? '') : '';
            $message = $reason === 'locked' ? '驗證碼錯誤次數已達上限，請重新取得驗證碼。' : ($reason === 'expired' ? '驗證碼已過期，請重新取得驗證碼。' : '驗證碼錯誤，請再試一次。');
            respond(422, ['ok' => false, 'message' => $message]);
        }
        if ($purpose === 'signup') { setAccountSession($row); respond(200, ['ok' => true, 'account' => $_SESSION['account'], 'message' => '電子郵件驗證完成，帳號已啟用。']); }
        session_regenerate_id(true);
        $_SESSION['password_reset_user_id'] = (int)$row['user_id']; $_SESSION['password_reset_expires'] = time() + 600;
        respond(200, ['ok' => true, 'message' => '驗證成功，請設定新密碼。']);
    }
    if ($action === 'reset-password') {
        $userId = (int)($_SESSION['password_reset_user_id'] ?? 0); $expiry = (int)($_SESSION['password_reset_expires'] ?? 0);
        $password = (string)($input['password'] ?? '');
        if ($userId <= 0 || $expiry < time()) respond(401, ['ok' => false, 'message' => '重設密碼驗證已失效，請重新申請。']);
        if (strlen($password) < 8) respond(422, ['ok' => false, 'message' => '密碼至少需要 8 碼。']);
        if (rpc($config, 'auth_update_password', ['p_user_id' => $userId, 'p_password' => $password]) !== true) throw new RuntimeException('密碼更新失敗。');
        unset($_SESSION['password_reset_user_id'], $_SESSION['password_reset_expires']);
        respond(200, ['ok' => true, 'message' => '密碼已更新，請使用新密碼登入。']);
    }
    if ($action === 'login') {
        $password = (string)($input['password'] ?? '');
        if (!validEmail($email) || $password === '') respond(422, ['ok' => false, 'message' => '請輸入電子郵件與密碼。']);
        $result = rpc($config, 'auth_login', ['p_email' => $email, 'p_password' => $password]);
        $row = is_array($result) ? ($result[0] ?? null) : null;
        if (!is_array($row)) respond(401, ['ok' => false, 'message' => '電子郵件、密碼錯誤，或帳號尚未啟用。']);
        setAccountSession(['user_id' => $row['user_id'], 'user_email' => $row['email'], 'user_name' => $row['name']]);
        respond(200, ['ok' => true, 'account' => $_SESSION['account'], 'message' => '登入成功。']);
    }
    respond(404, ['ok' => false, 'message' => '找不到指定操作。']);
} catch (Throwable $error) {
    error_log('[jiacun-auth] ' . $error->getMessage());
    $safeMessages = ['此電子郵件已註冊', '電子郵件格式不正確', '密碼至少需要 8 碼', '所有註冊資料皆為必填'];
    respond(500, ['ok' => false, 'message' => in_array($error->getMessage(), $safeMessages, true) ? $error->getMessage() : '操作未完成，請稍後再試。']);
}
