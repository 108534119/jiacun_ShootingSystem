"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, Crosshair, Flag, Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { TargetPaper, type TargetShot } from "@/components/target-paper";

type LaneAvailability = "available" | "busy" | "offline" | "disabled";
type Lane = {
  id: number;
  target_name: string;
  address: string;
  state: boolean;
  last_seen_at: string | null;
  availability: LaneAvailability;
};
type GameSession = { session_id: number; lane_name: string; started_at: string };
const LANE_OFFLINE_AFTER_MS = 3_000;
const MAX_SHOTS = 30;

function scoreFromPoint(x: number, y: number) {
  const dx = x - 50;
  const dy = (y - 47) * 0.78;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 8) return 10;
  if (distance < 15) return 9;
  if (distance < 22) return 8;
  if (distance < 29) return 7;
  if (distance < 36) return 6;
  return 5;
}

function effectiveAvailability(lane: Lane, now: number): LaneAvailability {
  if (!lane.state) return "disabled";
  const lastSeen = lane.last_seen_at ? Date.parse(lane.last_seen_at) : Number.NaN;
  if (!Number.isFinite(lastSeen) || now - lastSeen > LANE_OFFLINE_AFTER_MS) return "offline";
  return lane.availability;
}

function laneStatus(lane: Lane, now: number) {
  const availability = effectiveAvailability(lane, now);
  if (availability === "available") return { label: "可使用", color: "text-emerald-600", icon: "text-emerald-500" };
  if (availability === "busy") return { label: "使用中", color: "text-orange-600", icon: "text-orange-500" };
  if (availability === "offline") return { label: "離線", color: "text-stone-500", icon: "text-stone-400" };
  return { label: "未開放", color: "text-stone-500", icon: "text-stone-400" };
}

function ShotScoreList({ shots }: { shots: TargetShot[] }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between"><h3 className="font-black text-stone-900">每發分數</h3><span className="text-sm font-bold text-stone-500">{shots.length} / {MAX_SHOTS} 發</span></div>
      {shots.length ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {shots.map((shot) => <div className="rounded-xl bg-stone-100 px-1 py-2 text-center" key={shot.number}><p className="text-[10px] text-stone-500">#{shot.number}</p><p className="text-base font-black text-orange-600">{shot.score}</p></div>)}
        </div>
      ) : <p className="mt-3 rounded-2xl bg-stone-100 px-3 py-4 text-center text-sm text-stone-500">等待第一發射擊資料…</p>}
    </div>
  );
}

export function PlayArea() {
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [shots, setShots] = useState<TargetShot[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ shots: number; score: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function loadLanes(showError = false) {
    const { data, error } = await supabase.rpc("list_playable_lanes");
    if (error) {
      if (showError) setNotice("目前無法讀取靶機資料，請確認已執行 Phase 3 靶機資料庫 SQL。");
      return;
    }
    setLanes((data ?? []) as Lane[]);
  }

  useEffect(() => {
    void loadLanes(true);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void loadLanes();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const totalScore = useMemo(() => shots.reduce((sum, shot) => sum + shot.score, 0), [shots]);
  const selectedIsAvailable = lanes.some((lane) => lane.id === selectedLane && effectiveAvailability(lane, now) === "available");

  async function startGame() {
    if (!selectedLane || !selectedIsAvailable) {
      setNotice("請先選擇一台目前可使用的靶機。");
      return;
    }
    setBusy(true);
    setNotice("");
    const { data, error } = await supabase.rpc("start_my_game_session", { p_lane_id: selectedLane });
    setBusy(false);
    if (error || !data?.[0]) {
      setNotice(error?.message || "這台靶機剛被其他玩家選擇，請改選其他靶機。");
      await loadLanes();
      return;
    }
    setSession(data[0] as GameSession);
    setShots([]);
    setFinished(null);
    await loadLanes();
  }

  async function recordTestShot() {
    if (!session || busy) return;
    if (shots.length >= MAX_SHOTS) {
      setNotice(`本場次最多 ${MAX_SHOTS} 發，請結束並保存本場成績。`);
      return;
    }
    setBusy(true);
    setNotice("");
    const number = shots.length + 1;
    const angle = number * 2.22;
    const radius = 7 + ((number * 11) % 33);
    const x = Math.max(8, Math.min(92, 50 + Math.cos(angle) * radius));
    const y = Math.max(11, Math.min(88, 47 + Math.sin(angle) * radius * 1.28));
    const score = scoreFromPoint(x, y);
    const lineShot = number % 5 === 0;
    const { error } = await supabase.rpc("record_my_game_shot", {
      p_session_id: session.session_id,
      p_shot_number: number,
      p_score_final: score,
      p_x_percent: x,
      p_y_percent: y,
      p_line_shot: lineShot,
      p_confidence: "HIGH",
      p_model_version: "V4.0",
    });
    setBusy(false);
    if (error) {
      setNotice(error.message || "儲存射擊資料失敗，請再試一次。");
      return;
    }
    setShots((current) => [...current, { number, score, x, y, lineShot }]);
  }

  async function finishGame() {
    if (!session) return;
    setBusy(true);
    setNotice("");
    const { data, error } = await supabase.rpc("finish_my_game_session", { p_session_id: session.session_id });
    setBusy(false);
    if (error || !data?.[0]) {
      setNotice(error?.message || "結束場次失敗，請再試一次。");
      return;
    }
    setFinished({ shots: data[0].total_shots, score: data[0].total_score });
    setSession(null);
    await loadLanes();
  }

  if (finished) {
    return (
      <section className="space-y-4">
        <div className="rounded-3xl bg-stone-900 p-6 text-center text-white">
          <Trophy className="mx-auto size-10 text-orange-300" />
          <p className="mt-4 text-sm text-stone-300">本場總分</p>
          <p className="mt-1 text-5xl font-black text-orange-300">{finished.score}</p>
          <p className="mt-2 text-sm">共 {finished.shots} 發</p>
        </div>
        <TargetPaper shots={shots} />
        <ShotScoreList shots={shots} />
        <Button className="h-12 w-full rounded-2xl bg-orange-500 hover:bg-orange-600" onClick={() => { setFinished(null); setShots([]); setSelectedLane(null); }} type="button">開始下一場</Button>
      </section>
    );
  }

  if (session) {
    const lastShot = shots.at(-1);
    return (
      <section className="space-y-4">
        <div className="rounded-3xl bg-stone-900 p-5 text-white">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-stone-400">正在使用</p><h2 className="text-xl font-black">{session.lane_name}</h2></div>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">場次進行中</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-stone-400">目前發數</p><p className="mt-1 text-2xl font-black">{shots.length} / {MAX_SHOTS}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-stone-400">單發分數</p><p className="mt-1 text-2xl font-black text-orange-300">{lastShot?.score ?? "—"}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-stone-400">累計分數</p><p className="mt-1 text-2xl font-black text-orange-300">{totalScore}</p></div>
          </div>
        </div>
        <TargetPaper shots={shots} />
        <ShotScoreList shots={shots} />
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-900"><Radio className="mb-2 size-4" />正式使用時，ESP32 會自動傳入每發射擊資料；目前保留測試入彈功能以便檢查畫面與資料庫。</div>
        <Button className="h-12 w-full rounded-2xl border border-stone-300 bg-white text-stone-900 hover:bg-stone-100" disabled={busy || shots.length >= MAX_SHOTS} onClick={() => void recordTestShot()} type="button">{shots.length >= MAX_SHOTS ? "已達本場次 30 發上限" : "測試入彈（保存一發）"}</Button>
        <Button className="h-12 w-full rounded-2xl bg-orange-500 hover:bg-orange-600" disabled={busy} onClick={() => void finishGame()} type="button"><Flag className="size-4" />結束並保存本場成績</Button>
        {notice && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{notice}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-stone-900 p-5 text-white">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-orange-500"><Crosshair /></div><div><p className="text-sm text-stone-300">立即開始</p><h2 className="text-xl font-black">選擇可用靶機</h2></div></div>
        <p className="mt-4 text-sm leading-6 text-stone-300">請先連線現場賈村 Wi‑Fi，再選擇顯示「可使用」的靶機開始遊玩；使用中的靶機請稍候。</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {lanes.map((lane) => {
          const selected = selectedLane === lane.id;
          const available = effectiveAvailability(lane, now) === "available";
          const status = laneStatus(lane, now);
          return (
            <button className={"rounded-3xl border p-4 text-left transition " + (selected ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200" : available ? "border-stone-200 bg-white" : "border-stone-200 bg-stone-100 opacity-60")} disabled={!available} key={lane.id} onClick={() => setSelectedLane(lane.id)} type="button">
              <div className="flex items-center justify-between"><CircleDot className={"size-5 " + status.icon} /><span className={"text-xs font-bold " + status.color}>{status.label}</span></div>
              <p className="mt-5 text-lg font-black text-stone-900">{lane.target_name}</p>
              <p className="mt-1 text-xs text-stone-500">{lane.address}</p>
            </button>
          );
        })}
      </div>
      {lanes.length === 0 && <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-600">尚未讀取到靶機資料。</p>}
      <Button className="h-13 w-full rounded-2xl bg-orange-500 text-base font-black hover:bg-orange-600" disabled={busy || !selectedIsAvailable} onClick={() => void startGame()} type="button">開始本場次</Button>
      {notice && <p className="flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-800"><CheckCircle2 className="size-4" />{notice}</p>}
    </section>
  );
}
