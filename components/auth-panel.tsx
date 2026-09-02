"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register";
type Stage = "form" | "verify-signup" | "forgot-email" | "verify-recovery" | "new-password";
export type Account = { id: number; email: string; name: string };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials") || message.includes("invalid login")) return "密碼錯誤，請重新輸入。";
  if (message.includes("already registered")) return "此電子郵件已註冊，請直接登入。";
  if (message.includes("rate limit") || message.includes("too many")) return "驗證信寄送過於頻繁，請稍後再試。";
  if (message.includes("token") || message.includes("otp") || message.includes("expired")) return "驗證碼錯誤或已過期，請重新取得驗證碼。";
  if (message.includes("password")) return "密碼不符合規則，請使用至少 8 碼的密碼。";
  return error instanceof Error && error.message ? error.message : "操作未完成，請稍後再試。";
}

export function AuthPanel({ mode, onSuccess }: { mode: AuthMode; onSuccess: (account: Account) => void }) {
  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState(""); const [verificationEmail, setVerificationEmail] = useState("");
  const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState(""); const [nickname, setNickname] = useState(""); const [phone, setPhone] = useState("");
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(""); const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setActiveMode(mode); setStage("form"); setMessage(""); }, [mode]);

  async function completeLogin() {
    const { data: active, error: stateError } = await supabase.rpc("is_current_visitor_active");
    if (stateError || !active) {
      await supabase.auth.signOut();
      throw new Error("帳號尚未完成電子郵件驗證或已停用。");
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) throw new Error("登入資料不完整。");
    onSuccess({ id: 0, email: data.user.email, name: String(data.user.user_metadata.name ?? "遊客") });
  }
  async function checkRegistrationEmail() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || activeMode !== "register") return true;
    const { data, error } = await supabase.rpc("is_registration_email_available", { p_email: normalized });
    const nextError = error || !data ? "此電子郵件已註冊，請改用其他電子郵件。" : "";
    setEmailError(nextError);
    emailInput.current?.setCustomValidity(nextError);
    if (nextError) emailInput.current?.reportValidity();
    return !nextError;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setIsLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (activeMode === "login") {
        const { data: authEmail, error: resolveError } = await supabase.rpc("resolve_login_auth_email", { p_login: normalized });
        if (resolveError || !authEmail) throw new Error("帳號或密碼錯誤，或帳號尚未啟用。");
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (error) throw error;
        await completeLogin(); return;
      }
      if (!(await checkRegistrationEmail())) return;
      if (password !== confirmPassword) {
        setConfirmPasswordError("兩次輸入的密碼不一致，請重新確認。");
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: normalized, password,
        options: { data: { name, nick_name: nickname, phone } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("帳號建立失敗。");
      const { error: passwordHashError } = await supabase.rpc("store_pending_registration_password_hash", {
        p_auth_user_id: data.user.id,
        p_email: normalized,
        p_password: password,
      });
      if (passwordHashError) throw new Error("帳號已建立，但密碼資料同步失敗，請聯絡管理員。");
      setVerificationEmail(normalized); setCode(""); setStage("verify-signup");
      setMessage("驗證碼已寄至你的電子信箱，請輸入信中的 6 位數驗證碼。\n若 1～2 分鐘未收到，請查看「垃圾郵件」或「促銷內容」資料夾。");
    } catch (error) { setMessage(errorMessage(error)); } finally { setIsLoading(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setIsLoading(true);
    try {
      const signup = stage === "verify-signup";
      const { error } = await supabase.auth.verifyOtp({ email: verificationEmail, token: code, type: signup ? "signup" : "recovery" });
      if (error) throw error;
      if (signup) { await completeLogin(); return; }
      setStage("new-password"); setNewPassword(""); setMessage("驗證成功，請設定新密碼。");
    } catch (error) { setMessage(errorMessage(error)); } finally { setIsLoading(false); }
  }
  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setIsLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(normalized);
      if (error) throw error;
      setVerificationEmail(normalized); setCode(""); setStage("verify-recovery");
      setMessage("若此信箱已註冊，驗證碼已寄出。請查看收件匣；若 1～2 分鐘未收到，也請查看垃圾郵件或促銷內容資料夾。");
    } catch (error) { setMessage(errorMessage(error)); } finally { setIsLoading(false); }
  }
  async function resend() {
    setIsLoading(true);
    try {
      const { error } = stage === "verify-signup"
        ? await supabase.auth.resend({ type: "signup", email: verificationEmail })
        : await supabase.auth.resetPasswordForEmail(verificationEmail);
      if (error) throw error;
      setMessage("新的驗證碼已寄出，請查看收件匣；若 1～2 分鐘未收到，也請查看垃圾郵件或促銷內容資料夾。");
    } catch (error) { setMessage(errorMessage(error)); } finally { setIsLoading(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      const { error: passwordHashError } = await supabase.rpc("update_current_user_password_hash", {
        p_password: newPassword,
      });
      if (passwordHashError) throw new Error("密碼已更新，但資料同步失敗，請聯絡管理員。");
      setStage("form"); setActiveMode("login"); setPassword(""); setMessage("密碼已更新，請使用新密碼登入。");
    } catch (error) { setMessage(errorMessage(error)); } finally { setIsLoading(false); }
  }
  function back() { setStage("form"); setActiveMode("login"); setMessage(""); setConfirmPassword(""); setConfirmPasswordError(""); }
  const verification = stage === "verify-signup" || stage === "verify-recovery";
  const tabClass = (tab: AuthMode) => "rounded-xl px-3 py-3 transition " + (activeMode === tab ? "bg-white text-orange-600 shadow-sm" : "text-stone-500");
  return <div className="space-y-5">
    {stage === "form" && <><div className="grid grid-cols-2 rounded-2xl bg-stone-100 p-1 text-sm font-bold">{(["login", "register"] as const).map((tab) => <button className={tabClass(tab)} key={tab} onClick={() => { setActiveMode(tab); setMessage(""); }} type="button">{tab === "login" ? "登入" : "註冊帳號"}</button>)}</div>
      <form className="space-y-4" onSubmit={submit}>{activeMode === "register" && <><Input onChange={(e) => setName(e.target.value)} placeholder="姓名" required value={name} /><Input onChange={(e) => setNickname(e.target.value)} placeholder="暱稱（排行榜顯示用）" required value={nickname} /><Input inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="手機號碼" required value={phone} /></>}<Input autoComplete={activeMode === "login" ? "username" : "email"} onBlur={() => void checkRegistrationEmail()} onChange={(e) => { setEmail(e.target.value); setEmailError(""); e.currentTarget.setCustomValidity(""); }} placeholder="電子郵件" ref={emailInput} required type={activeMode === "login" ? "text" : "email"} value={email} />{emailError && <p className="mt-[-8px] text-sm font-medium text-red-600">{emailError}</p>}<Input autoComplete={activeMode === "login" ? "current-password" : "new-password"} minLength={8} onChange={(e) => { const nextPassword = e.target.value; setPassword(nextPassword); if (confirmPassword) setConfirmPasswordError(confirmPassword === nextPassword ? "" : "兩次輸入的密碼不一致，請重新確認。"); }} placeholder={activeMode === "login" ? "密碼" : "密碼（至少 8 碼）"} required type="password" value={password} />{activeMode === "register" && <><Input autoComplete="new-password" minLength={8} onChange={(e) => { const nextConfirmation = e.target.value; setConfirmPassword(nextConfirmation); setConfirmPasswordError(nextConfirmation === password ? "" : "兩次輸入的密碼不一致，請重新確認。"); }} placeholder="再次輸入密碼" required type="password" value={confirmPassword} />{confirmPasswordError && <p className="mt-[-8px] text-sm font-medium text-red-600">{confirmPasswordError}</p>}</>}<Button className="h-14 w-full rounded-2xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600" disabled={isLoading} type="submit">{isLoading ? "處理中…" : activeMode === "login" ? "登入並開始" : "寄送郵件驗證碼"} {!isLoading && <ArrowRight className="size-5" />}</Button></form>{activeMode === "login" && <button className="w-full text-sm font-bold text-orange-600" onClick={() => { setStage("forgot-email"); setMessage(""); }} type="button">忘記密碼？</button>}</>}
    {stage === "forgot-email" && <form className="space-y-4" onSubmit={requestReset}><button className="flex items-center gap-1 text-sm font-bold text-stone-500" onClick={back} type="button"><ArrowLeft className="size-4" />返回登入</button><div><h3 className="text-xl font-black">忘記密碼</h3><p className="mt-1 text-sm leading-6 text-stone-500">輸入註冊信箱，我們會寄送重設密碼驗證碼。</p></div><Input autoComplete="email" onChange={(e) => setEmail(e.target.value)} placeholder="電子郵件" required type="email" value={email} /><Button className="h-14 w-full rounded-2xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600" disabled={isLoading} type="submit">寄送驗證碼</Button></form>}
    {verification && <form className="space-y-4" onSubmit={verify}><button className="flex items-center gap-1 text-sm font-bold text-stone-500" onClick={back} type="button"><ArrowLeft className="size-4" />返回登入</button><div className="rounded-2xl bg-orange-50 p-4 text-orange-800"><MailCheck className="size-7" /><h3 className="mt-3 text-xl font-black">輸入信箱驗證碼</h3><p className="mt-1 text-sm leading-6">驗證碼已寄至 {verificationEmail}</p><p className="mt-2 text-sm leading-6">若 1～2 分鐘未收到，請查看垃圾郵件或促銷內容資料夾。</p></div><Input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6 位數驗證碼" required value={code} /><Button className="h-14 w-full rounded-2xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600" disabled={isLoading} type="submit">確認驗證碼</Button><button className="w-full text-sm font-bold text-orange-600" disabled={isLoading} onClick={() => void resend()} type="button">重新寄送驗證碼</button></form>}
    {stage === "new-password" && <form className="space-y-4" onSubmit={changePassword}><div><h3 className="text-xl font-black">設定新密碼</h3><p className="mt-1 text-sm leading-6 text-stone-500">請設定至少 8 碼的新密碼。</p></div><Input autoComplete="new-password" minLength={8} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密碼（至少 8 碼）" required type="password" value={newPassword} /><Button className="h-14 w-full rounded-2xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600" disabled={isLoading} type="submit">更新密碼</Button></form>}
    {message && <p className="whitespace-pre-line rounded-xl bg-orange-50 px-3 py-3 text-sm leading-6 text-orange-800">{message}</p>}
    {stage === "form" && <p className="text-center text-xs leading-5 text-stone-400">註冊後須完成信箱驗證。密碼與驗證碼皆由 Supabase Auth 安全保存及驗證。</p>}
  </div>;
}
