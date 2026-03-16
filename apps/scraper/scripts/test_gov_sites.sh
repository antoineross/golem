#!/usr/bin/env bash
# v0.48.0 Scraper Compatibility Audit
# Tests LightPanda scraper against government and social media sites

SCRAPER_URL="${SCRAPER_URL:-http://localhost:8082}"
OUTPUT_DIR="${OUTPUT_DIR:-tmp/scraper-audit}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

# Results CSV
RESULTS_FILE="$OUTPUT_DIR/audit_results_$TIMESTAMP.csv"
echo "site,url,status,success,content_len,links,title,duration_ms,notes" > "$RESULTS_FILE"

log() {
    echo "[$(date +%H:%M:%S)] $1"
}

test_site() {
    local name="$1"
    local url="$2"

    log "Testing: $name"
    log "  URL: $url"

    local start_time=$(python3 -c "import time; print(int(time.time()*1000))")

    # Make scrape request with URL encoding
    local encoded_url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$url', safe=''))")
    local response
    response=$(curl -s --max-time 60 "$SCRAPER_URL/v1/scrape?url=$encoded_url&format=markdown" 2>/dev/null || echo '{"success":false,"error":"curl_failed"}')

    local end_time=$(python3 -c "import time; print(int(time.time()*1000))")
    local duration=$((end_time - start_time))

    # Parse response
    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null || echo "false")
    local status=$(echo "$response" | jq -r '.metadata.status_code // 0' 2>/dev/null || echo "0")
    local content=$(echo "$response" | jq -r '.content // ""' 2>/dev/null || echo "")
    local content_len=${#content}
    local links_count=$(echo "$response" | jq -r '.links | length // 0' 2>/dev/null || echo "0")
    local title=$(echo "$response" | jq -r '.title // "N/A"' 2>/dev/null || echo "N/A")
    local error=$(echo "$response" | jq -r '.error // ""' 2>/dev/null || echo "")

    # Determine status
    local result_status="UNKNOWN"
    local notes=""

    if [[ "$success" == "true" ]]; then
        if [[ $content_len -gt 1000 ]]; then
            result_status="OK"
            notes="Good content"
        elif [[ $content_len -gt 100 ]]; then
            result_status="LOW_CONTENT"
            notes="Partial content"
        else
            result_status="EMPTY"
            notes="No useful content"
        fi
    else
        result_status="FAILED"
        notes="$error"
    fi

    log "  Status: $result_status"
    log "  HTTP: $status | Content: ${content_len} chars | Links: $links_count"
    log "  Time: ${duration}ms"

    # Save sample content
    if [[ $content_len -gt 0 ]]; then
        echo "$content" | head -c 2000 > "$OUTPUT_DIR/${name}_sample.txt"
    fi

    # Clean title for CSV
    local clean_title=$(echo "$title" | tr ',' ';' | tr '\n' ' ' | head -c 100)
    local clean_notes=$(echo "$notes" | tr ',' ';' | tr '\n' ' ' | head -c 100)

    # Append to results
    echo "\"$name\",\"$url\",\"$result_status\",\"$success\",$content_len,$links_count,\"$clean_title\",$duration,\"$clean_notes\"" >> "$RESULTS_FILE"

    echo ""
}

# Main execution
log "================================================"
log "Scraper Compatibility Audit v0.48.0"
log "================================================"
log "Scraper URL: $SCRAPER_URL"
log "Output: $OUTPUT_DIR"
log ""

# Check scraper health
log "Checking scraper health..."
health=$(curl -s "$SCRAPER_URL/v1/health" 2>/dev/null || echo '{"ready":false}')
ready=$(echo "$health" | jq -r '.ready // false')

if [[ "$ready" != "true" ]]; then
    log "ERROR: Scraper not ready"
    exit 1
fi
log "Scraper healthy"
log ""

# Tier 1: Government Official Sites
test_site "whitehouse_statements" "https://www.whitehouse.gov/briefing-room/statements-releases/"
test_site "whitehouse_eo" "https://www.whitehouse.gov/presidential-actions/executive-orders/"
test_site "treasury_press" "https://home.treasury.gov/news/press-releases"
test_site "ofac_sdn" "https://www.treasury.gov/ofac/downloads/sdnlist.txt"
test_site "ustr_press" "https://ustr.gov/about-us/policy-offices/press-office/press-releases"
test_site "cftc_press" "https://www.cftc.gov/PressRoom/PressReleases"
test_site "fed_press" "https://www.federalreserve.gov/newsevents/pressreleases.htm"

# Tier 3: News
test_site "reuters_us" "https://www.reuters.com/world/us/"

log "================================================"
log "Audit Complete"
log "================================================"
log "Results: $RESULTS_FILE"

# Summary
log ""
log "SUMMARY:"
ok_count=$(grep -c ",\"OK\"," "$RESULTS_FILE" 2>/dev/null || echo "0")
low_count=$(grep -c ",\"LOW_CONTENT\"," "$RESULTS_FILE" 2>/dev/null || echo "0")
failed_count=$(grep -c ",\"FAILED\"," "$RESULTS_FILE" 2>/dev/null || echo "0")

log "  OK: $ok_count"
log "  LOW_CONTENT: $low_count"
log "  FAILED: $failed_count"

# Display results table
log ""
log "RESULTS TABLE:"
column -t -s',' "$RESULTS_FILE" 2>/dev/null || cat "$RESULTS_FILE"
