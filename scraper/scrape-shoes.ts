#!/usr/bin/env npx ts-node

/**
 * Shoe Deal Scraper
 *
 * Scrapes running shoe deals from multiple retailers and saves to JSON.
 *
 * Usage:
 *   npx ts-node scripts/scrape-shoes.ts
 *   npx ts-node scripts/scrape-shoes.ts --retailer running-warehouse
 *   npx ts-node scripts/scrape-shoes.ts --dry-run
 */

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { scrapeRunningWarehouse, type ShoeDeal } from "./lib/retailers/running-warehouse";
import { scrapeREI } from "./lib/retailers/rei";
import { scrapeNike } from "./lib/retailers/nike";
import { scrapeBrooks } from "./lib/retailers/brooks";
import { scrapeSaucony } from "./lib/retailers/saucony";
import { scrapeOnRunning } from "./lib/retailers/on-running";
import { scrapeDSW } from "./lib/retailers/dsw";
import { scrapeMizuno } from "./lib/retailers/mizuno";
import { scrapeHolabird } from "./lib/retailers/holabird";
import { scrapeRunRepeat } from "./lib/retailers/runrepeat";

// Disabled retailers (bot protection, timeouts, or selector issues):
// Backcountry, Under Armour, Finish Line, Road Runner Sports, JackRabbit,
// Zappos, Dick's, Fleet Feet, Hoka, ASICS, New Balance, Altra, 6pm,
// Topo, Salomon, Reebok, Eastbay, Nordstrom Rack, Adidas, Sierra

const OUTPUT_PATH = path.join(__dirname, "../data/shoe-deals.json");

interface DealsData {
  updated_at: string;
  deals: ShoeDeal[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const retailerArg = args.find(a => a.startsWith("--retailer="))?.split("=")[1];

  console.log("Starting shoe deal scraper...");
  console.log(`Dry run: ${dryRun}`);
  if (retailerArg) console.log(`Retailer filter: ${retailerArg}`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();

  // Set a realistic user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });

  const allDeals: ShoeDeal[] = [];

  try {
    // Scrape Running Warehouse
    if (!retailerArg || retailerArg === "running-warehouse") {
      console.log("\n=== Running Warehouse ===");
      const rwDeals = await scrapeRunningWarehouse(page);
      allDeals.push(...rwDeals);
    }

    // Scrape REI
    if (!retailerArg || retailerArg === "rei") {
      console.log("\n=== REI ===");
      const reiDeals = await scrapeREI(page);
      allDeals.push(...reiDeals);
    }

    // Scrape Nike
    if (!retailerArg || retailerArg === "nike") {
      console.log("\n=== Nike ===");
      const nikeDeals = await scrapeNike(page);
      allDeals.push(...nikeDeals);
    }

    // Scrape Brooks
    if (!retailerArg || retailerArg === "brooks") {
      console.log("\n=== Brooks ===");
      const brooksDeals = await scrapeBrooks(page);
      allDeals.push(...brooksDeals);
    }

    // Scrape Saucony
    if (!retailerArg || retailerArg === "saucony") {
      console.log("\n=== Saucony ===");
      const sauconyDeals = await scrapeSaucony(page);
      allDeals.push(...sauconyDeals);
    }

    // Scrape On Running
    if (!retailerArg || retailerArg === "on-running") {
      console.log("\n=== On Running ===");
      const onDeals = await scrapeOnRunning(page);
      allDeals.push(...onDeals);
    }

    // Scrape DSW
    if (!retailerArg || retailerArg === "dsw") {
      console.log("\n=== DSW ===");
      const dswDeals = await scrapeDSW(page);
      allDeals.push(...dswDeals);
    }

    // Scrape Mizuno
    if (!retailerArg || retailerArg === "mizuno") {
      console.log("\n=== Mizuno ===");
      const mizunoDeals = await scrapeMizuno(page);
      allDeals.push(...mizunoDeals);
    }

    // Scrape Holabird Sports
    if (!retailerArg || retailerArg === "holabird") {
      console.log("\n=== Holabird Sports ===");
      const holabirdDeals = await scrapeHolabird(page);
      allDeals.push(...holabirdDeals);
    }

    // Scrape RunRepeat (aggregator)
    if (!retailerArg || retailerArg === "runrepeat") {
      console.log("\n=== RunRepeat ===");
      const runrepeatDeals = await scrapeRunRepeat(page);
      allDeals.push(...runrepeatDeals);
    }

    console.log(`\nTotal deals scraped: ${allDeals.length}`);

    // Deduplicate by ID (keep lowest price)
    const dealsMap = new Map<string, ShoeDeal>();
    for (const deal of allDeals) {
      const existing = dealsMap.get(deal.id);
      if (!existing || deal.salePrice < existing.salePrice) {
        dealsMap.set(deal.id, deal);
      }
    }
    const uniqueDeals = Array.from(dealsMap.values());
    console.log(`Unique deals after deduplication: ${uniqueDeals.length}`);

    // Sort by sale price
    uniqueDeals.sort((a, b) => a.salePrice - b.salePrice);

    if (dryRun) {
      console.log("\nDry run - not saving. Sample deals:");
      console.log(JSON.stringify(uniqueDeals.slice(0, 5), null, 2));
    } else {
      // Load existing deals to merge
      let existingDeals: ShoeDeal[] = [];
      try {
        const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8")) as DealsData;
        existingDeals = existing.deals;
      } catch {
        console.log("No existing deals file, creating new one");
      }

      // Merge: new deals take priority, keep old deals from other retailers
      const scrapedRetailers = new Set(uniqueDeals.map(d => d.retailer));
      const keptOldDeals = existingDeals.filter(d => !scrapedRetailers.has(d.retailer));
      const mergedDeals = [...uniqueDeals, ...keptOldDeals];

      // Sort final list
      mergedDeals.sort((a, b) => a.salePrice - b.salePrice);

      const output: DealsData = {
        updated_at: new Date().toISOString(),
        deals: mergedDeals,
      };

      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
      console.log(`\nSaved ${mergedDeals.length} deals to ${OUTPUT_PATH}`);
    }
  } catch (error) {
    console.error("Scraper error:", error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
