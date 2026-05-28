"use client";

import { useState, useEffect, useCallback } from "react";
import "./globals.css";

interface PingResponse {
  status: string;
  database: string;
  redis: string;
  timestamp: string;
}

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<"ok" | "error" | "connecting">("connecting");
  const [dbStatus, setDbStatus] = useState<string>("connecting");
  const [redisStatus, setRedisStatus] = useState<string>("connecting");
  const [lastChecked, setLastChecked] = useState<string>("");

  const checkHealth = useCallback(async () => {
    setBackendStatus("connecting");
    setDbStatus("connecting");
    setRedisStatus("connecting");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
      const res = await fetch(`${apiUrl}/ping`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: PingResponse = await res.json();
      setBackendStatus(data.status === "ok" ? "ok" : "error");
      setDbStatus(data.database);
      setRedisStatus(data.redis);
      setLastChecked(new Date(data.timestamp).toLocaleString());
    } catch (err) {
      console.error("Health check failed:", err);
      setBackendStatus("error");
      setDbStatus("error: Backend unreachable");
      setRedisStatus("error: Backend unreachable");
      setLastChecked(new Date().toLocaleString());
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkHealth();
    }, 0);
    const interval = setInterval(checkHealth, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkHealth]);

  return (
    <div className="dashboard-container">
      <h1 className="title" data-testid="title">Frontend-performance-learn-app Dashboard</h1>
      <p className="subtitle">Go (Clean Architecture) + Next.js (App Router) + Docker Stack</p>

      <div className="status-grid">
        {/* Backend Status */}
        <div className="status-card">
          <div className="status-label">
            <span className={`status-indicator ${backendStatus}`}></span>
            <span>Backend API</span>
          </div>
          <span className={`status-value ${backendStatus}`}>{backendStatus}</span>
        </div>

        {/* Database Status */}
        <div className="status-card">
          <div className="status-label">
            <span className={`status-indicator ${dbStatus === "ok" ? "ok" : dbStatus === "connecting" ? "connecting" : "error"}`}></span>
            <span>MySQL Database</span>
          </div>
          <span className={`status-value ${dbStatus === "ok" ? "ok" : dbStatus === "connecting" ? "connecting" : "error"}`}>
            {dbStatus === "ok" ? "ok" : dbStatus === "connecting" ? "connecting" : "error"}
          </span>
        </div>

        {/* Redis Status */}
        <div className="status-card">
          <div className="status-label">
            <span className={`status-indicator ${redisStatus === "ok" ? "ok" : redisStatus === "connecting" ? "connecting" : "error"}`}></span>
            <span>Redis Cache</span>
          </div>
          <span className={`status-value ${redisStatus === "ok" ? "ok" : redisStatus === "connecting" ? "connecting" : "error"}`}>
            {redisStatus === "ok" ? "ok" : redisStatus === "connecting" ? "connecting" : "error"}
          </span>
        </div>
      </div>

      <button className="reload-button" onClick={checkHealth} data-testid="reload-btn">
        <span>Check Connection</span>
      </button>

      {lastChecked && (
        <div className="timestamp" data-testid="last-checked">
          Last Checked: {lastChecked}
        </div>
      )}
    </div>
  );
}
