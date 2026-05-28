"use client";

import { useState, useCallback, useRef } from "react";

// --- 型定義 ---

interface DataStructureSimulatorProps {
  onLongTask?: (durationMs: number, taskName: string) => void;
}

/** ベンチマーク計測結果を格納する型 */
interface BenchmarkResult {
  aosDurationMs: number;
  soaDurationMs: number;
  /** DCE回避用: AoS計算で得られた合計値 */
  aosSum: number;
  /** DCE回避用: SoA計算で得られた合計値 */
  soaSum: number;
  /** DCE回避用: AoS計算で得られた平均値 */
  aosAverage: number;
  /** DCE回避用: SoA計算で得られた平均値 */
  soaAverage: number;
  /** ベンチマーク実行時のデータ件数 */
  itemCount: number;
  /** ベンチマーク実行時のプロパティ数 */
  propertyCount: number;
}

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
  propertyNames: string[]
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
  propertyNames: string[]
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
  targetProperty: string
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
  targetProperty: string
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
  const [itemCount, setItemCount] = useState<number>(SLIDER_CONFIG.itemCount.default);
  const [propertyCount, setPropertyCount] = useState<number>(
    SLIDER_CONFIG.propertyCount.default
  );
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  /** 連打防止用のフラグ */
  const isRunningRef = useRef(false);

  const runBenchmark = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);

    // UIスレッドのブロッキングを最小限にするため、requestAnimationFrameで次フレームに委譲
    requestAnimationFrame(() => {
      const propertyNames = generatePropertyNames(propertyCount);
      const targetProperty = propertyNames[0];

      // データ生成（ベンチマーク計測外）
      const aosData = createArrayOfStructs(itemCount, propertyNames);
      const soaData = createStructOfArrays(itemCount, propertyNames);

      // AoSベンチマーク実行
      const aosResult = benchmarkAoS(aosData, targetProperty);

      // SoAベンチマーク実行
      const soaResult = benchmarkSoA(soaData, targetProperty);

      const benchmarkResult: BenchmarkResult = {
        aosDurationMs: aosResult.durationMs,
        soaDurationMs: soaResult.durationMs,
        aosSum: aosResult.sum,
        soaSum: soaResult.sum,
        aosAverage: aosResult.average,
        soaAverage: soaResult.average,
        itemCount,
        propertyCount,
      };

      setResult(benchmarkResult);
      setIsRunning(false);
      isRunningRef.current = false;

      // Long Task通知: 50ms超の処理を外部に報告
      const totalDuration = aosResult.durationMs + soaResult.durationMs;
      if (totalDuration > LONG_TASK_THRESHOLD_MS) {
        onLongTask?.(totalDuration, "DataStructure Benchmark (AoS vs SoA)");
      }
    });
  }, [itemCount, propertyCount, onLongTask]);

  /** SoAがAoSより何%高速かを算出 */
  const speedupPercentage =
    result && result.aosDurationMs > 0
      ? ((result.aosDurationMs - result.soaDurationMs) /
          result.aosDurationMs) *
        100
      : null;

  /** バーチャートの最大値（2つのうち大きい方を100%とする） */
  const maxDuration = result
    ? Math.max(result.aosDurationMs, result.soaDurationMs)
    : 0;

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🧱</span>
        <h2 className="text-lg font-bold text-cyan-400">
          データ構造 &amp; キャッシュ効率シミュレーター
        </h2>
      </div>
      <p className="text-sm text-gray-400">
        AoS（Array of Structs）と SoA（Struct of
        Arrays）のメモリレイアウトの違いが、CPUキャッシュ効率にどう影響するかを体感できます。
      </p>

      {/* コントロールパネル */}
      <div className="space-y-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          ⚙️ パラメータ設定
        </h3>

        {/* データ件数スライダー */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <label htmlFor="item-count-slider" className="text-gray-400">
              データ件数
            </label>
            <span className="font-mono text-cyan-400">
              {itemCount.toLocaleString()} 件
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
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{SLIDER_CONFIG.itemCount.min.toLocaleString()}</span>
            <span>{SLIDER_CONFIG.itemCount.max.toLocaleString()}</span>
          </div>
        </div>

        {/* プロパティ数スライダー */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <label htmlFor="property-count-slider" className="text-gray-400">
              プロパティ数
            </label>
            <span className="font-mono text-cyan-400">{propertyCount} 個</span>
          </div>
          <input
            id="property-count-slider"
            type="range"
            min={SLIDER_CONFIG.propertyCount.min}
            max={SLIDER_CONFIG.propertyCount.max}
            step={SLIDER_CONFIG.propertyCount.step}
            value={propertyCount}
            onChange={(e) => setPropertyCount(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{SLIDER_CONFIG.propertyCount.min}</span>
            <span>{SLIDER_CONFIG.propertyCount.max}</span>
          </div>
        </div>

        {/* 実行ボタン */}
        <button
          type="button"
          onClick={runBenchmark}
          disabled={isRunning}
          className="w-full py-3 px-6 rounded-lg font-bold text-white
            bg-linear-to-r from-cyan-600 to-blue-600
            hover:from-cyan-500 hover:to-blue-500
            active:from-cyan-700 active:to-blue-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 cursor-pointer
            shadow-lg shadow-cyan-900/30 hover:shadow-cyan-800/50"
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              ベンチマーク実行中...
            </span>
          ) : (
            "🚀 ベンチマーク実行"
          )}
        </button>
      </div>

      {/* バーチャート比較 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          📊 処理時間の比較
        </h3>

        <div className="space-y-3 bg-gray-800 rounded-lg p-4">
          {/* AoSバー */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-red-400 font-semibold">
                AoS（Array of Structs）
              </span>
              <span className="font-mono text-red-300">
                {result ? `${result.aosDurationMs.toFixed(2)} ms` : "--- ms"}
              </span>
            </div>
            <div className="h-8 bg-gray-700/50 rounded-md overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-red-600 to-red-400 rounded-md transition-all duration-700 ease-out"
                style={{
                  width:
                    result && maxDuration > 0
                      ? `${(result.aosDurationMs / maxDuration) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>

          {/* SoAバー */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-400 font-semibold">
                SoA（Struct of Arrays）
              </span>
              <span className="font-mono text-emerald-300">
                {result ? `${result.soaDurationMs.toFixed(2)} ms` : "--- ms"}
              </span>
            </div>
            <div className="h-8 bg-gray-700/50 rounded-md overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-emerald-600 to-emerald-400 rounded-md transition-all duration-700 ease-out"
                style={{
                  width:
                    result && maxDuration > 0
                      ? `${(result.soaDurationMs / maxDuration) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>

          {/* 速度差テキスト */}
          {speedupPercentage !== null && (
            <div className="pt-2 border-t border-gray-700/50 text-center">
              {speedupPercentage > 0 ? (
                <p className="text-emerald-400 font-bold text-sm">
                  ⚡ SoA は AoS より{" "}
                  <span className="text-lg">
                    {speedupPercentage.toFixed(1)}%
                  </span>{" "}
                  高速
                </p>
              ) : (
                <p className="text-yellow-400 font-bold text-sm">
                  ⚠️ AoS が SoA より{" "}
                  <span className="text-lg">
                    {Math.abs(speedupPercentage).toFixed(1)}%
                  </span>{" "}
                  高速（データが少ない場合やJIT最適化の影響の可能性あり）
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DCE回避用: 計算結果の表示 */}
      {result && (
        <div className="space-y-2 bg-gray-800/50 rounded-lg p-4 border border-gray-700/30">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            🔢 計算結果（DCE回避用出力）
          </h3>
          <p className="text-xs text-gray-500 mb-2">
            ※ JSエンジンによるDead Code
            Eliminationを防ぐため、計算結果を画面に出力しています
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="space-y-1">
              <p className="text-red-400 font-semibold text-sm">AoS</p>
              <p className="text-gray-400">
                合計（×{BENCHMARK_ITERATIONS}回）:{" "}
                <span className="text-gray-200">
                  {result.aosSum.toFixed(4)}
                </span>
              </p>
              <p className="text-gray-400">
                平均:{" "}
                <span className="text-gray-200">
                  {result.aosAverage.toFixed(6)}
                </span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-emerald-400 font-semibold text-sm">SoA</p>
              <p className="text-gray-400">
                合計（×{BENCHMARK_ITERATIONS}回）:{" "}
                <span className="text-gray-200">
                  {result.soaSum.toFixed(4)}
                </span>
              </p>
              <p className="text-gray-400">
                平均:{" "}
                <span className="text-gray-200">
                  {result.soaAverage.toFixed(6)}
                </span>
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            データ件数: {result.itemCount.toLocaleString()} 件 / プロパティ数:{" "}
            {result.propertyCount} 個 / 反復回数: {BENCHMARK_ITERATIONS} 回
          </p>
        </div>
      )}

      {/* 学習解説トグル */}
      <div className="border border-gray-700/50 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsExplanationOpen((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 text-left
            bg-gray-800/50 hover:bg-gray-800/80 transition-colors cursor-pointer"
        >
          <span className="text-sm font-semibold text-amber-400">
            📖 なぜSoAが速いのか？
          </span>
          <span
            className={`text-gray-400 transition-transform duration-300 ${
              isExplanationOpen ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {isExplanationOpen && (
          <div className="p-4 space-y-4 text-sm text-gray-300 bg-gray-900/50 border-t border-gray-700/30">
            {/* CPUキャッシュラインの仕組み */}
            <div className="space-y-2">
              <h4 className="font-bold text-cyan-400">
                🧠 CPUキャッシュライン（64バイト）の仕組み
              </h4>
              <p className="text-gray-400 leading-relaxed">
                CPUがメモリからデータを読む際、1バイトずつではなく
                <span className="text-cyan-300 font-semibold">
                  64バイトの「キャッシュライン」
                </span>
                単位でL1/L2キャッシュに読み込みます。
                つまり、あるアドレスのデータを読むと、その前後の64バイト分のデータも一緒にキャッシュに載ります。
                連続したメモリ領域を順番にアクセスするプログラムは、この仕組みの恩恵を最大限に受けられます。
              </p>
            </div>

            {/* AoSの問題点 */}
            <div className="space-y-2">
              <h4 className="font-bold text-red-400">
                ❌ AoSの問題: キャッシュミスの多発
              </h4>
              <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <p className="text-gray-500 mb-1">
                  AoS: オブジェクトごとに全プロパティがまとまる
                </p>
                <p className="text-red-300">
                  [&#123;x,y,z,w,v&#125;, &#123;x,y,z,w,v&#125;,
                  &#123;x,y,z,w,v&#125;, ...]
                </p>
                <p className="text-gray-500 mt-1">
                  xだけ合計したいのに、y,z,w,vも一緒にキャッシュに載ってしまう
                </p>
              </div>
              <p className="text-gray-400 leading-relaxed">
                AoSでは、特定のプロパティ（例: x）だけを集計したい場合でも、
                各オブジェクトの他のプロパティ（y, z, w,
                v）がキャッシュラインに含まれてしまいます。
                キャッシュの容量が無駄に消費され、
                <span className="text-red-300 font-semibold">
                  頻繁なキャッシュミス（Cache Miss）
                </span>
                が発生します。
              </p>
            </div>

            {/* SoAの利点 */}
            <div className="space-y-2">
              <h4 className="font-bold text-emerald-400">
                ✅ SoAの利点: プリフェッチャーの効率的な動作
              </h4>
              <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <p className="text-gray-500 mb-1">
                  SoA: 同じプロパティが連続して並ぶ
                </p>
                <p className="text-emerald-300">
                  x: [x₀, x₁, x₂, x₃, x₄, x₅, x₆, x₇, ...]
                </p>
                <p className="text-gray-600">
                  y: [y₀, y₁, y₂, y₃, ...] ← アクセスしない
                </p>
                <p className="text-gray-500 mt-1">
                  1回のキャッシュライン読み込みで8個のxを取得（Float64 = 8バイト × 8 = 64バイト）
                </p>
              </div>
              <p className="text-gray-400 leading-relaxed">
                SoAでは同じプロパティが連続したメモリ領域に配置されるため、
                CPUの
                <span className="text-emerald-300 font-semibold">
                  ハードウェアプリフェッチャー
                </span>
                がアクセスパターンを予測し、次のデータを事前にキャッシュに読み込みます。
                1回のキャッシュライン読み込みで
                <span className="text-emerald-300 font-semibold">
                  8個のFloat64値
                </span>
                を取得でき、帯域幅の利用効率が飛躍的に向上します。
              </p>
            </div>

            {/* 実際の採用例 */}
            <div className="space-y-2">
              <h4 className="font-bold text-purple-400">
                🎮 実際の採用例: ECS（Entity Component System）
              </h4>
              <p className="text-gray-400 leading-relaxed">
                ゲームエンジンで広く採用されている
                <span className="text-purple-300 font-semibold">
                  ECS（Entity Component System）
                </span>
                アーキテクチャは、まさにSoAの考え方を発展させたものです。
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-1 ml-2">
                <li>
                  <span className="text-purple-300">Unity DOTS / ECS</span> —
                  数万のエンティティを高速に処理
                </li>
                <li>
                  <span className="text-purple-300">Bevy Engine（Rust）</span>{" "}
                  — SoAレイアウトをデフォルト採用
                </li>
                <li>
                  <span className="text-purple-300">EnTT（C++）</span> —
                  キャッシュフレンドリーなECSライブラリ
                </li>
                <li>
                  <span className="text-purple-300">
                    Unreal Engine Mass Entity
                  </span>{" "}
                  — 大規模シミュレーション向けECS
                </li>
              </ul>
              <p className="text-gray-400 leading-relaxed mt-2">
                データ指向設計（Data-Oriented Design,
                DOD）では、「データのレイアウトがパフォーマンスを決める」が鉄則です。
                OOPの継承ツリーよりも、
                <span className="text-purple-300 font-semibold">
                  メモリ上のデータ配置
                </span>
                を意識することが、現代のハイパフォーマンスプログラミングの基礎となっています。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
