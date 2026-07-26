/**
 * Normalize shoe names and sizes for consistent matching
 */

export function normalizeShoeModel(brand: string, model: string): string {
  // Lowercase and remove extra spaces
  const normalized = `${brand} ${model}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

export function parseSize(sizeText: string): { size: string; sizeType: "mens" | "womens"; sizeNumeric: number } | null {
  // Handle formats like "M 10", "Men's 10", "10 M", "W 8.5", "Women's 8.5", etc.
  const text = sizeText.trim().toUpperCase();

  // Try to extract numeric size
  const numMatch = text.match(/(\d+\.?\d*)/);
  if (!numMatch) return null;

  const sizeNumeric = parseFloat(numMatch[1]);

  // Determine gender
  let sizeType: "mens" | "womens" = "mens";
  if (text.includes("W") || text.includes("WOMEN")) {
    sizeType = "womens";
  }

  const prefix = sizeType === "mens" ? "M" : "W";
  const size = `${prefix}${sizeNumeric}`;

  return { size, sizeType, sizeNumeric };
}

export function extractBrandModel(fullName: string): { brand: string; model: string } | null {
  // Known brands with their variations
  const brands: Record<string, string> = {
    "nike": "Nike",
    "brooks": "Brooks",
    "hoka": "Hoka",
    "hoka one one": "Hoka",
    "saucony": "Saucony",
    "asics": "ASICS",
    "new balance": "New Balance",
    "adidas": "Adidas",
    "on": "On",
    "on running": "On",
    "altra": "Altra",
    "mizuno": "Mizuno",
    "puma": "Puma",
    "reebok": "Reebok",
    "salomon": "Salomon",
  };

  const nameLower = fullName.toLowerCase().trim();

  for (const [pattern, brandName] of Object.entries(brands)) {
    if (nameLower.startsWith(pattern + " ") || nameLower.startsWith(pattern + "'s ")) {
      const model = fullName.substring(pattern.length).trim().replace(/^'s\s*/i, "");
      return { brand: brandName, model };
    }
  }

  // Fallback: first word is brand, rest is model
  const parts = fullName.split(/\s+/);
  if (parts.length >= 2) {
    return {
      brand: parts[0],
      model: parts.slice(1).join(" ")
    };
  }

  return null;
}

export function calculateDiscount(original: number, sale: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - sale) / original) * 100);
}

export function generateDealId(retailer: string, brand: string, model: string, size: string): string {
  const retailerCode = retailer.toLowerCase().replace(/\s+/g, "-").substring(0, 3);
  const shoeCode = `${brand}-${model}`.toLowerCase().replace(/\s+/g, "").substring(0, 20);
  const sizeCode = size.toLowerCase();
  return `${retailerCode}-${shoeCode}-${sizeCode}`;
}
