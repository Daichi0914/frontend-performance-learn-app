//go:build integration

package delivery_test

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"backend/delivery"

	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/mysql"
	"github.com/testcontainers/testcontainers-go/wait"
	gorm_mysql "gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestPingHandler_Integration(t *testing.T) {
	// Disable Ryuk for Podman/Docker environment compatibility in local/CI environments
	os.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")

	ctx := context.Background()

	// 1. Start MySQL container
	log.Println("Starting MySQL test container...")
	mysqlContainer, err := mysql.Run(ctx,
		"mysql:8.0",
		mysql.WithDatabase("test_db"),
		mysql.WithUsername("test_user"),
		mysql.WithPassword("test_password"),
	)
	require.NoError(t, err)
	defer func() {
		log.Println("Terminating MySQL test container...")
		mysqlContainer.Terminate(ctx)
	}()

	mysqlConnStr, err := mysqlContainer.ConnectionString(ctx, "parseTime=true&loc=Local")
	require.NoError(t, err)

	db, err := gorm.Open(gorm_mysql.Open(mysqlConnStr), &gorm.Config{})
	require.NoError(t, err)

	// 2. Start Redis container
	log.Println("Starting Redis test container...")
	redisReq := testcontainers.ContainerRequest{
		Image:        "redis:7-alpine",
		ExposedPorts: []string{"6379/tcp"},
		WaitingFor:   wait.ForListeningPort("6379/tcp"),
	}
	redisContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: redisReq,
		Started:          true,
	})
	require.NoError(t, err)
	defer func() {
		log.Println("Terminating Redis test container...")
		redisContainer.Terminate(ctx)
	}()

	redisEndpoint, err := redisContainer.Endpoint(ctx, "")
	require.NoError(t, err)

	rdb := redis.NewClient(&redis.Options{
		Addr: redisEndpoint,
	})
	defer rdb.Close()

	// 3. Test PingHandler with active DB and Redis connections
	handler := delivery.NewPingHandler(db, rdb)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	req, err := http.NewRequest(http.MethodGet, "/api/ping", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err = json.NewDecoder(rr.Body).Decode(&response)
	require.NoError(t, err)

	assert.Equal(t, "ok", response["status"])
	assert.Equal(t, "ok", response["database"])
	assert.Equal(t, "ok", response["redis"])
	assert.NotEmpty(t, response["timestamp"])
}
