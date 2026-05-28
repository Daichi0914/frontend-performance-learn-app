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
    label: "Interpreter (Bytecode)",
    icon: "🐢",
    colorClass: "border-gray-500",
    glowColor: "shadow-gray-500/30",
    description:
      "コードを1行ずつ解釈して実行中。最も低速だが、型情報を収集している段階。",
  },
  {
    id: "baseline",
    label: "Baseline JIT (Warm)",
    icon: "🔥",
    colorClass: "border-amber-500",
    glowColor: "shadow-amber-500/40",
    description:
      "ホットスポット検知。頻繁に実行される関数をベースラインJITコンパイル。中程度の最適化が適用されている。",
  },
  {
    id: "top-tier",
    label: "Top-tier JIT (Optimized)",
    icon: "⚡",
    colorClass: "border-emerald-500",
    glowColor: "shadow-emerald-500/40",
    description:
      "TurboFan級の最適化JITコンパイル完了！投機的最適化（Speculative Optimization）が成功し、型ガード付きの機械語を生成。最速実行中。",
  },
  {
    id: "deoptimized",
    label: "DEOPTIMIZATION DETECTED",
    icon: "💥",
    colorClass: "border-red-500",
    glowColor: "shadow-red-500/50",
    description: "",
  },
] as const;

/** 脱最適化時に表示する詳細技術解説 */
const DEOPT_EXPLANATION = `💥 脱最適化（Deoptimization）発生！
V8エンジンはTop-tier JITコンパイル時に「この関数の引数は常にnumber型である」という投機的仮定（Type Speculation）を立てて最適化しました。
しかし、string型の引数が渡されたことで仮定チェック（Guard Check）が失敗。
エンジンは最適化済みの機械語を破棄し、Interpreterモードに退行しました。
これがPolymorphicコード（多態的コード）が危険な理由です。
Hidden Classの遷移が複数発生し、Inline Cache（IC）がMegamorphic状態に陥ると、以降の最適化が困難になります。`;

// ============================================================
// ユーティリティ関数
// ============================================================

/** 累計実行回数からJITステージを決定する */
function resolveJitStage(
  totalExecutions: number,
  typeMode: TypeMode
): JitStage {
  if (totalExecutions < BASELINE_THRESHOLD) return "interpreter";
  if (totalExecutions < TOPTIER_THRESHOLD) return "baseline";
  if (typeMode === "polymorphic") return "deoptimized";
  return "top-tier";
}

/**
 * 実行時間をシミュレートする
 * Monomorphicでは回数が増えるほど高速化、Polymorphicでは性能が劣化する
 */
function simulateExecutionTime(
  batchSize: number,
  totalExecutions: number,
  typeMode: TypeMode
): number {
  // JITステージに応じたベース時間倍率（低いほど高速）
  const stageMultiplier =
    totalExecutions >= TOPTIER_THRESHOLD && typeMode === "monomorphic"
      ? 0.15
      : totalExecutions >= BASELINE_THRESHOLD
        ? 0.5
        : 1.0;

  // Polymorphic時は型混在による追加オーバーヘッド
  const polymorphicPenalty = typeMode === "polymorphic" ? 2.5 : 1.0;

  // バッチサイズに対する対数的スケーリング（大量実行でも値が爆発しすぎない）
  const scaledBatch = Math.log10(batchSize + 1) * 10;

  const baseDuration = scaledBatch * stageMultiplier * polymorphicPenalty;

  // ノイズを加えてリアリティを出す（±15%のランダム変動）
  const noise = 0.85 + Math.random() * 0.3;

  return Math.round(baseDuration * noise * 100) / 100;
}

// ============================================================
// サブコンポーネント
// ============================================================

/** 実行回数トリガーボタン */
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
        flex-1 px-4 py-3 rounded-xl font-bold text-white text-sm
        ${gradientClass}
        hover:scale-105 hover:brightness-110
        active:scale-95
        transition-all duration-200 ease-out
        cursor-pointer
        shadow-lg
      `}
    >
      {label}
    </button>
  );
}

/** Monomorphic / Polymorphic 切り替えトグル */
function TypeModeToggle({
  typeMode,
  onToggle,
}: {
  readonly typeMode: TypeMode;
  readonly onToggle: () => void;
}) {
  const isPolymorphic = typeMode === "polymorphic";

  return (
    <div className="flex items-center gap-4">
      <span
        className={`text-sm font-semibold transition-colors duration-300 ${
          !isPolymorphic ? "text-emerald-400" : "text-gray-500"
        }`}
      >
        単一形（Monomorphic）
      </span>

      <button
        type="button"
        onClick={onToggle}
        aria-label={`型モード切替: 現在${isPolymorphic ? "Polymorphic" : "Monomorphic"}`}
        className={`
          relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer
          ${isPolymorphic
            ? "bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.5)]"
            : "bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.4)]"
          }
        `}
      >
        <span
          className={`
            absolute top-0.5 w-6 h-6 bg-white rounded-full
            transition-transform duration-300 ease-out shadow-md
            ${isPolymorphic ? "translate-x-7.5" : "translate-x-0.5"}
          `}
        />
      </button>

      <span
        className={`text-sm font-semibold transition-colors duration-300 ${
          isPolymorphic ? "text-red-400" : "text-gray-500"
        }`}
      >
        多角形（Polymorphic）
      </span>
    </div>
  );
}

/** ステータスカード（4段階の各段階を表示） */
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
        relative overflow-hidden rounded-xl p-4
        border-2 transition-all duration-500
        ${isActive
          ? `${definition.colorClass} ${definition.glowColor} shadow-lg bg-gray-800/80`
          : "border-gray-700/30 bg-gray-800/30 opacity-50"
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
            className="absolute w-1 h-1 bg-green-300 rounded-full opacity-40 pointer-events-none"
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
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{definition.icon}</span>
          <span className="text-sm font-bold text-white/90">
            {definition.label}
          </span>
        </div>
        {definition.description && (
          <p className="text-xs text-gray-400 leading-relaxed">
            {definition.description}
          </p>
        )}
      </div>
    </div>
  );
}

/** 実行時間履歴の折れ線グラフ（CSSベース） */
function ExecutionTimeChart({
  records,
}: {
  readonly records: readonly ExecutionRecord[];
}) {
  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        実行データなし — ボタンを押して実行してください
      </div>
    );
  }

  const maxDuration = Math.max(...records.map((r) => r.durationMs), 1);

  return (
    <div className="flex items-end gap-1.5 h-36 px-2">
      {records.map((record, index) => {
        // 最小高さ8%を保証し、グラフが見えるようにする
        const heightPercent = Math.max(
          (record.durationMs / maxDuration) * 100,
          8
        );

        // 実行回数に応じてバーの色を変える
        const barColorClass =
          record.durationMs > maxDuration * 0.7
            ? "from-red-500 to-red-400"
            : record.durationMs > maxDuration * 0.4
              ? "from-amber-500 to-yellow-400"
              : "from-emerald-500 to-green-400";

        return (
          <div
            key={`${record.timestamp}-${index}`}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span className="text-[10px] text-gray-400 font-mono">
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
            <span className="text-[9px] text-gray-500 font-mono">
              ×{record.executionCount}
            </span>
          </div>
        );
      })}
    </div>
  );
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

  // Top-tier状態の追跡（Polymorphicトグル時の脱最適化検知に使用）
  useEffect(() => {
    wasTopTierRef.current = currentStage === "top-tier";
  }, [currentStage]);

  // タイマーのクリーンアップ
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  /** 脱最適化演出の発火 */
  const triggerDeoptimization = useCallback(() => {
    // 赤フラッシュ表示
    setShowDeoptFlash(true);
    setIsShaking(true);
    setShowDeoptExplanation(true);

    // フラッシュを時間経過で消す
    flashTimerRef.current = setTimeout(() => {
      setShowDeoptFlash(false);
    }, DEOPT_FLASH_DURATION_MS);

    // 振動を時間経過で止める
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
    }, DEOPT_SHAKE_DURATION_MS);

    // Interpreterへ叩き落とす
    setTotalExecutions(0);
  }, []);

  /** 型モードトグルのハンドラ */
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
          className="fixed inset-0 z-50 pointer-events-none bg-red-500/30"
          style={{
            animation: `deopt-flash ${DEOPT_FLASH_DURATION_MS}ms ease-out forwards`,
          }}
        />
      )}

      <div
        className={`
          bg-gray-900/80 backdrop-blur-sm border border-gray-700/50
          rounded-2xl p-6 space-y-6
          ${isShaking ? "animate-[shake_0.6s_ease-in-out]" : ""}
        `}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <span>⚙️</span>
            JSエンジン機嫌シミュレーター
          </h2>
          <button
            type="button"
            onClick={handleReset}
            className="
              px-4 py-2 text-sm font-semibold text-gray-300
              bg-gray-800 hover:bg-gray-700
              border border-gray-600 rounded-lg
              transition-all duration-200
              hover:text-white cursor-pointer
              active:scale-95
            "
          >
            🔄 エンジンリセット
          </button>
        </div>

        {/* 累計実行回数カウンター */}
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1 tracking-wider uppercase">
            累計実行回数
          </div>
          <div
            className={`
            text-5xl font-black font-mono tracking-tight
            transition-colors duration-500
            ${currentStage === "top-tier"
                ? "text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.6)]"
                : currentStage === "baseline"
                  ? "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                  : currentStage === "deoptimized"
                    ? "text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.5)]"
                    : "text-gray-300"
              }
          `}
          >
            {totalExecutions.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {currentStage === "interpreter" && "型情報を収集中..."}
            {currentStage === "baseline" &&
              `あと ${(TOPTIER_THRESHOLD - totalExecutions).toLocaleString()} 回で最適化到達`}
            {currentStage === "top-tier" && "🔥🔥🔥 最高速で稼働中"}
            {currentStage === "deoptimized" && "💥 最適化が解除されました"}
          </div>
        </div>

        {/* 型モード切替トグル */}
        <div className="flex justify-center">
          <TypeModeToggle
            typeMode={typeMode}
            onToggle={handleTypeModeToggle}
          />
        </div>

        {/* 実行ボタン群 */}
        <div className="flex gap-3">
          <ExecutionButton
            batchSize={1}
            label="▶ 1回実行"
            gradientClass="bg-gradient-to-r from-blue-600 to-blue-500"
            onExecute={handleExecute}
          />
          <ExecutionButton
            batchSize={100}
            label="⏩ 100回実行"
            gradientClass="bg-gradient-to-r from-violet-600 to-purple-500"
            onExecute={handleExecute}
          />
          <ExecutionButton
            batchSize={10000}
            label="🚀 10,000回実行"
            gradientClass="bg-gradient-to-r from-fuchsia-600 to-pink-500"
            onExecute={handleExecute}
          />
        </div>

        {/* JITステータスカード（4段階） */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              bg-red-950/60 border-2 border-red-500/50
              rounded-xl p-5 space-y-2
              animate-[fadeSlideIn_0.4s_ease-out]
            "
          >
            <h3 className="text-red-400 font-bold text-sm flex items-center gap-2">
              <span>⚠️</span>
              脱最適化の技術的解説
            </h3>
            <p className="text-red-300/90 text-xs leading-relaxed whitespace-pre-line">
              {DEOPT_EXPLANATION}
            </p>
          </div>
        )}

        {/* 実行時間グラフ */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <span>📊</span>
            実行時間履歴（直近{MAX_HISTORY_LENGTH}回）
          </h3>
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
            <ExecutionTimeChart records={executionHistory} />
          </div>
        </div>

        {/* CSSキーフレーム定義 — Tailwind v4ではグローバルCSSに置くのが理想だが、
            コンポーネントの自己完結性を優先しスコープ内で定義 */}
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
