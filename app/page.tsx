"use client";

import { useEffect, useState } from "react";
import { Crosshair, History, LogOut, Play, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AuthPanel, type Account } from "@/components/auth-panel";
import { MemberArea, type MemberProfile } from "@/components/member-area";
import { GameHistory } from "@/components/game-history";
import { PlayArea } from "@/components/play-area";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register";
type DashboardTab = "play" | "history" | "member";

export default function Home() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardTab>("play");
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAccountEmail(session?.user.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  function openAuth(mode: AuthMode) {
    setAuthMode(mode); setDialogOpen(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null); setTab("play"); setSignOutOpen(false);
  }

  function handleAuthSuccess(account: Account) {
    setAccountEmail(account.email); setDialogOpen(false); setTab("play");
  }

  if (accountEmail) {
    return (
      <main className="min-h-dvh bg-stone-100 text-stone-900">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-stone-900 text-orange-300"><Crosshair className="size-5" /></div><div><p className="text-[10px] font-bold tracking-[.18em] text-orange-600">JIA CUN RANGE</p><p className="text-sm font-black">賈村戰技體驗場</p></div></div>
            <button aria-label="登出" className="grid size-10 place-items-center rounded-xl bg-stone-100 text-stone-600" onClick={() => setSignOutOpen(true)} type="button"><LogOut className="size-5" /></button>
          </div>
        </header>

        <div className="mx-auto max-w-md px-5 pb-28 pt-5">
          <div className="mb-5 flex gap-1 rounded-2xl bg-stone-200 p-1">
            <button className={"flex-1 rounded-xl px-2 py-3 text-xs font-black transition " + (tab === "play" ? "bg-white text-orange-600 shadow-sm" : "text-stone-500")} onClick={() => setTab("play")} type="button"><Play className="mr-1 inline size-4" />遊玩</button>
            <button className={"flex-1 rounded-xl px-2 py-3 text-xs font-black transition " + (tab === "history" ? "bg-white text-orange-600 shadow-sm" : "text-stone-500")} onClick={() => setTab("history")} type="button"><History className="mr-1 inline size-4" />紀錄</button>
            <button className={"flex-1 rounded-xl px-2 py-3 text-xs font-black transition " + (tab === "member" ? "bg-white text-orange-600 shadow-sm" : "text-stone-500")} onClick={() => setTab("member")} type="button"><UserRound className="mr-1 inline size-4" />會員</button>
          </div>
          {tab === "play" ? <PlayArea /> : tab === "history" ? <GameHistory /> : <MemberArea onProfileLoaded={setProfile} />}
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white px-5 py-3 text-center text-xs text-stone-400">
          {profile?.nick_name ? profile.nick_name + " · " : ""}安全射擊，請依現場人員指示操作
        </footer>
        <AlertDialog onOpenChange={setSignOutOpen} open={signOutOpen}>
          <AlertDialogContent className="w-[calc(100%-2.5rem)] rounded-3xl p-5">
            <AlertDialogHeader className="place-items-start text-left">
              <AlertDialogTitle className="text-lg font-black">確定要登出嗎？</AlertDialogTitle>
              <AlertDialogDescription className="text-left leading-6">登出後需要重新輸入帳號與密碼才能使用遊玩及會員功能。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2 -mx-5 -mb-5 rounded-b-3xl">
              <AlertDialogCancel className="h-11 rounded-xl">先不要</AlertDialogCancel>
              <AlertDialogAction className="h-11 rounded-xl bg-orange-500 hover:bg-orange-600" onClick={() => void signOut()}>確認登出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-stone-950 text-white">
      <section className="relative isolate min-h-dvh overflow-hidden">
        <div className="absolute inset-0 bg-[url('/shootingrange.jpeg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/85 via-stone-950/45 to-stone-950" />
        <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pb-10 pt-5 sm:px-8">
          <header className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl border border-white/20 bg-white/10"><Crosshair className="size-6 text-orange-300" /></div><div><p className="text-xs font-semibold tracking-[.16em] text-orange-200">JIA CUN RANGE</p><p className="text-sm font-bold">賈村戰技體驗場</p></div></header>
          <div className="mt-auto max-w-xl pb-10"><p className="mb-4 inline-flex rounded-full border border-orange-200/30 bg-orange-400/15 px-3 py-1.5 text-xs font-bold text-orange-100">定點射擊遊玩系統</p><h1 className="text-4xl font-black leading-[1.12] tracking-tight sm:text-6xl">瞄準目標，<br /><span className="text-orange-300">留下你的戰績。</span></h1><p className="mt-5 max-w-lg text-base leading-7 text-stone-200">登入後選擇靶機，查看即時落點與分數，並保存完整遊玩場次。</p><div className="mt-8 grid gap-3 sm:flex"><button className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 text-base font-black shadow-xl shadow-orange-950/40 hover:bg-orange-400" onClick={() => openAuth("login")} type="button"><Play className="size-5" />登入後開始</button><button className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-6 text-base font-bold backdrop-blur hover:bg-white/20" onClick={() => openAuth("register")} type="button"><UserRound className="size-5" />註冊帳號</button></div></div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl border border-white/15 bg-black/25 px-2 py-3 font-semibold text-stone-100">即時判分</div><div className="rounded-xl border border-white/15 bg-black/25 px-2 py-3 font-semibold text-stone-100">6 個靶位</div><div className="rounded-xl border border-white/15 bg-black/25 px-2 py-3 font-semibold text-stone-100">場次保存</div></div>
        </div>
      </section>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild><span className="hidden" /></DialogTrigger>
        <DialogContent className="bottom-0 top-auto w-full max-w-none translate-x-[-50%] translate-y-0 rounded-t-[2rem] border-stone-200 bg-white p-6 text-stone-900 sm:top-1/2 sm:max-w-md sm:translate-y-[-50%] sm:rounded-3xl">
          <DialogHeader><DialogTitle className="text-left text-2xl font-black">{authMode === "login" ? "歡迎回來" : "建立你的射擊帳號"}</DialogTitle></DialogHeader>
          <AuthPanel mode={authMode} onSuccess={handleAuthSuccess} />
        </DialogContent>
      </Dialog>
    </main>
  );
}
