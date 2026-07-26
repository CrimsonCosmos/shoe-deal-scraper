import type { Page } from "puppeteer";
import { extractBrandModel, generateDealId } from "../normalizer";
import type { ShoeDeal } from "./running-warehouse";

const RETAILER = "RunRepeat";
// RunRepeat catalog with deals filter
const BASE_URL = "https://runrepeat.com/catalog/running-shoes";
const MAX_PAGES = 20; // They have many pages

export async function scrapeRunRepeat(page: Page): Promise<ShoeDeal[]> {
  const allDeals: ShoeDeal[] = [];

  console.log("Scraping RunRepeat running shoe deals...");

  // Scrape multiple pages
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;
    console.log(`  Scraping page ${pageNum}...`);

    const deals = await scrapeSinglePage(page, url);
    if (deals.length === 0) {
      console.log(`  No more products on page ${pageNum}, stopping.`);
      break;
    }
    allDeals.push(...deals);
    console.log(`  Found ${deals.length} deals on page ${pageNum}`);

    // Respectful delay between pages
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`Total RunRepeat deals: ${allDeals.length}`);
  return allDeals;
}

async function scrapeSinglePage(page: Page, url: string): Promise<ShoeDeal[]> {
  const deals: ShoeDeal[] = [];

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Scroll to load any lazy content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const products = await page.evaluate(() => {
      const items: Array<{
        name: string;
        brand: string;
        originalPrice: string;
        salePrice: string;
        discount: string;
        url: string;
        retailer: string;
      }> = [];

      // RunRepeat uses product links like /nike-vomero-18, /hoka-bondi-9
      // Find all links that look like product pages (not catalog, guides, deals)
      const productLinks = Array.from(document.querySelectorAll("a"))
        .filter((a) => {
          const href = a.href;
          return (
            href.includes("runrepeat.com/") &&
            !href.includes("/catalog") &&
            !href.includes("/guides") &&
            !href.includes("/deals") &&
            !href.includes("/about") &&
            !href.includes("/search") &&
            !href.includes("#") &&
            href.split("/").length === 4 // runrepeat.com/shoe-slug
          );
        })
        .filter((a, i, arr) => arr.findIndex((x) => x.href === a.href) === i); // unique

      // For each product link, find its container and extract info
      const processedUrls = new Set<string>();

      productLinks.forEach((link) => {
        if (processedUrls.has(link.href)) return;
        processedUrls.add(link.href);

        // Find the product container - the LI.product_list element
        // Must be specific because product-name is a child div that doesn't have prices
        let container = link.closest("li.product_list");
        if (!container) {
          container = link.closest("[class*='product_list']");
        }
        if (!container) {
          // Fallback: walk up 3 levels (a -> product-name -> product-title-container -> product_list)
          container = link.parentElement?.parentElement?.parentElement || null;
        }
        if (!container) return;

        const name = link.textContent?.trim() || "";
        if (!name || name.length < 3) return;

        // Extract brand from name
        const brandMatch = name.match(/^(Nike|ASICS|Brooks|Hoka|HOKA|Saucony|New Balance|Adidas|Mizuno|On|Puma|PUMA|Altra|Reebok)/i);
        const brand = brandMatch ? brandMatch[1] : "";

        // Find prices in container
        const containerText = container.textContent || "";
        const prices = containerText.match(/\$(\d+)/g) || [];
        let originalPrice = "";
        let salePrice = "";

        if (prices.length >= 2) {
          originalPrice = prices[0] ?? "";
          salePrice = prices[1] ?? "";
        } else if (prices.length === 1) {
          salePrice = prices[0] ?? "";
        }

        // Find discount
        const discountMatch = containerText.match(/Save\s+(\d+)%/i);
        const discount = discountMatch ? discountMatch[1] + "%" : "";

        // Find retailer
        const retailerMatch = containerText.match(/See on\s+(\w+)/i);
        const retailer = retailerMatch ? retailerMatch[1] : "";

        if (name && (salePrice || originalPrice)) {
          items.push({
            name,
            brand,
            originalPrice,
            salePrice: salePrice || originalPrice,
            discount,
            url: link.href,
            retailer,
          });
        }
      });

      return items;
    });


    console.log(`    Found ${products.length} products on page`);

    for (const product of products) {
      // Use extractBrandModel or fall back to the brand we found
      let brand = product.brand;
      let model = product.name;

      const brandModel = extractBrandModel(product.name);
      if (brandModel) {
        brand = brandModel.brand;
        model = brandModel.model;
      }

      if (!brand) continue;

      const originalPrice = parsePrice(product.originalPrice);
      const salePrice = parsePrice(product.salePrice);

      if (salePrice <= 0) continue;

      // Skip if no discount (not actually on sale)
      if (originalPrice > 0 && salePrice >= originalPrice) continue;

      // Infer gender from name
      const nameLower = product.name.toLowerCase();
      const isWomens = nameLower.includes("women") || nameLower.includes("wmns");
      const sizeType: "mens" | "womens" = isWomens ? "womens" : "mens";
      const defaultSize = isWomens ? "W8" : "M10";
      const sizeNumeric = isWomens ? 8 : 10;

      deals.push({
        id: generateDealId(RETAILER, brand, model, defaultSize),
        brand,
        model,
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
    console.error(`Error scraping RunRepeat page:`, error);
  }

  return deals;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(",", "")) : 0;
}
