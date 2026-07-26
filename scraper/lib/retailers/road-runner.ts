import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "Road Runner Sports";
const MENS_SALE_URL = "https://www.roadrunnersports.com/rrs/product/search-results.jsp?N=100+4294966793+4294955498&Ns=P_SalePrice%7c0&page=1&perPage=96";
const WOMENS_SALE_URL = "https://www.roadrunnersports.com/rrs/product/search-results.jsp?N=100+4294966792+4294955498&Ns=P_SalePrice%7c0&page=1&perPage=96";

export async function scrapeRoadRunner(page: Page): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  console.log("Scraping Road Runner Sports men's sale...");
  const mensDeals = await scrapeSalePage(page, MENS_SALE_URL, "mens");
  deals.push(...mensDeals);
  console.log(`Found ${mensDeals.length} men's deals`);

  console.log("Scraping Road Runner Sports women's sale...");
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

      // Road Runner uses product cards
      const productElements = document.querySelectorAll(
        ".product-card, .product-tile, [class*='ProductCard'], [data-testid='product-card'], .searchResults-item, .product"
      );

      productElements.forEach((el) => {
        // Get name from various sources
        let name = "";
        const nameEl = el.querySelector(
          ".product-name, .product-title, [class*='productName'], h3, h2, a[class*='name']"
        );
        if (nameEl?.textContent) {
          name = nameEl.textContent.trim();
        }

        // Get image alt as fallback
        if (!name) {
          const img = el.querySelector("img[alt]") as HTMLImageElement;
          if (img?.alt) name = img.alt.trim();
        }

        // Get prices
        let originalPrice = "";
        let salePrice = "";

        const priceContainer = el.querySelector("[class*='price'], .prices");
        if (priceContainer) {
          const text = priceContainer.textContent || "";
          const prices = text.match(/\$[\d.]+/g);
          if (prices && prices.length >= 2) {
            originalPrice = prices[0];
            salePrice = prices[1];
          } else if (prices && prices.length === 1) {
            salePrice = prices[0];
          }
        }

        // Also check for specific price elements
        const wasPrice = el.querySelector(".was-price, .original-price, [class*='wasPrice'], del, s");
        const nowPrice = el.querySelector(".now-price, .sale-price, [class*='salePrice'], [class*='nowPrice']");

        if (wasPrice?.textContent) originalPrice = wasPrice.textContent.trim();
        if (nowPrice?.textContent) salePrice = nowPrice.textContent.trim();

        // Get URL
        let url = "";
        const linkEl = el.querySelector("a[href*='/product/'], a[href*='shoes']") as HTMLAnchorElement;
        if (linkEl?.href) url = linkEl.href;

        if (name && (salePrice || originalPrice)) {
          // Ensure lower price is sale
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
    console.error(`Error scraping Road Runner:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}
