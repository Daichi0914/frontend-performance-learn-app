"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./PerformanceMonitor.module.scss";

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
const JANK_FRAME_THRESHOLD_MS = 50;

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

// ─── FPSステータス判定 ────────────────────────────────────────
function getFpsStatus(fps: number): "good" | "warning" | "danger" {
  if (fps >= FPS_THRESHOLD_GOOD) return "good";
  if (fps >= FPS_THRESHOLD_WARNING) return "warning";
  return "danger";
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
  const lastFrameTimeRef = useRef(0);
  const animationFrameIdRef = useRef<number>(0);
  const lowFpsStreakRef = useRef(0);
  const jankResetTimeoutRef = useRef<number>(0);
  const jankMarkerRef = useRef<HTMLDivElement | null>(null);
  const jankGapRef = useRef<HTMLSpanElement | null>(null);

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

      if (lastFrameTimeRef.current !== 0) {
        const frameGapMs = now - lastFrameTimeRef.current;
        const marker = jankMarkerRef.current;

        if (marker) {
          const progress = 3 + ((now / 14) % 94);
          marker.style.left = `${progress}%`;

          if (frameGapMs >= JANK_FRAME_THRESHOLD_MS) {
            marker.classList.add(styles.janking);
            if (jankGapRef.current) {
              jankGapRef.current.textContent = `${Math.round(frameGapMs)}ms`;
            }
            window.clearTimeout(jankResetTimeoutRef.current);
            jankResetTimeoutRef.current = window.setTimeout(() => {
              marker.classList.remove(styles.janking);
            }, 220);
          }
        }
      }
      lastFrameTimeRef.current = now;
      
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
              message: `FPS低下検知: ${fps}fps — メインスレッド of 負荷が高い状態が継続しています`,
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
      window.clearTimeout(jankResetTimeoutRef.current);
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
    <div className={styles.monitorContainer}>
      {/* ── ヘッダー：FPSインジケーター + コントロール ── */}
      <div className={styles.header}>
        <div className={styles.headerTitleWrapper}>
          <div
            className={`${styles.fpsBadge} ${styles[getFpsStatus(currentFps)]}`}
          >
            {currentFps} FPS
          </div>
          <div
            className={`
              ${styles.statusIndicator}
              ${isObserving ? styles.observing : ""}
            `}
            title={isObserving ? "監視中" : "停止中"}
          />
        </div>
        <div className={styles.controls}>
          <button
            onClick={toggleObserving}
            className={`
              ${styles.btnControl}
              ${styles.toggleObserving}
              ${isObserving ? styles.observing : styles.stopped}
            `}
          >
            {isObserving ? "⏸ 停止" : "▶ 開始"}
          </button>
          <button
            onClick={clearLogs}
            className={`${styles.btnControl} ${styles.clear}`}
          >
            🗑 クリア
          </button>
        </div>
      </div>

      {/* ── FPS詳細バー ── */}
      <div className={styles.fpsDetailBar}>
        <span className={styles.label}>FPS:</span>
        <div className={styles.progressBg}>
          <div
            className={`
              ${styles.progressBar}
              ${styles[getFpsStatus(currentFps)]}
            `}
            style={{ width: `${Math.min((currentFps / 120) * 100, 100)}%` }}
          />
        </div>
        <span className={`${styles.valueText} ${styles[getFpsStatus(currentFps)]}`}>
          {currentFps}/60
        </span>
      </div>

      <div className={styles.jankPreview}>
        <div className={styles.jankPreviewHeader}>
          <span>Jank Preview</span>
          <span ref={jankGapRef} className={styles.jankGap}>
            16ms
          </span>
        </div>
        <div className={styles.jankTrack} aria-hidden="true">
          <div ref={jankMarkerRef} className={styles.jankMarker} />
        </div>
      </div>

      {/* ── ログエントリ一覧（DevToolsコンソール風） ── */}
      <div className={styles.logsContainer}>
        {internalLogs.length === 0 ? (
          <div className={styles.noLogs}>
            ログエントリはまだありません
          </div>
        ) : (
          <div className={styles.logList}>
            {internalLogs.map((logEntry) => (
              <div
                key={logEntry.id}
                className={styles.logEntry}
              >
                {/* タイムスタンプ */}
                <span className={styles.timestamp}>
                  {formatTimestamp(logEntry.timestamp)}
                </span>
                {/* 種別アイコン */}
                <span className={styles.icon}>
                  {getLogIcon(logEntry.type)}
                </span>
                {/* メッセージ */}
                <span className={`${styles.message} ${styles[logEntry.type]}`}>
                  {logEntry.message}
                </span>
                {/* 処理時間（存在する場合） */}
                {logEntry.durationMs !== undefined && (
                  <span className={styles.duration}>
                    {logEntry.durationMs}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── フッター：統計サマリー ── */}
      <div className={styles.footer}>
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
