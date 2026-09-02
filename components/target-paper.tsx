"use client";

export type TargetShot = {
  number: number;
  score: number;
  x: number;
  y: number;
  lineShot?: boolean;
};

export function TargetPaper({ shots }: { shots: TargetShot[] }) {
  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-sm bg-white shadow-[0_15px_35px_rgba(0,0,0,.22)]">
      <img alt="30 × 40 cm 黑白交替射擊靶紙" className="pointer-events-none absolute inset-0 size-full object-cover" src="/target-paper-v4.png" />

      {shots.map((shot) => (
        <div
          aria-label={`第 ${shot.number} 發，${shot.score} 分${shot.lineShot ? "，壓線" : ""}`}
          className="absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-orange-500 text-[11px] font-black text-white shadow-md"
          key={shot.number}
          style={{ left: `${shot.x}%`, top: `${shot.y}%` }}
          title={`第 ${shot.number} 發：${shot.score} 分`}
        >
          {shot.number}
          {shot.lineShot && <span className="absolute -inset-1 rounded-full border-2 border-orange-300" />}
        </div>
      ))}
    </div>
  );
}
