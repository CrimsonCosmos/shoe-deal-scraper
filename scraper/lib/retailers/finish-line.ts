import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Finish Line";
const MENS_RUNNING_SALE_URL = "https://www.finishline.com/store/sale/men/shoes/running/_/N-1naclf7Z57cgax";
const WOMENS_RUNNING_SALE_URL = "https://www.finishline.com/store/sale/women/shoes/running/_/N-a7hj11Z57cgax";

export async function scrapeFinishLine(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Finish Line men's running sale...");
  const mensDeals = await scrapeSalePage(page, MENS_RUNNING_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Finish Line women's running sale...");
  const womensDeals = await scrapeSalePage(page, WOMENS_RUNNING_SALE_URL, "womens");
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

      // Finish Line product card selectors
      const productElements = document.querySelectorAll(
        "[data-test='product-card'], .product-card, [class*='ProductCard'], [class*='product-tile'], article"
      );

      productElements.forEach((el) => {
        let name = "";

        const nameSelectors = [
          "[data-test='product-card-name']",
          "[class*='product-name']",
          "[class*='ProductName']",
          "[class*='product-card__name']",
          "h2",
          "h3",
        ];

        for (const sel of nameSelectors) {
          const nameEl = el.querySelector(sel);
          if (nameEl?.textContent?.trim()) {
            name = nameEl.textContent.trim();
            break;
          }
        }

        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 5) name = img.alt;
        }

        let originalPrice = "";
        let salePrice = "";

        const strikeEl = el.querySelector(
          "[class*='strike'], [class*='was'], [class*='original'], [class*='compare'], del, s"
        );
        const saleEl = el.querySelector(
          "[class*='sale'], [class*='now'], [class*='current'], [class*='final']"
        );
        const priceEl = el.querySelector("[class*='price'], [class*='Price']");

        if (strikeEl?.textContent) originalPrice = strikeEl.textContent.trim();
        if (saleEl?.textContent) salePrice = saleEl.textContent.trim();

        if (!salePrice && priceEl) {
          const text = priceEl.textContent || "";
          const prices = text.match(/\$[\d,.]+/g);
          if (prices && prices.length >= 2) {
            originalPrice = prices[0];
            salePrice = prices[1];
          } else if (prices && prices.length === 1) {
            salePrice = prices[0];
          }
        }

        let productUrl = "";
        const linkEl = el.querySelector("a[href*='/store/']") as HTMLAnchorElement;
        if (linkEl?.href) productUrl = linkEl.href;

        if (name && (salePrice || originalPrice)) {
          const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, "")) || 0;
          const saleNum = parseFloat(salePrice.replace(/[^0-9.]/g, "")) || 0;

          if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
            [originalPrice, salePrice] = [salePrice, originalPrice];
          }

          items.push({
            name,
            originalPrice,
            salePrice: salePrice || originalPrice,
            url: productUrl,
          });
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
    console.error(`Error scraping Finish Line:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(",", "")) : 0;
}
