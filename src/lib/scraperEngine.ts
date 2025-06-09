import puppeteer, { Page } from 'puppeteer';
// Assuming ScraperConfigSchema is the most complete schema including refinements for a valid config.
// Or, use a specific schema if only a subset of fields is needed by the engine.
// For now, let's use the base one and assume validation happened before calling runScraper.
import { ScraperConfigSchema, Selector } from '@/lib/models/scraper';
import { z } from 'zod';

// Infer TypeScript type from Zod schema
export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;

interface ScrapedDataItem {
  [key: string]: string | null; // Allow any string key, value can be string or null
}

// Helper function to scrape a single page
async function scrapePage(page: Page, selectors: Selector[]): Promise<ScrapedDataItem[]> {
  // This version assumes each set of selectors defines one item.
  // If a page lists multiple items (e.g., product listing), this needs to be adapted.
  // For instance, first select all item "blocks", then iterate and apply sub-selectors.
  // For this iteration, we'll assume one item per page, as per the initial design.

  const scrapedData: ScrapedDataItem = {};
  let hasData = false;

  for (const selectorConfig of selectors) {
    try {
      // Ensure the selector is not empty
      if (!selectorConfig.cssSelector.trim()) {
        console.warn(`Empty CSS selector for field "${selectorConfig.fieldName}". Skipping.`);
        scrapedData[selectorConfig.fieldName] = null;
        continue;
      }

      // Wait for the selector to appear on the page, with a timeout
      await page.waitForSelector(selectorConfig.cssSelector, { timeout: 10000 }); // 10s timeout for element

      const elementText = await page.$eval(selectorConfig.cssSelector, el => el.textContent);
      const trimmedText = elementText?.trim() || null;

      if (trimmedText !== null) {
        hasData = true;
      }
      scrapedData[selectorConfig.fieldName] = trimmedText;

    } catch (error: any) {
      console.warn(`Could not find or extract text from selector "${selectorConfig.cssSelector}" for field "${selectorConfig.fieldName}": ${error.message}`);
      scrapedData[selectorConfig.fieldName] = null;
    }
  }

  // Only return an item if it has at least one non-null value
  return hasData ? [scrapedData] : [];
}


export async function runScraper(config: ScraperConfig): Promise<ScrapedDataItem[]> {
  let browser;
  try {
    // Validate config with Zod before proceeding (optional, but good practice)
    // const validation = ScraperConfigSchema.safeParse(config);
    // if (!validation.success) {
    //   throw new Error(`Invalid scraper configuration: ${validation.error.flatten().fieldErrors}`);
    // }
    // const validConfig = validation.data; // Use validConfig below

    // For simplicity, assuming config is pre-validated if this function is called internally.
    const validConfig = config;


    console.log(`[ScraperEngine] Launching Puppeteer for URL: ${validConfig.url}`);
    browser = await puppeteer.launch({
      headless: "new", // Opt-in to the new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Common in Docker/CI environments
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        // '--single-process', // Only if resource-constrained, may cause issues
        '--disable-gpu' // Often recommended for headless
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Increase navigation timeout
    await page.setDefaultNavigationTimeout(60000); // 60 seconds
    await page.setDefaultTimeout(30000); // 30 seconds for other operations

    console.log(`[ScraperEngine] Navigating to ${validConfig.url}`);
    await page.goto(validConfig.url, { waitUntil: 'networkidle2' });

    let allScrapedData: ScrapedDataItem[] = [];
    let currentPageNum = 1;
    const maxDepth = validConfig.paginationEnabled && validConfig.maxDepth ? validConfig.maxDepth : 1;

    while (currentPageNum <= maxDepth) {
      console.log(`[ScraperEngine] Scraping page ${currentPageNum} of ${maxDepth} for ${validConfig.url}`);

      // Wait for a brief moment or a specific element that indicates page is ready after navigation/load
      // This can be adjusted based on typical page load behavior.
      // await page.waitForTimeout(validConfig.delayBetweenRequests || 1000); // Example delay

      const pageData = await scrapePage(page, validConfig.selectors);
      if (pageData.length > 0) {
        allScrapedData.push(...pageData);
      }

      if (validConfig.paginationEnabled && validConfig.paginationNextSelector && currentPageNum < maxDepth) {
        console.log(`[ScraperEngine] Trying to find next page selector: ${validConfig.paginationNextSelector}`);

        try {
          // Wait for the selector to be available
          await page.waitForSelector(validConfig.paginationNextSelector, { timeout: 10000 });
          const nextPageButton = await page.$(validConfig.paginationNextSelector);

          if (nextPageButton) {
            console.log("[ScraperEngine] Next page button found, clicking...");

            // Using Promise.all for navigation is a common pattern
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2' }), // Removed timeout here to use default navigation timeout
              page.click(validConfig.paginationNextSelector),
            ]);
            console.log(`[ScraperEngine] Navigated to page ${currentPageNum + 1}`);
            currentPageNum++;
          } else {
            console.log("[ScraperEngine] Next page selector not found on page. Ending pagination.");
            break;
          }
        } catch (e: any) {
          console.warn(`[ScraperEngine] Could not find or click next page selector "${validConfig.paginationNextSelector}": ${e.message}. Ending pagination.`);
          break;
        }
      } else {
        if (currentPageNum < maxDepth && validConfig.paginationEnabled) {
          console.log("[ScraperEngine] Pagination conditions not fully met (selector missing or max depth reached).");
        }
        break;
      }
    }

    console.log(`[ScraperEngine] Scraping finished for ${validConfig.url}. Found ${allScrapedData.length} item(s).`);
    return allScrapedData;

  } catch (error: any) {
    console.error(`[ScraperEngine] Error during scraping process for ${config.url}:`, error);
    throw new Error(`Scraping failed for ${config.url}: ${error.message || error}`);
  } finally {
    if (browser) {
      console.log(`[ScraperEngine] Closing browser for ${config.url}`);
      await browser.close();
    }
  }
}
