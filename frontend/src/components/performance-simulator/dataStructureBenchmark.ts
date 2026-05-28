export type BenchmarkTarget = "aos" | "soa" | "both";

export type RunningTarget = BenchmarkTarget | null;

export interface BenchmarkMeasurement {
  durationMs: number;
  sum: number;
  average: number;
}

export interface BenchmarkResult {
  aosDurationMs: number | null;
  soaDurationMs: number | null;
  aosSum: number | null;
  soaSum: number | null;
  aosAverage: number | null;
  soaAverage: number | null;
  itemCount: number;
  propertyCount: number;
}

export interface BenchmarkComparison {
  aosDurationMs: number;
  soaDurationMs: number;
  speedupPercentage: number;
}

export type StructElement = Record<string, number>;
export type StructOfArrays = Record<string, Float64Array>;

export const BENCHMARK_ITERATIONS = 100;
export const LONG_TASK_THRESHOLD_MS = 50;

export const SLIDER_CONFIG = {
  itemCount: { min: 1000, max: 200000, step: 1000, default: 10000 },
  propertyCount: { min: 3, max: 20, step: 1, default: 5 },
} as const;

export function generatePropertyNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `prop_${index}`);
}

export function createArrayOfStructs(
  itemCount: number,
  propertyNames: string[],
  random: () => number = Math.random,
): StructElement[] {
  return Array.from({ length: itemCount }, () => {
    const element: StructElement = {};
    for (const name of propertyNames) {
      element[name] = random() * 100;
    }
    return element;
  });
}

export function createStructOfArrays(
  itemCount: number,
  propertyNames: string[],
  random: () => number = Math.random,
): StructOfArrays {
  const soa: StructOfArrays = {};
  for (const name of propertyNames) {
    const array = new Float64Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      array[i] = random() * 100;
    }
    soa[name] = array;
  }
  return soa;
}

export function benchmarkAoS(
  data: StructElement[],
  targetProperty: string,
  iterations: number = BENCHMARK_ITERATIONS,
): BenchmarkMeasurement {
  const startTime = performance.now();

  let totalSum = 0;
  let lastAverage = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let itemIndex = 0; itemIndex < data.length; itemIndex++) {
      sum += data[itemIndex][targetProperty];
    }
    totalSum += sum;
    lastAverage = sum / data.length;
  }

  return {
    durationMs: performance.now() - startTime,
    sum: totalSum,
    average: lastAverage,
  };
}

export function benchmarkSoA(
  data: StructOfArrays,
  targetProperty: string,
  iterations: number = BENCHMARK_ITERATIONS,
): BenchmarkMeasurement {
  const startTime = performance.now();

  let totalSum = 0;
  let lastAverage = 0;
  const array = data[targetProperty];
  const length = array.length;

  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let itemIndex = 0; itemIndex < length; itemIndex++) {
      sum += array[itemIndex];
    }
    totalSum += sum;
    lastAverage = sum / length;
  }

  return {
    durationMs: performance.now() - startTime,
    sum: totalSum,
    average: lastAverage,
  };
}

export function mergeBenchmarkResult(
  previousResult: BenchmarkResult | null,
  nextResult: {
    aosResult: BenchmarkMeasurement | null;
    soaResult: BenchmarkMeasurement | null;
    itemCount: number;
    propertyCount: number;
  },
): BenchmarkResult {
  const canKeepPrevious =
    previousResult?.itemCount === nextResult.itemCount &&
    previousResult.propertyCount === nextResult.propertyCount;

  return {
    aosDurationMs:
      nextResult.aosResult?.durationMs ??
      (canKeepPrevious ? previousResult?.aosDurationMs : null) ??
      null,
    soaDurationMs:
      nextResult.soaResult?.durationMs ??
      (canKeepPrevious ? previousResult?.soaDurationMs : null) ??
      null,
    aosSum:
      nextResult.aosResult?.sum ??
      (canKeepPrevious ? previousResult?.aosSum : null) ??
      null,
    soaSum:
      nextResult.soaResult?.sum ??
      (canKeepPrevious ? previousResult?.soaSum : null) ??
      null,
    aosAverage:
      nextResult.aosResult?.average ??
      (canKeepPrevious ? previousResult?.aosAverage : null) ??
      null,
    soaAverage:
      nextResult.soaResult?.average ??
      (canKeepPrevious ? previousResult?.soaAverage : null) ??
      null,
    itemCount: nextResult.itemCount,
    propertyCount: nextResult.propertyCount,
  };
}

export function createBenchmarkComparison(
  result: BenchmarkResult | null,
): BenchmarkComparison | null {
  const aosDurationMs = result?.aosDurationMs ?? null;
  const soaDurationMs = result?.soaDurationMs ?? null;

  if (aosDurationMs === null || soaDurationMs === null || aosDurationMs <= 0) {
    return null;
  }

  return {
    aosDurationMs,
    soaDurationMs,
    speedupPercentage: ((aosDurationMs - soaDurationMs) / aosDurationMs) * 100,
  };
}

export function getBenchmarkTaskLabel(target: BenchmarkTarget): string {
  if (target === "both") return "AoS vs SoA";
  if (target === "aos") return "AoS";
  return "SoA";
}
