package infrastructure

import (
	"log"
	"os"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// NewMySQLConnection initializes and returns a MySQL database connection
func NewMySQLConnection() *gorm.DB {
	dsn := os.Getenv("MYSQL_DSN")
	if dsn == "" {
		dsn = "root:root@tcp(127.0.0.1:3306)/appdb?charset=utf8mb4&parseTime=True&loc=Asia%2FTokyo"
	}

	var db *gorm.DB
	var err error
	
	// DB起動待ちのためのリトライロジック
	for i := 0; i < 10; i++ {
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Println("Waiting for MySQL...", err)
		time.Sleep(2 * time.Second)
	}
	
	if err != nil {
		log.Fatal("Failed to connect to MySQL:", err)
	}
	
	log.Println("MySQL connected.")
	return db
}
