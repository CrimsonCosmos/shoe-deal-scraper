import type { Page } from "puppeteer";
import { generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Brooks";
const MENS_SALE_URL = "https://www.brooksrunning.com/en_us/sale/mens/shoes/";
const WOMENS_SALE_URL = "https://www.brooksrunning.com/en_us/sale/womens/shoes/";

export async function scrapeBrooks(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Brooks men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Brooks women's sale...");
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

    // Scroll to load lazy-loaded products
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    // Scroll back up
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
      }> = [];

      // Brooks uses various product tile patterns
      const productElements = document.querySelectorAll(
        "[data-component='ProductTile'], [class*='product-tile'], [class*='product-card'], .product-grid-item, article[class*='product'], div[class*='ProductCard'], li[class*='product']"
      );

      productElements.forEach((el) => {
        let name = "";

        // Try multiple name selectors
        const nameEl = el.querySelector(
          "[class*='product-name'], [class*='ProductName'], [class*='title'], h2, h3, h4, a[class*='link']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        // Image alt as fallback
        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt && img.alt.length > 3) name = img.alt;
        }

        // Link aria-label as fallback
        if (!name) {
          const linkEl = el.querySelector("a[aria-label]") as HTMLAnchorElement;
          if (linkEl?.getAttribute("aria-label")) {
            name = linkEl.getAttribute("aria-label") || "";
          }
        }

        let originalPrice = "";
        let salePrice = "";

        const strikeEl = el.querySelector(".price--strike, .was-price, del, s");
        const currentEl = el.querySelector(".price--sale, .sale-price, .price--current");

        if (strikeEl?.textContent) originalPrice = strikeEl.textContent.trim();
        if (currentEl?.textContent) salePrice = currentEl.textContent.trim();

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
        const linkEl = el.querySelector("a[href]") as HTMLAnchorElement;
        if (linkEl?.href && (linkEl.href.includes("/shoes/") || linkEl.href.includes("/running/"))) {
          url = linkEl.href;
        }

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
        id: generateDealId(RETAILER, "Brooks", product.name, defaultSize),
        brand: "Brooks",
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
    console.error(`Error scraping Brooks:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
