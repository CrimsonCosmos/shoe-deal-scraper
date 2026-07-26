import type { Page } from "puppeteer";
import { generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Salomon";
// Salomon uses outlet pages with category filters
const TRAIL_RUNNING_OUTLET_URL = "https://www.salomon.com/en-us/c/promotions/outlet/shoes/trail-running";
const ROAD_RUNNING_OUTLET_URL = "https://www.salomon.com/en-us/c/promotions/outlet/shoes/road-running";

export async function scrapeSalomon(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Salomon trail running outlet...");
  const trailDeals = await scrapeSalePage(page, TRAIL_RUNNING_OUTLET_URL);
  deals.push(...trailDeals);
  console.log(`Found ${trailDeals.length} trail running deals`);

  console.log("Scraping Salomon road running outlet...");
  const roadDeals = await scrapeSalePage(page, ROAD_RUNNING_OUTLET_URL);
  deals.push(...roadDeals);
  console.log(`Found ${roadDeals.length} road running deals`);

  return deals;
}

async function scrapeSalePage(
  page: Page,
  url: string
): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll to load products
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
      }> = [];

      const productElements = document.querySelectorAll(
        ".product-tile, [class*='ProductCard'], [class*='product-card'], .product, article[class*='product']"
      );

      productElements.forEach((el) => {
        let name = "";

        const nameEl = el.querySelector(
          ".product-tile__name, [class*='product-name'], [class*='ProductName'], h2, h3, [class*='title']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 5) name = img.alt;
        }

        let originalPrice = "";
        let salePrice = "";

        const strikeEl = el.querySelector("[class*='strike'], [class*='was'], [class*='original'], del, s");
        const saleEl = el.querySelector("[class*='sale'], [class*='now'], [class*='current']");
        const priceEl = el.querySelector("[class*='price']");

        if (strikeEl?.textContent) originalPrice = strikeEl.textContent.trim();
        if (saleEl?.textContent) salePrice = saleEl.textContent.trim();

        if (!salePrice && priceEl) {
          const prices = (priceEl.textContent || "").match(/\$[\d.]+/g);
          if (prices && prices.length >= 2) {
            originalPrice = prices[0];
            salePrice = prices[1];
          } else if (prices) {
            salePrice = prices[0];
          }
        }

        let url = "";
        const linkEl = el.querySelector("a[href]") as HTMLAnchorElement;
        if (linkEl?.href && linkEl.href.includes("salomon.com")) url = linkEl.href;

        if (name && (salePrice || originalPrice)) {
          const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, "")) || 0;
          const saleNum = parseFloat(salePrice.replace(/[^0-9.]/g, "")) || 0;

          if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
            [originalPrice, salePrice] = [salePrice, originalPrice];
          }

          items.push({ name, originalPrice, salePrice: salePrice || originalPrice, url });
        }
      });

      return items;
    });

    console.log(`Found ${products.length} products on page`);

    for (const product of products) {
      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

      // Infer gender from name or URL
      const nameLower = product.name.toLowerCase();
      const urlLower = product.url.toLowerCase();
      const isWomens = nameLower.includes("women") || urlLower.includes("women");
      const sizeType: "mens" | "womens" = isWomens ? "womens" : "mens";
      const defaultSize = isWomens ? "W8" : "M10";
      const sizeNumeric = isWomens ? 8 : 10;

      deals.push({
        id: generateDealId(RETAILER, "Salomon", product.name, defaultSize),
        brand: "Salomon",
        model: product.name,
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
    console.error(`Error scraping Salomon:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
