"use client";

import { useState, useCallback } from "react";
import DataStructureSimulator from "@/components/performance-simulator/DataStructureSimulator";
import JitSimulator from "@/components/performance-simulator/JitSimulator";
import GarbageCollectionSimulator from "@/components/performance-simulator/GarbageCollectionSimulator";
import PerformanceMonitor from "@/components/performance-simulator/PerformanceMonitor";
import type { PerformanceLogEntry } from "@/components/performance-simulator/PerformanceMonitor";
import styles from "./page.module.scss";

/** シミュレーターのセクション識別子 */
type SimulatorSection = "data-structure" | "jit" | "gc";

/** セクション定義: 各シミュレーターのメタ情報 */
const SECTIONS: readonly {
  id: SimulatorSection;
  label: string;
  icon: string;
  shortLabel: string;
}[] = [
  {
    id: "data-structure",
    label: "データ構造 & キャッシュ効率",
    icon: "📊",
    shortLabel: "AoS vs SoA",
  },
  {
    id: "jit",
    label: "JIT Compilation & Hidden Class",
    icon: "⚡",
    shortLabel: "JIT Engine",
  },
  {
    id: "gc",
    label: "世代別GC シミュレーター",
    icon: "🗑️",
    shortLabel: "GC Tank",
  },
] as const;

export default function PerformanceSimulatorPage() {
  const [activeSection, setActiveSection] =
    useState<SimulatorSection>("data-structure");
  const [performanceLogs, setPerformanceLogs] = useState<
    PerformanceLogEntry[]
  >(() => [
    {
      id: "welcome",
      timestamp: new Date(),
      type: "info" as const,
      message:
        "パフォーマンスモニター起動。Long Task（50ms以上）とFPS低下をリアルタイムで監視中...",
    },
  ]);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);

  /**
   * 各シミュレーターからのLong Task通知を受け取り、
   * PerformanceMonitorのログに追記するためのコールバック
   */
  const handleLongTask = useCallback(
    (durationMs: number, taskName: string) => {
      const logEntry: PerformanceLogEntry = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(),
        type: durationMs >= 100 ? "warning" : "long-task",
        message: `[${taskName}] ${durationMs.toFixed(1)}msのタスクを検知。${durationMs >= 100 ? "⚠️ ユーザー体験に深刻なガタつきが発生しました" : "ユーザー体験にガタつきが発生しました"}`,
        durationMs,
      };
      setPerformanceLogs((previousLogs) => [logEntry, ...previousLogs]);
    },
    [],
  );

  return (
    <div className={styles.container}>
      {/* ヘッダー: 固定高さで管理を容易に */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoContainer}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <div className={styles.logo}>
                🔬
              </div>
            </div>
            <div className={styles.titleContainer}>
              <h1 className={styles.title}>
                Frontend Performance Lab
              </h1>
              <p className={styles.subtitle}>
                V8 Engine • CPU Cache • GC • Rendering
              </p>
            </div>
          </div>

          <nav className={styles.headerNavigation} aria-label="Simulator sections">
            <div className={styles.navContainer}>
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`${styles.navButton} ${
                    activeSection === section.id ? styles.active : styles.inactive
                  }`}
                >
                  <span className={styles.navIcon}>{section.icon}</span>
                  <span className={styles.navLabelFull}>{section.label}</span>
                  <span className={styles.navLabelShort}>{section.shortLabel}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.monitorToggle} ${
                isMonitorOpen ? styles.active : ""
              }`}
              onClick={() => setIsMonitorOpen((current) => !current)}
              aria-expanded={isMonitorOpen}
              aria-controls="performance-monitor-panel"
            >
              <span className={styles.monitorToggleIcon}>📊</span>
              <span className={styles.monitorToggleLabel}>Monitor</span>
              <span className={styles.monitorToggleBadge}>
                {performanceLogs.length}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* メインレイアウトコンテナ */}
      <div className={styles.mainLayout}>
        {/* 上側: シミュレータメインエリア */}
        <main className={styles.mainArea}>
          {/* シミュレーター表示エリア */}
          <div className={styles.simulatorArea}>
            {activeSection === "data-structure" && (
              <DataStructureSimulator onLongTask={handleLongTask} />
            )}
            {activeSection === "jit" && (
              <JitSimulator onLongTask={handleLongTask} />
            )}
            {activeSection === "gc" && (
              <GarbageCollectionSimulator onLongTask={handleLongTask} />
            )}
          </div>

          {/* フッターをスクロール領域内に移動して自然に見えるように配置 */}
          <footer className={styles.footer}>
            <p className={styles.footerText}>
              ⚡ すべてのベンチマークはメインスレッドで実行されます。実際のパフォーマンス影響を体感してください。
            </p>
          </footer>
        </main>
      </div>

      <div
        id="performance-monitor-panel"
        className={`${styles.monitorPanel} ${
          isMonitorOpen ? styles.open : ""
        }`}
        aria-hidden={!isMonitorOpen}
      >
        <div className={styles.monitorPanelHeader}>
          <div>
            <p className={styles.monitorPanelEyebrow}>Runtime diagnostics</p>
            <h2 className={styles.monitorPanelTitle}>
              Performance Monitor
            </h2>
          </div>
        </div>
        <div className={styles.monitorInner}>
          <PerformanceMonitor externalLogs={performanceLogs} />
        </div>
      </div>
    </div>
  );
}
