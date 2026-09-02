"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, PencilLine, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export type MemberProfile = {
  id: number;
  account: string;
  name: string;
  phone: string;
  nick_name: string;
  role_name: string;
  state: string;
};

function maskPhone(phone: string) {
  if (!phone) return "尚未設定";
  if (phone.length <= 3) return phone;
  return "*".repeat(Math.max(0, phone.length - 3)) + phone.slice(-3);
}

export function MemberArea({ onProfileLoaded }: { onProfileLoaded?: (profile: MemberProfile) => void }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneUnlockOpen, setPhoneUnlockOpen] = useState(false);
  const [phoneUnlocked, setPhoneUnlocked] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [phoneNotice, setPhoneNotice] = useState("");
  const [nicknameNotice, setNicknameNotice] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadProfile() {
    const { data, error } = await supabase.rpc("get_my_profile");
    if (error || !data?.[0]) {
      setNotice("暫時無法讀取會員資料，請確認已執行會員與遊玩專區 SQL。");
      return;
    }
    const next = data[0] as MemberProfile;
    setProfile(next); setPhone(next.phone ?? ""); setNickname(next.nick_name ?? "");
    onProfileLoaded?.(next);
  }

  useEffect(() => { void loadProfile(); }, []);

  async function saveNickname() {
    setSaving(true); setNicknameNotice("");
    const { data, error } = await supabase.rpc("update_my_profile", { p_phone: phone, p_nick_name: nickname });
    setSaving(false);
    if (error || !data?.[0]) { setNicknameNotice("暱稱更新失敗，請確認欄位已填寫。"); return; }
    const next = data[0] as MemberProfile;
    setProfile(next); onProfileLoaded?.(next); setNicknameNotice("暱稱已更新。");
  }

  async function verifyCurrentPassword(value: string) {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) {
      return "登入狀態已失效，請重新登入。";
    }
    const { error } = await supabase.auth.signInWithPassword({ email: data.user.email, password: value });
    if (error) {
      return "目前密碼錯誤，請重新輸入。";
    }
    return "";
  }

  async function unlockPhone() {
    if (!phonePassword) { setPhoneNotice("請先輸入目前密碼。"); return; }
    setSaving(true); setPhoneNotice("");
    const verificationError = await verifyCurrentPassword(phonePassword);
    setSaving(false);
    if (verificationError) { setPhoneNotice(verificationError); return; }
    setPhoneUnlocked(true); setPhoneUnlockOpen(false); setPhonePassword("");
    setPhoneNotice("已驗證目前密碼，現在可以查看與修改完整手機號碼。");
  }

  async function savePhone() {
    if (!phoneUnlocked) return;
    setSaving(true); setPhoneNotice("");
    const { data, error } = await supabase.rpc("update_my_profile", { p_phone: phone, p_nick_name: nickname });
    setSaving(false);
    if (error || !data?.[0]) { setPhoneNotice("手機號碼更新失敗，請稍後再試。"); return; }
    const next = data[0] as MemberProfile;
    setProfile(next); onProfileLoaded?.(next);
    setPhoneUnlocked(false); setPhoneNotice("手機號碼已更新。");
  }

  async function unlockPasswordChange() {
    if (!oldPassword) { setPasswordNotice("請先輸入舊密碼。"); return; }
    setSaving(true); setPasswordNotice("");
    const verificationError = await verifyCurrentPassword(oldPassword);
    setSaving(false);
    if (verificationError) { setPasswordNotice(verificationError); return; }
    setPasswordUnlocked(true); setOldPassword("");
    setPasswordNotice("舊密碼驗證成功，請設定新密碼。");
  }

  async function changePassword() {
    if (!passwordUnlocked) { setPasswordNotice("請先驗證舊密碼。"); return; }
    if (newPassword.length < 8) { setPasswordNotice("新密碼至少需要 8 碼。"); return; }
    if (newPassword !== confirmPassword) { setPasswordNotice("兩次輸入的新密碼不一致。"); return; }
    setSaving(true); setPasswordNotice("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      const { error: hashError } = await supabase.rpc("update_current_user_password_hash", { p_password: newPassword });
      if (hashError) { setSaving(false); setPasswordNotice("密碼已更新，但 users.password 同步失敗，請聯絡管理員。"); return; }
    }
    setSaving(false);
    if (error) { setPasswordNotice("密碼更新失敗，請稍後再試。"); return; }
    setNewPassword(""); setConfirmPassword(""); setPasswordUnlocked(false); setPasswordNotice("密碼已更新。");
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-stone-900 p-5 text-white">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-orange-500"><UserRound /></div><div><p className="text-sm text-stone-300">會員專區</p><h2 className="text-xl font-black">{profile?.nick_name || "讀取中…"}</h2></div></div>
      </div>
      {notice && <p className="flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-800"><CheckCircle2 className="size-4" />{notice}</p>}

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-700"><LockKeyhole className="size-4 text-orange-500" />使用者帳號</div>
        <p className="mt-3 break-all rounded-xl bg-stone-100 px-3 py-3 font-mono text-sm text-stone-800">{profile?.account ?? "載入中…"}</p>
        <p className="mt-2 text-xs text-stone-400">帳號由系統管理，無法修改。</p>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-stone-700"><Phone className="size-4 text-orange-500" />手機號碼</div><span className="text-sm text-stone-500">{profile ? maskPhone(profile.phone) : ""}</span></div>
        {!phoneUnlocked && !phoneUnlockOpen && <Button className="mt-4 h-11 w-full rounded-xl bg-stone-900" onClick={() => setPhoneUnlockOpen(true)} type="button">修改手機號碼</Button>}
        {phoneUnlockOpen && <div className="mt-4 rounded-2xl bg-orange-50 p-4"><p className="text-sm font-bold text-orange-900">請輸入目前密碼以查看及修改完整手機號碼</p><Input autoComplete="current-password" className="mt-3 bg-white" onChange={(event) => setPhonePassword(event.target.value)} placeholder="目前密碼" type="password" value={phonePassword} /><Button className="mt-3 h-10 w-full rounded-xl bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={() => void unlockPhone()} type="button">確認密碼</Button></div>}
        {phoneUnlocked && <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-800">已完成密碼驗證</p><Input className="mt-3 bg-white" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="完整手機號碼" value={phone} /><Button className="mt-3 h-10 w-full rounded-xl bg-stone-900" disabled={saving} onClick={() => void savePhone()} type="button">儲存手機號碼</Button></div>}
        {phoneNotice && <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm leading-5 text-orange-800"><CheckCircle2 className="size-4 shrink-0" />{phoneNotice}</p>}
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-700"><PencilLine className="size-4 text-orange-500" />暱稱</div>
        <Input className="mt-3" onChange={(event) => setNickname(event.target.value)} placeholder="排行榜顯示名稱" value={nickname} />
        <Button className="mt-4 h-11 w-full rounded-xl bg-stone-900" disabled={saving} onClick={() => void saveNickname()} type="button">儲存暱稱</Button>
        {nicknameNotice && <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm leading-5 text-orange-800"><CheckCircle2 className="size-4 shrink-0" />{nicknameNotice}</p>}
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-700"><KeyRound className="size-4 text-orange-500" />更改密碼</div>
        {!passwordUnlocked && <><p className="mt-3 text-sm leading-6 text-stone-500">為保護帳號安全，請先確認舊密碼。</p><Input autoComplete="current-password" className="mt-4" onChange={(event) => setOldPassword(event.target.value)} placeholder="舊密碼" type="password" value={oldPassword} /><Button className="mt-3 h-11 w-full rounded-xl bg-stone-900" disabled={saving} onClick={() => void unlockPasswordChange()} type="button">確認舊密碼</Button></>}
        {passwordUnlocked && <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-800">舊密碼驗證成功</p><Input autoComplete="new-password" className="mt-3 bg-white" minLength={8} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密碼（至少 8 碼）" type="password" value={newPassword} /><Input autoComplete="new-password" className="mt-3 bg-white" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次輸入新密碼" type="password" value={confirmPassword} /><Button className="mt-3 h-11 w-full rounded-xl bg-orange-500 hover:bg-orange-600" disabled={saving} onClick={() => void changePassword()} type="button">更新密碼</Button></div>}
        {passwordNotice && <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm leading-5 text-orange-800"><CheckCircle2 className="size-4 shrink-0" />{passwordNotice}</p>}
      </div>
    </section>
  );
}
