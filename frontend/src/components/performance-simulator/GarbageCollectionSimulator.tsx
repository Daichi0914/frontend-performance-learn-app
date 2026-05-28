"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import styles from "./GarbageCollectionSimulator.module.scss";

// ─── 型定義 ───────────────────────────────────────────────
interface GarbageCollectionSimulatorProps {
  onLongTask?: (durationMs: number, taskName: string) => void;
}

/** New Spaceタンクの最大容量（MB） */
const TANK_CAPACITY_MB = 32;

/** Long Taskの閾値（ブラウザ標準 of 50ms） */
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

  // タンクのパーセンテージに応じた色のクラスを選択
  const tankThemeClass = memoryPercentage <= 33 ? styles.green : memoryPercentage <= 66 ? styles.yellow : styles.red;

  return (
    <div style={{ position: "relative" }}>
      {/* ── GCフリーズオーバーレイ ── */}
      {isGcTriggered && (
        <div className={styles.freezeOverlay}>
          <div className={styles.freezeCard}>
            <div className={styles.bounceIcon}>⚡</div>
            <div className={styles.freezeTitle}>
              Scavenge GC（マイナーGC）発生！
            </div>
            <div className={styles.freezeDesc}>
              Stop-The-World: メインスレッドが一時停止しています...
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.introSection}>
          {/* ヘッダー */}
          <div className={styles.header}>
            <div className={styles.iconWrapper}>
              <span className={styles.icon}>🗑️</span>
            </div>
            <div>
              <h2 className={styles.title}>
                Garbage Collection
              </h2>
              <p className={styles.subtitle}>V8 Memory Simulator</p>
            </div>
          </div>
          <p className={styles.description}>
            世代別GC（Scavenge GC）と、メモリ割り当ての最適化によるパフォーマンスへの影響を比較します。
          </p>
        </div>

        {/* 2カラムレイアウトコンテナ */}
        <div className={styles.grid}>
          {/* 左カラム：説明用のコンポーネント */}
          <div className={styles.leftColumn}>
            {/* 技術解説（開閉なしで常時表示） */}
            <div className={styles.explanationBox}>
              <h3 className={styles.sectionTitle}>
                📖 なぜGCが発生するのか？ — 技術解説
              </h3>

              {/* 非効率パターンの解説 */}
              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.rose}`}>
                  <span className={styles.dot} />{" "}
                  高階関数チェーンによる「ゴミ」の大量生成
                </h4>
                <p className={styles.conceptText}>
                  JavaScriptでは、配列操作に便利なメソッドチェーン（
                  <span className={styles.highlightRose}>
                    .map().filter().reduce()
                  </span>
                  など）を多用します。しかし、これらはメソッドが実行されるたびに、
                  <span className={styles.highlightRose}>
                    メモリ上に「中間配列」という使い捨てのオブジェクト
                  </span>
                  を生成します。データ件数が大きいほど、またメソッドチェーンが長いほど、この中間オブジェクト（ゴミ）がメモリ空間を瞬時に埋めてしまいます。
                </p>
              </div>

              {/* V8のScavengeアルゴリズムの解説 */}
              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.cyan}`}>
                  <span className={styles.dot} />{" "}
                  V8のメモリ管理：Scavenger（若者部屋GC）
                </h4>
                <p className={styles.conceptText}>
                  生成されたばかりのオブジェクトは、ヒープメモリ内の
                  <span className={styles.highlightCyan}>
                    「New Space（新世代領域）」
                  </span>
                  に割り当てられます。この領域は数MBから数十MBと非常に狭く、ゴミによってすぐに満杯になります。満杯になると、V8は
                  <span className={styles.highlightCyan}>
                    「Scavenge GC（マイナーGC）」
                  </span>
                  を実行します。このGCは極めて高速に処理されるように設計されていますが、実行中はJavaScriptコードの実行が完全にストップ（
                  <span className={styles.highlightCyan}>Stop-The-World</span>
                  ）するため、ガタつき（Jank）の原因になります。
                </p>
              </div>

              {/* 最適化コードの解説 */}
              <div className={styles.conceptBlock}>
                <h4 className={`${styles.conceptHeader} ${styles.emerald}`}>
                  <span className={styles.dot} />{" "}
                  最適化: アロケーションフリー（ゴミを作らない）
                </h4>
                <p className={styles.conceptText}>
                  パフォーマンスが要求される処理（アニメーション、ループ、スクロール監視など）では、
                  <span className={styles.highlightEmerald}>
                    従来の for / while ループや、変数の再利用（In-place）
                  </span>
                  を使用して中間オブジェクトを一切生成しない「アロケーションフリー」な実装を行います。メモリ確保を行わなければGCの発生回数そのものをゼロに抑えることができ、フレームレート（FPS）を常に安定させることができます。
                </p>
              </div>
            </div>
          </div>

          {/* 右カラム：実行エリア（上）と実行結果表示エリア（下） */}
          <div className={styles.rightColumn}>
            
            {/* コントロールエリア */}
            <div className={styles.controlCard}>
              <h3 className={styles.cardTitle}>
                <span className={styles.icon}>⚙️</span> Simulation Control
              </h3>

              {/* データ件数スライダー */}
              <div className={styles.sliderBlock}>
                <div className={styles.sliderHeader}>
                  <label
                    htmlFor="gc-data-count-slider"
                    className={styles.sliderLabel}
                  >
                    処理データ件数
                  </label>
                  <span className={styles.sliderValue}>
                    {dataCount.toLocaleString()}{" "}
                    <span className={styles.unit}>件</span>
                  </span>
                </div>
                <input
                  id="gc-data-count-slider"
                  type="range"
                  min={DATA_COUNT_MIN}
                  max={DATA_COUNT_MAX}
                  step={DATA_COUNT_STEP}
                  value={dataCount}
                  onChange={(e) => setDataCount(Number(e.target.value))}
                  className={styles.sliderInput}
                />
                <div className={styles.sliderMinMax}>
                  <span>{DATA_COUNT_MIN.toLocaleString()}</span>
                  <span>{DATA_COUNT_MAX.toLocaleString()}</span>
                </div>
              </div>

              {/* 実行ボタン群 */}
              <div className={styles.buttonGrid}>
                <button
                  type="button"
                  onClick={executeHighOrderChain}
                  disabled={isProcessing || isGcTriggered}
                  className={`${styles.executionButton} ${styles.red}`}
                >
                  <span className={styles.btnIcon}>🔗</span>
                  高階関数チェーン実行
                  <span className={styles.btnSubtext}>
                    .map().filter().reduce()
                  </span>
                </button>

                <button
                  type="button"
                  onClick={executeOptimizedCode}
                  disabled={isProcessing || isGcTriggered}
                  className={`${styles.executionButton} ${styles.emerald}`}
                >
                  <span className={styles.btnIcon}>⚡</span>
                  最適化コード実行
                  <span className={styles.btnSubtext}>
                    for ループ + in-place
                  </span>
                </button>
              </div>
            </div>

            {/* 実行結果表示エリア (メモリタンク、メトリクス結果) */}
            <div className={styles.resultsArea}>
              <div className={styles.header}>
                <h3 className={styles.title}>
                  <span>📊</span> Metrics &amp; Heap Tank
                </h3>
              </div>

              {/* メモリタンクUI */}
              <div className={styles.tankBlock}>
                <div className={styles.tankHeader}>
                  <span className={styles.tankLabel}>
                    New Space (若者部屋)
                  </span>
                  <span
                    className={`${styles.tankValue} ${tankThemeClass}`}
                  >
                    {memoryUsedMB.toFixed(1)} / {TANK_CAPACITY_MB} MB
                  </span>
                </div>

                {/* タンク本体 */}
                <div
                  className={`${styles.tankBody} ${tankThemeClass}`}
                >
                  {/* メモリ使用量インジケーター（下から上へ伸びる） */}
                  <div
                    className={`${styles.fluid} ${tankThemeClass}`}
                    style={{ height: `${memoryPercentage}%` }}
                  >
                    {/* 水面の波紋エフェクト */}
                    <div className={styles.ripple} />
                  </div>

                  {/* パーセンテージ表示 */}
                  <div className={styles.textOverlay}>
                    <span
                      className={`${styles.percentage} ${memoryPercentage > 50 ? styles.white : tankThemeClass}`}
                    >
                      {Math.round(memoryPercentage)}%
                    </span>
                  </div>

                  {/* 目盛り線 */}
                  <div className={styles.scaleOverlay}>
                    {[25, 50, 75].map((level) => (
                      <div
                        key={level}
                        className={styles.scaleLine}
                        style={{ bottom: `${level}%` }}
                      >
                        <span className={styles.scaleLabel}>
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
                  className={`${styles.resultAlert} ${isOptimized ? styles.optimized : styles.standard}`}
                >
                  {isOptimized ? (
                    <span className={styles.badge}>✨ メモリ安定（アロケーションフリー） —</span>
                  ) : (
                    <span className={styles.badge}>⚠️ 中間オブジェクト生成量: +{estimateMemoryIncreaseMB(dataCount).toFixed(1)}MB —</span>
                  )}
                  {lastResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
