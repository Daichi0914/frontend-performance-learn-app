package delivery

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/go-redis/redis/v8"
	"gorm.io/gorm"
)

type PingHandler struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewPingHandler(db *gorm.DB, rdb *redis.Client) *PingHandler {
	return &PingHandler{
		db:  db,
		rdb: rdb,
	}
}

func (h *PingHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ping", h.handlePing)
}

func setCORS(w http.ResponseWriter, r *http.Request) {
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	appEnv := os.Getenv("APP_ENV")

	if allowedOrigin == "" {
		if appEnv == "production" || appEnv == "prod" || appEnv == "staging" || appEnv == "stg" {
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		return
	}

	if allowedOrigin == "*" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		return
	}

	origin := r.Header.Get("Origin")
	if origin == allowedOrigin {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Vary", "Origin")
	}
}

func (h *PingHandler) handlePing(w http.ResponseWriter, r *http.Request) {
	setCORS(w, r)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	dbStatus := "ok"
	sqlDB, err := h.db.DB()
	if err != nil {
		dbStatus = "error: " + err.Error()
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := sqlDB.PingContext(ctx); err != nil {
			dbStatus = "error: " + err.Error()
		}
	}

	redisStatus := "ok"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		redisStatus = "error: " + err.Error()
	}

	response := map[string]interface{}{
		"status":    "ok",
		"database":  dbStatus,
		"redis":     redisStatus,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
