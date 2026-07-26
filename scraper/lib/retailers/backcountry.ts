import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Backcountry";
const RUNNING_SHOES_SALE_URL = "https://www.backcountry.com/rc/running-shoes-on-sale";

export async function scrapeBackcountry(page: Page): Promise<ShoeDeal[]> {
  console.log("Scraping Backcountry running shoes on sale...");
  const deals = await scrapeSalePage(page, RUNNING_SHOES_SALE_URL);
  console.log(`Found ${deals.length} deals`);
  return deals;
}

async function scrapeSalePage(page: Page, url: string): Promise<ShoeDeal[]> {
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

      // Backcountry product card selectors
      const productElements = document.querySelectorAll(
        "[data-id='productCard'], .product-card, [class*='ProductCard'], [class*='product-listing'], article"
      );

      productElements.forEach((el) => {
        let name = "";

        // Try various name selectors
        const nameSelectors = [
          "[data-id='productCard-title']",
          "[class*='product-name']",
          "[class*='ProductName']",
          "[class*='title']",
          "h2",
          "h3",
          "a[class*='product']",
        ];

        for (const sel of nameSelectors) {
          const nameEl = el.querySelector(sel);
          if (nameEl?.textContent?.trim()) {
            name = nameEl.textContent.trim();
            break;
          }
        }

        // Fallback: image alt
        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 5) name = img.alt;
        }

        let originalPrice = "";
        let salePrice = "";

        // Look for price elements
        const strikeEl = el.querySelector(
          "[class*='strike'], [class*='was'], [class*='original'], [class*='retail'], del, s"
        );
        const saleEl = el.querySelector(
          "[class*='sale'], [class*='now'], [class*='current'], [class*='discount']"
        );
        const priceEl = el.querySelector("[class*='price'], [class*='Price']");

        if (strikeEl?.textContent) originalPrice = strikeEl.textContent.trim();
        if (saleEl?.textContent) salePrice = saleEl.textContent.trim();

        // Parse price container for multiple prices
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
        const linkEl = el.querySelector("a[href*='/']") as HTMLAnchorElement;
        if (linkEl?.href && linkEl.href.includes("backcountry.com")) {
          productUrl = linkEl.href;
        }

        if (name && (salePrice || originalPrice)) {
          // Ensure prices are in correct order
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

      // Infer gender from name or URL
      const nameLower = product.name.toLowerCase();
      const urlLower = product.url.toLowerCase();
      const isWomens = nameLower.includes("women") || urlLower.includes("women");
      const sizeType: "mens" | "womens" = isWomens ? "womens" : "mens";
      const defaultSize = isWomens ? "W8" : "M10";
      const sizeNumeric = isWomens ? 8 : 10;

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
    console.error(`Error scraping Backcountry:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(",", "")) : 0;
}
