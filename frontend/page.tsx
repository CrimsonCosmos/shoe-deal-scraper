"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";

const getSessionId = () => {
  let id = sessionStorage.getItem('sessionId');
  if (!id) {
    id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem('sessionId', id);
  }
  return id;
};

const trackEvent = (name: string, data?: Record<string, unknown>) => {
  const sessionId = getSessionId();
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'event',
      name,
      category: 'shoes',
      path: '/shoes',
      sessionId,
      data,
    }),
  }).catch(() => {});
};

interface Deal {
  id: string;
  brand: string;
  model: string;
  size: string;
  sizeType: "mens" | "womens";
  sizeNumeric: number;
  originalPrice: number;
  salePrice: number;
  retailer: string;
  url: string;
  inStock: boolean;
}

interface DealsData {
  updated_at: string;
  deals: Deal[];
}

const MENS_SIZES = ["M7", "M7.5", "M8", "M8.5", "M9", "M9.5", "M10", "M10.5", "M11", "M11.5", "M12", "M13", "M14"];
const WOMENS_SIZES = ["W5", "W5.5", "W6", "W6.5", "W7", "W7.5", "W8", "W8.5", "W9", "W9.5", "W10", "W11", "W12"];

export default function ShoesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sizeType, setSizeType] = useState<"mens" | "womens">("mens");
  const [selectedSize, setSelectedSize] = useState("");
  const [sortBy, setSortBy] = useState<"price" | "discount">("price");
  const [updatedAt, setUpdatedAt] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/data/shoe-deals.json")
      .then((res) => res.json())
      .then((data: DealsData) => {
        setDeals(data.deals);
        setUpdatedAt(data.updated_at);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load deals:", err);
        setLoading(false);
      });
  }, []);

  const sizes = sizeType === "mens" ? MENS_SIZES : WOMENS_SIZES;

  const filteredDeals = useMemo(() => {
    let results = deals.filter((d) => d.sizeType === sizeType);

    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(
        (d) =>
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          `${d.brand} ${d.model}`.toLowerCase().includes(q)
      );
    }

    if (selectedSize) {
      results = results.filter((d) => d.size === selectedSize);
    }

    // Sort
    if (sortBy === "price") {
      results.sort((a, b) => a.salePrice - b.salePrice);
    } else {
      results.sort((a, b) => {
        const discountA = (a.originalPrice - a.salePrice) / a.originalPrice;
        const discountB = (b.originalPrice - b.salePrice) / b.originalPrice;
        return discountB - discountA;
      });
    }

    return results;
  }, [deals, search, sizeType, selectedSize, sortBy]);

  // Group by shoe model for better display
  const groupedByShoe = useMemo(() => {
    const groups: Record<string, Deal[]> = {};
    for (const deal of filteredDeals) {
      const key = `${deal.brand} ${deal.model}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(deal);
    }
    return groups;
  }, [filteredDeals]);

  const uniqueShoes = Object.keys(groupedByShoe);

  const formatDiscount = (original: number, sale: number) => {
    const pct = Math.round(((original - sale) / original) * 100);
    return `${pct}% OFF`;
  };

  return (
    <div className="page">
      <header className="hero" style={{ background: "linear-gradient(135deg, #1a5c38 0%, #0d3320 100%)" }}>
        Shoe Deals
      </header>

      <div className="container">
        <p style={{
          fontSize: "1.1rem",
          color: "#e0e0e0",
          textAlign: "center",
          marginBottom: "1.5rem",
          maxWidth: "600px",
          margin: "0 auto 1.5rem"
        }}>
          Find the best prices on running shoes across multiple retailers
        </p>

        {/* Search Controls */}
        <div style={{
          background: "rgba(0,0,0,0.3)",
          borderRadius: "12px",
          padding: "1.25rem",
          marginBottom: "1.5rem"
        }}>
          {/* Size Type Toggle */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", justifyContent: "center" }}>
            <button
              onClick={() => { setSizeType("mens"); setSelectedSize(""); trackEvent('size_type_change', { sizeType: 'mens' }); }}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "6px",
                border: "none",
                background: sizeType === "mens" ? "#1a5c38" : "rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: sizeType === "mens" ? 600 : 400
              }}
            >
              Men's
            </button>
            <button
              onClick={() => { setSizeType("womens"); setSelectedSize(""); trackEvent('size_type_change', { sizeType: 'womens' }); }}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "6px",
                border: "none",
                background: sizeType === "womens" ? "#1a5c38" : "rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: sizeType === "womens" ? 600 : 400
              }}
            >
              Women's
            </button>
          </div>

          {/* Search & Size */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search shoe model (e.g., Vomero 18, Ghost 16)..."
              value={search}
              onChange={(e) => {
                const newSearch = e.target.value;
                setSearch(newSearch);
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                if (newSearch.trim()) {
                  searchTimeoutRef.current = setTimeout(() => {
                    const q = newSearch.toLowerCase();
                    const resultCount = deals.filter(d =>
                      d.sizeType === sizeType &&
                      (d.brand.toLowerCase().includes(q) || d.model.toLowerCase().includes(q) || `${d.brand} ${d.model}`.toLowerCase().includes(q)) &&
                      (!selectedSize || d.size === selectedSize)
                    ).length;
                    trackEvent('search', { query: newSearch.trim(), resultCount, sizeType, selectedSize: selectedSize || 'all' });
                  }, 1000);
                }
              }}
              style={{
                flex: 2,
                minWidth: "200px",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "none",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontSize: "1rem"
              }}
            />
            <select
              value={selectedSize}
              onChange={(e) => { setSelectedSize(e.target.value); if (e.target.value) trackEvent('size_filter', { size: e.target.value }); }}
              style={{
                flex: 1,
                minWidth: "120px",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "none",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontSize: "1rem",
                cursor: "pointer"
              }}
            >
              <option value="">All Sizes</option>
              {sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as "price" | "discount"); trackEvent('sort_change', { sortBy: e.target.value }); }}
              style={{
                minWidth: "140px",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "none",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontSize: "1rem",
                cursor: "pointer"
              }}
            >
              <option value="price">Lowest Price</option>
              <option value="discount">Best Discount</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <p style={{ textAlign: "center", color: "#d0d0d0", padding: "3rem" }}>Loading deals...</p>
        ) : filteredDeals.length === 0 ? (
          <div style={{ textAlign: "center", color: "#d0d0d0", padding: "3rem" }}>
            <p style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>No deals found</p>
            <p style={{ fontSize: "0.95rem" }}>Try a different search or size</p>
          </div>
        ) : (
          <>
            <p style={{ color: "#d0d0d0", marginBottom: "1rem", fontSize: "0.9rem" }}>
              {filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""} found
              {selectedSize && ` in size ${selectedSize}`}
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem"
            }}>
              {filteredDeals.map((deal) => (
                <div
                  key={deal.id}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    flexDirection: "column"
                  }}
                >
                  {/* Header */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <h3 style={{
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      marginBottom: "0.25rem",
                      color: "#fff"
                    }}>
                      {deal.brand} {deal.model}
                    </h3>
                    <p style={{ color: "#d0d0d0", fontSize: "0.9rem" }}>
                      {deal.retailer} · Size {deal.size}
                    </p>
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: "1rem", flex: 1 }}>
                    <span style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      color: "#4ade80"
                    }}>
                      ${deal.salePrice.toFixed(2)}
                    </span>
                    <span style={{
                      marginLeft: "0.5rem",
                      color: "#c0c0c0",
                      textDecoration: "line-through",
                      fontSize: "1rem"
                    }}>
                      ${deal.originalPrice.toFixed(2)}
                    </span>
                    <span style={{
                      marginLeft: "0.75rem",
                      background: "#1a5c38",
                      color: "#fff",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      fontWeight: 600
                    }}>
                      {formatDiscount(deal.originalPrice, deal.salePrice)}
                    </span>
                  </div>

                  {/* Action */}
                  <a
                    href={deal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent('view_deal', { brand: deal.brand, model: deal.model, size: deal.size, salePrice: deal.salePrice, retailer: deal.retailer })}
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "0.75rem",
                      background: "#1a5c38",
                      color: "#fff",
                      borderRadius: "8px",
                      textDecoration: "none",
                      fontWeight: 500,
                      fontSize: "0.95rem"
                    }}
                  >
                    View Deal →
                  </a>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer info */}
        {updatedAt && (
          <p style={{
            color: "#c0c0c0",
            fontSize: "0.85rem",
            textAlign: "center",
            marginTop: "2rem"
          }}>
            Last updated: {new Date(updatedAt).toLocaleDateString()}
          </p>
        )}

        {/* Back Link */}
        <div style={{ textAlign: "center", marginTop: "2rem", marginBottom: "2rem" }}>
          <Link href="/" prefetch={false} style={{
            display: "inline-block",
            padding: "0.6rem 1.5rem",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "0.95rem"
          }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
