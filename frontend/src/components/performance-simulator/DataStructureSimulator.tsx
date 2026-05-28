"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./DataStructureSimulator.module.scss";

// --- 型定義 ---

interface DataStructureSimulatorProps {
  onLongTask?: (durationMs: number, taskName: string) => void;
}

/** ベンチマーク計測結果を格納する型 */
interface BenchmarkResult {
  aosDurationMs: number | null;
  soaDurationMs: number | null;
  /** DCE回避用: AoS計算で得られた合計値 */
  aosSum: number | null;
  /** DCE回避用: SoA計算で得られた合計値 */
  soaSum: number | null;
  /** DCE回避用: AoS計算で得られた平均値 */
  aosAverage: number | null;
  /** DCE回避用: SoA計算で得られた平均値 */
  soaAverage: number | null;
  /** ベンチマーク実行時のデータ件数 */
  itemCount: number;
  /** ベンチマーク実行時のプロパティ数 */
  propertyCount: number;
}

type BenchmarkTarget = "aos" | "soa" | "both";
type RunningTarget = BenchmarkTarget | null;

/** AoSの1要素を表現する型（動的プロパティ数に対応） */
type StructElement = Record<string, number>;

/** SoAを表現する型（プロパティ名→Float64Arrayのマップ） */
type StructOfArrays = Record<string, Float64Array>;

// --- 定数 ---

const BENCHMARK_ITERATIONS = 100;
const LONG_TASK_THRESHOLD_MS = 50;

const SLIDER_CONFIG = {
  itemCount: { min: 1000, max: 200000, step: 1000, default: 10000 },
  propertyCount: { min: 3, max: 20, step: 1, default: 5 },
} as const;

// --- ユーティリティ関数 ---

/** プロパティ名を生成（prop_0, prop_1, ...） */
function generatePropertyNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `prop_${index}`);
}

/**
 * AoS形式のデータを生成
 * 各オブジェクトが全プロパティを持つ、一般的なオブジェクト配列
 */
function createArrayOfStructs(
  itemCount: number,
  propertyNames: string[],
): StructElement[] {
  return Array.from({ length: itemCount }, () => {
    const element: StructElement = {};
    for (const name of propertyNames) {
      element[name] = Math.random() * 100;
    }
    return element;
  });
}

/**
 * SoA形式のデータを生成
 * プロパティごとに連続したFloat64Arrayを使い、メモリ局所性を最大化
 */
function createStructOfArrays(
  itemCount: number,
  propertyNames: string[],
): StructOfArrays {
  const soa: StructOfArrays = {};
  for (const name of propertyNames) {
    const array = new Float64Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      array[i] = Math.random() * 100;
    }
    soa[name] = array;
  }
  return soa;
}

/**
 * AoS形式で先頭プロパティの合計・平均をBENCHMARK_ITERATIONS回計算
 * オブジェクトの各プロパティがメモリ上で散在するため、キャッシュミスが多発する
 */
function benchmarkAoS(
  data: StructElement[],
  targetProperty: string,
): { durationMs: number; sum: number; average: number } {
  const startTime = performance.now();

  let totalSum = 0;
  let lastAverage = 0;

  for (let iter = 0; iter < BENCHMARK_ITERATIONS; iter++) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i][targetProperty];
    }
    totalSum += sum;
    lastAverage = sum / data.length;
  }

  const endTime = performance.now();

  return {
    durationMs: endTime - startTime,
    sum: totalSum,
    average: lastAverage,
  };
}

/**
 * SoA形式で先頭プロパティの合計・平均をBENCHMARK_ITERATIONS回計算
 * 同じプロパティが連続配置されるため、CPUプリフェッチャーが効率的に動作する
 */
function benchmarkSoA(
  data: StructOfArrays,
  targetProperty: string,
): { durationMs: number; sum: number; average: number } {
  const startTime = performance.now();

  let totalSum = 0;
  let lastAverage = 0;
  const array = data[targetProperty];
  const length = array.length;

  for (let iter = 0; iter < BENCHMARK_ITERATIONS; iter++) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += array[i];
    }
    totalSum += sum;
    lastAverage = sum / length;
  }

  const endTime = performance.now();

  return {
    durationMs: endTime - startTime,
    sum: totalSum,
    average: lastAverage,
  };
}

// --- コンポーネント ---

export default function DataStructureSimulator({
  onLongTask,
}: DataStructureSimulatorProps) {
  const [itemCount, setItemCount] = useState<number>(
    SLIDER_CONFIG.itemCount.default,
  );
  const [propertyCount, setPropertyCount] = useState<number>(
    SLIDER_CONFIG.propertyCount.default,
  );
  const [runningTarget, setRunningTarget] = useState<RunningTarget>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  /** 連打防止用のフラグ */
  const isRunningRef = useRef(false);

  const runBenchmark = useCallback((target: BenchmarkTarget) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setRunningTarget(target);

    // UIスレッドのブロッキングを最小限にするため、requestAnimationFrameで次フレームに委譲
    requestAnimationFrame(() => {
      const propertyNames = generatePropertyNames(propertyCount);
      const targetProperty = propertyNames[0];

      let aosResult: ReturnType<typeof benchmarkAoS> | null = null;
      let soaResult: ReturnType<typeof benchmarkSoA> | null = null;

      if (target === "aos" || target === "both") {
        const aosData = createArrayOfStructs(itemCount, propertyNames);
        aosResult = benchmarkAoS(aosData, targetProperty);
      }

      if (target === "soa" || target === "both") {
        const soaData = createStructOfArrays(itemCount, propertyNames);
        soaResult = benchmarkSoA(soaData, targetProperty);
      }

      setResult((previousResult) => {
        const canKeepPrevious =
          previousResult?.itemCount === itemCount &&
          previousResult.propertyCount === propertyCount;

        return {
          aosDurationMs:
            aosResult?.durationMs ??
            (canKeepPrevious ? previousResult?.aosDurationMs : null) ??
            null,
          soaDurationMs:
            soaResult?.durationMs ??
            (canKeepPrevious ? previousResult?.soaDurationMs : null) ??
            null,
          aosSum:
            aosResult?.sum ??
            (canKeepPrevious ? previousResult?.aosSum : null) ??
            null,
          soaSum:
            soaResult?.sum ??
            (canKeepPrevious ? previousResult?.soaSum : null) ??
            null,
          aosAverage:
            aosResult?.average ??
            (canKeepPrevious ? previousResult?.aosAverage : null) ??
            null,
          soaAverage:
            soaResult?.average ??
            (canKeepPrevious ? previousResult?.soaAverage : null) ??
            null,
          itemCount,
          propertyCount,
        };
      });
      setRunningTarget(null);
      isRunningRef.current = false;

      // Long Task通知: 50ms超の処理を外部に報告
      const totalDuration =
        (aosResult?.durationMs ?? 0) + (soaResult?.durationMs ?? 0);
      if (totalDuration > LONG_TASK_THRESHOLD_MS) {
        const taskLabel =
          target === "both" ? "AoS vs SoA" : target === "aos" ? "AoS" : "SoA";
        onLongTask?.(totalDuration, `DataStructure Benchmark (${taskLabel})`);
      }
    });
  }, [itemCount, propertyCount, onLongTask]);

  const aosDurationMs = result?.aosDurationMs ?? null;
  const soaDurationMs = result?.soaDurationMs ?? null;
  const comparison =
    aosDurationMs !== null && soaDurationMs !== null && aosDurationMs > 0
      ? {
          aosDurationMs,
          soaDurationMs,
          speedupPercentage:
            ((aosDurationMs - soaDurationMs) / aosDurationMs) * 100,
        }
      : null;

  /** バーチャートの最大値（2つのうち大きい方を100%とする） */
  const maxDuration = result
    ? Math.max(result.aosDurationMs ?? 0, result.soaDurationMs ?? 0)
    : 0;

  return (
    <div className={styles.container}>
      <div className={styles.introSection}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <span className={styles.icon}>🧱</span>
          </div>
          <div>
            <h2 className={styles.title}>
              データ構造 &amp; キャッシュ効率
            </h2>
            <p className={styles.subtitle}>
              AoS vs SoA Simulator
            </p>
          </div>
        </div>
        <p className={styles.description}>
          AoS (Array of Structs) と SoA (Struct of Arrays)
          のメモリ構造の違いが、CPUキャッシュ効率に及ぼす影響を比較します。
        </p>
      </div>

      {/* 2カラムレイアウトコンテナ */}
      <div className={styles.grid}>
        {/* 左カラム：説明用のコンポーネント */}
        <div className={styles.leftColumn}>
          {/* 技術解説（開閉なしで常時表示） */}
          <div className={styles.explanationBox}>
            <h3 className={styles.sectionTitle}>
              📖 なぜSoAが速いのか？（メモリ配置とCPUキャッシュ）
            </h3>
            {/* CPUキャッシュラインの仕組み */}
            <div className={styles.conceptBlock}>
              <h4 className={`${styles.conceptHeader} ${styles.cyan}`}>
                <span className={styles.dot} />{" "}
                CPUキャッシュライン（64バイト）の仕組み
              </h4>
              <p className={styles.conceptText}>
                CPUがメモリからデータを読み込む際、1バイトずつではなく
                <span className={styles.highlightCyan}>
                  64バイトの「キャッシュライン」
                </span>
                という単位でL1/L2キャッシュに一括転送します。連続するメモリ領域に順番にアクセスするプログラムは、このキャッシュの恩恵を100%受けることができます。
              </p>
            </div>

            {/* AoSの問題点 */}
            <div className={styles.conceptBlock}>
              <h4 className={`${styles.conceptHeader} ${styles.rose}`}>
                <span className={styles.dot} />{" "}
                AoSの問題: キャッシュミスの多発
              </h4>
              <div className={styles.codeDemo}>
                <p className={styles.codeLabel}>
                  AoS (Array of Structs): オブジェクトの配列
                </p>
                <p className={`${styles.codeValue} ${styles.rose}`}>
                  [&#123;x,y,z,w,v&#125;, &#123;x,y,z,w,v&#125;, ...]
                </p>
                <p className={styles.codeComment}>
                  ※ xの集計中、不要な y, z, w, v までキャッシュを埋めてしまう
                </p>
              </div>
              <p className={styles.conceptText}>
                AoSでは、ある特定のプロパティ（例:
                x）だけを集計したい場合でも、隣接する他のデータ（y, z, w,
                v）が強制的にキャッシュに読み込まれます。キャッシュの容量が無駄に占有され、結果として
                <span className={styles.highlightRose}>
                  頻繁なキャッシュミス（Cache Miss）
                </span>
                による遅延が発生します。
              </p>
            </div>

            {/* SoAの利点 */}
            <div className={styles.conceptBlock}>
              <h4 className={`${styles.conceptHeader} ${styles.emerald}`}>
                <span className={styles.dot} />{" "}
                SoAの利点: プリフェッチャー of 最大効率化
              </h4>
              <div className={styles.codeDemo}>
                <p className={styles.codeLabel}>
                  SoA (Struct of Arrays): 配列の構造体
                </p>
                <p className={`${styles.codeValue} ${styles.emerald}`}>
                  x: [x0, x1, x2, x3, x4, x5, x6, x7, ...]
                </p>
                <p className={styles.codeComment}>
                  ※ 1回のロードで8個 of xを取得可能（Float64 = 8バイト × 8 =
                  64バイト）
                </p>
              </div>
              <p className={styles.conceptText}>
                SoAでは同じプロパティのデータが隙間なく連続したメモリ領域に配置されます。そのため、CPUの
                <span className={styles.highlightEmerald}>
                  ハードウェアプリフェッチャー
                </span>
                がアクセスパターンを予測し、次フレームに必要なデータを先回りしてキャッシュします。1回のメモリロードで
                <span className={styles.highlightEmerald}>
                  8個の倍精度浮動小数点数（Float64）
                </span>
                を取得でき、データ転送効率が劇的に高まります。
              </p>
            </div>

            {/* 実際の採用例 */}
            <div className={styles.conceptBlock}>
              <h4 className={`${styles.conceptHeader} ${styles.indigo}`}>
                <span className={styles.dot} /> 🎮
                実際の応用: ECS (Entity Component System)
              </h4>
              <p className={styles.conceptText}>
                ゲームエンジンや大規模シミュレータで採用される
                <span className={styles.highlightIndigo}>
                  ECS (Entity Component System)
                </span>
                は、このSoAメモリレイアウトをコアに据えています。
              </p>
              <ul className={styles.bulletList}>
                <li>
                  <span className={styles.highlightIndigo}>Unity DOTS / ECS</span> —
                  数万のアクティブなオブジェクトを秒間60フレーム以上で並列処理。
                </li>
                <li>
                  <span className={styles.highlightIndigo}>Bevy Engine (Rust)</span> —
                  言語の安全性を生かし、SoAストレージをコア構造に採用。
                </li>
                <li>
                  <span className={styles.highlightIndigo}>
                    Unreal Engine MassEntity
                  </span>{" "}
                  —
                  群衆シミュレーションなどのためにキャッシュ指向のデータ配置を提供。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 右カラム：実行エリア（上）と実行結果表示エリア（下） */}
        <div className={styles.rightColumn}>
          {/* コントロールカード */}
          <div className={styles.controlCard}>
            <h3 className={styles.cardTitle}>
              <span className={styles.icon}>⚙️</span> Configuration
            </h3>

            {/* データ件数スライダー */}
            <div className={styles.sliderBlock}>
              <div className={styles.sliderHeader}>
                <label
                  htmlFor="item-count-slider"
                  className={styles.sliderLabel}
                >
                  データ件数
                </label>
                <span className={styles.sliderValue}>
                  {itemCount.toLocaleString()}{" "}
                  <span className={styles.unit}>件</span>
                </span>
              </div>
              <input
                id="item-count-slider"
                type="range"
                min={SLIDER_CONFIG.itemCount.min}
                max={SLIDER_CONFIG.itemCount.max}
                step={SLIDER_CONFIG.itemCount.step}
                value={itemCount}
                onChange={(e) => setItemCount(Number(e.target.value))}
                className={styles.sliderInput}
              />
              <div className={styles.sliderMinMax}>
                <span>{SLIDER_CONFIG.itemCount.min.toLocaleString()}</span>
                <span>{SLIDER_CONFIG.itemCount.max.toLocaleString()}</span>
              </div>
            </div>

            {/* プロパティ数スライダー */}
            <div className={styles.sliderBlock}>
              <div className={styles.sliderHeader}>
                <label
                  htmlFor="property-count-slider"
                  className={styles.sliderLabel}
                >
                  プロパティ数
                </label>
                <span className={styles.sliderValue}>
                  {propertyCount}{" "}
                  <span className={styles.unit}>個</span>
                </span>
              </div>
              <input
                id="property-count-slider"
                type="range"
                min={SLIDER_CONFIG.propertyCount.min}
                max={SLIDER_CONFIG.propertyCount.max}
                step={SLIDER_CONFIG.propertyCount.step}
                value={propertyCount}
                onChange={(e) => setPropertyCount(Number(e.target.value))}
                className={styles.sliderInput}
              />
              <div className={styles.sliderMinMax}>
                <span>{SLIDER_CONFIG.propertyCount.min}</span>
                <span>{SLIDER_CONFIG.propertyCount.max}</span>
              </div>
            </div>

            {/* 実行ボタン */}
            <div className={styles.benchmarkActions}>
              <button
                type="button"
                onClick={() => runBenchmark("aos")}
                disabled={runningTarget !== null}
                className={`${styles.submitButton} ${styles.aos}`}
              >
                {runningTarget === "aos" ? (
                  <span className={styles.loadingWrapper}>
                    <svg
                      className={styles.spinner}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className={styles.spinnerTrack}
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className={styles.spinnerFill}
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    AoS 実行中...
                  </span>
                ) : (
                  "AoS 実行"
                )}
              </button>
              <button
                type="button"
                onClick={() => runBenchmark("soa")}
                disabled={runningTarget !== null}
                className={`${styles.submitButton} ${styles.soa}`}
              >
                {runningTarget === "soa" ? (
                  <span className={styles.loadingWrapper}>
                    <svg
                      className={styles.spinner}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className={styles.spinnerTrack}
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className={styles.spinnerFill}
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    SoA 実行中...
                  </span>
                ) : (
                  "SoA 実行"
                )}
              </button>
              <button
                type="button"
                onClick={() => runBenchmark("both")}
                disabled={runningTarget !== null}
                className={styles.submitButton}
              >
                {runningTarget === "both" ? (
                  <span className={styles.loadingWrapper}>
                    <svg
                      className={styles.spinner}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className={styles.spinnerTrack}
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className={styles.spinnerFill}
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    両方実行中...
                  </span>
                ) : (
                  "AoS / SoA 両方実行"
                )}
              </button>
            </div>
          </div>

          {/* 実行結果表示エリア */}
          <div className={styles.resultsArea}>
            {!result ? (
              /* ベンチマーク未実行のプレースホルダー */
              <div className={styles.standbyBox}>
                <div className={styles.icon}>📊</div>
                <h3 className={styles.title}>
                  Metrics Standby
                </h3>
                <p className={styles.text}>
                  データ設定を調整した上で、「ベンチマーク実行」ボタンを押すとメモリキャッシュ効率の測定が開始されます。
                </p>
              </div>
            ) : (
              /* 実行結果 */
              <div className={styles.resultsWrapper}>
                <div className={styles.metricsCard}>
                  <h3 className={styles.title}>
                    <span>📊</span> Execution Metrics
                  </h3>

                  <div className={styles.metricsList}>
                    {/* AoSバー */}
                    <div className={styles.barBlock}>
                      <div className={styles.barHeader}>
                        <span className={`${styles.label} ${styles.aos}`}>
                          <span className={styles.dot} />{" "}
                          AoS (Array of Structs)
                        </span>
                        <span className={`${styles.value} ${styles.aos}`}>
                          {result.aosDurationMs !== null
                            ? `${result.aosDurationMs.toFixed(2)} ms`
                            : "未実行"}
                        </span>
                      </div>
                      <div className={styles.barContainer}>
                        <div
                          className={`${styles.bar} ${styles.aos}`}
                          style={{
                            width:
                              maxDuration > 0 && result.aosDurationMs !== null
                                ? `${(result.aosDurationMs / maxDuration) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>

                    {/* SoAバー */}
                    <div className={styles.barBlock}>
                      <div className={styles.barHeader}>
                        <span className={`${styles.label} ${styles.soa}`}>
                          <span className={styles.dot} />{" "}
                          SoA (Struct of Arrays)
                        </span>
                        <span className={`${styles.value} ${styles.soa}`}>
                          {result.soaDurationMs !== null
                            ? `${result.soaDurationMs.toFixed(2)} ms`
                            : "未実行"}
                        </span>
                      </div>
                      <div className={styles.barContainer}>
                        <div
                          className={`${styles.bar} ${styles.soa}`}
                          style={{
                            width:
                              maxDuration > 0 && result.soaDurationMs !== null
                                ? `${(result.soaDurationMs / maxDuration) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>

                    {/* 速度差テキスト */}
                    {comparison !== null && (
                      <div className={styles.speedupWrapper}>
                        {comparison.speedupPercentage > 0 ? (
                          <div className={`${styles.badge} ${styles.success}`}>
                            ⚡ SoA は AoS より{" "}
                            <span className={styles.valueHighlight}>
                              {(
                                comparison.aosDurationMs /
                                comparison.soaDurationMs
                              ).toFixed(1)}
                              倍
                            </span>{" "}
                            (約 {comparison.speedupPercentage.toFixed(1)}%) 高速
                          </div>
                        ) : (
                          <div className={`${styles.badge} ${styles.warning}`}>
                            ⚠️ AoS が SoA より{" "}
                            <span className={styles.valueHighlight}>
                              {(
                                comparison.soaDurationMs /
                                comparison.aosDurationMs
                              ).toFixed(1)}
                              倍
                            </span>{" "}
                            (約{" "}
                            {Math.abs(comparison.speedupPercentage).toFixed(1)}
                            %) 高速
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* DCE回避用: 計算結果の表示 */}
                <div className={styles.verificationBox}>
                  <div className={styles.header}>
                    <h4 className={styles.title}>
                      🔢 Output Verification (DCE Prevention)
                    </h4>
                  </div>
                  <p className={styles.info}>
                    ※ JSエンジンによるDead Code
                    Eliminationを防ぐため、計算結果を画面に出力しています。
                  </p>
                  <div className={styles.grid}>
                    <div className={`${styles.resultBlock} ${styles.aos}`}>
                      <p className={styles.label}>
                        AoS Results
                      </p>
                      <p>
                        Sum:{" "}
                        <span className={styles.val}>
                          {result.aosSum !== null
                            ? result.aosSum.toFixed(4)
                            : "未実行"}
                        </span>
                      </p>
                      <p>
                        Avg:{" "}
                        <span className={styles.val}>
                          {result.aosAverage !== null
                            ? result.aosAverage.toFixed(6)
                            : "未実行"}
                        </span>
                      </p>
                    </div>
                    <div className={`${styles.resultBlock} ${styles.soa}`}>
                      <p className={styles.label}>
                        SoA Results
                      </p>
                      <p>
                        Sum:{" "}
                        <span className={styles.val}>
                          {result.soaSum !== null
                            ? result.soaSum.toFixed(4)
                            : "未実行"}
                        </span>
                      </p>
                      <p>
                        Avg:{" "}
                        <span className={styles.val}>
                          {result.soaAverage !== null
                            ? result.soaAverage.toFixed(6)
                            : "未実行"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className={styles.meta}>
                    <span>
                      データ件数: {result.itemCount.toLocaleString()} 件
                    </span>
                    <span>プロパティ数: {result.propertyCount} 個</span>
                    <span>反復回数: {BENCHMARK_ITERATIONS} 回</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
