#!/bin/bash
set -e

echo "Starting LightPanda browser..."
/usr/local/bin/lightpanda serve --host 0.0.0.0 --port 9222 &
LIGHTPANDA_PID=$!

# Wait for LightPanda to be ready
echo "Waiting for LightPanda to start..."
for i in {1..30}; do
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "LightPanda is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: LightPanda failed to start after 30 seconds"
    exit 1
  fi
  sleep 1
done

echo "Starting scraper with air..."
exec air -c .air.toml
