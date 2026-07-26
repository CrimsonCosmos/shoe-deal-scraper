import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Dick's Sporting Goods";
const MENS_SALE_URL = "https://www.dickssportinggoods.com/f/mens-running-shoes?pageNumber=0&filterFacets=facet_ads_f%3ASale";
const WOMENS_SALE_URL = "https://www.dickssportinggoods.com/f/womens-running-shoes?pageNumber=0&filterFacets=facet_ads_f%3ASale";

export async function scrapeDicks(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Dick's Sporting Goods men's running sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Dick's Sporting Goods women's running sale...");
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
    await new Promise(resolve => setTimeout(resolve, 4000));

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
        "[data-testid='product-card'], .product-card, [class*='ProductCard'], .rs-product-card"
      );

      productElements.forEach((el) => {
        let name = "";

        const nameEl = el.querySelector(
          "[data-testid='product-card-title'], .product-title, .product-name, h3, [class*='title']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        const brandEl = el.querySelector("[data-testid='product-card-brand'], .brand, [class*='brand']");
        if (brandEl?.textContent && name) {
          const brand = brandEl.textContent.trim();
          if (!name.toLowerCase().startsWith(brand.toLowerCase())) {
            name = brand + " " + name;
          }
        }

        let originalPrice = "";
        let salePrice = "";

        const wasPrice = el.querySelector("[data-testid='was-price'], .was-price, [class*='wasPrice'], del, s");
        const nowPrice = el.querySelector("[data-testid='now-price'], .now-price, [class*='salePrice'], [class*='nowPrice']");

        if (wasPrice?.textContent) originalPrice = wasPrice.textContent.trim();
        if (nowPrice?.textContent) salePrice = nowPrice.textContent.trim();

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
    console.error(`Error scraping Dick's:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
