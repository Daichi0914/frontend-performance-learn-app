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
    <div className="bg-slate-900/10 backdrop-blur-md border border-slate-800/60 rounded-2xl p-10 md:p-14 shadow-xl shadow-slate-950/20 transition-all duration-300 flex-1 flex flex-col justify-between">
      {/* 2カラムレイアウトコンテナ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
        
        {/* 左カラム：説明用のコンポーネント */}
        <div className="lg:col-span-5 flex flex-col space-y-8">
          <div className="space-y-6">
            {/* ヘッダー */}
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.05)]">
                <span className="text-xl filter drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">🧱</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                  Data Layout &amp; Cache
                </h2>
                <p className="text-xs text-slate-500 font-mono tracking-wider uppercase mt-1 leading-none">AoS vs SoA Simulator</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              AoS (Array of Structs) と SoA (Struct of Arrays) のメモリ構造の違いが、CPUキャッシュ効率に及ぼす影響を比較します。
            </p>
          </div>

          {/* 技術解説（開閉なしで常時表示） */}
          <div className="flex-1 border border-slate-800/80 rounded-2xl bg-slate-950/20 backdrop-blur-sm p-8 space-y-8 text-sm text-slate-300 overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800 font-sans">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
              📖 なぜSoAが速いのか？（メモリ配置とCPUキャッシュ）
            </h3>
            {/* CPUキャッシュラインの仕組み */}
            <div className="space-y-4">
              <h4 className="font-bold text-cyan-400 flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> CPUキャッシュライン（64バイト）の仕組み
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                CPUがメモリからデータを読み込む際、1バイトずつではなく<span className="text-cyan-300 font-semibold">64バイトの「キャッシュライン」</span>という単位でL1/L2キャッシュに一括転送します。連続するメモリ領域に順番にアクセスするプログラムは、このキャッシュの恩恵を100%受けることができます。
              </p>
            </div>

            {/* AoSの問題点 */}
            <div className="space-y-4">
              <h4 className="font-bold text-rose-400 flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> AoSの問題: キャッシュミスの多発
              </h4>
              <div className="bg-slate-950/80 rounded-xl p-5 font-mono text-[10px] overflow-x-auto border border-slate-800/60 leading-relaxed">
                <p className="text-slate-500 mb-1.5">AoS (Array of Structs): オブジェクトの配列</p>
                <p className="text-rose-300">[&#123;x,y,z,w,v&#125;, &#123;x,y,z,w,v&#125;, ...]</p>
                <p className="text-slate-500 mt-1.5">※ xの集計中、不要な y, z, w, v までキャッシュを埋めてしまう</p>
              </div>
              <p className="text-slate-400 leading-relaxed text-xs">
                AoSでは、ある特定のプロパティ（例: x）だけを集計したい場合でも、隣接する他のデータ（y, z, w, v）が強制的にキャッシュに読み込まれます。キャッシュの容量が無駄に占有され、結果として<span className="text-rose-300 font-semibold">頻繁なキャッシュミス（Cache Miss）</span>による遅延が発生します。
              </p>
            </div>

            {/* SoAの利点 */}
            <div className="space-y-4">
              <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> SoAの利点: プリフェッチャー of 最大効率化
              </h4>
              <div className="bg-slate-950/80 rounded-xl p-5 font-mono text-[10px] overflow-x-auto border border-slate-800/60 leading-relaxed">
                <p className="text-slate-500 mb-1.5">SoA (Struct of Arrays): 配列の構造体</p>
                <p className="text-emerald-300">x: [x0, x1, x2, x3, x4, x5, x6, x7, ...]</p>
                <p className="text-slate-500 mt-1.5">※ 1回のロードで8個 of xを取得可能（Float64 = 8バイト × 8 = 64バイト）</p>
              </div>
              <p className="text-slate-400 leading-relaxed text-xs">
                SoAでは同じプロパティのデータが隙間なく連続したメモリ領域に配置されます。そのため、CPU of <span className="text-emerald-300 font-semibold">ハードウェアプリフェッチャー</span>がアクセスパターンを予測し、次フレームに必要なデータを先回りしてキャッシュします。1回のメモリロードで<span className="text-emerald-300 font-semibold">8個の倍精度浮動小数点数（Float64）</span>を取得でき、データ転送効率が劇的に高まります。
              </p>
            </div>

            {/* 実際の採用例 */}
            <div className="space-y-4 pb-2">
              <h4 className="font-bold text-indigo-400 flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> 🎮 実際の応用: ECS (Entity Component System)
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                ゲームエンジンや大規模シミュレータで採用される<span className="text-indigo-300 font-semibold">ECS (Entity Component System)</span>は、このSoAメモリレイアウトをコアに据えています。
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-3 ml-2.5 text-xs leading-relaxed">
                <li><span className="text-indigo-300">Unity DOTS / ECS</span> — 数万のアクティブなオブジェクトを秒間60フレーム以上で並列処理。</li>
                <li><span className="text-indigo-300">Bevy Engine (Rust)</span> — 言語の安全性を生かし、SoAストレージをコア構造に採用。</li>
                <li><span className="text-indigo-300">Unreal Engine MassEntity</span> — 群衆シミュレーションなどのためにキャッシュ指向のデータ配置を提供。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 右カラム：実行エリア（上）と実行結果表示エリア（下） */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* コントロールカード */}
          <div className="space-y-8 bg-slate-950/40 rounded-2xl p-8 md:p-10 border border-slate-900/80 shadow-inner">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="text-cyan-400">⚙️</span> Configuration
            </h3>

            {/* データ件数スライダー */}
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <label htmlFor="item-count-slider" className="text-sm text-slate-400 font-medium">データ件数</label>
                <span className="font-mono text-cyan-400 text-base font-bold">{itemCount.toLocaleString()} <span className="text-xs text-slate-500 font-normal">件</span></span>
              </div>
              <input
                id="item-count-slider"
                type="range"
                min={SLIDER_CONFIG.itemCount.min}
                max={SLIDER_CONFIG.itemCount.max}
                step={SLIDER_CONFIG.itemCount.step}
                value={itemCount}
                onChange={(e) => setItemCount(Number(e.target.value))}
                className="w-full h-1 rounded-lg bg-slate-900 appearance-none cursor-pointer accent-cyan-400 transition-all hover:bg-slate-800"
              />
              <div className="flex justify-between text-xs font-mono text-slate-600">
                <span>{SLIDER_CONFIG.itemCount.min.toLocaleString()}</span>
                <span>{SLIDER_CONFIG.itemCount.max.toLocaleString()}</span>
              </div>
            </div>

            {/* プロパティ数スライダー */}
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <label htmlFor="property-count-slider" className="text-sm text-slate-400 font-medium">プロパティ数</label>
                <span className="font-mono text-cyan-400 text-base font-bold">{propertyCount} <span className="text-xs text-slate-500 font-normal">個</span></span>
              </div>
              <input
                id="property-count-slider"
                type="range"
                min={SLIDER_CONFIG.propertyCount.min}
                max={SLIDER_CONFIG.propertyCount.max}
                step={SLIDER_CONFIG.propertyCount.step}
                value={propertyCount}
                onChange={(e) => setPropertyCount(Number(e.target.value))}
                className="w-full h-1 rounded-lg bg-slate-900 appearance-none cursor-pointer accent-cyan-400 transition-all hover:bg-slate-800"
              />
              <div className="flex justify-between text-xs font-mono text-slate-600">
                <span>{SLIDER_CONFIG.propertyCount.min}</span>
                <span>{SLIDER_CONFIG.propertyCount.max}</span>
              </div>
            </div>

            {/* 実行ボタン */}
            <button
              type="button"
              onClick={runBenchmark}
              disabled={isRunning}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-white text-sm cursor-pointer
                bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600
                hover:from-cyan-500 hover:via-cyan-400 hover:to-blue-500
                active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                transition-all duration-200
                shadow-lg shadow-cyan-900/10 hover:shadow-cyan-500/15 border border-cyan-400/20"
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Benchmarking...
                </span>
              ) : (
                "🚀 ベンチマーク実行"
              )}
            </button>
          </div>

          {/* 実行結果表示エリア */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            {!result ? (
              /* ベンチマーク未実行のプレースホルダー */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 border border-dashed border-slate-800 rounded-2xl bg-slate-950/20 shadow-inner">
                <div className="h-12 w-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800/80 text-slate-500 mb-3">
                  📊
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metrics Standby</h3>
                <p className="text-[11px] text-slate-500 max-w-xs mt-1.5 leading-relaxed">
                  データ設定を調整した上で、「ベンチマーク実行」ボタンを押すとメモリキャッシュ効率の測定が開始されます。
                </p>
              </div>
            ) : (
              /* 実行結果 */
              <div className="space-y-8 flex-1 flex flex-col justify-between">
                
                <div className="space-y-8 bg-slate-950/20 rounded-2xl p-8 md:p-10 border border-slate-900/80 flex-1 flex flex-col justify-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <span className="text-cyan-400">📊</span> Execution Metrics
                  </h3>
   
                  <div className="space-y-6">
                    {/* AoSバー */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-rose-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" /> AoS (Array of Structs)
                        </span>
                        <span className="font-mono text-rose-300">
                          {result.aosDurationMs.toFixed(2)} ms
                        </span>
                      </div>
                      <div className="h-5 bg-slate-950 rounded-lg overflow-hidden border border-slate-900/80 p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-md transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                          style={{
                            width: maxDuration > 0 ? `${(result.aosDurationMs / maxDuration) * 100}%` : "0%",
                          }}
                        />
                      </div>
                    </div>
   
                    {/* SoAバー */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> SoA (Struct of Arrays)
                        </span>
                        <span className="font-mono text-emerald-300">
                          {result.soaDurationMs.toFixed(2)} ms
                        </span>
                      </div>
                      <div className="h-5 bg-slate-950 rounded-lg overflow-hidden border border-slate-900/80 p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-md transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                          style={{
                            width: maxDuration > 0 ? `${(result.soaDurationMs / maxDuration) * 100}%` : "0%",
                          }}
                        />
                      </div>
                    </div>
   
                    {/* 速度差テキスト */}
                    {speedupPercentage !== null && (
                      <div className="pt-4 border-t border-slate-900 text-center">
                        {speedupPercentage > 0 ? (
                          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/5 text-emerald-400 text-sm font-bold border border-emerald-500/10 shadow-sm">
                            ⚡ SoA は AoS より <span className="text-base font-extrabold text-white">{(result.aosDurationMs / result.soaDurationMs).toFixed(1)}倍</span> (約 {speedupPercentage.toFixed(1)}%) 高速
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/5 text-amber-400 text-sm font-bold border border-amber-500/10 shadow-sm">
                            ⚠️ AoS が SoA より <span className="text-base font-extrabold text-white">{(result.soaDurationMs / result.aosDurationMs).toFixed(1)}倍</span> (約 {Math.abs(speedupPercentage).toFixed(1)}%) 高速
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
   
                {/* DCE回避用: 計算結果の表示 */}
                <div className="bg-slate-950/40 rounded-2xl p-8 border border-slate-900/80">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      🔢 Output Verification (DCE Prevention)
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    ※ JSエンジンによるDead Code Eliminationを防ぐため、計算結果を画面に出力しています。
                  </p>
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono leading-relaxed text-slate-400">
                    <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
                      <p className="text-rose-400 font-bold text-xs mb-1.5">AoS Results</p>
                      <p>Sum: <span className="text-slate-200">{result.aosSum.toFixed(4)}</span></p>
                      <p>Avg: <span className="text-slate-200">{result.aosAverage.toFixed(6)}</span></p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-emerald-400 font-bold text-xs mb-1.5">SoA Results</p>
                      <p>Sum: <span className="text-slate-200">{result.soaSum.toFixed(4)}</span></p>
                      <p>Avg: <span className="text-slate-200">{result.soaAverage.toFixed(6)}</span></p>
                    </div>
                  </div>
                  <div className="mt-3.5 pt-3 border-t border-slate-900 text-[10px] text-slate-600 font-mono flex justify-between">
                    <span>データ件数: {result.itemCount.toLocaleString()} 件</span>
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
