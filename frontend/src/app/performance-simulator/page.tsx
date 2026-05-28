"use client";

import { useState, useCallback } from "react";
import DataStructureSimulator from "@/components/performance-simulator/DataStructureSimulator";
import JitSimulator from "@/components/performance-simulator/JitSimulator";
import GarbageCollectionSimulator from "@/components/performance-simulator/GarbageCollectionSimulator";
import PerformanceMonitor from "@/components/performance-simulator/PerformanceMonitor";
import type { PerformanceLogEntry } from "@/components/performance-simulator/PerformanceMonitor";

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
  const [isMonitorExpanded, setIsMonitorExpanded] = useState(true);

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
    <div className="min-h-screen bg-linear-to-r from-gray-950 via-slate-900 to-gray-950 text-gray-100 font-[Inter,sans-serif]">
      {/* ヘッダー: アプリタイトルとサイバー感のあるデザイン */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-gray-950/70 border-b border-cyan-500/20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              {/* サイバーアイコンのパルスエフェクト */}
              <div className="absolute inset-0 bg-cyan-500/30 rounded-lg blur-md animate-pulse" />
              <div className="relative bg-gray-800 border border-cyan-500/50 rounded-lg p-2 text-xl">
                🔬
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent leading-tight">
                Frontend Performance Lab
              </h1>
              <p className="text-xs text-gray-500 font-mono">
                V8 Engine • CPU Cache • GC • Rendering
              </p>
            </div>
          </div>

          {/* モニター展開/縮小トグル */}
          <button
            onClick={() => setIsMonitorExpanded((previous) => !previous)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:border-cyan-500/30 transition-colors text-sm cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-gray-400">Monitor</span>
            <span className="text-gray-600">
              {isMonitorExpanded ? "▼" : "▲"}
            </span>
          </button>
        </div>
      </header>

      {/* セクションナビゲーション: タブ切り替え */}
      <nav className="sticky top-14.25 z-30 backdrop-blur-lg bg-gray-950/50 border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                  whitespace-nowrap transition-all duration-300 cursor-pointer
                  ${
                    activeSection === section.id
                      ? "bg-linear-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/10"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 border border-transparent"
                  }
                `}
              >
                <span>{section.icon}</span>
                <span className="hidden sm:inline">{section.label}</span>
                <span className="sm:hidden">{section.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* メインコンテンツ: 上部にシミュレーター、下部にモニター */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* シミュレーター表示エリア */}
        <div className="min-h-[60vh]">
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

        {/* パフォーマンスモニター: 常に下部に表示 */}
        {isMonitorExpanded && (
          <div className="sticky bottom-0 z-20">
            <PerformanceMonitor externalLogs={performanceLogs} />
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="border-t border-gray-800/50 py-4 text-center">
        <p className="text-xs text-gray-600 font-mono">
          ⚡ すべてのベンチマークはメインスレッドで実行されます。実際のパフォーマンス影響を体感してください。
        </p>
      </footer>
    </div>
  );
}
