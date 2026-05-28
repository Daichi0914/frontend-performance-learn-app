"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ─── 型定義 ───────────────────────────────────────────────
interface GarbageCollectionSimulatorProps {
  onLongTask?: (durationMs: number, taskName: string) => void;
}

/** New Spaceタンクの最大容量（MB） */
const TANK_CAPACITY_MB = 32;

/** Long Taskの閾値（ブラウザ標準の50ms） */
const LONG_TASK_THRESHOLD_MS = 50;

/** GC発生後のフリーズ演出時間（ms） */
const GC_FREEZE_DURATION_MS = 800;

/** GCフリーズ後のリセットまでの待機時間（ms） */
const GC_RESET_DELAY_MS = 300;

/** スライダーの最小・最大データ件数 */
const DATA_COUNT_MIN = 1000;
const DATA_COUNT_MAX = 100_000;
const DATA_COUNT_STEP = 1000;

// ─── ヘルパー ─────────────────────────────────────────────

/** データ件数からメモリ増加量（MB）を算出する近似式
 *  実際のV8では中間配列1つあたり8byte×要素数だが、
 *  シミュレーター上では体感的にちょうどよいスケーリングにしている */
function estimateMemoryIncreaseMB(dataCount: number): number {
  // .map().filter().reduce()で3つの中間配列が生成される想定
  const intermediateArrays = 3;
  const bytesPerElement = 8;
  const totalBytes = dataCount * intermediateArrays * bytesPerElement;
  const totalMB = totalBytes / (1024 * 1024);
  // タンク容量に対して2〜100%程度の増加にスケーリング
  return Math.min(totalMB * 4, TANK_CAPACITY_MB);
}

/** メモリ使用率に応じたタンクカラーを返す */
function getTankColor(percentage: number): string {
  if (percentage <= 33) return "from-green-500 to-green-400";
  if (percentage <= 66) return "from-yellow-500 to-yellow-400";
  return "from-red-500 to-red-400";
}

/** メモリ使用率に応じたテキストカラーを返す */
function getTankTextColor(percentage: number): string {
  if (percentage <= 33) return "text-green-400";
  if (percentage <= 66) return "text-yellow-400";
  return "text-red-400";
}

/** メモリ使用率に応じたグロー（発光）エフェクトを返す */
function getTankGlow(percentage: number): string {
  if (percentage <= 33) return "shadow-green-500/20";
  if (percentage <= 66) return "shadow-yellow-500/20";
  return "shadow-red-500/30";
}

// ─── コンポーネント ───────────────────────────────────────
export default function GarbageCollectionSimulator({
  onLongTask,
}: GarbageCollectionSimulatorProps) {
  const [memoryUsedMB, setMemoryUsedMB] = useState(0);
  const [dataCount, setDataCount] = useState(10_000);
  const [isGcTriggered, setIsGcTriggered] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // GCアニメーション中のタイマーID（クリーンアップ用）
  const gcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // コンポーネントのアンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (gcTimerRef.current) clearTimeout(gcTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const memoryPercentage = Math.min(
    (memoryUsedMB / TANK_CAPACITY_MB) * 100,
    100
  );

  /** GC発生の演出をトリガーする
   *  タンクが100%に達した瞬間にフリーズオーバーレイ＋振動を表示し、
   *  一定時間後にタンクをリセットする */
  const triggerGarbageCollection = useCallback(() => {
    setIsGcTriggered(true);

    gcTimerRef.current = setTimeout(() => {
      setIsGcTriggered(false);
      // リセットまで少し間を空けることで「GC後の回復」を体感させる
      resetTimerRef.current = setTimeout(() => {
        setMemoryUsedMB(0);
      }, GC_RESET_DELAY_MS);
    }, GC_FREEZE_DURATION_MS);
  }, []);

  /** 高階関数チェーン実行: .map().filter().reduce() を多段に繋いで
   *  意図的に大量の中間配列（ゴミ）を生成する非効率パターン */
  const executeHighOrderChain = useCallback(() => {
    if (isProcessing) return;
    setIsProcessing(true);
    setIsOptimized(false);

    const startTime = performance.now();

    // 巨大配列を生成し、高階関数チェーンで中間配列を3つ生成
    const sourceArray = Array.from({ length: dataCount }, (_, index) => ({
      value: Math.random() * 1000,
      id: index,
    }));

    // map → 新しい配列(中間配列1)
    // filter → 新しい配列(中間配列2)
    // reduce → 最終値
    const result = sourceArray
      .map((item) => ({
        ...item,
        computed: item.value * 2 + Math.sqrt(item.value),
      }))
      .filter((item) => item.computed > 500)
      .reduce((accumulator, item) => accumulator + item.computed, 0);

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // DCE（Dead Code Elimination）回避: 計算結果を画面に表示
    setLastResult(
      `合計: ${result.toLocaleString("ja-JP", { maximumFractionDigits: 2 })} (${durationMs}ms)`
    );

    // メモリタンクの増加アニメーション
    const memoryIncrease = estimateMemoryIncreaseMB(dataCount);
    const newMemory = Math.min(
      memoryUsedMB + memoryIncrease,
      TANK_CAPACITY_MB
    );
    setMemoryUsedMB(newMemory);

    // タンクが溢れたらGCを発生させる
    if (newMemory >= TANK_CAPACITY_MB) {
      triggerGarbageCollection();
    }

    // Long Task通知（50ms以上の処理を外部に報告）
    if (durationMs >= LONG_TASK_THRESHOLD_MS && onLongTask) {
      onLongTask(durationMs, "高階関数チェーン実行");
    }

    setIsProcessing(false);
  }, [
    dataCount,
    memoryUsedMB,
    onLongTask,
    triggerGarbageCollection,
    isProcessing,
  ]);

  /** 最適化コード実行: forループ1回で全処理を完結させる
   *  中間配列を一切生成しないため、メモリタンクは増加しない */
  const executeOptimizedCode = useCallback(() => {
    if (isProcessing) return;
    setIsProcessing(true);
    setIsOptimized(true);

    const startTime = performance.now();

    // 破壊的操作＋単一ループで中間配列ゼロの処理
    const sourceArray = Array.from({ length: dataCount }, (_, index) => ({
      value: Math.random() * 1000,
      id: index,
    }));

    let result = 0;
    for (let i = 0; i < sourceArray.length; i++) {
      const computed =
        sourceArray[i].value * 2 + Math.sqrt(sourceArray[i].value);
      if (computed > 500) {
        result += computed;
      }
    }

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    setLastResult(
      `合計: ${result.toLocaleString("ja-JP", { maximumFractionDigits: 2 })} (${durationMs}ms)`
    );

    // メモリは増加しない — 最適化の効果を可視化

    if (durationMs >= LONG_TASK_THRESHOLD_MS && onLongTask) {
      onLongTask(durationMs, "最適化コード実行");
    }

    setIsProcessing(false);
  }, [dataCount, onLongTask, isProcessing]);

  return (
    <div className="relative">
      {/* ── GCフリーズオーバーレイ ── */}
      {isGcTriggered && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-xs animate-[shake_0.1s_linear_infinite] border border-red-500/20">
          <div className="text-center p-6 bg-slate-950/90 rounded-2xl border border-red-500/30 shadow-2xl">
            <div className="mb-2 text-4xl animate-bounce">⚡</div>
            <div className="text-lg font-bold text-red-400 animate-pulse">
              Scavenge GC（マイナーGC）発生！
            </div>
            <div className="mt-1 text-xs text-red-300/70">
              Stop-The-World: メインスレッドが一時停止しています...
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900/10 backdrop-blur-md border border-slate-800/60 rounded-2xl p-10 md:p-14 shadow-xl shadow-slate-950/20 transition-all duration-300 flex-1 flex flex-col justify-between">
        {/* 2カラムレイアウトコンテナ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
          
          {/* 左カラム：説明用のコンポーネント */}
          <div className="lg:col-span-5 flex flex-col space-y-8">
            <div className="space-y-6">
              {/* ヘッダー */}
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.05)]">
                  <span className="text-xl filter drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">🗑️</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                    Garbage Collection
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tracking-wider uppercase mt-1 leading-none">V8 Memory Simulator</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                世代別GC（Scavenge GC）と、メモリ割り当ての最適化によるパフォーマンスへの影響を比較します。
              </p>
            </div>

            {/* 技術解説（開閉なしで常時表示） */}
            <div className="flex-1 border border-slate-800/80 rounded-2xl bg-slate-950/20 backdrop-blur-sm p-8 space-y-8 text-sm text-slate-300 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800 font-sans">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
                📖 なぜGCが発生するのか？ — 技術解説
              </h3>

              {/* 非効率パターンの解説 */}
              <div className="space-y-3.5">
                <h4 className="font-bold text-red-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> ❌ .map().filter().reduce() チェーンの問題
                </h4>
                <p className="text-slate-400 leading-relaxed text-xs">
                  高階関数チェーンは可読性が高い反面、
                  <strong className="text-white font-semibold">各メソッドが新しい配列を生成する</strong>
                  という代償があります。
                </p>
                <div className="rounded-xl bg-slate-950/80 border border-slate-800/60 p-4 font-mono text-red-300/80 text-xs leading-relaxed">
                  <div className="text-slate-500">
                    {"//"} 100,000要素の場合:
                  </div>
                  <div>
                    array
                    <span className="text-yellow-400">.map()</span>{" "}
                    <span className="text-slate-500">
                      {"// "}→ 中間配列1（800KB）
                    </span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="text-yellow-400">.filter()</span>{" "}
                    <span className="text-slate-500">
                      {"// "}→ 中間配列2（~400KB）
                    </span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="text-yellow-400">.reduce()</span>{" "}
                    <span className="text-slate-500">
                      {"// "}→ 最終値
                    </span>
                  </div>
                </div>
                <p className="text-slate-400 leading-relaxed text-xs mt-3.5">
                  V8のNew Space（若い世代のヒープ、通常1〜8MB）が溢れると
                  <strong className="text-red-400">Scavenge GC（マイナーGC）</strong>
                  が発動し、メインスレッドが
                  <strong className="text-white">数ms〜数十ms停止（Stop-The-World）</strong>
                  します。高頻度に発生するとフレーム落ち（ジャンク）の原因になります。
                </p>
              </div>

              {/* 最適化パターンの解説 */}
              <div className="space-y-3.5">
                <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ✅ for ループ + in-place操作の利点
                </h4>
                <p className="text-slate-400 leading-relaxed text-xs">
                  単一ループで条件分岐と集計を同時に行えば、
                  <strong className="text-white font-semibold">中間配列が一切生成されない</strong>
                  ためGC圧力はゼロです。
                </p>
                <div className="rounded-xl bg-slate-950/80 border border-slate-800/60 p-4 font-mono text-emerald-300/80 text-xs leading-relaxed">
                  <div>
                    <span className="text-cyan-400">for</span> (
                    <span className="text-cyan-400">let</span> i = 0; i
                    &lt; array.length; i++) {"{"}
                  </div>
                  <div>
                    &nbsp;&nbsp;
                    <span className="text-cyan-400">const</span> computed
                    = transform(array[i]);
                  </div>
                  <div>
                    &nbsp;&nbsp;
                    <span className="text-cyan-400">if</span> (computed
                    &gt; threshold) result += computed;
                  </div>
                  <div>{"}"}</div>
                </div>
                <p className="text-slate-400 leading-relaxed text-xs mt-3.5">
                  パフォーマンスクリティカルなパス（アニメーション、大量データ処理）
                  では、可読性よりもGC圧力の低減を優先すべきです。
                  Object Poolパターンとの組み合わせで、ゼロアロケーション処理も実現できます。
                </p>
              </div>

              {/* V8 GCの仕組み */}
              <div className="space-y-3.5 pb-2">
                <h4 className="font-bold text-indigo-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> 🧠 V8の世代別GCとは
                </h4>
                <ul className="list-disc list-inside text-slate-400 space-y-2.5 ml-2 text-xs leading-relaxed">
                  <li>
                    <strong className="text-white">New Space（Young Generation）</strong>
                    : 新しく確保されたオブジェクトが置かれる。容量が小さく、溢れると
                    <em>Scavenge GC</em>が走る（数ms）。
                  </li>
                  <li>
                    <strong className="text-white">Old Space（Old Generation）</strong>
                    : Scavengeを2回生き残ったオブジェクトが昇格。溢れると
                    <em>Mark-Sweep/Compact GC（メジャーGC）</em>
                    が走る（数十ms〜数百ms）。
                  </li>
                  <li>
                    中間配列は関数の戻り値取得後すぐに不要になるため、
                    New Spaceを高速に消費する「短命オブジェクト」の典型例。
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 右カラム：実行エリア（上）と実行結果表示エリア（下） */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            
            {/* 実行エリア (コントロールパネル) */}
            <div className="space-y-8 bg-slate-950/40 rounded-2xl p-8 md:p-10 border border-slate-900/80 shadow-inner flex flex-col">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="text-red-400">⚙️</span> Control Panel
                </h3>
              </div>

              {/* データ件数スライダー */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="data-count-slider"
                    className="text-sm font-bold text-slate-400 uppercase tracking-wider"
                  >
                    データ件数
                  </label>
                  <span className="text-base font-mono text-cyan-400 font-bold">
                    {dataCount.toLocaleString("ja-JP")} 件
                  </span>
                </div>
                <input
                  id="data-count-slider"
                  type="range"
                  min={DATA_COUNT_MIN}
                  max={DATA_COUNT_MAX}
                  step={DATA_COUNT_STEP}
                  value={dataCount}
                  onChange={(event) => setDataCount(Number(event.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-600 font-mono">
                  <span>{DATA_COUNT_MIN.toLocaleString()}</span>
                  <span>{DATA_COUNT_MAX.toLocaleString()}</span>
                </div>
              </div>

              {/* 実行ボタン群 */}
              <div className="grid grid-cols-2 gap-6">
                <button
                  type="button"
                  onClick={executeHighOrderChain}
                  disabled={isProcessing || isGcTriggered}
                  className="rounded-xl bg-gradient-to-r from-red-600/10 to-red-500/5 hover:from-red-600/20 hover:to-red-500/10 border border-red-500/20 px-6 py-4.5 text-sm font-bold text-red-400 transition-all hover:shadow-lg hover:shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 text-center flex flex-col items-center justify-center"
                >
                  <span className="block text-2xl mb-2">🔗</span>
                  高階関数チェーン実行
                  <span className="block text-[10px] mt-1.5 font-normal text-red-400/60 font-mono">
                    .map().filter().reduce()
                  </span>
                </button>

                <button
                  type="button"
                  onClick={executeOptimizedCode}
                  disabled={isProcessing || isGcTriggered}
                  className="rounded-xl bg-gradient-to-r from-emerald-600/10 to-emerald-500/5 hover:from-emerald-600/20 hover:to-emerald-500/10 border border-emerald-500/20 px-6 py-4.5 text-sm font-bold text-emerald-400 transition-all hover:shadow-lg hover:shadow-emerald-500/5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 text-center flex flex-col items-center justify-center"
                >
                  <span className="block text-2xl mb-2">⚡</span>
                  最適化コード実行
                  <span className="block text-[10px] mt-1.5 font-normal text-emerald-400/60 font-mono">
                    for ループ + in-place
                  </span>
                </button>
              </div>
            </div>

            {/* 実行結果表示エリア (メモリタンク、メトリクス結果) */}
            <div className="space-y-8 bg-slate-950/40 rounded-2xl p-8 md:p-10 border border-slate-900/80 shadow-inner flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="text-emerald-400">📊</span> Metrics &amp; Heap Tank
                </h3>
              </div>

              {/* メモリタンクUI */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                    New Space (若者部屋)
                  </span>
                  <span
                    className={`text-base font-mono font-bold ${getTankTextColor(memoryPercentage)}`}
                  >
                    {memoryUsedMB.toFixed(1)} / {TANK_CAPACITY_MB} MB
                  </span>
                </div>

                {/* タンク本体 */}
                <div
                  className={`relative h-32 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/60 shadow-lg ${getTankGlow(memoryPercentage)}`}
                >
                  {/* メモリ使用量インジケーター（下から上へ伸びる） */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 bg-linear-to-r ${getTankColor(memoryPercentage)} transition-all duration-500 ease-out`}
                    style={{ height: `${memoryPercentage}%` }}
                  >
                    {/* 水面の波紋エフェクト */}
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-white/20" />
                  </div>

                  {/* パーセンテージ表示 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-3xl font-black font-mono ${memoryPercentage > 50 ? "text-white" : getTankTextColor(memoryPercentage)}`}
                    >
                      {Math.round(memoryPercentage)}%
                    </span>
                  </div>

                  {/* 目盛り線 */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[25, 50, 75].map((level) => (
                      <div
                        key={level}
                        className="absolute left-0 right-0 border-t border-dashed border-slate-800/30"
                        style={{ bottom: `${level}%` }}
                      >
                        <span className="absolute right-2.5 -top-3 text-[10px] text-slate-600 font-mono">
                          {level}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 実行結果表示 */}
              {lastResult && (
                <div
                  className={`rounded-xl border px-6 py-4 text-xs md:text-sm font-mono transition-all duration-300 leading-relaxed ${
                    isOptimized
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                      : "border-slate-800 bg-slate-950/60 text-slate-300"
                  }`}
                >
                  {isOptimized ? (
                    <span className="mr-2">✨ メモリ安定（アロケーションフリー） —</span>
                  ) : (
                    <span className="mr-2">⚠️ 中間オブジェクト生成量: +{estimateMemoryIncreaseMB(dataCount).toFixed(1)}MB —</span>
                  )}
                  {lastResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 振動アニメーション用のインラインkeyframes ── */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-3px, 2px); }
          50% { transform: translate(3px, -2px); }
          75% { transform: translate(-2px, -3px); }
        }
      `}</style>
    </div>
  );
}
