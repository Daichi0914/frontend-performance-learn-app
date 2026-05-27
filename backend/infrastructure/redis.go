package infrastructure

import (
	"context"
	"log"
	"os"

	"github.com/go-redis/redis/v8"
)

// NewRedisClient initializes and returns a Redis client
func NewRedisClient() *redis.Client {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "127.0.0.1:6379"
	}
	
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatal("Failed to connect to Redis:", err)
	}
	
	log.Println("Redis connected.")
	return rdb
}
