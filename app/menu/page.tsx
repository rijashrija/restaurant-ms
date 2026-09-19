"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, Plus, Minus, ChefHat, CheckCircle2 } from "lucide-react";
import { verifyTable, getMenu, placeOrder, getRestaurantSettings, RestaurantSettings, API_BASE_URL, getCategories, Category } from "../../services/api";
import { MenuItem, Table, CartItem } from "../../lib/types";
import { getToken } from "../../services/auth";

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  pageBg: "#f5efe6",         // warm cream
  cardBg: "#fff",
  cardBorder: "#e8ddd2",
  sidebarBg: "#fff",
  sidebarBorder: "#e8ddd2",
  text: "#2c1f14",
  muted: "#7a6552",
  primary: "#c2703e",        // terracotta
  primaryHover: "#a3622f",
  primaryBg: "#f5ebe4",      // pale terracotta
  olive: "#4a6741",          // olive green (add to cart)
  oliveHover: "#3d5636",
  oliveBg: "#eef2eb",        // pale olive
  priceBg: "#f5ebe4",
  priceText: "#8b5e3c",
  categoryActive: "#2c2118", // warm charcoal
  cartBarBg: "#2c2118",
  tagBg: "#f5ebe4",
  tagText: "#8b5e3c",
};

function MenuContent() {
  const searchParams = useSearchParams();
  const tableIdentifier = searchParams.get("table");

  const [table, setTable] = useState<Table | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [categories, setCategories] = useState<Category[]>([]);
  const [branding, setBranding] = useState<RestaurantSettings | null>(null);

  // Splash screen state
  const [showSplash, setShowSplash] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashFadingOut, setSplashFadingOut] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState<{ id: number; total: number } | null>(null);

  // ── 1. Initial Load: Verify Table & Fetch Menu ──────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!tableIdentifier) {
        setError("No table identifier found in URL. Please scan the QR code on your table.");
        setIsLoading(false);
        return;
      }

      try {
        // First verify the table exists and check its status
        const tableData = await verifyTable(tableIdentifier);

        // Table is available or we are appending to an existing order — load the rest
        const [menuData, brandingData, categoriesData] = await Promise.all([
          getMenu(),
          getRestaurantSettings(),
          getCategories()
        ]);
        
        setTable(tableData);
        setMenuItems(menuData);
        setBranding(brandingData);
        setCategories(categoriesData);

        // Trigger splash screen
        setShowSplash(true);
        setIsLoading(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setSplashVisible(true));
        });
        setTimeout(() => setSplashFadingOut(true), 2500);
        setTimeout(() => setShowSplash(false), 3100);
      } catch (err: any) {
        setError(err.message || "Failed to load menu. Please try again.");
        setIsLoading(false);
      }
    }

    loadData();
  }, [tableIdentifier]);

  // ── 2. Handle Category Filtering ─────────────────────────────────────────
  useEffect(() => {
    async function updateCategory() {
      if (!table) return;
      try {
        const menuData = await getMenu(activeCategory);
        setMenuItems(menuData);
      } catch (err) {
        console.error("Failed to filter menu:", err);
      }
    }
    updateCategory();
  }, [activeCategory, table]);

  // ── 3. Cart Management Functions ─────────────────────────────────────────
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.id !== itemId));
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCart((prev) => {
      return prev.map((c) => {
        if (c.id === itemId) {
          const newQ = c.quantity + delta;
          return newQ > 0 ? { ...c, quantity: newQ } : c;
        }
        return c;
      });
    });
  };

  const cartSubtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  }, [cart]);

  const vatAmount = cartSubtotal * 0.13;
  const grandTotal = cartSubtotal + vatAmount;

  // ── 4. Place Order ───────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!table || cart.length === 0) return;
    
    setIsPlacingOrder(true);
    setError(null);
    
    try {
      const orderItems = cart.map(item => ({
        menu_item_id: item.id,
        quantity: item.quantity
      }));
      
      const token = getToken() || undefined;
      const response = await placeOrder(table.id, orderItems, token);
      
      const respSubtotal = response.total_price;
      const respVat = respSubtotal * 0.13;
      setOrderConfirmed({ id: response.order_id, total: respSubtotal + respVat });
      setCart([]);
    } catch (err: any) {
      setError(err.message || "Failed to place order.");
    } finally {
      setIsPlacingOrder(false);
    }
  };



  // ── Render Error State ──────────────────────────────────────────────────
  if (error && !table) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.pageBg, color: C.text }}>
        <div className="p-8 rounded-2xl shadow-sm text-center max-w-md w-full" style={{ background: C.cardBg, border: "1px solid #fecaca" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#fee2e2", color: "#ef4444" }}>
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Oops!</h1>
          <p style={{ color: C.muted }} className="mb-6">{error}</p>
        </div>
      </div>
    );
  }

  // ── Render Loading State ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.pageBg, color: C.text }}>
        <div className="flex flex-col items-center gap-4">
          <ChefHat className="w-12 h-12 animate-bounce" style={{ color: C.primary }} />
          <p className="font-medium animate-pulse" style={{ color: C.muted }}>Loading Menu...</p>
        </div>
      </div>
    );
  }

  // ── Render Splash Screen (after data loads) ──────────────────────────────
  if (showSplash) {
    const logoUrl = branding?.logo_url
      ? branding.logo_url.startsWith("/")
        ? `${API_BASE_URL}${branding.logo_url}`
        : branding.logo_url
      : null;
    const restroName = branding?.restro_name || "Welcome";
    const tagline = branding?.tagline || "";

    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          .qr-splash-bg {
            background: #1c1714;
            font-family: 'Inter', sans-serif;
          }
          .qr-splash-wrap {
            opacity: 0;
            transform: scale(0.92);
            transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
          }
          .qr-splash-wrap.visible { opacity: 1; transform: scale(1); }
          .qr-splash-wrap.fading {
            opacity: 0; transform: scale(1.04);
            transition: opacity 0.55s ease-in, transform 0.55s ease-in;
          }
          .qr-logo-ring {
            box-shadow: 0 0 32px rgba(194,112,62,0.08);
          }
          .qr-splash-name {
            animation: qr-slide-up 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.2s;
          }
          .qr-splash-tagline {
            animation: qr-slide-up 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.45s;
          }
          @keyframes qr-slide-up {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .qr-splash-divider {
            animation: qr-grow-w 0.65s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.32s;
          }
          @keyframes qr-grow-w {
            from { width: 0; opacity: 0; }
            to   { width: 72px; opacity: 1; }
          }
          .qr-splash-subtitle {
            animation: qr-slide-up 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.6s;
          }
          .qr-splash-dots span {
            display: inline-block;
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #c2703e;
            opacity: 0.4;
            animation: qr-dot-b 1.2s ease-in-out infinite;
          }
          .qr-splash-dots span:nth-child(2) { animation-delay: 0.2s; }
          .qr-splash-dots span:nth-child(3) { animation-delay: 0.4s; }
          @keyframes qr-dot-b {
            0%,80%,100% { transform: scale(0.8); opacity: 0.4; }
            40%          { transform: scale(1.3); opacity: 0.9; }
          }
        `}</style>

        <div className="qr-splash-bg min-h-screen flex items-center justify-center relative overflow-hidden">
          {/* Content */}
          <div
            className={`qr-splash-wrap${splashVisible ? " visible" : ""}${splashFadingOut ? " fading" : ""}`}
            style={{ textAlign: "center", padding: "0 28px", zIndex: 10, maxWidth: 480, width: "100%" }}
          >
            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <div
                className="qr-logo-ring"
                style={{
                  width: 136, height: 136, borderRadius: "50%",
                  background: "rgba(194,112,62,0.08)",
                  border: "2px solid rgba(194,112,62,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={restroName}
                    style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }}
                  />
                ) : (
                  <ChefHat style={{ width: 60, height: 60, color: "#c2703e" }} />
                )}
              </div>
            </div>

            {/* Restaurant name */}
            <h1
              className="qr-splash-name"
              style={{
                fontSize: "clamp(1.9rem,5vw,2.8rem)", fontWeight: 800,
                color: "#f0e6d8", letterSpacing: "-0.5px",
                marginBottom: 14, lineHeight: 1.15,
              }}
            >
              {restroName}
            </h1>

            {/* Divider */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: tagline ? 14 : 16 }}>
              <div
                className="qr-splash-divider"
                style={{
                  height: 2, display: "block",
                  background: "linear-gradient(90deg, transparent, #c2703e, transparent)",
                  borderRadius: 99,
                }}
              />
            </div>

            {/* Tagline */}
            {tagline && (
              <p
                className="qr-splash-tagline"
                style={{
                  fontSize: "clamp(0.95rem,2.5vw,1.18rem)",
                  color: "#d4c4a8", fontWeight: 500,
                  letterSpacing: "0.015em", marginBottom: 20,
                  lineHeight: 1.55,
                }}
              >
                {tagline}
              </p>
            )}

            {/* Subtitle */}
            <p
              className="qr-splash-subtitle"
              style={{ color: "#7a6552", fontSize: "0.85rem", marginBottom: 36 }}
            >
              Preparing your menu&hellip;
            </p>

            {/* Loading dots */}
            <div className="qr-splash-dots" style={{ display: "flex", gap: 9, justifyContent: "center" }}>
              <span /><span /><span />
            </div>
          </div>
        </div>
      </>
    );
  }


  // ── Render Confirmation State ───────────────────────────────────────────
  if (orderConfirmed) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center" style={{ background: C.pageBg }}>
        <div className="p-8 rounded-2xl shadow-sm max-w-md w-full text-center" style={{ background: C.cardBg, border: "1px solid #bbf7d0" }}>
          <CheckCircle2 className="w-20 h-20 mx-auto mb-4" style={{ color: "#16a34a" }} />
          <h1 className="text-3xl font-bold mb-2" style={{ color: C.text }}>Order Placed!</h1>
          <p className="mb-6" style={{ color: C.muted }}>
            Order #{orderConfirmed.id} has been sent to the kitchen.
          </p>
          <div className="rounded-xl p-4 mb-8" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p className="text-sm uppercase font-semibold mb-1" style={{ color: "#166534" }}>Grand Total (Inc. 13% VAT)</p>
            <p className="text-3xl font-bold" style={{ color: "#15803d" }}>Rs. {orderConfirmed.total.toFixed(2)}</p>
          </div>
          <button
            onClick={() => setOrderConfirmed(null)}
            className="w-full font-semibold py-4 rounded-xl transition-colors"
            style={{ background: C.olive, color: "#fff" }}
            onMouseEnter={e => (e.currentTarget.style.background = C.oliveHover)}
            onMouseLeave={e => (e.currentTarget.style.background = C.olive)}
          >
            Order More Food
          </button>
        </div>
      </div>
    );
  }

  // ── Render Main Menu UI ─────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden" style={{ background: C.pageBg, color: C.text }}>
      {/* Left Side: Menu Section */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        
        {/* Header */}
        <header className="mb-8 flex justify-between items-start">
          {/* Left: Greetings & Table Info */}
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: C.text }}>
              {(() => {
                const hour = new Date().getHours();
                if (hour < 12) return "Good Morning";
                if (hour < 17) return "Good Afternoon";
                return "Good Evening";
              })()}!
            </h1>
            <p className="mt-2" style={{ color: C.text }}>
              Currently seated at{" "}
              <span
                className="font-semibold px-2 py-0.5 rounded-md"
                style={{ color: C.primary, background: C.tagBg }}
              >
                Table {table?.table_number}
              </span>
            </p>
            {branding?.description && <p className="text-sm mt-2" style={{ color: C.muted }}>{branding.description}</p>}
          </div>
          
          {/* Right: Restaurant Branding */}
          <div className="flex items-center gap-3 text-right">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 justify-end">
                {branding?.restro_name || "My Restaurant"}
              </h2>
              {branding?.tagline && <p className="text-xs" style={{ color: C.muted }}>{branding.tagline}</p>}
            </div>
            {branding?.logo_url ? (
              <img
                src={branding.logo_url.startsWith('/') ? `${API_BASE_URL}${branding.logo_url}` : branding.logo_url}
                alt="Logo"
                className="w-12 h-12 object-contain rounded-xl"
                style={{ border: `1px solid ${C.cardBorder}`, background: "#fff" }}
              />
            ) : (
              <ChefHat className="w-10 h-10" style={{ color: C.primary }} />
            )}
          </div>
        </header>
        
        {/* Category Filters */}
        <div
          className="sticky top-0 z-40 -mx-4 px-4 md:-mx-8 md:px-8 py-4 mb-6 transition-all shadow-sm"
          style={{
            background: "rgba(245,239,230,0.88)",
            backdropFilter: "blur(16px)",
            borderBottom: `1px solid ${C.cardBorder}`,
          }}
        >
          <div className="flex overflow-x-auto gap-3 pb-1 no-scrollbar">
            {["All", ...categories.map(c => c.name)].map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className="px-5 py-2.5 rounded-full whitespace-nowrap font-semibold transition-all active:scale-95"
                style={
                  activeCategory === category
                    ? { background: C.categoryActive, color: "#f0e6d8", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", transform: "translateY(-1px)" }
                    : { background: "#fff", color: C.muted, border: `1px solid ${C.cardBorder}` }
                }
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {menuItems.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl flex flex-col h-full transition-all duration-300 hover:-translate-y-1 premium-shadow hover:premium-shadow-hover"
              style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}` }}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg leading-tight" style={{ color: C.text }}>{item.name}</h3>
                  <span
                    className="font-extrabold px-2 py-1 rounded-lg ml-2 shrink-0"
                    style={{ color: C.priceText, background: C.priceBg }}
                  >
                    Rs. {item.price}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm mb-4 line-clamp-2 leading-relaxed" style={{ color: C.muted }}>{item.description}</p>
                )}
              </div>
              
              <button
                onClick={() => addToCart(item)}
                className="w-full mt-4 font-bold py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 group"
                style={{ background: C.oliveBg, color: C.olive }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = C.olive;
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = C.oliveBg;
                  e.currentTarget.style.color = C.olive;
                }}
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                Add to Cart
              </button>
            </div>
          ))}
          
          {menuItems.length === 0 && (
            <div
              className="col-span-full py-12 text-center rounded-2xl"
              style={{ color: C.muted, background: C.cardBg, border: `1px dashed ${C.cardBorder}` }}
            >
              No items found in this category.
            </div>
          )}
        </div>
      </div>

      {/* Mobile Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 z-50 md:hidden flex justify-center px-4 animate-fade-in-up pointer-events-none">
          <button
            onClick={() => {
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }}
            className="pointer-events-auto w-full max-w-sm rounded-2xl p-4 shadow-2xl flex justify-between items-center active:scale-[0.98] transition-all"
            style={{ background: C.cartBarBg, color: "#f0e6d8", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(194,112,62,0.2)" }}>
                  <ShoppingCart className="w-5 h-5" style={{ color: "#c2703e" }} />
                </div>
                <span
                  className="absolute -top-1 -right-1 text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                  style={{ background: C.primary, color: "#fff", border: `2px solid ${C.cartBarBg}` }}
                >
                  {cart.reduce((total, item) => total + item.quantity, 0)}
                </span>
              </div>
              <span className="font-bold text-sm tracking-wide uppercase" style={{ color: "#d4c4a8" }}>View Cart</span>
            </div>
            <span className="font-bold text-lg" style={{ color: "#f0e6d8" }}>Rs. {grandTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Right Side: Cart Section — fixed height column on desktop */}
      <div
        id="cart-sidebar"
        className="hidden md:flex md:w-96 flex-col h-screen"
        style={{
          background: C.sidebarBg,
          borderLeft: `1px solid ${C.sidebarBorder}`,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.04)",
        }}
      >
        <div className="p-6" style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: C.text }}>
            <ShoppingCart className="w-6 h-6" /> Your Cart
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6" style={{ background: "#faf6f2" }}>
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-8" style={{ color: C.muted }}>
              <ShoppingCart className="w-16 h-16 opacity-20" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.id} className="p-4 rounded-xl shadow-sm" style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}` }}>
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium" style={{ color: C.text }}>{item.name}</h4>
                    <span className="font-semibold" style={{ color: C.muted }}>Rs. {item.price * item.quantity}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center rounded-lg p-1" style={{ background: "#f0ebe4" }}>
                      <button
                        onClick={() => {
                          if (item.quantity === 1) removeFromCart(item.id);
                          else updateQuantity(item.id, -1);
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded shadow-sm transition-colors"
                        style={{ background: "#fff", color: C.muted }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                        onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center font-medium" style={{ color: C.text }}>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded shadow-sm transition-colors"
                        style={{ background: "#fff", color: C.muted }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.olive)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-6" style={{ background: C.sidebarBg, borderTop: `1px solid ${C.sidebarBorder}` }}>
          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
          
          <div className="space-y-2 mb-6">
            <div className="flex justify-between items-center text-sm" style={{ color: C.muted }}>
              <span>Subtotal</span>
              <span className="font-medium">Rs. {cartSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm pb-2" style={{ color: C.muted, borderBottom: `1px dashed ${C.cardBorder}` }}>
              <span>VAT (13%)</span>
              <span className="font-medium">Rs. {vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="font-bold" style={{ color: C.text }}>Grand Total</span>
              <span className="text-2xl font-bold" style={{ color: C.primary }}>Rs. {grandTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <button
            onClick={handlePlaceOrder}
            disabled={cart.length === 0 || isPlacingOrder}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all"
            style={
              cart.length === 0
                ? { background: "#e8ddd2", color: C.muted, cursor: "not-allowed" }
                : { background: C.olive, color: "#fff" }
            }
            onMouseEnter={e => { if (cart.length > 0) e.currentTarget.style.background = C.oliveHover; }}
            onMouseLeave={e => { if (cart.length > 0) e.currentTarget.style.background = C.olive; }}
          >
            {isPlacingOrder ? "Placing Order..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f5efe6" }}>
        Loading...
      </div>
    }>
      <MenuContent />
    </Suspense>
  );
}
