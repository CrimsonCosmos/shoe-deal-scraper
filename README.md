# shoe-deal-scraper

Scrapes running-shoe deals across 30 retailers via Puppeteer and normalizes
them into a single JSON feed; a React dashboard renders and filters the
result.

Extracted from [ramandu.com](https://www.ramandu.com)'s `/shoes` page
(source repo: [wintern-next](https://github.com/CrimsonCosmos/wintern-next)).

- `scraper/scrape-shoes.ts` + `scraper/lib/retailers/*.ts` — one scraper
  module per retailer (Nike, Brooks, REI, Zappos, and 26 others), each
  normalized through `scraper/lib/normalizer.ts` into a common `ShoeDeal`
  shape.
- `frontend/page.tsx` — the dashboard component (Next.js/React) that reads
  the resulting JSON feed and renders filterable deal cards. Included for
  reference; it depends on the wintern-next site's global styles
  (`className="page"`) and isn't standalone-runnable as-is.
- `.github/workflows/scrape-shoes.yml` — the original scheduled-scrape
  automation, with the actual `schedule` trigger commented out here (see the
  file for why) so this doesn't double up on the live automation still
  running in wintern-next.

## Running the scraper

```
npm install
npx puppeteer browsers install chrome
npm run scrape          # writes data/shoe-deals.json
npm run scrape -- --dry-run
npm run scrape -- --retailer=nike
```

## Note on sync

This is a periodic snapshot of the source published from the
[wintern-next](https://github.com/CrimsonCosmos/wintern-next) monorepo, not
a live two-way mirror — the live site's data feed and any code changes made
here won't automatically stay in sync.
