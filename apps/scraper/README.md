# Scraper Service

Web scraping and data ingestion service.

## Core Capabilities

1. **Web Scraping**: LightPanda browser automation for JavaScript-rendered content, HTTP fallback for static sites
2. **LLM Parsing**: Gemini-powered content extraction and structuring

## Architecture

- **Browser Automation**: LightPanda (via Chrome DevTools Protocol)
- **HTTP Scraping**: Direct HTTP requests with TLS fingerprinting and multiple header strategies
- **Task Queue**: Asynq (Redis-backed) for async job processing
- **LLM Integration**: Gemini for content parsing and extraction
- **Event Bus**: Redis Streams for real-time event delivery

## LightPanda Migration (November 2025)

Successfully migrated from Playwright to LightPanda for improved performance and bot detection avoidance.

### Migration Benefits

Based on comprehensive benchmarking:

- **100% success rate** vs 50% with Playwright (bot detection avoidance)
- **7.7x less memory** (17.7 MiB vs 136.3 MiB per instance)
- **60x smaller image** (24.6 MB vs 1.51 GB)
- **Faster average speed** (4.2s vs 5.4s)
- **Lower CPU usage** (0.08% vs 0.33%)

### Test Results (Complex JS-Rendered Sites)

Tested on 10 challenging JavaScript-heavy websites:

| Website                 | Status   | Content      | Links | Time  |
|-------------------------|----------|--------------|-------|-------|
| react.dev               | ✅ 200    | 5,302 chars  | 61    | 2.98s |
| nextjs.org/docs         | ✅ 200    | 3,309 chars  | 412   | 3.47s |
| vuejs.org               | ✅ 200    | 2,331 chars  | 70    | 3.49s |
| angular.dev             | ✅ 200    | 3,523 chars  | 32    | 2.32s |
| svelte.dev              | ✅ 200    | 5,562 chars  | 69    | 2.32s |
| tailwindcss.com/docs    | ✅ 200    | 4,048 chars  | 215   | 2.38s |
| vercel.com/templates    | ✅ 200    | 7,243 chars  | 105   | 3.16s |
| typescriptlang.org/docs | ✅ 200    | 6,792 chars  | 97    | 3.15s |
| vitejs.dev              | ✅ 200    | 45,353 chars | 54    | 3.61s |
| astro.build             | ❌ Failed | -            | -     | 5.77s |

**Summary:**
- **Success Rate**: 90% (9/10)
- **Average Time**: 2.98s
- **Total Content**: 83,463 characters
- **Total Links**: 1,115

## How It Works

### Scraping Flow

1. **LightPanda First**: Attempts JavaScript rendering via LightPanda browser
2. **HTTP Fallback**: Falls back to direct HTTP if LightPanda fails
3. **Multiple Strategies**: Tests different header strategies (modern browser, mobile, bot-friendly)
4. **Content Extraction**: Converts HTML to Markdown, extracts links and metadata

### LightPanda Setup

LightPanda runs as a bundled process within the scraper container:

- Starts on container boot via `/start-dev.sh` script
- Listens on `ws://localhost:9222` (CDP endpoint)
- Automatically handles ARM64 and x86_64 architectures
- No separate service required (unlike Playwright)

### Configuration

Environment variables:

```bash
# LightPanda CDP endpoint
LIGHTPANDA_CDP_URL=ws://localhost:9222

# Redis for task queue
REDIS_ADDR=redis:6379
REDIS_PASSWORD=dev_password

# LLM provider
LLM_PROVIDER=gemini
DEFAULT_LLM_MODEL=gemini-2.5-flash-lite
FALLBACK_LLM_MODEL=gemini-2.0-flash-lite

# Supabase for screenshots
NEXT_PUBLIC_SUPABASE_URL=https://app.supacrawler.com
SUPABASE_SERVICE_ROLE_KEY_FILE=/run/secrets/supabase_service_role_key
SUPABASE_STORAGE_BUCKET=screenshots
```

## Development

### Running Locally

```bash
# Start scraper with Redis
docker-compose -f docker-compose.dev.yml up scraper redis

# Or build and start
docker-compose -f docker-compose.dev.yml up --build scraper
```

### Testing

Run the LightPanda test suite:

```bash
cd apps/scraper/scripts
./test_lightpanda.sh
```

This tests 10 complex JS-rendered websites and outputs:
- Success rate
- Average response time
- Total content scraped
- Total links extracted

**Note**: Test scripts are located in `scripts/` directory:
- `test_lightpanda.sh` - Bash test script
- `test_lightpanda.py` - Python test script (requires `requests`)

For known issues and incompatible websites, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

### API Endpoints

#### Scrape Endpoint

```bash
GET /v1/scrape?url=https://example.com

# Optional parameters:
# - format: markdown (default) | html
# - include_html: true | false
# - wait_for_selectors: CSS selectors to wait for
```

Response:

```json
{
  "success": true,
  "url": "https://example.com",
  "content": "# Example Domain\n\nThis domain is for use in illustrative examples...",
  "title": "Example Domain",
  "links": ["https://www.iana.org/domains/example"],
  "discovered": 1,
  "metadata": {
    "status_code": 200,
    "content_type": "text/html",
    "content_length": 1256
  }
}
```

#### Screenshot Endpoint

```bash
POST /v1/screenshots
Content-Type: application/json

{
  "url": "https://example.com",
  "format": "png",
  "full_page": true,
  "device": "desktop"
}
```

Response:

```json
{
  "success": true,
  "url": "https://example.com",
  "screenshot_url": "https://storage.supacrawler.com/...",
  "metadata": {
    "width": 1920,
    "height": 1080,
    "format": "png",
    "file_size": 245678,
    "load_time": 1234
  }
}
```

## Architecture Details

### Browser Pool

`internal/browser/pool.go` manages CDP connections:

- Creates chromedp contexts on demand
- Connects to LightPanda via WebSocket
- Thread-safe context creation
- Automatic cleanup on shutdown

### Scrape Service

`internal/core/scrape/service.go` handles scraping logic:

- **LightPanda scraping**: `scrapeWithLightPanda()` - Uses chromedp for JS rendering
- **HTTP scraping**: `scrapeWithRetriesHTTP()` - Direct HTTP with TLS fingerprinting
- **Content conversion**: HTML → Markdown via `html-to-markdown`
- **Link extraction**: Absolute URL resolution and deduplication

### Screenshot Service

`internal/core/screenshot/service.go` handles screenshots:

- Device emulation (desktop, mobile, tablet, custom)
- Full-page or viewport screenshots
- Format support: PNG, JPEG
- Supabase storage integration
- Local fallback for development

### Stealth Features (Preserved)

`internal/core/scrape/stealth.go` contains Playwright stealth techniques:

- WebDriver masking
- Canvas fingerprint noise
- Plugin spoofing
- Mouse movement simulation

**Note**: Currently not in use. LightPanda's obscurity provides natural bot detection avoidance.

## Production Deployment

### Docker Build

```bash
# Build production image
docker build -f Dockerfile -t scraper:latest .

# Run
docker run -p 8082:8082 \
  -e LIGHTPANDA_CDP_URL=ws://localhost:9222 \
  -e REDIS_ADDR=redis:6379 \
  scraper:latest
```

### Docker Swarm

Configured in `docker-stack.yml`:

- **Replicas**: 4 instances for horizontal scaling
- **Resources**: 0.2 CPU, 1536M memory limit
- **Health checks**: HTTP endpoint monitoring
- **Secrets**: Supabase, Gemini API keys via Docker secrets

### Scaling

LightPanda runs within each scraper replica:

- Each replica has its own LightPanda instance
- No shared browser state between replicas
- Scales horizontally with scraper instances
- Memory footprint: ~128-256 MiB per replica

## Troubleshooting

### LightPanda Not Starting

Check logs:

```bash
docker logs supacrawler-app-scraper-1 | grep -i lightpanda
```

Expected output:

```
Starting LightPanda browser...
Waiting for LightPanda to start...
LightPanda is ready!
```

### Connection Refused

Ensure LightPanda is running:

```bash
docker exec supacrawler-app-scraper-1 curl -s http://localhost:9222/json/version
```

### Architecture Mismatch

The Dockerfile automatically detects architecture:

- ARM64 (Apple Silicon): Downloads `lightpanda-aarch64-linux`
- x86_64 (Intel/AMD): Downloads `lightpanda-x86_64-linux`

## Performance Tips

1. **Use HTTP for static sites**: LightPanda is overkill for non-JS sites
2. **Cache aggressively**: Redis caching reduces duplicate scrapes
3. **Adjust timeouts**: Default 15s for LightPanda, 30s for screenshots
4. **Monitor memory**: LightPanda uses ~17 MiB per instance
5. **Scale horizontally**: Add more replicas for higher throughput

## Future Improvements

- [ ] Implement stealth features with chromedp (if needed)
- [ ] Add proxy support for LightPanda
- [ ] Implement screenshot queue for async processing
- [ ] Add metrics/monitoring for LightPanda performance
- [ ] Support for custom browser flags
- [ ] WebSocket scraping support

## Resources

- [LightPanda Docs](https://lightpanda.io/docs)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [chromedp Documentation](https://github.com/chromedp/chromedp)
- [Benchmark Results](../../supacrawl-light/BENCHMARK.md)
