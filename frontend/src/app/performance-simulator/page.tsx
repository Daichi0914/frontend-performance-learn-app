"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  const [monitorHeight, setMonitorHeight] = useState(320);

  /** 連打・リサイズドラッグ管理用のref */
  const isResizingRef = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 120;
      const maxHeight = window.innerHeight * 0.8;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setMonitorHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* ヘッダー: 固定高さで管理を容易に */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="w-full h-full mx-auto px-6 md:px-12 lg:px-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center h-10 w-10">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-xl blur-sm animate-pulse" />
              <div className="relative bg-slate-900 border border-cyan-500/30 rounded-xl p-2 text-lg">
                🔬
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent leading-none">
                Frontend Performance Lab
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1.5 leading-none">
                V8 Engine • CPU Cache • GC • Rendering
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* メインレイアウトコンテナ */}
      <div className="flex-1 w-full mx-auto px-6 md:px-12 lg:px-16 pt-12 pb-16 flex flex-col gap-16 relative self-stretch">
        
        {/* 上側: シミュレータメインエリア - fixedのモニターに被らないよう、動的に下部余白を確保 */}
        <main 
          style={{ paddingBottom: `${monitorHeight + 40}px` }}
          className="w-full flex flex-col space-y-12"
        >
          
          {/* セクションナビゲーション - justify-centerを追加して中央寄せ */}
          <nav className="sticky top-16 z-30 -mx-4 px-4 md:mx-0 md:px-0 py-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 mb-4">
            <div className="flex gap-4 overflow-x-auto py-1.5 scrollbar-none justify-start md:justify-center">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`
                    flex items-center gap-2.5 px-4.5 py-3 rounded-xl text-sm font-semibold
                    whitespace-nowrap transition-all duration-200 cursor-pointer border
                    ${
                      activeSection === section.id
                        ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-lg shadow-cyan-500/5"
                        : "text-slate-400 border-slate-900 bg-slate-950 hover:text-slate-200 hover:border-slate-800"
                    }
                  `}
                >
                  <span>{section.icon}</span>
                  <span className="hidden sm:inline">{section.label}</span>
                  <span className="sm:hidden">{section.shortLabel}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* シミュレーター表示エリア */}
          <div className="flex-1 flex flex-col">
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
          <footer className="border-t border-slate-900/60 py-8 text-center mt-10">
            <p className="text-xs text-slate-600 font-mono">
              ⚡ すべてのベンチマークはメインスレッドで実行されます。実際のパフォーマンス影響を体感してください。
            </p>
          </footer>
        </main>
      </div>

      {/* 下側: パフォーマンスモニター - 画面最下部に完全に fixed で独立して固定、ドラッグで高さを可変可能 */}
      <div 
        style={{ height: `${monitorHeight}px` }}
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-900 bg-slate-950/95 backdrop-blur-md shadow-[0_-15px_30px_rgba(0,0,0,0.6)] px-6 md:px-12 lg:px-16 pb-6 flex flex-col"
      >
        {/* リサイズ用ドラッグハンドルバー */}
        <div
          onMouseDown={startResizing}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-slate-900/50 hover:bg-cyan-500/50 transition-colors flex items-center justify-center group z-50"
          title="ドラッグして高さをリサイズ"
        >
          {/* つまみ用の小さなドット/バー線 */}
          <div className="w-12 h-0.5 bg-slate-700 group-hover:bg-cyan-400 rounded-full transition-colors" />
        </div>

        {/* パフォーマンスモニター本体 (インナーラッパー) */}
        <div className="flex-1 min-h-0 pt-3">
          <PerformanceMonitor externalLogs={performanceLogs} />
        </div>
      </div>
    </div>
  );
}
