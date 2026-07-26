import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "REI";
const SALE_URL = "https://www.rei.com/c/running-shoes/f/scd-deals";
const MAX_PAGES = 10;

export async function scrapeREI(page: Page): Promise<ShoeDeal[]> {
  const allDeals: ShoeDeal[] = [];

  console.log("Scraping REI running shoes on sale...");

  // REI uses pagination, scrape multiple pages
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = pageNum === 1 ? SALE_URL : `${SALE_URL}?page=${pageNum}`;
    console.log(`  Scraping page ${pageNum}...`);

    const deals = await scrapeSinglePage(page, url);
    if (deals.length === 0) {
      console.log(`  No more products on page ${pageNum}, stopping.`);
      break;
    }
    allDeals.push(...deals);

    // Small delay between pages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allDeals;
}

async function scrapeSinglePage(page: Page, url: string): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
        gender: string;
      }> = [];

      // REI uses li elements with data-id for products
      const productElements = document.querySelectorAll(
        "li[data-id], [data-ui='product-card'], .VcGDfKKy_dvNbxUqm29K"
      );

      // Fallback: find all links that look like product pages
      if (productElements.length === 0) {
        const productLinks = document.querySelectorAll('a[href*="/product/"]');
        productLinks.forEach((link) => {
          const container = link.closest("li, div, article");
          if (container) {
            let name = "";
            // Try to get name from link text or nearby elements
            const img = container.querySelector("img[alt]") as HTMLImageElement;
            if (img?.alt) name = img.alt;
            if (!name) name = link.textContent?.trim() || "";

            // Find prices in container
            const allText = container.textContent || "";
            const prices = allText.match(/\$[\d.]+/g);

            let originalPrice = "";
            let salePrice = "";
            if (prices && prices.length >= 2) {
              originalPrice = prices[0];
              salePrice = prices[1];
            } else if (prices && prices.length === 1) {
              salePrice = prices[0];
            }

            const url = (link as HTMLAnchorElement).href;

            let gender = "mens";
            const nameLower = name.toLowerCase();
            if (nameLower.includes("women") || nameLower.includes("wmns")) {
              gender = "womens";
            }

            if (name && salePrice && url) {
              const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, "")) || 0;
              const saleNum = parseFloat(salePrice.replace(/[^0-9.]/g, "")) || 0;
              if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
                [originalPrice, salePrice] = [salePrice, originalPrice];
              }
              items.push({ name, originalPrice, salePrice, url, gender });
            }
          }
        });
        return items;
      }

      productElements.forEach((el) => {
        let name = "";

        // Try various ways to get the name
        const img = el.querySelector("img[alt]") as HTMLImageElement;
        if (img?.alt) name = img.alt;

        const titleEl = el.querySelector("h3, [class*='title'], [class*='name']");
        if (!name && titleEl?.textContent) {
          name = titleEl.textContent.trim();
        }

        // Get brand
        const brandEl = el.querySelector("[class*='brand']");
        if (brandEl?.textContent && name && !name.toLowerCase().includes(brandEl.textContent.toLowerCase())) {
          name = brandEl.textContent.trim() + " " + name;
        }

        // Get prices
        let originalPrice = "";
        let salePrice = "";

        const allText = el.textContent || "";
        const prices = allText.match(/\$[\d.]+/g);
        if (prices && prices.length >= 2) {
          originalPrice = prices[0];
          salePrice = prices[1];
        } else if (prices && prices.length === 1) {
          salePrice = prices[0];
        }

        // Get URL
        let url = "";
        const linkEl = el.querySelector("a[href*='/product/']") as HTMLAnchorElement;
        if (linkEl?.href) url = linkEl.href;

        let gender = "mens";
        const nameLower = name.toLowerCase();
        if (nameLower.includes("women") || nameLower.includes("wmns")) {
          gender = "womens";
        }

        if (name && (salePrice || originalPrice)) {
          const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, "")) || 0;
          const saleNum = parseFloat(salePrice.replace(/[^0-9.]/g, "")) || 0;

          if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
            [originalPrice, salePrice] = [salePrice, originalPrice];
          }

          items.push({ name, originalPrice, salePrice: salePrice || originalPrice, url, gender });
        }
      });

      return items;
    });

    console.log(`Found ${products.length} products on page`);

    for (const product of products) {
      const brandModel = extractBrandModel(product.name);
      if (!brandModel) continue;

      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

      const sizeType = product.gender === "womens" ? "womens" : "mens";
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
  } catch (error) {
    console.error(`Error scraping REI:`, error);
  }

  return deals;
}

async function autoScroll(page: Page): Promise<void> {
  // Aggressive scrolling to load all lazy-loaded products
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
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Scroll back to top and wait for any final renders
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(resolve => setTimeout(resolve, 1000));
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
