import type { Page } from "puppeteer";
import { extractBrandModel, parseSize, generateDealId } from "../normalizer";

export interface ShoeDeal {
  id: string;
  brand: string;
  model: string;
  size: string;
  sizeType: "mens" | "womens";
  sizeNumeric: number;
  originalPrice: number;
  salePrice: number;
  retailer: string;
  url: string;
  inStock: boolean;
}

const RETAILER = "Running Warehouse";
const MENS_SALE_URL = "https://www.runningwarehouse.com/catpage-SALEMS.html";
const WOMENS_SALE_URL = "https://www.runningwarehouse.com/catpage-SALEWS.html";
export async function scrapeRunningWarehouse(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  // Scrape men's sale
  console.log("Scraping Running Warehouse men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  // Scrape women's sale
  console.log("Scraping Running Warehouse women's sale...");
  const womensDeals = await scrapeSalePage(page, WOMENS_SALE_URL, "womens");
  deals.push(...womensDeals);
  console.log(`Found ${womensDeals.length} women's deals`);

  return deals;
}

async function scrapeSalePage(
  page: Page,
  url: string,
  sizeType: "mens" | "womens"
): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait longer for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for product grid to load - Running Warehouse specific selectors
    await page.waitForSelector(".productDisplayTable, .product_wrapper, #productsDisplayed", { timeout: 15000 }).catch(() => {
      console.log("No product selector found, trying alternative approach");
    });

    // Aggressive scrolling to load all products (Running Warehouse uses infinite scroll)
    let previousHeight = 0;
    let sameHeightCount = 0;
    while (sameHeightCount < 3) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) {
        sameHeightCount++;
      } else {
        sameHeightCount = 0;
        previousHeight = currentHeight;
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Debug: log page title and some content
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    // Check if we hit a block page
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    if (bodyText.toLowerCase().includes("access denied") || bodyText.toLowerCase().includes("blocked")) {
      console.log("WARNING: Possible bot detection - page may be blocked");
      console.log("Body preview:", bodyText.substring(0, 200));
    }

    // Extract product data - Running Warehouse uses table-based layout
    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
        sizes: string[];
      }> = [];

      // Running Warehouse uses table rows for products
      // Also try div-based selectors as fallback
      const selectors = [
        "tr.product_row",
        "div.product_wrapper",
        "div[class*='productContainer']",
        ".catTableRow",
        "table tr[onclick]",
        ".product-tile",
      ];

      let productElements: Element[] = [];
      for (const selector of selectors) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          productElements = Array.from(els);
          console.log(`Found ${els.length} elements with selector: ${selector}`);
          break;
        }
      }

      // If no products found, try to get any links that look like product links
      if (productElements.length === 0) {
        const productLinks = document.querySelectorAll('a[href*="descpage-"]');
        productLinks.forEach((link) => {
          const anchor = link as HTMLAnchorElement;
          const container = anchor.closest("tr, div, td") || anchor.parentElement;
          if (container && !productElements.includes(container)) {
            productElements.push(container);
          }
        });
      }

      productElements.forEach((el) => {
        // Get product name - first try image alt, then link text
        let name = "";

        // Best source: image alt attribute (has full product name)
        const imgEl = el.querySelector("img[alt]") as HTMLImageElement;
        if (imgEl?.alt) {
          name = imgEl.alt.trim();
        }

        // Fallback: extract from URL
        if (!name) {
          const linkEl = el.querySelector('a[href*="descpage-"]') as HTMLAnchorElement;
          if (linkEl?.href) {
            // URL like /Brooks_Launch_11/descpage-B11LAM6.html -> Brooks Launch 11
            const match = linkEl.href.match(/\/([^/]+)\/descpage-/);
            if (match) {
              name = match[1].replace(/_/g, " ");
            }
          }
        }

        // Fallback: try text selectors
        if (!name) {
          const nameSelectors = [
            ".product_name",
            ".productTitle",
            "h3",
            "h4",
            ".name",
          ];
          for (const sel of nameSelectors) {
            const nameEl = el.querySelector(sel);
            if (nameEl?.textContent?.trim()) {
              name = nameEl.textContent.trim();
              break;
            }
          }
        }

        // Get prices - look for crossed out and current price
        let originalPrice = "";
        let salePrice = "";

        const priceSelectors = [
          ".product_price",
          ".price",
          "td.price",
          "[class*='price']",
        ];

        for (const sel of priceSelectors) {
          const priceEls = el.querySelectorAll(sel);
          priceEls.forEach(priceEl => {
            const text = priceEl.textContent || "";
            if (priceEl.querySelector("del, s, strike") || priceEl.classList.contains("original")) {
              originalPrice = text;
            } else if (text.includes("$")) {
              // Check for both prices in one element
              const prices = text.match(/\$[\d.]+/g);
              if (prices && prices.length >= 2) {
                originalPrice = prices[0];
                salePrice = prices[1];
              } else if (prices && prices.length === 1) {
                salePrice = prices[0];
              }
            }
          });
          if (salePrice) break;
        }

        // If still no sale price, look for any dollar amount
        if (!salePrice) {
          const allText = el.textContent || "";
          const prices = allText.match(/\$[\d.]+/g);
          if (prices && prices.length >= 1) {
            salePrice = prices[prices.length - 1]; // Usually last price is sale price
            if (prices.length >= 2) {
              originalPrice = prices[0];
            }
          }
        }

        // Get URL
        let url = "";
        const linkEl = el.querySelector('a[href*="descpage-"], a[href*="/product/"]') as HTMLAnchorElement;
        if (linkEl) {
          url = linkEl.href;
        }

        // Get available sizes (often shown as "Size X only" text)
        const sizes: string[] = [];
        const sizeText = el.textContent || "";
        const sizeMatch = sizeText.match(/Size\s+([\d.]+)/i);
        if (sizeMatch) {
          sizes.push(sizeMatch[1]);
        }

        if (name && (salePrice || originalPrice)) {
          // Ensure lower price is sale price
          let finalOriginal = originalPrice;
          let finalSale = salePrice || originalPrice;

          const origNum = parseFloat(finalOriginal.replace(/[^0-9.]/g, "")) || 0;
          const saleNum = parseFloat(finalSale.replace(/[^0-9.]/g, "")) || 0;

          // If original is lower than sale, swap them
          if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
            finalOriginal = salePrice;
            finalSale = originalPrice;
          }

          items.push({
            name,
            originalPrice: finalOriginal,
            salePrice: finalSale,
            url,
            sizes
          });
        }
      });

      return items;
    });

    console.log(`Found ${products.length} products on page`);

    // Process each product
    for (const product of products) {
      const brandModel = extractBrandModel(product.name);
      if (!brandModel) continue;

      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

      // If sizes are available from the listing
      if (product.sizes.length > 0) {
        for (const sizeStr of product.sizes) {
          const parsed = parseSize(sizeStr);
          if (!parsed) continue;

          deals.push({
            id: generateDealId(RETAILER, brandModel.brand, brandModel.model, parsed.size),
            brand: brandModel.brand,
            model: brandModel.model,
            size: parsed.size,
            sizeType: parsed.sizeType,
            sizeNumeric: parsed.sizeNumeric,
            originalPrice: originalPrice || salePrice * 1.3, // Estimate if not available
            salePrice,
            retailer: RETAILER,
            url: product.url,
            inStock: true,
          });
        }
      } else {
        // If no sizes in listing, create a generic entry to be expanded later
        // or fetch individual product pages
        const defaultSize = sizeType === "mens" ? "M10" : "W8";
        const sizeNumeric = sizeType === "mens" ? 10 : 8;

        deals.push({
          id: generateDealId(RETAILER, brandModel.brand, brandModel.model, defaultSize),
          brand: brandModel.brand,
          model: brandModel.model,
          size: defaultSize,
          sizeType,
          sizeNumeric,
          originalPrice: originalPrice || salePrice * 1.3,
          salePrice,
          retailer: RETAILER,
          url: product.url,
          inStock: true,
        });
      }
    }
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  // Extract numeric value from strings like "$99.95", "99.95", "Was $160"
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
