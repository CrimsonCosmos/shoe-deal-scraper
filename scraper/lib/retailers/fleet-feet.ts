import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Fleet Feet";
const SALE_URL = "https://www.fleetfeet.com/collections/sale-running-shoes";

export async function scrapeFleetFeet(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Fleet Feet sale...");

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

      // Fleet Feet uses Shopify-style product cards
      const productElements = document.querySelectorAll(
        ".product-card, .product-item, [class*='ProductCard'], .grid-product"
      );

      productElements.forEach((el) => {
        let name = "";

        const vendorEl = el.querySelector(".product-card__vendor, .vendor, [class*='vendor']");
        const titleEl = el.querySelector(".product-card__title, .product-title, h3, [class*='title']");

        if (vendorEl?.textContent) name = vendorEl.textContent.trim();
        if (titleEl?.textContent) {
          name = name ? name + " " + titleEl.textContent.trim() : titleEl.textContent.trim();
        }

        let originalPrice = "";
        let salePrice = "";

        const comparePrice = el.querySelector(".product-card__price--compare, .compare-price, [class*='comparePrice'], del, s");
        const currentPrice = el.querySelector(".product-card__price--sale, .sale-price, [class*='salePrice']");
        const regularPrice = el.querySelector(".product-card__price, .price");

        if (comparePrice?.textContent) originalPrice = comparePrice.textContent.trim();
        if (currentPrice?.textContent) salePrice = currentPrice.textContent.trim();
        if (!salePrice && regularPrice?.textContent) salePrice = regularPrice.textContent.trim();

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
        const linkEl = el.querySelector("a[href*='/products/']") as HTMLAnchorElement;
        if (linkEl?.href) url = linkEl.href;

        let gender = "mens";
        const nameLower = name.toLowerCase();
        if (nameLower.includes("women") || nameLower.includes("wmns") || nameLower.includes("w ")) {
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
    console.error(`Error scraping Fleet Feet:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
