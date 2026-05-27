package main

import (
	"log"
	"net/http"

	"backend/delivery"
	"backend/infrastructure"
)

func main() {
	// Initialize Infrastructure (Database & Redis)
	db := infrastructure.NewMySQLConnection()
	rdb := infrastructure.NewRedisClient()

	// Initialize Handlers (Delivery Layer)
	pingHandler := delivery.NewPingHandler(db, rdb)

	// Setup Router
	mux := http.NewServeMux()
	pingHandler.RegisterRoutes(mux)

	// Start Server
	log.Println("Server starting on :8080 (Clean Architecture Boilerplate)")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
