#!/bin/bash
# Setup script for MariaDB migration

echo "Starting MariaDB migration setup..."

# Start MariaDB using Docker
echo "Starting MariaDB container..."
cd docker && docker-compose up -d db

# Wait for MariaDB to be ready
echo "Waiting for MariaDB to be ready..."
sleep 10

# Create database and run migration
echo "Running database migration..."
docker exec -i chat-engine-db-1 mysql -uroot -proot_password -e "CREATE DATABASE IF NOT EXISTS chat_engine;"
docker exec -i chat-engine-db-1 mysql -uroot -proot_password chat_engine < ../src/database/migration.sql

echo "Database setup complete!"
