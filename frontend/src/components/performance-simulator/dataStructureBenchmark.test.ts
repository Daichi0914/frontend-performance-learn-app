import { describe, expect, test, vi } from "vitest";
import {
  benchmarkAoS,
  benchmarkSoA,
  createArrayOfStructs,
  createBenchmarkComparison,
  createStructOfArrays,
  generatePropertyNames,
  getBenchmarkTaskLabel,
  mergeBenchmarkResult,
  type BenchmarkResult,
} from "./dataStructureBenchmark";

describe("dataStructureBenchmark", () => {
  test("指定数のプロパティ名を順序付きで生成する", () => {
    // Given
    const propertyCount = 4;

    // When
    const propertyNames = generatePropertyNames(propertyCount);

    // Then
    expect(propertyNames).toEqual([
      "prop_0",
      "prop_1",
      "prop_2",
      "prop_3",
    ]);
  });

  test("AoS と SoA のデータ構造を同じ入力仕様から生成できる", () => {
    // Given
    const itemCount = 2;
    const propertyNames = ["x", "y"];
    const aosRandom = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.4);

    // When
    const aos = createArrayOfStructs(itemCount, propertyNames, aosRandom);

    // Then
    expect(aos).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);

    // Given
    const soaRandom = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.4);

    // When
    const soa = createStructOfArrays(itemCount, propertyNames, soaRandom);

    // Then
    expect(Array.from(soa.x)).toEqual([10, 20]);
    expect(Array.from(soa.y)).toEqual([30, 40]);
  });

  test("AoS と SoA の合計・平均を同じ反復数で計算する", () => {
    // Given
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(112)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(215);
    const aosData = [{ x: 1 }, { x: 2 }];
    const soaData = { x: new Float64Array([1, 2]) };

    // When
    const aos = benchmarkAoS(aosData, "x", 3);
    const soa = benchmarkSoA(soaData, "x", 3);

    // Then
    expect(aos).toEqual({
      durationMs: 12,
      sum: 9,
      average: 1.5,
    });
    expect(soa).toEqual({
      durationMs: 15,
      sum: 9,
      average: 1.5,
    });

    performanceNow.mockRestore();
  });

  test("同じ設定の片側実行では既存のもう片側結果を保持する", () => {
    // Given
    const previousResult: BenchmarkResult = {
      aosDurationMs: 20,
      soaDurationMs: 10,
      aosSum: 100,
      soaSum: 200,
      aosAverage: 5,
      soaAverage: 10,
      itemCount: 1000,
      propertyCount: 3,
    };

    // When
    const merged = mergeBenchmarkResult(previousResult, {
      aosResult: null,
      soaResult: { durationMs: 8, sum: 160, average: 8 },
      itemCount: 1000,
      propertyCount: 3,
    });

    // Then
    expect(merged).toMatchObject({
      aosDurationMs: 20,
      soaDurationMs: 8,
      aosSum: 100,
      soaSum: 160,
    });
  });

  test("設定が変わった片側実行では古い比較対象を破棄する", () => {
    // Given
    const previousResult: BenchmarkResult = {
      aosDurationMs: 20,
      soaDurationMs: 10,
      aosSum: 100,
      soaSum: 200,
      aosAverage: 5,
      soaAverage: 10,
      itemCount: 1000,
      propertyCount: 3,
    };

    // When
    const merged = mergeBenchmarkResult(previousResult, {
      aosResult: { durationMs: 30, sum: 300, average: 15 },
      soaResult: null,
      itemCount: 2000,
      propertyCount: 3,
    });

    // Then
    expect(merged).toMatchObject({
      aosDurationMs: 30,
      soaDurationMs: null,
      aosSum: 300,
      soaSum: null,
      itemCount: 2000,
    });
  });

  test("両方の結果が揃った時だけ比較値を作る", () => {
    // Given
    const comparableResult: BenchmarkResult = {
      aosDurationMs: 20,
      soaDurationMs: 10,
      aosSum: 1,
      soaSum: 1,
      aosAverage: 1,
      soaAverage: 1,
      itemCount: 1000,
      propertyCount: 3,
    };
    const incompleteResult: BenchmarkResult = {
      aosDurationMs: 20,
      soaDurationMs: null,
      aosSum: 1,
      soaSum: null,
      aosAverage: 1,
      soaAverage: null,
      itemCount: 1000,
      propertyCount: 3,
    };

    // When
    const comparison = createBenchmarkComparison(comparableResult);
    const incompleteComparison = createBenchmarkComparison(incompleteResult);

    // Then
    expect(comparison).toEqual({
      aosDurationMs: 20,
      soaDurationMs: 10,
      speedupPercentage: 50,
    });
    expect(incompleteComparison).toBeNull();
  });

  test("Long Task 通知用ラベルをターゲット別に返す", () => {
    // Given
    const targets = ["aos", "soa", "both"] as const;

    // When
    const labels = targets.map((target) => getBenchmarkTaskLabel(target));

    // Then
    expect(labels).toEqual(["AoS", "SoA", "AoS vs SoA"]);
  });
});
