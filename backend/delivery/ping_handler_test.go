package delivery_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/delivery"

	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestPingHandler_HandlePing_FailureCases(t *testing.T) {
	// Create an invalid/unreachable DB connection
	dialector := mysql.Open("invalid_user:invalid_pass@tcp(127.0.0.1:9999)/invalid_db")
	db, _ := gorm.Open(dialector, &gorm.Config{})

	// Create an invalid/unreachable Redis client
	rdb := redis.NewClient(&redis.Options{
		Addr: "127.0.0.1:9999",
	})

	handler := delivery.NewPingHandler(db, rdb)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req, err := http.NewRequest(http.MethodGet, "/api/ping", nil)
	assert.NoError(t, err)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err = json.NewDecoder(rr.Body).Decode(&response)
	assert.NoError(t, err)

	assert.Equal(t, "ok", response["status"])
	assert.Contains(t, response["database"].(string), "error")
	assert.Contains(t, response["redis"].(string), "error")
}

func TestPingHandler_CORS(t *testing.T) {
	dialector := mysql.Open("invalid_user:invalid_pass@tcp(127.0.0.1:9999)/invalid_db")
	db, _ := gorm.Open(dialector, &gorm.Config{})
	rdb := redis.NewClient(&redis.Options{
		Addr: "127.0.0.1:9999",
	})

	handler := delivery.NewPingHandler(db, rdb)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req, err := http.NewRequest(http.MethodGet, "/api/ping", nil)
	assert.NoError(t, err)
	req.Header.Set("Origin", "http://localhost:3000")

	t.Setenv("ALLOWED_ORIGIN", "http://localhost:3000")

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, "http://localhost:3000", rr.Header().Get("Access-Control-Allow-Origin"))
}
