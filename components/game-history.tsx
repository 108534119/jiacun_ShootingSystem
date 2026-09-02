"use client";

import { useEffect, useState } from "react";
import { Clock3, History, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";

type GameHistoryItem = {
  session_id: number;
  lane_name: string;
  started_at: string;
  ended_at: string | null;
  total_shots: number;
  total_score: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function GameHistory() {
  const [items, setItems] = useState<GameHistoryItem[]>([]);
  const [notice, setNotice] = useState("載入中…");

  useEffect(() => {
    async function loadHistory() {
      const { data, error } = await supabase.rpc("list_my_game_history");
      if (error) {
        setNotice("目前無法讀取紀錄，請確認已執行最新 Phase 3 資料庫 SQL。");
        return;
      }
      const next = (data ?? []) as GameHistoryItem[];
      setItems(next);
      setNotice(next.length ? "" : "近三個月尚無已完成的遊玩紀錄。完成一場射擊後，成績會顯示在這裡。");
    }
    void loadHistory();
  }, []);

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-stone-900 p-5 text-white">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-orange-500"><History className="size-5" /></div><div><p className="text-sm text-stone-300">我的戰績</p><h2 className="text-xl font-black">最近三個月遊玩紀錄</h2></div></div>
        <p className="mt-4 text-sm leading-6 text-stone-300">只顯示已完成的場次，分數與發數皆以結束場次時保存的結果為準。</p>
      </div>
      {items.map((item) => (
        <article className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm" key={item.session_id}>
          <div className="flex items-start justify-between gap-3"><div><p className="font-black text-stone-900">{item.lane_name}</p><p className="mt-1 flex items-center gap-1 text-xs text-stone-500"><Clock3 className="size-3.5" />{formatDate(item.started_at)}</p></div><div className="rounded-2xl bg-orange-50 px-3 py-2 text-right"><p className="text-[11px] font-bold text-orange-700">本場總分</p><p className="text-2xl font-black text-orange-600">{item.total_score}</p></div></div>
          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-sm"><span className="text-stone-500">完成 {item.total_shots} / 30 發</span><span className="flex items-center gap-1 font-bold text-stone-800"><Trophy className="size-4 text-orange-500" />最高 300 分</span></div>
        </article>
      ))}
      {notice && <p className="rounded-2xl bg-stone-100 px-4 py-4 text-sm leading-6 text-stone-600">{notice}</p>}
    </section>
  );
}
