import type { Page } from "puppeteer";
import { generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Nike";
const MENS_SALE_URL = "https://www.nike.com/w/mens-sale-running-shoes-37v7jz3yaepz4c3ty";
const WOMENS_SALE_URL = "https://www.nike.com/w/womens-sale-running-shoes-37v7jz3yaepz5e1x6";

export async function scrapeNike(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Nike men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Nike women's sale...");
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

    // Scroll to load more products
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
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

      // Nike uses product-card elements
      const productElements = document.querySelectorAll(
        "[data-testid='product-card'], .product-card, .product-card__body"
      );

      productElements.forEach((el) => {
        let name = "";

        const titleEl = el.querySelector(
          "[data-testid='product-card__title'], .product-card__title, h3"
        );
        if (titleEl?.textContent) {
          name = titleEl.textContent.trim();
        }

        // Subtitle often has more details
        const subtitleEl = el.querySelector(
          "[data-testid='product-card__subtitle'], .product-card__subtitle"
        );
        if (subtitleEl?.textContent) {
          name = name + " " + subtitleEl.textContent.trim();
        }

        let originalPrice = "";
        let salePrice = "";

        const fullPriceEl = el.querySelector(
          "[data-testid='product-price-reduced'], .product-price__reduced, .is--striked-out"
        );
        const currentPriceEl = el.querySelector(
          "[data-testid='product-price'], .product-price, .is--current-price"
        );

        if (fullPriceEl?.textContent) originalPrice = fullPriceEl.textContent.trim();
        if (currentPriceEl?.textContent) salePrice = currentPriceEl.textContent.trim();

        // If both prices in one container
        if (!salePrice) {
          const priceContainer = el.querySelector("[class*='price']");
          if (priceContainer) {
            const prices = (priceContainer.textContent || "").match(/\$[\d.]+/g);
            if (prices && prices.length >= 2) {
              originalPrice = prices[0];
              salePrice = prices[1];
            } else if (prices) {
              salePrice = prices[0];
            }
          }
        }

        let url = "";
        const linkEl = el.querySelector("a[href*='/t/']") as HTMLAnchorElement;
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
      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

      // Filter out non-shoe items (shorts, socks, shirts, etc.)
      const nameLower = product.name.toLowerCase();
      const nonShoeTerms = ["short", "sock", "shirt", "top", "bra", "tight", "pant", "jacket", "vest", "hat", "cap", "bag", "visor", "tank", "hoodie", "sleeve", "jogger", "legging"];
      if (nonShoeTerms.some(term => nameLower.includes(term))) continue;
      // Must have "shoe" in the name or be priced like a shoe ($50+)
      if (!nameLower.includes("shoe") && salePrice < 50) continue;

      const defaultSize = sizeType === "mens" ? "M10" : "W8";
      const sizeNumeric = sizeType === "mens" ? 10 : 8;

      deals.push({
        id: generateDealId(RETAILER, "Nike", product.name, defaultSize),
        brand: "Nike",
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
    console.error(`Error scraping Nike:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
