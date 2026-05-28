export const FPS_THRESHOLD_GOOD = 60;
export const FPS_THRESHOLD_WARNING = 30;
export const FPS_DROP_CONSECUTIVE_FRAMES = 5;
export const JANK_FRAME_THRESHOLD_MS = 50;

export type FpsStatus = "good" | "warning" | "danger";
export type PerformanceLogType =
  | "long-task"
  | "fps-drop"
  | "gc-event"
  | "info"
  | "warning";

export function getLogIcon(type: PerformanceLogType): string {
  const iconMap: Record<PerformanceLogType, string> = {
    "long-task": "🔴",
    "fps-drop": "🟠",
    "gc-event": "🟣",
    info: "🔵",
    warning: "🟡",
  };
  return iconMap[type];
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function generateLogId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getFpsStatus(fps: number): FpsStatus {
  if (fps >= FPS_THRESHOLD_GOOD) return "good";
  if (fps >= FPS_THRESHOLD_WARNING) return "warning";
  return "danger";
}

export function calculateJankMarkerPosition(nowMs: number): number {
  return 3 + ((nowMs / 14) % 94);
}

export function isJankFrame(frameGapMs: number): boolean {
  return frameGapMs >= JANK_FRAME_THRESHOLD_MS;
}

export function getNewExternalLogEntries<TLogEntry extends { id: string }>(
  externalLogs: TLogEntry[],
  consumedLogIds: ReadonlySet<string>,
): TLogEntry[] {
  return externalLogs.filter((logEntry) => !consumedLogIds.has(logEntry.id));
}
