import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Zappos";
const MENS_SALE_URL = "https://www.zappos.com/men-running-shoes?s=percentOff/desc/";
const WOMENS_SALE_URL = "https://www.zappos.com/women-running-shoes?s=percentOff/desc/";

export async function scrapeZappos(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Zappos men's running sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Zappos women's running sale...");
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

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
      }> = [];

      // Zappos uses article elements for products
      const productElements = document.querySelectorAll(
        "article[data-product-id], [data-product-id], .product-card, [class*='productCard']"
      );

      productElements.forEach((el) => {
        let name = "";

        // Brand + product name
        const brandEl = el.querySelector("[data-brand-name], [class*='brandName'], .brand");
        const productNameEl = el.querySelector("[data-product-name], [class*='productName'], .product-name");

        if (brandEl?.textContent) name = brandEl.textContent.trim();
        if (productNameEl?.textContent) {
          name = name ? name + " " + productNameEl.textContent.trim() : productNameEl.textContent.trim();
        }

        // Fallback to link text or image alt
        if (!name) {
          const linkEl = el.querySelector("a[aria-label]") as HTMLAnchorElement;
          if (linkEl?.getAttribute("aria-label")) {
            name = linkEl.getAttribute("aria-label") || "";
          }
        }

        let originalPrice = "";
        let salePrice = "";

        // Zappos shows original and sale prices
        const originalEl = el.querySelector("[data-original-price], .original-price, [class*='originalPrice'], del");
        const saleEl = el.querySelector("[data-sale-price], .sale-price, [class*='salePrice']");
        const priceEl = el.querySelector("[data-price], .price");

        if (originalEl?.textContent) originalPrice = originalEl.textContent.trim();
        if (saleEl?.textContent) salePrice = saleEl.textContent.trim();
        if (!salePrice && priceEl?.textContent) salePrice = priceEl.textContent.trim();

        // Parse from combined text
        if (!salePrice) {
          const container = el.querySelector("[class*='price']");
          if (container) {
            const prices = (container.textContent || "").match(/\$[\d.]+/g);
            if (prices && prices.length >= 2) {
              originalPrice = prices[0];
              salePrice = prices[1];
            } else if (prices) {
              salePrice = prices[0];
            }
          }
        }

        let url = "";
        const linkEl = el.querySelector("a[href*='/p/']") as HTMLAnchorElement;
        if (linkEl?.href) url = linkEl.href;

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
    console.error(`Error scraping Zappos:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
