import { describe, expect, test, vi } from "vitest";
import {
  calculateJankMarkerPosition,
  formatTimestamp,
  generateLogId,
  getFpsStatus,
  getNewExternalLogEntries,
  getLogIcon,
  isJankFrame,
} from "./performanceMonitorMetrics";

describe("performanceMonitorMetrics", () => {
  test("FPS の境界値をステータスへ分類する", () => {
    // Given
    const fpsValues = [60, 59, 30, 29];

    // When
    const statuses = fpsValues.map((fps) => getFpsStatus(fps));

    // Then
    expect(statuses).toEqual(["good", "warning", "warning", "danger"]);
  });

  test("ログ種別に対応するアイコンを返す", () => {
    // Given
    const logTypes = [
      "long-task",
      "fps-drop",
      "gc-event",
      "info",
      "warning",
    ] as const;

    // When
    const icons = logTypes.map((type) => getLogIcon(type));

    // Then
    expect(icons).toEqual(["🔴", "🟠", "🟣", "🔵", "🟡"]);
  });

  test("Jank Preview のマーカー位置をトラック内の範囲に収める", () => {
    // Given
    const frameTimes = [0, 14, 14 * 94];

    // When
    const positions = frameTimes.map((time) => calculateJankMarkerPosition(time));

    // Then
    expect(positions).toEqual([3, 4, 3]);
  });

  test("50ms 以上のフレーム間隔を jank と判定する", () => {
    // Given
    const smoothFrameGapMs = 49.9;
    const jankFrameGapMs = 50;

    // When
    const smoothFrameResult = isJankFrame(smoothFrameGapMs);
    const jankFrameResult = isJankFrame(jankFrameGapMs);

    // Then
    expect(smoothFrameResult).toBe(false);
    expect(jankFrameResult).toBe(true);
  });

  test("時刻をミリ秒付きで表示する", () => {
    // Given
    const timestamp = new Date("2026-05-29T12:34:56.789+09:00");

    // When
    const formatted = formatTimestamp(timestamp);

    // Then
    expect(formatted).toMatch(/12:34:56\.789|03:34:56\.789/);
  });

  test("crypto.randomUUID がある環境ではそれを優先して使う", () => {
    // Given
    const expectedId = "00000000-0000-4000-8000-000000000000";
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(expectedId);

    // When
    const logId = generateLogId();

    // Then
    expect(logId).toBe(expectedId);
    randomUUID.mockRestore();
  });

  test("外部ログはID未取り込みのものだけ返す", () => {
    // Given
    const consumedLogIds = new Set(["welcome"]);
    const externalLogs = [
      { id: "benchmark-1", message: "newest" },
      { id: "welcome", message: "already consumed" },
    ];

    // When
    const newEntries = getNewExternalLogEntries(externalLogs, consumedLogIds);

    // Then
    expect(newEntries).toEqual([{ id: "benchmark-1", message: "newest" }]);
  });
});
