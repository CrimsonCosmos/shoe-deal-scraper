import type { Page } from "puppeteer";
import { generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Altra";
const MENS_SALE_URL = "https://www.altrarunning.com/shop/mens-shoes-sale";
const WOMENS_SALE_URL = "https://www.altrarunning.com/shop/womens-shoes-sale";

export async function scrapeAltra(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Altra men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Altra women's sale...");
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

      const productElements = document.querySelectorAll(
        ".product-tile, [class*='product-card'], .product, .grid-tile"
      );

      productElements.forEach((el) => {
        let name = "";

        const nameEl = el.querySelector(
          ".product-tile__name, .product-name, .pdp-link, h3, [class*='name']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt) name = img.alt;
        }

        let originalPrice = "";
        let salePrice = "";

        const strikeEl = el.querySelector(".price--strike, .price-standard, [class*='was'], del, s");
        const saleEl = el.querySelector(".price--sale, .price-sales, [class*='sale'], [class*='now']");

        if (strikeEl?.textContent) originalPrice = strikeEl.textContent.trim();
        if (saleEl?.textContent) salePrice = saleEl.textContent.trim();

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
        const linkEl = el.querySelector("a[href*='/product/'], a[href*='/shop/']") as HTMLAnchorElement;
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

      const defaultSize = sizeType === "mens" ? "M10" : "W8";
      const sizeNumeric = sizeType === "mens" ? 10 : 8;

      deals.push({
        id: generateDealId(RETAILER, "Altra", product.name, defaultSize),
        brand: "Altra",
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
    console.error(`Error scraping Altra:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
