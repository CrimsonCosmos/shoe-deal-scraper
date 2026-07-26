import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "JackRabbit";
const SALE_URL = "https://www.jackrabbit.com/sale/shoes/?prefn1=isRunning&prefv1=true";

export async function scrapeJackRabbit(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping JackRabbit sale...");

  try {
    await page.goto(SALE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        originalPrice: string;
        salePrice: string;
        url: string;
        gender: string;
      }> = [];

      const productElements = document.querySelectorAll(
        ".product-tile, .product, [class*='product-card'], [data-pid]"
      );

      productElements.forEach((el) => {
        let name = "";

        const nameEl = el.querySelector(
          ".product-name, .pdp-link a, .product-title, h3, [class*='name']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        const brandEl = el.querySelector(".product-brand, [class*='brand']");
        if (brandEl?.textContent && name && !name.toLowerCase().includes(brandEl.textContent.toLowerCase())) {
          name = brandEl.textContent.trim() + " " + name;
        }

        let originalPrice = "";
        let salePrice = "";

        const strikePrice = el.querySelector(".strike-through, .was-price, del, s, [class*='original']");
        const currentPrice = el.querySelector(".sales, .sale-price, .now-price, [class*='sale']");

        if (strikePrice?.textContent) originalPrice = strikePrice.textContent.trim();
        if (currentPrice?.textContent) salePrice = currentPrice.textContent.trim();

        if (!salePrice) {
          const priceEl = el.querySelector(".price, [class*='price']");
          if (priceEl) {
            const prices = (priceEl.textContent || "").match(/\$[\d.]+/g);
            if (prices && prices.length >= 2) {
              originalPrice = prices[0];
              salePrice = prices[1];
            } else if (prices) {
              salePrice = prices[0];
            }
          }
        }

        let url = "";
        const linkEl = el.querySelector("a[href*='/product/'], a.product-link, a[href*='shoes']") as HTMLAnchorElement;
        if (linkEl?.href) url = linkEl.href;

        let gender = "mens";
        const nameLower = name.toLowerCase();
        if (nameLower.includes("women") || nameLower.includes("wmns")) {
          gender = "womens";
        }

        if (name && (salePrice || originalPrice)) {
          const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, "")) || 0;
          const saleNum = parseFloat(salePrice.replace(/[^0-9.]/g, "")) || 0;

          if (origNum > 0 && saleNum > 0 && origNum < saleNum) {
            [originalPrice, salePrice] = [salePrice, originalPrice];
          }

          items.push({ name, originalPrice, salePrice: salePrice || originalPrice, url, gender });
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

      const sizeType = product.gender === "womens" ? "womens" : "mens";
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
    console.error(`Error scraping JackRabbit:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
