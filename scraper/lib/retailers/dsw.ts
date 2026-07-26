import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "DSW";
const MENS_SALE_URL = "https://www.dsw.com/category/mens/clearance/shoes/athletic-sneakers/running";
const WOMENS_SALE_URL = "https://www.dsw.com/category/womens/clearance/shoes/athletic-sneakers/running";

export async function scrapeDSW(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping DSW men's running...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping DSW women's running...");
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Aggressive scrolling to load all products
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

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
      }> = [];

      // DSW uses product tile elements
      const productElements = document.querySelectorAll(
        "[data-testid='product-tile'], .product-tile, [class*='ProductTile'], [class*='product-card'], article[class*='product']"
      );

      productElements.forEach((el) => {
        let name = "";

        // Try brand + product name
        const brandEl = el.querySelector("[class*='brand'], [data-testid='brand']");
        const nameEl = el.querySelector("[class*='product-name'], [class*='ProductName'], [data-testid='product-name'], h2, h3");

        if (brandEl?.textContent) name = brandEl.textContent.trim();
        if (nameEl?.textContent) {
          name = name ? name + " " + nameEl.textContent.trim() : nameEl.textContent.trim();
        }

        // Image alt as fallback
        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 3) name = img.alt;
        }

        let originalPrice = "";
        let salePrice = "";

        const originalEl = el.querySelector("[class*='original'], [class*='was'], [class*='compare'], del, s");
        const saleEl = el.querySelector("[class*='sale'], [class*='now'], [class*='current']");
        const priceEl = el.querySelector("[class*='price']");

        if (originalEl?.textContent) originalPrice = originalEl.textContent.trim();
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
        if (linkEl?.href && linkEl.href.includes("dsw.com")) url = linkEl.href;

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
      const brandModel = extractBrandModel(product.name);
      if (!brandModel) continue;

      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

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
    console.error(`Error scraping DSW:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
