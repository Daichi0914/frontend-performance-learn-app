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
  const [showExplanation, setShowExplanation] = useState(false);
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
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-sm animate-[shake_0.1s_linear_infinite]">
          <div className="text-center">
            <div className="mb-2 text-4xl animate-pulse">⚡</div>
            <div className="text-lg font-bold text-red-400 animate-pulse">
              Scavenge GC（マイナーGC）発生！
            </div>
            <div className="mt-1 text-sm text-red-300/70">
              メインスレッドが一時停止しています...
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        {/* ── タイトル ── */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-100">
            🗑️ ゴミ拾いの代償シミュレーター
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            世代別GC — New Space メモリタンク（{TANK_CAPACITY_MB}MB）
          </p>
        </div>

        {/* ── メモリタンクUI ── */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">
              New Space（若者部屋）
            </span>
            <span
              className={`text-sm font-mono font-bold ${getTankTextColor(memoryPercentage)}`}
            >
              {memoryUsedMB.toFixed(1)} / {TANK_CAPACITY_MB} MB
            </span>
          </div>

          {/* タンク本体: 高さで使用量を表現するプログレスバー */}
          <div
            className={`relative h-32 overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 shadow-lg ${getTankGlow(memoryPercentage)}`}
          >
            {/* メモリ使用量インジケーター（下から上へ伸びる） */}
            <div
              className={`absolute bottom-0 left-0 right-0 bg-linear-to-r ${getTankColor(memoryPercentage)} transition-all duration-500 ease-out`}
              style={{ height: `${memoryPercentage}%` }}
            >
              {/* 水面の波紋エフェクト */}
              <div className="absolute inset-x-0 top-0 h-1 bg-white/20" />
            </div>

            {/* パーセンテージ表示 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`text-2xl font-bold font-mono ${memoryPercentage > 50 ? "text-white" : getTankTextColor(memoryPercentage)}`}
              >
                {Math.round(memoryPercentage)}%
              </span>
            </div>

            {/* 目盛り線 */}
            <div className="absolute inset-0 pointer-events-none">
              {[25, 50, 75].map((level) => (
                <div
                  key={level}
                  className="absolute left-0 right-0 border-t border-dashed border-gray-600/30"
                  style={{ bottom: `${level}%` }}
                >
                  <span className="absolute right-1 -top-3 text-[10px] text-gray-600">
                    {level}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── データ件数スライダー ── */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="data-count-slider"
              className="text-xs font-medium text-gray-400"
            >
              データ件数
            </label>
            <span className="text-xs font-mono text-cyan-400">
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
            className="w-full accent-cyan-500"
          />
          <div className="mt-1 flex justify-between text-[10px] text-gray-600">
            <span>{DATA_COUNT_MIN.toLocaleString()}</span>
            <span>{DATA_COUNT_MAX.toLocaleString()}</span>
          </div>
        </div>

        {/* ── 実行ボタン群 ── */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button
            onClick={executeHighOrderChain}
            disabled={isProcessing || isGcTriggered}
            className="rounded-lg bg-red-600/20 px-4 py-3 text-sm font-bold text-red-400 transition-all hover:bg-red-600/30 hover:shadow-lg hover:shadow-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="block text-lg mb-1">🔗</span>
            高階関数チェーン実行
            <span className="block text-[10px] mt-1 font-normal text-red-400/60">
              .map().filter().reduce()
            </span>
          </button>

          <button
            onClick={executeOptimizedCode}
            disabled={isProcessing || isGcTriggered}
            className="rounded-lg bg-green-600/20 px-4 py-3 text-sm font-bold text-green-400 transition-all hover:bg-green-600/30 hover:shadow-lg hover:shadow-green-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="block text-lg mb-1">⚡</span>
            最適化コード実行
            <span className="block text-[10px] mt-1 font-normal text-green-400/60">
              for ループ + in-place
            </span>
          </button>
        </div>

        {/* ── 実行結果表示 ── */}
        {lastResult && (
          <div
            className={`mb-4 rounded-lg border px-4 py-2 text-sm font-mono ${
              isOptimized
                ? "border-green-700/50 bg-green-900/20 text-green-400"
                : "border-gray-700 bg-gray-800/50 text-gray-300"
            }`}
          >
            {isOptimized && (
              <span className="mr-2">✅ メモリ安定 —</span>
            )}
            {lastResult}
          </div>
        )}

        {/* ── 学習解説トグル ── */}
        <div className="border-t border-gray-800 pt-4">
          <button
            onClick={() => setShowExplanation((previous) => !previous)}
            className="flex w-full items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <span>📖 なぜGCが発生するのか？ — 技術解説</span>
            <span
              className={`transition-transform duration-200 ${showExplanation ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>

          {showExplanation && (
            <div className="mt-3 space-y-4 rounded-lg border border-gray-800 bg-gray-800/30 px-4 py-4 text-xs leading-relaxed text-gray-300">
              {/* 非効率パターンの解説 */}
              <div>
                <h3 className="mb-2 font-bold text-red-400">
                  ❌ .map().filter().reduce() チェーンの問題
                </h3>
                <p className="mb-2">
                  高階関数チェーンは可読性が高い反面、
                  <strong className="text-white">
                    各メソッドが新しい配列を生成する
                  </strong>
                  という代償があります。
                </p>
                <div className="rounded-md bg-gray-900 p-3 font-mono text-red-300/80">
                  <div className="text-gray-500">
                    {"//"} 100,000要素の場合:
                  </div>
                  <div>
                    array
                    <span className="text-yellow-400">.map()</span>{" "}
                    <span className="text-gray-500">
                      {"// "}→ 中間配列1（800KB）
                    </span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="text-yellow-400">.filter()</span>{" "}
                    <span className="text-gray-500">
                      {"// "}→ 中間配列2（~400KB）
                    </span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="text-yellow-400">.reduce()</span>{" "}
                    <span className="text-gray-500">
                      {"// "}→ 最終値
                    </span>
                  </div>
                </div>
                <p className="mt-2">
                  V8のNew Space（若い世代のヒープ、通常1〜8MB）が溢れると
                  <strong className="text-red-400">
                    Scavenge GC（マイナーGC）
                  </strong>
                  が発動し、メインスレッドが
                  <strong className="text-white">数ms〜数十ms停止</strong>
                  します。高頻度に発生するとフレーム落ち（ジャンク）の原因になります。
                </p>
              </div>

              {/* 最適化パターンの解説 */}
              <div>
                <h3 className="mb-2 font-bold text-green-400">
                  ✅ for ループ + in-place操作の利点
                </h3>
                <p className="mb-2">
                  単一ループで条件分岐と集計を同時に行えば、
                  <strong className="text-white">
                    中間配列が一切生成されない
                  </strong>
                  ためGC圧力はゼロです。
                </p>
                <div className="rounded-md bg-gray-900 p-3 font-mono text-green-300/80">
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
                <p className="mt-2">
                  パフォーマンスクリティカルなパス（アニメーション、大量データ処理）
                  では、可読性よりもGC圧力の低減を優先すべきです。
                  Object Poolパターンとの組み合わせで、ゼロアロケーション処理も実現できます。
                </p>
              </div>

              {/* V8 GCの仕組み */}
              <div>
                <h3 className="mb-2 font-bold text-cyan-400">
                  🧠 V8の世代別GCとは
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-gray-400">
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
          )}
        </div>
      </div>

      {/* ── 振動アニメーション用のインラインkeyframes ──
           Tailwind v4ではarbitrary animationがサポートされるが、
           shakeのような複雑なkeyframeはstyleタグで定義する方が明確 */}
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
