"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import styles from "./JitSimulator.module.scss";

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
    description:
      "コードを順次実行中。最も低速だが、型情報（Feedback Vector）を収集している段階。",
  },
  {
    id: "baseline",
    label: "Baseline JIT",
    icon: "🔥",
    description:
      "頻繁に実行される関数をベースラインJITコンパイル。中程度の最適化が適用されている。",
  },
  {
    id: "top-tier",
    label: "Top-tier JIT",
    icon: "⚡",
    description:
      "TurboFan級の最適化コンパイル完了！型が固定され、極限まで最適化された機械語を実行中。",
  },
  {
    id: "deoptimized",
    label: "Deoptimization",
    icon: "💥",
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
        ${styles.stageCard}
        ${isActive ? styles.active : ""}
        ${isActive ? styles[definition.id] : ""}
        ${isPulsing && isActive ? styles.pulse : ""}
      `}
    >
      {/* Top-tier JIT のとき、揺らめくグラデーション背景 */}
      {isOptimized && isActive && (
        <div className={styles.shimmerBackground} />
      )}

      {/* パーティクル風エフェクト（Top-tier JIT時） */}
      {isOptimized && isActive && (
        <>
          <div
            className={`${styles.particle} ${styles.p1}`}
          />
          <div
            className={`${styles.particle} ${styles.p2}`}
          />
          <div
            className={`${styles.particle} ${styles.p3}`}
          />
        </>
      )}

      <div className={styles.cardContent}>
        <div className={styles.cardHeader}>
          <span className={styles.icon}>{definition.icon}</span>
          <span className={styles.label}>
            {definition.label}
          </span>
        </div>
        {definition.description && (
          <p className={styles.desc}>
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
      <div className={styles.noData}>
        実行データなし — パラメータを入力しボタンを押して実行してください
      </div>
    );
  }

  const maxDuration = Math.max(...records.map((r) => r.durationMs), 1);

  return (
    <div className={styles.chartWrapper}>
      {records.map((record, index) => {
        const heightPercent = Math.max(
          (record.durationMs / maxDuration) * 100,
          8
        );

        const barColorClass =
          record.durationMs > maxDuration * 0.7
            ? styles.high
            : record.durationMs > maxDuration * 0.4
              ? styles.medium
              : styles.low;

        return (
          <div
            key={`${record.timestamp}-${index}`}
            className={styles.chartBarWrapper}
          >
            <span className={styles.chartValue}>
              {record.durationMs.toFixed(1)}ms
            </span>
            <div
              className={`${styles.chartBar} ${barColorClass}`}
              style={{ height: `${heightPercent}%` }}
              title={`${record.executionCount}回実行: ${record.durationMs.toFixed(2)}ms`}
            />
            <span className={styles.chartLabel}>
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
      className={styles.toggleButton}
    >
      <div
        className={`
          ${styles.toggleSlider}
          ${typeMode === "polymorphic" ? styles.polymorphic : styles.monomorphic}
        `}
      />
      <span
        className={`
          ${styles.toggleText}
          ${typeMode === "monomorphic" ? `${styles.active} ${styles.mono}` : ""}
        `}
      >
        Monomorphic (単一形)
      </span>
      <span
        className={`
          ${styles.toggleText}
          ${typeMode === "polymorphic" ? `${styles.active} ${styles.poly}` : ""}
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
  readonly gradientClass: "blue" | "violet" | "fuchsia";
  readonly onExecute: (batchSize: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onExecute(batchSize)}
      className={`${styles.btnExecute} ${styles[gradientClass]}`}
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
        <div className={styles.deoptFlash} />
      )}

      <div
        className={`
          ${styles.container}
          ${isShaking ? styles.shaking : ""}
        `}
      >
        {/* 2カラムレイアウトコンテナ */}
        <div className={styles.grid}>
          
          {/* 左カラム：説明用のコンポーネント */}
          <div className={styles.leftColumn}>
            <div className={styles.introSection}>
              {/* ヘッダー */}
              <div className={styles.header}>
                <div className={styles.iconWrapper}>
                  <span className={styles.icon}>⚡</span>
                </div>
                <div>
                  <h2 className={styles.title}>
                    JIT &amp; Hidden Class
                  </h2>
                  <p className={styles.subtitle}>JS Engine Simulation</p>
                </div>
              </div>
              <p className={styles.description}>
                V8エンジンのJITコンパイル（Interpreter -&gt; Baseline -&gt; Top-tier）と、ポリモーフィックなコードによる脱最適化（Deoptimization）をシミュレートします。
              </p>
            </div>

            {/* 技術解説（開閉なしで常時表示） */}
            <div className={styles.explanationBox}>
              <h3 className={styles.sectionTitle}>
                📖 JITコンパイルと脱最適化のメカニズム
              </h3>
              
              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.cyan}`}>
                  <span className={styles.dot} /> JITエンジンの3つの実行ステージ
                </h4>
                <p className={styles.conceptText}>
                  現代のJavaScriptエンジン（V8など）は、コードの実行頻度（ホットスポット）に応じて段階的に最適化を行います。
                </p>
                <ul className={styles.bulletList}>
                  <li><span className={styles.cyan}>Interpreter</span> — 起動時に実行時の型情報を記録します。</li>
                  <li><span className={styles.amber}>Baseline JIT</span> — 頻繁に呼出される関数を機械語にし、高速化します。</li>
                  <li><span className={styles.emerald}>Top-tier JIT</span> — 非常に多く呼ばれる関数に対し型を仮定して、極めて最適化された機械語にコンパイルします。</li>
                </ul>
              </div>

              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.rose}`}>
                  <span className={styles.dot} /> なぜ脱最適化が発生するのか？
                </h4>
                <p className={styles.conceptText}>
                  JavaScriptは動的型付け言語であるため、Top-tier JITは仮定チェックを埋め込みます。もし「常にnumber型」と仮定された関数に突然string型が渡されると仮定チェックが失敗し、最適化機械語を即座に破棄してインタープリタへロールバック（Deopt）します。
                </p>
              </div>

              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.indigo}`}>
                  <span className={styles.dot} /> 🎮 実際の応用: 静的最適化へのヒント
                </h4>
                <ul className={styles.bulletList}>
                  <li><span className={styles.indigo}>単一形（Monomorphic）の維持</span> — 関数の引数の型を一定に保つ。</li>
                  <li><span className={styles.indigo}>隠しクラス（Hidden Class）の共有</span> — 同一のプロパティ構造のオブジェクトを再利用する。</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 右カラム：実行エリア（上）と実行結果表示エリア（下） */}
          <div className={styles.rightColumn}>
            
            {/* 実行エリア (コントロールパネル) */}
            <div className={styles.controlCard}>
              <div className={styles.header}>
                <h3 className={styles.title}>
                  ⚙️ Control Panel
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className={styles.resetButton}
                >
                  🔄 RESET
                </button>
              </div>

              {/* 累計実行回数メーター */}
              <div className={styles.executionsMeter}>
                <div className={styles.meterLabel}>
                  累計実行回数
                </div>
                <div
                  className={`
                    ${styles.meterValue}
                    ${styles[currentStage]}
                  `}
                >
                  {totalExecutions.toLocaleString()}
                </div>
                <div className={styles.meterStatus}>
                  {currentStage === "interpreter" && "🐢 Interpreter: 型情報を収集中..."}
                  {currentStage === "baseline" &&
                    `🔥 Baseline JIT (Warm): 最最適化まであと ${(TOPTIER_THRESHOLD - totalExecutions).toLocaleString()} 回`}
                  {currentStage === "top-tier" && "⚡ Top-tier JIT (Optimized): 最高速稼働中"}
                  {currentStage === "deoptimized" && "💥 Deoptimization: 最適化解除"}
                </div>
              </div>

              <div>
                {/* 型モード切替トグル */}
                <div className={styles.toggleWrapper}>
                  <TypeModeToggle
                    typeMode={typeMode}
                    onToggle={handleTypeModeToggle}
                  />
                </div>

                {/* 実行ボタン群 */}
                <div className={styles.buttonGrid}>
                  <ExecutionButton
                    batchSize={1}
                    label="+1回"
                    gradientClass="blue"
                    onExecute={handleExecute}
                  />
                  <ExecutionButton
                    batchSize={100}
                    label="+100回"
                    gradientClass="violet"
                    onExecute={handleExecute}
                  />
                  <ExecutionButton
                    batchSize={10000}
                    label="+10,000回"
                    gradientClass="fuchsia"
                    onExecute={handleExecute}
                  />
                </div>
              </div>
            </div>

            {/* 実行結果表示エリア (ステータス遷移と履歴グラフ) */}
            <div className={styles.resultsArea}>
              {/* JITステータスカード（4段階） */}
              <div className={styles.stageGrid}>
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
                <div className={styles.deoptAlert}>
                  <h3 className={styles.title}>
                    💥 Deoptimization Alert
                  </h3>
                  <p className={styles.desc}>
                    {DEOPT_EXPLANATION}
                  </p>
                </div>
              )}

              {/* 実行時間グラフ */}
              <div className={styles.chartCard}>
                <h3 className={styles.title}>
                  📊 Execution History (ms)
                </h3>
                <div className={styles.chartContainer}>
                  <ExecutionTimeChart records={executionHistory} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
