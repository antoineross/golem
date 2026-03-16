#!/usr/bin/env python3
"""
Test LightPanda Migration - Complex JS-Rendered Websites
Tests 10 challenging websites with heavy JavaScript rendering
"""
import requests
import json
import time
from datetime import datetime
from urllib.parse import urlencode

# Complex JS-rendered websites for testing
TEST_URLS = [
    "https://react.dev",  # React docs - heavy JS
    "https://nextjs.org/docs",  # Next.js docs - SSR/CSR hybrid
    "https://vuejs.org",  # Vue.js - SPA
    "https://angular.dev",  # Angular - complex SPA
    "https://svelte.dev",  # Svelte - compiled framework
    "https://tailwindcss.com/docs",  # Tailwind docs - JS search
    "https://vercel.com/templates",  # Vercel templates - dynamic loading
    "https://www.typescriptlang.org/docs",  # TypeScript docs - JS navigation
    "https://vitejs.dev",  # Vite - modern build tool site
    "https://astro.build",  # Astro - modern framework
]

SCRAPER_URL = "http://localhost:8082/v1/scrape"

def scrape_url(url):
    """Scrape URL and return metrics"""
    params = {"url": url}
    full_url = f"{SCRAPER_URL}?{urlencode(params)}"

    print(f"\n{'='*80}")
    print(f"Testing: {url}")
    print(f"{'='*80}")

    start = time.time()

    try:
        resp = requests.get(full_url, timeout=30)
        elapsed = time.time() - start

        if resp.status_code != 200:
            print(f"❌ HTTP {resp.status_code}")
            return {
                "url": url,
                "success": False,
                "status_code": resp.status_code,
                "time": elapsed,
                "error": f"HTTP {resp.status_code}"
            }

        data = resp.json()
        success = data.get("success", False)
        status_code = data.get("metadata", {}).get("status_code", 0)
        content = data.get("content", "")
        content_len = len(content)
        title = data.get("title", "")
        links_count = len(data.get("links", []))

        # Check if we got meaningful content
        if content_len < 100:
            success = False
            error = "minimal_content"
        else:
            error = None

        # Print results
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} Status: HTTP {status_code}")
        print(f"⏱️  Time: {elapsed:.2f}s")
        print(f"📄 Title: {title[:60]}...")
        print(f"📝 Content: {content_len:,} chars")
        print(f"🔗 Links: {links_count}")

        if content_len > 0:
            # Show first 200 chars of content
            preview = content[:200].replace('\n', ' ')
            print(f"👀 Preview: {preview}...")

        return {
            "url": url,
            "success": success,
            "status_code": status_code,
            "time": elapsed,
            "content_length": content_len,
            "title": title,
            "links_count": links_count,
            "error": error
        }
    except requests.Timeout:
        elapsed = time.time() - start
        print(f"❌ Timeout after {elapsed:.2f}s")
        return {
            "url": url,
            "success": False,
            "status_code": 0,
            "time": elapsed,
            "error": "timeout"
        }
    except Exception as e:
        elapsed = time.time() - start
        print(f"❌ Error: {str(e)}")
        return {
            "url": url,
            "success": False,
            "status_code": 0,
            "time": elapsed,
            "error": str(e)
        }

def run_tests():
    """Run all tests"""
    print("\n" + "="*80)
    print("LIGHTPANDA MIGRATION TEST - COMPLEX JS-RENDERED WEBSITES")
    print("="*80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Testing {len(TEST_URLS)} websites")

    results = []

    for i, url in enumerate(TEST_URLS, 1):
        print(f"\n[{i}/{len(TEST_URLS)}]", end=" ")
        result = scrape_url(url)
        results.append(result)

        # Small delay between requests
        if i < len(TEST_URLS):
            time.sleep(2)

    # Print summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    success_count = sum(1 for r in results if r["success"])
    total = len(results)
    success_rate = (success_count / total * 100) if total > 0 else 0

    successful_times = [r["time"] for r in results if r["success"]]
    avg_time = sum(successful_times) / len(successful_times) if successful_times else 0

    total_content = sum(r.get("content_length", 0) for r in results)
    total_links = sum(r.get("links_count", 0) for r in results)

    print(f"✅ Success Rate: {success_count}/{total} ({success_rate:.1f}%)")
    print(f"⏱️  Average Time (successful): {avg_time:.2f}s")
    print(f"📝 Total Content: {total_content:,} chars")
    print(f"🔗 Total Links: {total_links}")

    # Show failures
    failures = [r for r in results if not r["success"]]
    if failures:
        print(f"\n❌ Failures ({len(failures)}):")
        for f in failures:
            print(f"  - {f['url']}: {f.get('error', 'unknown')}")

    # Save results
    output = {
        "timestamp": datetime.now().isoformat(),
        "summary": {
            "total": total,
            "success": success_count,
            "success_rate": f"{success_rate:.1f}%",
            "avg_time": f"{avg_time:.2f}s",
            "total_content": total_content,
            "total_links": total_links
        },
        "results": results
    }

    with open('lightpanda_test_results.json', 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Results saved to: lightpanda_test_results.json")
    print("="*80)

    return results

if __name__ == "__main__":
    run_tests()
