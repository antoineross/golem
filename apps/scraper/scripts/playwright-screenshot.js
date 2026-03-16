#!/usr/bin/env node
// Playwright-based screenshot script invoked by the scraper service.
// Usage: node playwright-screenshot.js <json-args>
// Args: { url, output, width?, height?, fullPage?, delay?, clickSelector?, waitForSelector? }
// Exits 0 on success, 1 on error. Writes JSON result to stdout.

const { chromium } = require("playwright");

async function main() {
  const args = JSON.parse(process.argv[2]);
  const {
    url,
    output,
    width = 1920,
    height = 1080,
    fullPage = false,
    delay = 0,
    clickSelector,
    waitForSelector,
    timeout = 30000,
  } = args;

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(timeout);

    await page.goto(url, { waitUntil: "networkidle", timeout });

    if (delay > 0) {
      await page.waitForTimeout(delay * 1000);
    }

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
    }

    if (clickSelector) {
      await page.click(clickSelector).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: output, fullPage, type: "png" });

    const result = { success: true, path: output, width, height, format: "png" };
    process.stdout.write(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
