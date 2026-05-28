"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── 型定義 ───────────────────────────────────────────────
/** パフォーマンスログの種別。UIの色分けとアイコンに直結する */
export interface PerformanceLogEntry {
  id: string;
  timestamp: Date;
  type: "long-task" | "fps-drop" | "gc-event" | "info" | "warning";
  message: string;
  durationMs?: number;
}

interface PerformanceMonitorProps {
  externalLogs?: PerformanceLogEntry[];
}

// ─── 定数 ─────────────────────────────────────────────────
/** ブラウザの標準描画レートを基準としたFPS閾値 */
const FPS_THRESHOLD_GOOD = 60;
const FPS_THRESHOLD_WARNING = 30;

/** FPS低下を連続検知した場合にのみ警告するための閾値 */
const FPS_DROP_CONSECUTIVE_FRAMES = 5;

// ─── ヘルパー ─────────────────────────────────────────────
/** ログ種別に応じたアイコンを返す */
function getLogIcon(type: PerformanceLogEntry["type"]): string {
  const iconMap: Record<PerformanceLogEntry["type"], string> = {
    "long-task": "🔴",
    "fps-drop": "🟠",
    "gc-event": "🟣",
    info: "🔵",
    warning: "🟡",
  };
  return iconMap[type];
}

/** ログ種別に応じたTailwindテキストカラーを返す */
function getLogTextColor(type: PerformanceLogEntry["type"]): string {
  const colorMap: Record<PerformanceLogEntry["type"], string> = {
    "long-task": "text-red-400",
    "fps-drop": "text-orange-400",
    "gc-event": "text-purple-400",
    info: "text-blue-400",
    warning: "text-yellow-400",
  };
  return colorMap[type];
}

/** タイムスタンプを HH:MM:SS.mmm 形式にフォーマット */
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/** 一意なIDを生成（crypto.randomUUID非対応環境のフォールバック付き） */
function generateLogId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── FPSカラー判定 ────────────────────────────────────────
function getFpsColor(fps: number): string {
  if (fps >= FPS_THRESHOLD_GOOD) return "text-green-400";
  if (fps >= FPS_THRESHOLD_WARNING) return "text-yellow-400";
  return "text-red-400";
}

function getFpsBgColor(fps: number): string {
  if (fps >= FPS_THRESHOLD_GOOD) return "bg-green-500/20";
  if (fps >= FPS_THRESHOLD_WARNING) return "bg-yellow-500/20";
  return "bg-red-500/20";
}

// ─── コンポーネント ───────────────────────────────────────
export default function PerformanceMonitor({
  externalLogs,
}: PerformanceMonitorProps) {
  const [internalLogs, setInternalLogs] = useState<PerformanceLogEntry[]>([]);
  const [currentFps, setCurrentFps] = useState(60);
  const [isObserving, setIsObserving] = useState(true);

  // FPSカウント用のref群（再レンダリング不要な計測値はrefで管理）
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const animationFrameIdRef = useRef<number>(0);
  const lowFpsStreakRef = useRef(0);

  // PerformanceObserverの参照を保持（クリーンアップ用）
  const observerRef = useRef<PerformanceObserver | null>(null);

  /** 内部ログに新しいエントリを追加する */
  const addLog = useCallback((entry: Omit<PerformanceLogEntry, "id">) => {
    setInternalLogs((previous) => [
      { ...entry, id: generateLogId() },
      ...previous,
    ]);
  }, []);

  // PerformanceObserverの起動と管理
  useEffect(() => {
    if (!isObserving) return;

    // PerformanceObserver非対応環境（SSR含む）への防御
    if (typeof PerformanceObserver === "undefined") {
      setTimeout(() => {
        addLog({
          timestamp: new Date(),
          type: "warning",
          message: "PerformanceObserverがこの環境ではサポートされていません",
        });
      }, 0);
      return;
    }

    try {
      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const durationMs = Math.round(entry.duration);
          addLog({
            timestamp: new Date(),
            type: "long-task",
            message: `[警告] ${durationMs}msのLong Taskを検知。ユーザー体験にガタつきが発生しました`,
            durationMs,
          });
        }
      });

      observer.observe({ type: "longtask", buffered: true });
      observerRef.current = observer;

      setTimeout(() => {
        addLog({
          timestamp: new Date(),
          type: "info",
          message:
            "PerformanceObserver起動: Long Task（50ms以上）の監視を開始しました",
        });
      }, 0);
    } catch {
      setTimeout(() => {
        addLog({
          timestamp: new Date(),
          type: "warning",
          message: "Long Task監視の開始に失敗しました（longtaskタイプ非対応）",
        });
      }, 0);
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [isObserving, addLog]);

  // requestAnimationFrameベースのFPS計測ループ
  useEffect(() => {
    if (!isObserving) return;

    const measureFrame = (now: number) => {
      frameCountRef.current++;
      
      // 初回フレーム実行時に基準時間を設定
      if (lastFpsUpdateRef.current === 0) {
        lastFpsUpdateRef.current = now;
      }

      const elapsed = now - lastFpsUpdateRef.current;

      // 約1秒ごとにFPSを更新（高頻度すぎるstate更新を避ける）
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        setCurrentFps(fps);

        // FPS低下が連続した場合のみ警告を出す（一瞬のドロップでノイズを出さない）
        if (fps < FPS_THRESHOLD_WARNING) {
          lowFpsStreakRef.current++;
          if (lowFpsStreakRef.current >= FPS_DROP_CONSECUTIVE_FRAMES) {
            addLog({
              timestamp: new Date(),
              type: "fps-drop",
              message: `FPS低下検知: ${fps}fps — メインスレッドの負荷が高い状態が継続しています`,
              durationMs: elapsed,
            });
            lowFpsStreakRef.current = 0;
          }
        } else {
          lowFpsStreakRef.current = 0;
        }

        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

      animationFrameIdRef.current = requestAnimationFrame(measureFrame);
    };

    animationFrameIdRef.current = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [isObserving, addLog]);

  // 外部ログの取り込み（externalLogsの差分のみ追加）
  const lastExternalCountRef = useRef(0);
  useEffect(() => {
    if (!externalLogs) return;

    // 前回取り込み済みの件数より新しいものだけを追加
    const newEntries = externalLogs.slice(lastExternalCountRef.current);
    if (newEntries.length === 0) return;

    lastExternalCountRef.current = externalLogs.length;
    setInternalLogs((previous) => [...newEntries.reverse(), ...previous]);
  }, [externalLogs]);

  /** ログをすべてクリアする */
  const clearLogs = useCallback(() => {
    setInternalLogs([]);
    lastExternalCountRef.current = externalLogs?.length ?? 0;
  }, [externalLogs]);

  /** 監視のON/OFFを切り替える */
  const toggleObserving = useCallback(() => {
    setIsObserving((previous) => !previous);
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-950/30 backdrop-blur-md shadow-inner text-slate-100 font-sans">
      {/* ── ヘッダー：FPSインジケーター + コントロール ── */}
      <div className="flex items-center justify-between border-b border-gray-700 px-8 py-5">
        <div className="flex items-center gap-3.5">
          <h2 className="text-sm font-bold tracking-wide text-gray-200">
            📊 Performance Monitor
          </h2>
          <div
            className={`rounded-md px-2.5 py-1 text-xs font-mono font-bold ${getFpsBgColor(currentFps)} ${getFpsColor(currentFps)}`}
          >
            {currentFps} FPS
          </div>
          <div
            className={`h-2.5 w-2.5 rounded-full ${isObserving ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
            title={isObserving ? "監視中" : "停止中"}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleObserving}
            className={`rounded-md px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
              isObserving
                ? "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30"
                : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
            }`}
          >
            {isObserving ? "⏸ 停止" : "▶ 開始"}
          </button>
          <button
            onClick={clearLogs}
            className="rounded-md bg-gray-700/50 px-4 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200 cursor-pointer"
          >
            🗑 クリア
          </button>
        </div>
      </div>

      {/* ── FPS詳細バー ── */}
      <div className="border-b border-gray-800 px-8 py-4.5">
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">FPS:</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                currentFps >= FPS_THRESHOLD_GOOD
                  ? "bg-green-500"
                  : currentFps >= FPS_THRESHOLD_WARNING
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${Math.min((currentFps / 120) * 100, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-mono ${getFpsColor(currentFps)}`}>
            {currentFps}/60
          </span>
        </div>
      </div>

      {/* ── ログエントリ一覧（DevToolsコンソール風） ── */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] md:text-xs min-h-[100px]">
        {internalLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-600 font-sans p-8">
            ログエントリはまだありません
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {internalLogs.map((logEntry) => (
              <div
                key={logEntry.id}
                className="flex items-start gap-4 px-8 py-3.5 hover:bg-gray-800/30 transition-all duration-150"
              >
                {/* タイムスタンプ */}
                <span className="shrink-0 text-gray-600">
                  {formatTimestamp(logEntry.timestamp)}
                </span>
                {/* 種別アイコン */}
                <span className="shrink-0">
                  {getLogIcon(logEntry.type)}
                </span>
                {/* メッセージ */}
                <span className={`flex-1 leading-relaxed ${getLogTextColor(logEntry.type)}`}>
                  {logEntry.message}
                </span>
                {/* 処理時間（存在する場合） */}
                {logEntry.durationMs !== undefined && (
                  <span className="shrink-0 text-gray-500 font-bold">
                    {logEntry.durationMs}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── フッター：統計サマリー ── */}
      <div className="flex items-center justify-between border-t border-gray-800 px-8 py-4.5 text-xs text-gray-500">
        <span>
          ログ数: {internalLogs.length} |
          Long Task:{" "}
          {internalLogs.filter((log) => log.type === "long-task").length}件
        </span>
        <span>
          {isObserving ? "🟢 リアルタイム監視中" : "⏹ 監視停止中"}
        </span>
      </div>
    </div>
  );
}
