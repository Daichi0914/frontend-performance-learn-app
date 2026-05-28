import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "フロントエンドパフォーマンスチューニング学習シミュレーター",
  description:
    "V8エンジン、CPUキャッシュ効率、メモリ管理、GC、レンダリングの仕組みを体感的に学べるインタラクティブシミュレーター",
};

export default function PerformanceSimulatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
