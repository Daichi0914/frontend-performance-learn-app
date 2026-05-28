"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================
// 型定義
// ============================================================

interface JitSimulatorProps {
  onLongTask?: (durationMs: number, taskName: string) => void;
}

/** JITエンジンの内部状態を表現する4段階 */
type JitStage = "interpreter" | "baseline" | "top-tier" | "deoptimized";

/** 型モード：単一形 or 多角形 */
type TypeMode = "monomorphic" | "polymorphic";

/** 実行時間の計測結果 */
interface ExecutionRecord {
  readonly executionCount: number;
  readonly durationMs: number;
  readonly timestamp: number;
}

/** 各ステータスカードの定義 */
interface StageDefinition {
  readonly id: JitStage;
  readonly label: string;
  readonly icon: string;
  readonly colorClass: string;
  readonly glowColor: string;
  readonly description: string;
}

// ============================================================
// 定数定義
// ============================================================

/** JIT最適化の閾値 */
const BASELINE_THRESHOLD = 100;
const TOPTIER_THRESHOLD = 1000;

/** 実行時間履歴の最大保持数 */
const MAX_HISTORY_LENGTH = 10;

/** 脱最適化フラッシュの表示時間（ms） */
const DEOPT_FLASH_DURATION_MS = 500;

/** 脱最適化時の振動アニメーション時間（ms） */
const DEOPT_SHAKE_DURATION_MS = 600;

/** 各ステータスの定義マップ */
const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  {
    id: "interpreter",
    label: "Interpreter",
    icon: "🐢",
    colorClass: "border-slate-800 bg-slate-950/20",
    glowColor: "shadow-slate-500/5",
    description:
      "コードを順次実行中。最も低速だが、型情報（Feedback Vector）を収集している段階。",
  },
  {
    id: "baseline",
    label: "Baseline JIT",
    icon: "🔥",
    colorClass: "border-amber-500/40 bg-amber-500/5",
    glowColor: "shadow-amber-500/10",
    description:
      "頻繁に実行される関数をベースラインJITコンパイル。中程度の最適化が適用されている。",
  },
  {
    id: "top-tier",
    label: "Top-tier JIT",
    icon: "⚡",
    colorClass: "border-emerald-500/40 bg-emerald-500/5",
    glowColor: "shadow-emerald-500/15",
    description:
      "TurboFan級の最適化コンパイル完了！型が固定され、極限まで最適化された機械語を実行中。",
  },
  {
    id: "deoptimized",
    label: "Deoptimization",
    icon: "💥",
    colorClass: "border-rose-500/40 bg-rose-500/5",
    glowColor: "shadow-rose-500/15",
    description: "動的型の変化（多態性）を検知し、投機的最適化を解除。インタープリタへ退行。",
  },
] as const;

/** 脱最適化時に表示する詳細技術解説 */
const DEOPT_EXPLANATION = `💥 脱最適化（Deoptimization）発生！
V8エンジンはTop-tier JITコンパイル時に「この関数の引数は常にnumber型である」という投機的仮定（Type Speculation）を立てて最適化しました。
しかし、string型の引数が渡されたことで仮定チェック（Guard Check）が失敗。
エンジンは最適化済みの機械語を破棄し、Interpreterモードに退行しました。
これがPolymorphicコード（多態的コード）が危険な理由です。
Hidden Class of 遷移が複数発生し、Inline Cache（IC）がMegamorphic状態に陥ると、以降の最適化が困難になります。`;

// ============================================================
// 内部用サブコンポーネント
// ============================================================

/** JIT状態を示す4枚のカード */
function StageCard({
  definition,
  isActive,
  isPulsing,
  isOptimized,
}: {
  readonly definition: StageDefinition;
  readonly isActive: boolean;
  readonly isPulsing: boolean;
  readonly isOptimized: boolean;
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border p-5 md:p-6 transition-all duration-300
        ${
          isActive
            ? `${definition.colorClass} ${definition.glowColor} shadow-lg`
            : "border-slate-900/60 bg-slate-950/10 opacity-30"
        }
        ${isPulsing && isActive ? "animate-pulse" : ""}
      `}
    >
      {/* Top-tier JIT のとき、揺らめくグラデーション背景 */}
      {isOptimized && isActive && (
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background:
              "linear-gradient(45deg, #10b981, #059669, #34d399, #10b981)",
            backgroundSize: "300% 300%",
            animation: "shimmer 3s ease-in-out infinite",
          }}
        />
      )}

      {/* パーティクル風エフェクト（Top-tier JIT時） */}
      {isOptimized && isActive && (
        <>
          <div
            className="absolute w-1.5 h-1.5 bg-emerald-400 rounded-full opacity-60 pointer-events-none"
            style={{
              top: "20%",
              left: "10%",
              animation: "float-particle 2.5s ease-in-out infinite",
            }}
          />
          <div
            className="absolute w-1.5 h-1.5 bg-green-300 rounded-full opacity-40 pointer-events-none"
            style={{
              top: "60%",
              right: "15%",
              animation: "float-particle 3.2s ease-in-out infinite 0.8s",
            }}
          />
          <div
            className="absolute w-2 h-2 bg-emerald-300 rounded-full opacity-30 pointer-events-none"
            style={{
              bottom: "15%",
              left: "40%",
              animation: "float-particle 2.8s ease-in-out infinite 1.4s",
            }}
          />
        </>
      )}

      <div className="relative z-10">
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="text-2xl">{definition.icon}</span>
          <span className="text-base font-bold text-white/90">
            {definition.label}
          </span>
        </div>
        {definition.description && (
          <p className="text-sm text-slate-400 leading-relaxed">
            {definition.description}
          </p>
        )}
      </div>
    </div>
  );
}

/** 実行時間履歴の折れ線グラフ */
function ExecutionTimeChart({
  records,
}: {
  readonly records: readonly ExecutionRecord[];
}) {
  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-slate-600 text-sm">
        実行データなし — パラメータを入力しボタンを押して実行してください
      </div>
    );
  }

  const maxDuration = Math.max(...records.map((r) => r.durationMs), 1);

  return (
    <div className="flex items-end gap-2 h-36 px-2">
      {records.map((record, index) => {
        const heightPercent = Math.max(
          (record.durationMs / maxDuration) * 100,
          8
        );

        const barColorClass =
          record.durationMs > maxDuration * 0.7
            ? "from-rose-500 to-red-400"
            : record.durationMs > maxDuration * 0.4
              ? "from-amber-500 to-yellow-400"
              : "from-emerald-500 to-green-400";

        return (
          <div
            key={`${record.timestamp}-${index}`}
            className="flex-1 flex flex-col items-center gap-1.5"
          >
            <span className="text-xs text-slate-400 font-mono">
              {record.durationMs.toFixed(1)}ms
            </span>
            <div
              className={`
                w-full rounded-t-md bg-linear-to-r ${barColorClass}
                transition-all duration-500 ease-out
                min-w-5
              `}
              style={{ height: `${heightPercent}%` }}
              title={`${record.executionCount}回実行: ${record.durationMs.toFixed(2)}ms`}
            />
            <span className="text-xs text-slate-500 font-mono">
              ×{record.executionCount}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 型モード切替トグル */
function TypeModeToggle({
  typeMode,
  onToggle,
}: {
  readonly typeMode: TypeMode;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="
        relative flex items-center justify-between w-full max-w-[280px] p-1.5
        bg-slate-950 border border-slate-900 rounded-xl cursor-pointer select-none
      "
    >
      <div
        className={`
          absolute top-1 bottom-1 w-[calc(50%-6px)] bg-slate-900 border border-slate-800 rounded-lg shadow-md transition-all duration-300
          ${typeMode === "polymorphic" ? "left-[calc(50%+2px)]" : "left-1"}
        `}
      />
      <span
        className={`
          flex-1 text-center text-xs font-bold py-1.5 z-10 transition-colors duration-300
          ${typeMode === "monomorphic" ? "text-cyan-400" : "text-slate-500"}
        `}
      >
        Monomorphic (単一形)
      </span>
      <span
        className={`
          flex-1 text-center text-xs font-bold py-1.5 z-10 transition-colors duration-300
          ${typeMode === "polymorphic" ? "text-rose-400" : "text-slate-500"}
        `}
      >
        Polymorphic (多態性)
      </span>
    </button>
  );
}

/** 実行ボタン */
function ExecutionButton({
  batchSize,
  label,
  gradientClass,
  onExecute,
}: {
  readonly batchSize: number;
  readonly label: string;
  readonly gradientClass: string;
  readonly onExecute: (batchSize: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onExecute(batchSize)}
      className={`
        py-2 px-3 rounded-lg text-xs font-bold text-white transition-all duration-200
        active:scale-[0.98] cursor-pointer shadow-lg hover:shadow-cyan-500/10
        ${gradientClass}
      `}
    >
      {label}
    </button>
  );
}

// ============================================================
// ヘルパーロジック
// ============================================================

/** 実行回数と型モードから、現在のJITステージを判別 */
function resolveJitStage(
  executions: number,
  typeMode: TypeMode
): JitStage {
  if (typeMode === "polymorphic" && executions >= TOPTIER_THRESHOLD) {
    return "deoptimized";
  }
  if (executions >= TOPTIER_THRESHOLD) {
    return "top-tier";
  }
  if (executions >= BASELINE_THRESHOLD) {
    return "baseline";
  }
  return "interpreter";
}

/**
 * JIT最適化レベルに応じた疑似実行時間をミリ秒でシミュレーションする
 * V8の実際の挙動をモデル化し、JITコンパイルの効果と脱最適化ペナルティを表現する
 */
function simulateExecutionTime(
  batchSize: number,
  currentExecutions: number,
  typeMode: TypeMode
): number {
  // 1バッチ（単一アロケーション/計算処理）あたりの基礎コスト
  const baseMicroSeconds = 80;

  // JITステージに応じたスケーリング係数を算出
  let speedFactor = 1.0;
  const stage = resolveJitStage(currentExecutions, typeMode);

  switch (stage) {
    case "interpreter":
      // インタプリタ実行：最適化なし
      speedFactor = 1.0;
      break;
    case "baseline":
      // ベースラインJIT：機械語実行により約4倍高速化
      speedFactor = 0.25;
      break;
    case "top-tier":
      // トップティアJIT：高度な型最適化により約20倍高速化
      speedFactor = 0.05;
      break;
    case "deoptimized":
      // 脱最適化ペナルティ：仮定チェックの失敗とインタープリタへの退行により、
      // 通常のインタープリタよりもさらに遅くなる（約1.5倍のオーバーヘッド）
      speedFactor = 1.5;
      break;
  }

  // 実行時間（ミリ秒） = バッチサイズ × 基礎コスト × 最適化係数 + 軽微なノイズ
  const totalMicro = batchSize * baseMicroSeconds * speedFactor;
  const jitter = (Math.random() - 0.5) * (totalMicro * 0.1); // ±10%のブレ

  return Math.max((totalMicro + jitter) / 1000, 0.01);
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function JitSimulator({ onLongTask }: JitSimulatorProps) {
  // --- State ---
  const [totalExecutions, setTotalExecutions] = useState(0);
  const [typeMode, setTypeMode] = useState<TypeMode>("monomorphic");
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>(
    []
  );
  const [showDeoptFlash, setShowDeoptFlash] = useState(false);
  const [showDeoptExplanation, setShowDeoptExplanation] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // --- Refs ---
  /** 脱最適化前にTop-tier状態だったかを追跡するフラグ */
  const wasTopTierRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 派生状態 ---
  const currentStage = resolveJitStage(totalExecutions, typeMode);

  // Top-tierに到達した履歴があるかを監視
  useEffect(() => {
    if (currentStage === "top-tier") {
      wasTopTierRef.current = true;
    }
  }, [currentStage]);

  /** 脱最適化イベントのトリガー */
  const triggerDeoptimization = useCallback(() => {
    setShowDeoptExplanation(true);
    setShowDeoptFlash(true);
    setIsShaking(true);

    // フラッシュの点滅時間を管理
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setShowDeoptFlash(false);
    }, DEOPT_FLASH_DURATION_MS);

    // 振動の終了時間を管理
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
    }, DEOPT_SHAKE_DURATION_MS);
  }, []);

  /** 型モードの切り替えハンドラ */
  const handleTypeModeToggle = useCallback(() => {
    setTypeMode((prevMode) => {
      const nextMode =
        prevMode === "monomorphic" ? "polymorphic" : "monomorphic";

      // Top-tier状態からPolymorphicに切り替えたら脱最適化
      if (nextMode === "polymorphic" && wasTopTierRef.current) {
        // 非同期で脱最適化を発火（state更新後に実行するため）
        queueMicrotask(() => triggerDeoptimization());
      }

      // Monomorphicに戻す場合は脱最適化解説を閉じる
      if (nextMode === "monomorphic") {
        setShowDeoptExplanation(false);
      }

      return nextMode;
    });
  }, [triggerDeoptimization]);

  /** 関数実行のハンドラ */
  const handleExecute = useCallback(
    (batchSize: number) => {
      const startTime = performance.now();

      // シミュレートされた実行時間を算出
      const simulatedDuration = simulateExecutionTime(
        batchSize,
        totalExecutions,
        typeMode
      );

      const elapsed = performance.now() - startTime;

      // Long Task検出通知
      if (onLongTask && elapsed > 50) {
        onLongTask(elapsed, `JIT Simulation (×${batchSize})`);
      }

      // 実行回数を加算
      setTotalExecutions((prev) => prev + batchSize);

      // 実行履歴に記録（直近MAX_HISTORY_LENGTH件を保持）
      setExecutionHistory((prev) => {
        const newRecord: ExecutionRecord = {
          executionCount: batchSize,
          durationMs: simulatedDuration,
          timestamp: Date.now(),
        };
        const updated = [...prev, newRecord];
        return updated.slice(-MAX_HISTORY_LENGTH);
      });
    },
    [totalExecutions, typeMode, onLongTask]
  );

  /** エンジンリセット */
  const handleReset = useCallback(() => {
    setTotalExecutions(0);
    setTypeMode("monomorphic");
    setExecutionHistory([]);
    setShowDeoptExplanation(false);
    setShowDeoptFlash(false);
    setIsShaking(false);
    wasTopTierRef.current = false;
  }, []);

  return (
    <>
      {/* 脱最適化時の赤フラッシュオーバーレイ */}
      {showDeoptFlash && (
        <div
          className="fixed inset-0 z-50 pointer-events-none bg-red-500/20"
          style={{
            animation: `deopt-flash ${DEOPT_FLASH_DURATION_MS}ms ease-out forwards`,
          }}
        />
      )}

      <div
        className={`
          bg-slate-900/10 backdrop-blur-md border border-slate-800/60
          rounded-2xl p-10 md:p-14 shadow-xl shadow-slate-950/20 transition-all duration-300 flex-1 flex flex-col justify-between
          ${isShaking ? "animate-[shake_0.6s_ease-in-out]" : ""}
        `}
      >
        {/* 2カラムレイアウトコンテナ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
          
          {/* 左カラム：説明用のコンポーネント */}
          <div className="lg:col-span-5 flex flex-col space-y-8">
            <div className="space-y-6">
              {/* ヘッダー */}
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.05)]">
                  <span className="text-xl filter drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">⚡</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
                    JIT &amp; Hidden Class
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tracking-wider uppercase mt-1 leading-none">JS Engine Simulation</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                V8エンジンのJITコンパイル（Interpreter -&gt; Baseline -&gt; Top-tier）と、ポリモーフィックなコードによる脱最適化（Deoptimization）をシミュレートします。
              </p>
            </div>

            {/* 技術解説（開閉なしで常時表示） */}
            <div className="flex-1 border border-slate-800/80 rounded-2xl bg-slate-950/20 backdrop-blur-sm p-8 space-y-8 text-sm text-slate-300 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800 font-sans">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
                📖 JITコンパイルと脱最適化のメカニズム
              </h3>
              
              <div className="space-y-4">
                <h4 className="font-bold text-cyan-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> JITエンジンの3つの実行ステージ
                </h4>
                <p className="text-slate-400 leading-relaxed text-xs">
                  現代のJavaScriptエンジン（V8など）は、コードの実行頻度（ホットスポット）に応じて段階的に最適化を行います。
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-2.5 ml-2.5 text-xs leading-relaxed">
                  <li><span className="text-cyan-300 font-bold">Interpreter</span> — 起動時に実行時の型情報を記録します。</li>
                  <li><span className="text-amber-400 font-bold">Baseline JIT</span> — 頻繁に呼出される関数を機械語にし、高速化します。</li>
                  <li><span className="text-emerald-400 font-bold">Top-tier JIT</span> — 非常に多く呼ばれる関数に対し型を仮定して、極めて最適化された機械語にコンパイルします。</li>
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-rose-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> なぜ脱最適化が発生するのか？
                </h4>
                <p className="text-slate-400 leading-relaxed text-xs">
                  JavaScriptは動的型付け言語であるため、Top-tier JITは仮定チェックを埋め込みます。もし「常にnumber型」と仮定された関数に突然string型が渡されると仮定チェックが失敗し、最適化機械語を即座に破棄してインタープリタへロールバック（Deopt）します。
                </p>
              </div>

              <div className="space-y-4 pb-2">
                <h4 className="font-bold text-indigo-400 flex items-center gap-1.5 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> 🎮 実際の応用: 静的最適化へのヒント
                </h4>
                <ul className="list-disc list-inside text-slate-400 space-y-2.5 ml-2.5 text-xs leading-relaxed">
                  <li><span className="text-indigo-300 font-bold">単一形（Monomorphic）の維持</span> — 関数の引数の型を一定に保つ。</li>
                  <li><span className="text-indigo-300 font-bold">隠しクラス（Hidden Class）の共有</span> — 同一のプロパティ構造のオブジェクトを再利用する。</li>
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
                  <span className="text-amber-400">⚙️</span> Control Panel
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2 text-xs font-bold tracking-wider text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-900 border border-slate-800/80 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 animate-none"
                >
                  🔄 RESET
                </button>
              </div>

              {/* 累計実行回数メーター */}
              <div className="py-6 border-b border-slate-900/60 text-center space-y-3">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  累計実行回数
                </div>
                <div
                  className={`
                    text-5xl font-black font-mono tracking-tight transition-all duration-500
                    ${currentStage === "top-tier"
                      ? "text-emerald-400 drop-shadow-[0_0_16px_rgba(52,211,153,0.4)]"
                      : currentStage === "baseline"
                        ? "text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                        : currentStage === "deoptimized"
                          ? "text-rose-500 drop-shadow-[0_0_16px_rgba(244,63,94,0.4)]"
                          : "text-slate-300"
                    }
                  `}
                >
                  {totalExecutions.toLocaleString()}
                </div>
                <div className="text-xs font-semibold text-slate-400 font-mono mt-2">
                  {currentStage === "interpreter" && "🐢 Interpreter: 型情報を収集中..."}
                  {currentStage === "baseline" &&
                    `🔥 Baseline JIT (Warm): 最適化まであと ${(TOPTIER_THRESHOLD - totalExecutions).toLocaleString()} 回`}
                  {currentStage === "top-tier" && "⚡ Top-tier JIT (Optimized): 最高速稼働中"}
                  {currentStage === "deoptimized" && "💥 Deoptimization: 最適化解除"}
                </div>
              </div>

              <div className="space-y-6">
                {/* 型モード切替トグル */}
                <div className="py-2 flex justify-center">
                  <TypeModeToggle
                    typeMode={typeMode}
                    onToggle={handleTypeModeToggle}
                  />
                </div>

                {/* 実行ボタン群 */}
                <div className="grid grid-cols-3 gap-3.5">
                  <ExecutionButton
                    batchSize={1}
                    label="+1回"
                    gradientClass="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 border border-blue-400/20 py-3 text-sm"
                    onExecute={handleExecute}
                  />
                  <ExecutionButton
                    batchSize={100}
                    label="+100回"
                    gradientClass="bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 border border-purple-400/20 py-3 text-sm"
                    onExecute={handleExecute}
                  />
                  <ExecutionButton
                    batchSize={10000}
                    label="+10,000回"
                    gradientClass="bg-gradient-to-r from-fuchsia-600 to-pink-500 hover:from-fuchsia-500 hover:to-pink-400 border border-pink-400/20 py-3 text-sm"
                    onExecute={handleExecute}
                  />
                </div>
              </div>
            </div>

            {/* 実行結果表示エリア (ステータス遷移と履歴グラフ) */}
            <div className="flex-1 flex flex-col gap-8 min-h-[300px]">
              {/* JITステータスカード（4段階） */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                {STAGE_DEFINITIONS.map((definition) => (
                  <StageCard
                    key={definition.id}
                    definition={definition}
                    isActive={currentStage === definition.id}
                    isPulsing={definition.id === "baseline"}
                    isOptimized={definition.id === "top-tier"}
                  />
                ))}
              </div>

              {/* 脱最適化の技術解説 */}
              {showDeoptExplanation && (
                <div
                  className="
                    bg-rose-950/10 border border-rose-500/20 backdrop-blur-xs
                    rounded-2xl p-8 space-y-5
                    animate-[fadeSlideIn_0.4s_ease-out]
                  "
                >
                  <h3 className="text-rose-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <span>💥</span> Deoptimization Alert
                  </h3>
                  <p className="text-rose-300 text-xs leading-relaxed whitespace-pre-line font-mono">
                    {DEOPT_EXPLANATION}
                  </p>
                </div>
              )}

              {/* 実行時間グラフ */}
              <div className="bg-slate-950/20 rounded-2xl p-8 md:p-10 flex-1 flex flex-col justify-center min-h-[200px] space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <span>📊</span> Execution History (ms)
                </h3>
                <div className="bg-slate-950/30 rounded-xl p-8 md:p-10 border border-slate-900/60 flex-1 flex items-center justify-center min-h-[140px]">
                  <ExecutionTimeChart records={executionHistory} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CSSキーフレーム定義 */}
        <style>{`
          @keyframes shimmer {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }

          @keyframes float-particle {
            0%, 100% {
              transform: translateY(0) scale(1);
              opacity: 0.3;
            }
            50% {
              transform: translateY(-12px) scale(1.3);
              opacity: 0.7;
            }
          }

          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10% { transform: translateX(-6px) rotate(-0.5deg); }
            20% { transform: translateX(6px) rotate(0.5deg); }
            30% { transform: translateX(-5px) rotate(-0.3deg); }
            40% { transform: translateX(5px) rotate(0.3deg); }
            50% { transform: translateX(-3px); }
            60% { transform: translateX(3px); }
            70% { transform: translateX(-2px); }
            80% { transform: translateX(2px); }
            90% { transform: translateX(-1px); }
          }

          @keyframes deopt-flash {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }

          @keyframes fadeSlideIn {
            0% {
              opacity: 0;
              transform: translateY(-8px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </>
  );
}
