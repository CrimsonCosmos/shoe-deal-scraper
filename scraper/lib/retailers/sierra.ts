import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Sierra";
const MENS_SALE_URL = "https://www.sierra.com/mens-running-shoes~d~372/";
const WOMENS_SALE_URL = "https://www.sierra.com/womens-running-shoes~d~373/";

export async function scrapeSierra(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Sierra men's running...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Sierra women's running...");
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

      // Sierra uses product card elements
      const productElements = document.querySelectorAll(
        ".product-card, [class*='ProductCard'], [class*='product-tile'], .search-product, [data-testid='product']"
      );

      productElements.forEach((el) => {
        let name = "";

        // Try brand + product name
        const brandEl = el.querySelector("[class*='brand'], .product-brand");
        const nameEl = el.querySelector("[class*='product-name'], [class*='title'], h2, h3, a[class*='name']");

        if (brandEl?.textContent) name = brandEl.textContent.trim();
        if (nameEl?.textContent) {
          name = name ? name + " " + nameEl.textContent.trim() : nameEl.textContent.trim();
        }

        // Image alt as fallback
        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 3) name = img.alt;
        }

        // Link title as fallback
        if (!name) {
          const linkEl = el.querySelector("a[title]") as HTMLAnchorElement;
          if (linkEl?.title) name = linkEl.title;
        }

        let originalPrice = "";
        let salePrice = "";

        // Sierra typically shows compare price and our price
        const compareEl = el.querySelector("[class*='compare'], [class*='was'], [class*='original'], del, s");
        const ourPriceEl = el.querySelector("[class*='our-price'], [class*='sale'], [class*='now'], [class*='current']");
        const priceEl = el.querySelector("[class*='price']");

        if (compareEl?.textContent) originalPrice = compareEl.textContent.trim();
        if (ourPriceEl?.textContent) salePrice = ourPriceEl.textContent.trim();

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
        if (linkEl?.href && linkEl.href.includes("sierra.com")) url = linkEl.href;

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
    console.error(`Error scraping Sierra:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
