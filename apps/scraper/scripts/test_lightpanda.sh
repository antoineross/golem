#!/bin/bash

# Test LightPanda Migration - Complex JS-Rendered Websites
# Tests 10 challenging websites with heavy JavaScript rendering

echo "================================================================================"
echo "LIGHTPANDA MIGRATION TEST - COMPLEX JS-RENDERED WEBSITES"
echo "================================================================================"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Complex JS-rendered websites for testing
URLS=(
    "https://react.dev"
    "https://nextjs.org/docs"
    "https://vuejs.org"
    "https://angular.dev"
    "https://svelte.dev"
    "https://tailwindcss.com/docs"
    "https://vercel.com/templates"
    "https://www.typescriptlang.org/docs"
    "https://vitejs.dev"
    "https://astro.build"
)

SUCCESS_COUNT=0
TOTAL=0
TOTAL_TIME=0
TOTAL_CONTENT=0
TOTAL_LINKS=0

for url in "${URLS[@]}"; do
    TOTAL=$((TOTAL + 1))
    echo "================================================================================"
    echo "[$TOTAL/${#URLS[@]}] Testing: $url"
    echo "================================================================================"

    START=$(date +%s.%N)
    ENCODED_URL=$(echo -n "$url" | jq -sRr @uri)
    RESPONSE=$(curl -s "http://localhost:8082/v1/scrape?url=$ENCODED_URL" 2>&1)
    END=$(date +%s.%N)
    DURATION=$(echo "$END - $START" | bc)

    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    STATUS=$(echo "$RESPONSE" | jq -r '.metadata.status_code // 0')
    CONTENT_LEN=$(echo "$RESPONSE" | jq -r '.content | length // 0')
    TITLE=$(echo "$RESPONSE" | jq -r '.title // "N/A"' | head -c 60)
    LINKS=$(echo "$RESPONSE" | jq -r '.links | length // 0')

    if [ "$SUCCESS" = "true" ] && [ "$CONTENT_LEN" -gt 100 ]; then
        echo "✅ Success: HTTP $STATUS"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        TOTAL_TIME=$(echo "$TOTAL_TIME + $DURATION" | bc)
        TOTAL_CONTENT=$((TOTAL_CONTENT + CONTENT_LEN))
        TOTAL_LINKS=$((TOTAL_LINKS + LINKS))
    else
        echo "❌ Failed: HTTP $STATUS"
    fi

    echo "⏱️  Time: ${DURATION}s"
    echo "📄 Title: $TITLE..."
    echo "📝 Content: $CONTENT_LEN chars"
    echo "🔗 Links: $LINKS"

    if [ "$CONTENT_LEN" -gt 0 ]; then
        PREVIEW=$(echo "$RESPONSE" | jq -r '.content // ""' | head -c 200 | tr '\n' ' ')
        echo "👀 Preview: $PREVIEW..."
    fi

    echo ""
    sleep 2
done

echo "================================================================================"
echo "SUMMARY"
echo "================================================================================"
SUCCESS_RATE=$(echo "scale=1; $SUCCESS_COUNT * 100 / $TOTAL" | bc)
if [ "$SUCCESS_COUNT" -gt 0 ]; then
    AVG_TIME=$(echo "scale=2; $TOTAL_TIME / $SUCCESS_COUNT" | bc)
else
    AVG_TIME=0
fi

echo "✅ Success Rate: $SUCCESS_COUNT/$TOTAL ($SUCCESS_RATE%)"
echo "⏱️  Average Time (successful): ${AVG_TIME}s"
echo "📝 Total Content: $TOTAL_CONTENT chars"
echo "🔗 Total Links: $TOTAL_LINKS"
echo ""
echo "================================================================================"
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"
