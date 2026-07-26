import type { Page } from "puppeteer";
import { generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Mizuno";
const MENS_SALE_URL = "https://usa.mizuno.com/running/mens-shoes/sale/";
const WOMENS_SALE_URL = "https://usa.mizuno.com/running/womens-shoes/sale/";

export async function scrapeMizuno(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Mizuno men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Mizuno women's sale...");
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

      // Mizuno uses various product selectors
      const productElements = document.querySelectorAll(
        ".product-card, [class*='ProductCard'], .product-item, .grid-product, [class*='product-tile'], article[class*='product'], [data-testid='product-card'], .product, li[class*='product']"
      );

      productElements.forEach((el) => {
        let name = "";

        // Get product link first - we'll extract name from URL if needed
        let productUrl = "";
        const linkEl = el.querySelector("a[href*='mizuno']") as HTMLAnchorElement;
        if (linkEl?.href) productUrl = linkEl.href;

        // Try image alt
        const img = el.querySelector("img[alt]") as HTMLImageElement;
        const altText = img?.alt || "";
        const invalidAlts = ["placeholder", "badge", "more colors", "color", "loading"];
        if (altText.length > 10 && !invalidAlts.some(inv => altText.toLowerCase().includes(inv))) {
          name = altText;
        }

        // Extract name from URL as reliable fallback (e.g., running-wave-rider-28-mens -> Wave Rider 28)
        if (!name && productUrl) {
          const urlPath = productUrl.split('/').pop() || "";
          // Remove common suffixes and clean up
          const cleaned = urlPath
            .replace(/-mens$|-womens$|-unisex$/i, "")
            .replace(/^running-/, "")
            .replace(/-/g, " ")
            .split(" ")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          if (cleaned.length > 3) name = cleaned;
        }

        // Product name element
        if (!name) {
          const nameEl = el.querySelector(
            "[class*='product-title'], [class*='ProductTitle'], [class*='product-name'], h2, h3, h4"
          );
          const text = nameEl?.textContent?.trim() || "";
          if (text.length > 5 && !invalidAlts.some(inv => text.toLowerCase().includes(inv))) {
            name = text;
          }
        }

        let originalPrice = "";
        let salePrice = "";

        // Shopify patterns
        const compareEl = el.querySelector("[class*='compare'], [class*='was'], .price--compare, del, s");
        const saleEl = el.querySelector("[class*='sale'], [class*='now'], .price--sale");
        const priceEl = el.querySelector("[class*='price'], .money");

        if (compareEl?.textContent) originalPrice = compareEl.textContent.trim();
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

        const url = productUrl;

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

      const defaultSize = sizeType === "mens" ? "M10" : "W8";
      const sizeNumeric = sizeType === "mens" ? 10 : 8;

      deals.push({
        id: generateDealId(RETAILER, "Mizuno", product.name, defaultSize),
        brand: "Mizuno",
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
    console.error(`Error scraping Mizuno:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
