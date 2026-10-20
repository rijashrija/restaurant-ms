"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, Plus, Minus, ChefHat, CheckCircle2, Clock, History, X, UserCheck, ClipboardList, RefreshCw, Trash2 } from "lucide-react";
import { verifyTable, getMenu, placeOrder, getRestaurantSettings, RestaurantSettings, API_BASE_URL, getCategories, Category, getActiveOrderByTable, PlaceOrderResponse, getStaffList, updateOrderItemQuantity, deleteOrderItem } from "../../services/api";
import { MenuItem, Table, CartItem } from "../../lib/types";
import { getToken, getUser, AuthUser } from "../../services/auth";

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

function formatOrderTime(dateStr?: string) {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return dateStr;
  }
}

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getStatusBadge(status?: string) {
  switch (status?.toLowerCase()) {
    case "preparing":
      return {
        label: "Cooking in Kitchen",
        bg: "#fff7ed",
        border: "#fed7aa",
        text: "#c2410c",
        dot: "#f97316",
        icon: "🍳",
        step: 2,
      };
    case "ready":
      return {
        label: "Ready to Serve",
        bg: "#ecfdf5",
        border: "#a7f3d0",
        text: "#047857",
        dot: "#10b981",
        icon: "🍽️",
        step: 3,
      };
    case "completed":
      return {
        label: "Served",
        bg: "#f0fdf4",
        border: "#bbf7d0",
        text: "#15803d",
        dot: "#22c55e",
        icon: "✅",
        step: 4,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        bg: "#fef2f2",
        border: "#fecaca",
        text: "#b91c1c",
        dot: "#ef4444",
        icon: "❌",
        step: 0,
      };
    default:
      return {
        label: "Order Received",
        bg: "#eff6ff",
        border: "#bfdbfe",
        text: "#1d4ed8",
        dot: "#3b82f6",
        icon: "📋",
        step: 1,
      };
  }
}

function MenuContent() {
  const searchParams = useSearchParams();
  const tableIdentifier = searchParams.get("table");

  const [table, setTable] = useState<Table | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [categories, setCategories] = useState<Category[]>([]);
  const [branding, setBranding] = useState<RestaurantSettings | null>(null);

  // Staff attribution state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [staffList, setStaffList] = useState<{ id: number; username: string; role: string }[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("auto");

  // Splash screen state
  const [showSplash, setShowSplash] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashFadingOut, setSplashFadingOut] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState<PlaceOrderResponse | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"cart" | "order">("cart");
  const [isRefreshingOrder, setIsRefreshingOrder] = useState(false);

  // Refresh active order from backend
  const refreshActiveOrder = async (silent = false) => {
    if (!table) return;
    if (!silent) setIsRefreshingOrder(true);
    try {
      const activeRes = await getActiveOrderByTable(table.id);
      if (activeRes.has_active_order && activeRes.order) {
        setActiveOrder(activeRes.order);
      } else {
        setActiveOrder(null);
      }
    } catch (err) {
      console.error("Failed to refresh active order:", err);
    } finally {
      if (!silent) setIsRefreshingOrder(false);
    }
  };

  // Poll for active order updates so kitchen status is real-time
  useEffect(() => {
    if (!table || !activeOrder) return;
    const interval = setInterval(() => {
      refreshActiveOrder(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [table, activeOrder?.id]);

  // Total items ordered count across all rounds
  const totalOrderedItemsCount = useMemo(() => {
    if (!activeOrder?.rounds) return 0;
    return activeOrder.rounds.reduce((acc: number, rnd: any) => {
      return acc + (rnd.items?.reduce((iAcc: number, it: any) => iAcc + (it.quantity || 1), 0) || 0);
    }, 0);
  }, [activeOrder]);

  // Order item edit/delete states & handlers
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [editConfirm, setEditConfirm] = useState<{
    itemId: number;
    itemName: string;
    action: "increase" | "decrease" | "remove";
    currentQty: number;
    newQty: number;
  } | null>(null);

  const canEditOrder = useMemo(() => {
    return activeOrder && activeOrder.status !== "completed" && activeOrder.status !== "cancelled";
  }, [activeOrder]);

  const promptEditConfirm = (
    itemId: number,
    itemName: string,
    action: "increase" | "decrease" | "remove",
    currentQty: number,
    newQty: number
  ) => {
    setEditConfirm({ itemId, itemName, action, currentQty, newQty });
  };

  const handleConfirmEdit = async () => {
    if (!editConfirm) return;
    const { itemId, itemName, action, newQty } = editConfirm;
    setEditConfirm(null);
    if (action === "remove" || newQty <= 0) {
      await handleDeleteItem(itemId, itemName);
    } else {
      await handleUpdateItemQuantity(itemId, newQty);
    }
  };

  const handleUpdateItemQuantity = async (itemId: number, newQty: number) => {
    if (!activeOrder?.id) return;
    setUpdatingItemId(itemId);
    setItemActionError(null);
    try {
      const res = await updateOrderItemQuantity(activeOrder.id, itemId, newQty);
      if (res.order_cancelled || !res.order) {
        setActiveOrder(null);
        setShowOrderHistoryModal(false);
      } else {
        setActiveOrder(res.order);
      }
    } catch (err: any) {
      setItemActionError(err.message || "Failed to update item");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleDeleteItem = async (itemId: number, itemName?: string) => {
    if (!activeOrder?.id) return;
    setUpdatingItemId(itemId);
    setItemActionError(null);
    try {
      const res = await deleteOrderItem(activeOrder.id, itemId);
      if (res.order_cancelled || !res.order) {
        setActiveOrder(null);
        setShowOrderHistoryModal(false);
      } else {
        setActiveOrder(res.order);
      }
    } catch (err: any) {
      setItemActionError(err.message || "Failed to remove item");
    } finally {
      setUpdatingItemId(null);
    }
  };

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

        // Fetch active order for this table if any
        getActiveOrderByTable(tableData.id).then((activeRes) => {
          if (activeRes.has_active_order && activeRes.order) {
            setActiveOrder(activeRes.order);
          }
        }).catch(() => {});

        // Fetch current user and staff list for server attribution
        const user = getUser();
        if (user) {
          setCurrentUser(user);
        }
        getStaffList().then((list) => {
          setStaffList(list);
        }).catch(() => {});

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
      let serverUserId: number | undefined = undefined;
      if (selectedStaffId === "auto") {
        serverUserId = currentUser?.id;
      } else if (selectedStaffId === "self") {
        serverUserId = undefined;
      } else {
        const parsed = parseInt(selectedStaffId);
        if (!isNaN(parsed)) serverUserId = parsed;
      }

      const response = await placeOrder(table.id, orderItems, token, serverUserId);
      
      setOrderConfirmed(response);
      setActiveOrder({
        id: response.order_id,
        order_count: response.order_count,
        total_price: response.total_price,
        rounds: response.rounds,
        status: response.status,
      });
      setCart([]);
      setIsMobileCartOpen(false);
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
    const totalWithVat = (orderConfirmed.total_price || 0) * 1.13;
    const count = orderConfirmed.order_count || 1;

    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center" style={{ background: C.pageBg }}>
        <div className="p-6 md:p-8 rounded-3xl shadow-xl max-w-lg w-full text-center animate-in fade-in zoom-in-95 duration-300" style={{ background: C.cardBg, border: "1px solid #d1fae5" }}>
          
          {/* Animated Success Badge */}
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-full flex items-center justify-center bg-green-100 text-green-600 shadow-sm">
            <CheckCircle2 className="w-10 h-10 md:w-12 md:h-12" />
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold mb-1" style={{ color: C.text }}>
            {count > 1 ? `Order Placed! (${getOrdinal(count)} Order)` : "Order Placed!"}
          </h1>

          <p className="text-sm mb-4" style={{ color: C.muted }}>
            Order #{orderConfirmed.order_id} has been sent to the kitchen.
          </p>

          {/* Highlight Badge: Times Ordered */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Customer has ordered <strong>{count} time{count > 1 ? "s" : ""}</strong></span>
          </div>

          {/* Timeline of Order Times & Items */}
          <div className="text-left mb-6 bg-stone-50/90 rounded-2xl p-4 border border-stone-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
              <span className="text-xs uppercase font-extrabold tracking-wider text-stone-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Order Timeline ({count} round{count > 1 ? "s" : ""})
              </span>
              <span className="text-[11px] font-semibold text-stone-500">Order timestamps</span>
            </div>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {orderConfirmed.rounds?.map((rnd) => (
                <div key={rnd.round_number} className="p-3 rounded-xl bg-white border border-stone-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] flex items-center justify-center font-bold">
                        {rnd.round_number}
                      </span>
                      {getOrdinal(rnd.round_number)} Order
                      {rnd.round_number === orderConfirmed.current_round && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">New</span>
                      )}
                    </span>
                    <span className="text-xs text-stone-600 font-semibold flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      {formatOrderTime(rnd.ordered_at)}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-stone-600 pl-6">
                    {rnd.items?.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span>
                          {it.quantity}x {it.item_name}
                          {it.served_by_username && rnd.served_by_usernames && rnd.served_by_usernames.length > 1 && (
                            <span className="ml-1.5 text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                              Server: {it.served_by_username}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-stone-700">Rs. {(it.price * it.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {rnd.served_by_username && (
                    <div className="mt-2 ml-6 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 font-medium">
                      <UserCheck className="w-3 h-3 text-amber-700" />
                      <span>Served by: <strong>{rnd.served_by_username}</strong></span>
                    </div>
                  )}

                  <div className="mt-2 pt-1 border-t border-dashed border-stone-100 text-right text-[11px] font-semibold text-stone-500">
                    Round subtotal: Rs. {(rnd.subtotal || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grand Total */}
          <div className="rounded-2xl p-4 mb-6" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div className="flex justify-between items-center text-xs text-green-800 mb-1">
              <span>Subtotal: Rs. {(orderConfirmed.total_price || 0).toFixed(2)}</span>
              <span>13% VAT Included</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-green-200">
              <span className="text-sm uppercase font-bold text-green-900">Grand Total</span>
              <p className="text-2xl font-black text-green-700">Rs. {totalWithVat.toFixed(2)}</p>
            </div>
          </div>

          <button
            onClick={() => setOrderConfirmed(null)}
            className="w-full font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg"
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
      <div className="flex-1 p-4 md:p-8 overflow-y-auto pb-28 md:pb-8">
        
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start gap-6 md:gap-0">
          {/* Left: Greetings & Table Info */}
          <div className="w-full md:w-auto">
            <h1 className="text-3xl font-bold mb-2" style={{ color: C.text }}>
              {(() => {
                const hour = new Date().getHours();
                if (hour < 12) return "Good Morning";
                if (hour < 17) return "Good Afternoon";
                return "Good Evening";
              })()}!
            </h1>
            <div className="flex items-center gap-3 flex-wrap mt-2">
              <p style={{ color: C.text }}>
                Currently seated at{" "}
                <span
                  className="font-semibold px-2 py-0.5 rounded-md"
                  style={{ color: C.primary, background: C.tagBg }}
                >
                  Table {table?.table_number}
                </span>
              </p>
            </div>
            {branding?.description && <p className="text-sm mt-2" style={{ color: C.muted }}>{branding.description}</p>}
          </div>
          
          {/* Right: Restaurant Branding */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-start md:justify-end text-left md:text-right">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url.startsWith('/') ? `${API_BASE_URL}${branding.logo_url}` : branding.logo_url}
                alt="Logo"
                className="w-12 h-12 object-contain rounded-xl shrink-0 md:order-last"
                style={{ border: `1px solid ${C.cardBorder}`, background: "#fff" }}
              />
            ) : (
              <ChefHat className="w-10 h-10 shrink-0 md:order-last" style={{ color: C.primary }} />
            )}
            <div className="md:order-first">
              <h2 className="text-xl font-bold flex items-center gap-2 md:justify-end">
                {branding?.restro_name || "My Restaurant"}
              </h2>
              {branding?.tagline && <p className="text-xs" style={{ color: C.muted }}>{branding.tagline}</p>}
            </div>
          </div>
        </header>
        
        {/* Category Filters */}
        <div
          className="sticky top-0 z-40 -mx-4 px-4 md:-mx-8 md:px-8 py-4 mb-6 transition-all shadow-sm"
          style={{
            background: "rgba(245,239,230,0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: `1px solid ${C.cardBorder}`,
          }}
        >
          <div 
            className="flex overflow-x-auto gap-3 pb-2 -mb-2 no-scrollbar" 
            style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
          >
            {["All", ...categories.map(c => c.name)].map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className="px-5 py-2.5 rounded-full whitespace-nowrap font-semibold transition-all active:scale-95 shrink-0"
                style={{
                  scrollSnapAlign: "start",
                  ...(activeCategory === category
                    ? { background: C.categoryActive, color: "#f0e6d8", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", transform: "translateY(-1px)" }
                    : { background: "#fff", color: C.muted, border: `1px solid ${C.cardBorder}` })
                }}
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

      {/* ── Mobile: Sticky Cart Bar + Slide-up Drawer ─────────────────── */}
      <div className="md:hidden">
        {/* Sticky bottom bar — shows Cart or Active Order on mobile */}
        {cart.length > 0 ? (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2 pointer-events-none space-y-2"
            style={{ background: "linear-gradient(to top, rgba(28,23,18,0.95) 60%, transparent)" }}
          >
            {activeOrder && (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowOrderHistoryModal(true)}
                  className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-900/90 text-amber-300 border border-stone-700 shadow-lg backdrop-blur-md active:scale-95 transition-all"
                >
                  <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                  <span>My Order ({totalOrderedItemsCount})</span>
                </button>
              </div>
            )}
            <button
              onClick={() => setIsMobileCartOpen(true)}
              className="pointer-events-auto w-full rounded-2xl p-4 shadow-2xl flex justify-between items-center active:scale-[0.98] transition-all"
              style={{ background: C.cartBarBg, color: "#f0e6d8", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3">
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
        ) : activeOrder ? (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(28,23,18,0.95) 60%, transparent)" }}
          >
            <button
              onClick={() => setShowOrderHistoryModal(true)}
              className="pointer-events-auto w-full rounded-2xl p-4 shadow-2xl flex justify-between items-center active:scale-[0.98] transition-all"
              style={{ background: "#2c2118", color: "#f0e6d8", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="font-bold text-sm tracking-wide text-white">My Order ({totalOrderedItemsCount})</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-base text-amber-400">
                  Rs. {((activeOrder.total_price || 0) * 1.13).toFixed(2)}
                </div>
                <div className="text-[10px] text-stone-400">inc. 13% VAT</div>
              </div>
            </button>
          </div>
        ) : null}

        {/* Slide-up Drawer Overlay */}
        {isMobileCartOpen && (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setIsMobileCartOpen(false)}
          >
            <div
              className="rounded-t-3xl flex flex-col max-h-[85vh]"
              style={{ background: C.sidebarBg }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer handle + header */}
              <div className="p-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.sidebarBorder}` }}>
                <div className="w-10 h-1 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" style={{ background: C.cardBorder }} />
                <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: C.text }}>
                  <ShoppingCart className="w-5 h-5" /> Your Cart
                </h2>
                <button
                  onClick={() => setIsMobileCartOpen(false)}
                  className="p-2 rounded-lg"
                  style={{ background: "#f0ebe4", color: C.muted }}
                >
                  ✕
                </button>
              </div>

              {/* Cart Items (scrollable) */}
              <div className="flex-1 overflow-y-auto p-5" style={{ background: "#faf6f2" }}>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12" style={{ color: C.muted }}>
                    <ShoppingCart className="w-14 h-14 opacity-20" />
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.id} className="p-4 rounded-xl shadow-sm" style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}` }}>
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-medium" style={{ color: C.text }}>{item.name}</h4>
                          <span className="font-semibold" style={{ color: C.muted }}>Rs. {item.price * item.quantity}</span>
                        </div>
                        <div className="flex items-center">
                          <div className="flex items-center rounded-lg p-1" style={{ background: "#f0ebe4" }}>
                            <button
                              onClick={() => { if (item.quantity === 1) removeFromCart(item.id); else updateQuantity(item.id, -1); }}
                              className="w-8 h-8 flex items-center justify-center rounded shadow-sm"
                              style={{ background: "#fff", color: C.muted }}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-10 text-center font-medium" style={{ color: C.text }}>{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded shadow-sm"
                              style={{ background: "#fff", color: C.muted }}
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

              {/* Totals + Place Order */}
              <div className="p-5" style={{ borderTop: `1px solid ${C.sidebarBorder}`, background: C.sidebarBg }}>
                {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm" style={{ color: C.muted }}>
                    <span>Subtotal</span>
                    <span className="font-medium">Rs. {cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm pb-2" style={{ color: C.muted, borderBottom: `1px dashed ${C.cardBorder}` }}>
                    <span>VAT (13%)</span>
                    <span className="font-medium">Rs. {vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="font-bold" style={{ color: C.text }}>Grand Total</span>
                    <span className="text-2xl font-bold" style={{ color: C.primary }}>Rs. {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  disabled={cart.length === 0 || isPlacingOrder}
                  className="w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95"
                  style={cart.length === 0 ? { background: "#e8ddd2", color: C.muted, cursor: "not-allowed" } : { background: C.olive, color: "#fff" }}
                >
                  {isPlacingOrder ? "Placing Order..." : "Place Order"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Side: Cart & Order Details Section — fixed height column on desktop */}
      <div
        id="cart-sidebar"
        className="hidden md:flex md:w-96 flex-col h-screen"
        style={{
          background: C.sidebarBg,
          borderLeft: `1px solid ${C.sidebarBorder}`,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.04)",
        }}
      >
        {/* Sidebar Header Tabs: Cart vs My Order */}
        <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: C.sidebarBorder }}>
          <button
            onClick={() => setActiveSidebarTab("cart")}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeSidebarTab === "cart"
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Cart ({cart.reduce((t, i) => t + i.quantity, 0)})</span>
          </button>
          {activeOrder && (
            <button
              onClick={() => setActiveSidebarTab("order")}
              className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                activeSidebarTab === "order"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200"
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>My Order ({totalOrderedItemsCount})</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </button>
          )}
        </div>

        {/* Tab 1: Current Cart */}
        {activeSidebarTab === "cart" ? (
          <>
            <div className="flex-1 overflow-y-auto p-6" style={{ background: "#faf6f2" }}>
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 py-8" style={{ color: C.muted }}>
                  <ShoppingCart className="w-16 h-16 opacity-20" />
                  <p className="font-medium">Your cart is empty</p>
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
          </>
        ) : (
          /* Tab 2: Persistent My Order Details in Sidebar */
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#faf6f2" }}>
            {/* Status & Refresh Header */}
            <div className="p-4 border-b bg-white flex items-center justify-between" style={{ borderColor: C.sidebarBorder }}>
              <div>
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  Order #{activeOrder?.id} &bull; Table {table?.table_number}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mt-1"
                  style={{
                    background: getStatusBadge(activeOrder?.status).bg,
                    color: getStatusBadge(activeOrder?.status).text,
                    border: `1px solid ${getStatusBadge(activeOrder?.status).border}`
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: getStatusBadge(activeOrder?.status).dot }} />
                  {getStatusBadge(activeOrder?.status).label}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refreshActiveOrder()}
                  title="Refresh order status"
                  className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingOrder ? "animate-spin text-amber-600" : ""}`} />
                </button>
                <button
                  onClick={() => setShowOrderHistoryModal(true)}
                  title="Expand order details"
                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 transition-colors"
                >
                  Full Modal
                </button>
              </div>
            </div>

            {/* Item action error notice */}
            {itemActionError && (
              <div className="mx-4 mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex justify-between items-center">
                <span>{itemActionError}</span>
                <button onClick={() => setItemActionError(null)} className="font-bold text-xs ml-2">&times;</button>
              </div>
            )}

            {/* Rounds List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeOrder?.rounds?.map((rnd: any) => (
                <div key={rnd.round_number} className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-stone-100">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-[10px] flex items-center justify-center font-bold">
                        {rnd.round_number}
                      </span>
                      {getOrdinal(rnd.round_number)} Order
                    </span>
                    <span className="text-[11px] text-stone-600 font-semibold flex items-center gap-1 bg-stone-50 px-2 py-0.5 rounded border border-stone-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      {formatOrderTime(rnd.ordered_at)}
                    </span>
                  </div>

                  {rnd.served_by_username && (
                    <div className="mb-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded inline-flex items-center gap-1 font-medium">
                      <UserCheck className="w-2.5 h-2.5 text-amber-700" />
                      <span>Served by: <strong>{rnd.served_by_username}</strong></span>
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-stone-700">
                    {rnd.items?.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-stone-100/80 last:border-b-0">
                        <div className="flex-1 pr-2 truncate">
                          <div className="font-medium text-stone-900 truncate">
                            {it.item_name}
                            {it.served_by_username && rnd.served_by_usernames && rnd.served_by_usernames.length > 1 && (
                              <span className="ml-1 text-[9px] text-stone-500 bg-stone-100 px-1 py-0.2 rounded">
                                {it.served_by_username}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            Rs. {it.price.toFixed(2)} &bull; <strong className="text-stone-800">Rs. {(it.price * it.quantity).toFixed(2)}</strong>
                          </div>
                        </div>

                        {/* Interactive Edit / Delete Controls */}
                        {canEditOrder ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className="flex items-center bg-stone-100 rounded-lg p-0.5 border border-stone-200">
                              <button
                                onClick={() => {
                                  if (it.quantity === 1) {
                                    promptEditConfirm(it.id, it.item_name, "remove", 1, 0);
                                  } else {
                                    promptEditConfirm(it.id, it.item_name, "decrease", it.quantity, it.quantity - 1);
                                  }
                                }}
                                disabled={updatingItemId === it.id}
                                title={it.quantity === 1 ? "Remove item" : "Decrease quantity"}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-red-50 hover:text-red-600 text-stone-600 shadow-2xs transition-colors disabled:opacity-50"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="w-5 text-center font-bold text-[11px] text-stone-800">
                                {updatingItemId === it.id ? "..." : it.quantity}
                              </span>
                              <button
                                onClick={() => promptEditConfirm(it.id, it.item_name, "increase", it.quantity, it.quantity + 1)}
                                disabled={updatingItemId === it.id}
                                title="Increase quantity"
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-green-50 hover:text-green-700 text-stone-600 shadow-2xs transition-colors disabled:opacity-50"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <button
                              onClick={() => promptEditConfirm(it.id, it.item_name, "remove", it.quantity, 0)}
                              disabled={updatingItemId === it.id}
                              title="Delete item"
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-stone-100 hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-stone-900 shrink-0">
                            {it.quantity}x &bull; Rs. {(it.price * it.quantity).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-dashed border-stone-100 flex justify-between text-[11px]">
                    <span className="text-stone-500">Round Total:</span>
                    <span className="font-bold text-stone-800">Rs. {(rnd.subtotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar Order Total & Order More button */}
            <div className="p-4 bg-white border-t border-stone-200 space-y-3">
              <div className="space-y-1 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-semibold">Rs. {(activeOrder?.total_price || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-dashed border-stone-200">
                  <span>VAT (13%):</span>
                  <span className="font-semibold">Rs. {((activeOrder?.total_price || 0) * 0.13).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-bold text-stone-900">Total Bill:</span>
                  <span className="font-black text-green-700 text-lg">
                    Rs. {((activeOrder?.total_price || 0) * 1.13).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setActiveSidebarTab("cart")}
                className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-sm transition-all"
                style={{ background: C.olive }}
                onMouseEnter={e => (e.currentTarget.style.background = C.oliveHover)}
                onMouseLeave={e => (e.currentTarget.style.background = C.olive)}
              >
                + Add More Food
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Order Details Modal (Customer View) ─────────────────────────── */}
      {showOrderHistoryModal && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowOrderHistoryModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shadow-xs">
                  <ClipboardList className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-lg text-stone-900">Your Order Details</h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                      #{activeOrder.id}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Table {table?.table_number} &bull; Ordered <strong>{activeOrder.order_count || 1} time{(activeOrder.order_count || 1) > 1 ? "s" : ""}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => refreshActiveOrder()}
                  title="Refresh order status"
                  className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingOrder ? "animate-spin text-amber-600" : ""}`} />
                </button>
                <button
                  onClick={() => setShowOrderHistoryModal(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Kitchen Progress Tracker */}
            <div className="mb-4 p-3.5 rounded-2xl bg-stone-50 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-ping" style={{ background: getStatusBadge(activeOrder.status).dot }} />
                  Live Order Status
                </span>
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: getStatusBadge(activeOrder.status).bg,
                    color: getStatusBadge(activeOrder.status).text,
                    border: `1px solid ${getStatusBadge(activeOrder.status).border}`
                  }}
                >
                  {getStatusBadge(activeOrder.status).icon} {getStatusBadge(activeOrder.status).label}
                </span>
              </div>
              
              {/* Stepper Bar */}
              <div className="grid grid-cols-3 gap-1 pt-1.5 text-center text-[11px] font-medium text-stone-500">
                <div className={`p-1.5 rounded-lg border transition-all ${
                  getStatusBadge(activeOrder.status).step >= 1
                    ? "bg-blue-50 border-blue-200 text-blue-900 font-bold"
                    : "bg-white border-stone-200"
                }`}>
                  1. Received
                </div>
                <div className={`p-1.5 rounded-lg border transition-all ${
                  getStatusBadge(activeOrder.status).step >= 2
                    ? "bg-orange-50 border-orange-200 text-orange-900 font-bold"
                    : "bg-white border-stone-200"
                }`}>
                  2. In Kitchen
                </div>
                <div className={`p-1.5 rounded-lg border transition-all ${
                  getStatusBadge(activeOrder.status).step >= 3
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-bold"
                    : "bg-white border-stone-200"
                }`}>
                  3. Ready / Served
                </div>
              </div>
            </div>

            {/* Item action error notice */}
            {itemActionError && (
              <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex justify-between items-center">
                <span>{itemActionError}</span>
                <button onClick={() => setItemActionError(null)} className="font-bold text-xs ml-2">&times;</button>
              </div>
            )}

            {/* Modal Body: Rounds with Timestamps & Server Attribution */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-stone-500 px-1 flex justify-between">
                <span>Order Timeline ({activeOrder.order_count || 1} Round{(activeOrder.order_count || 1) > 1 ? "s" : ""})</span>
                <span>{totalOrderedItemsCount} Items Ordered</span>
              </div>

              {activeOrder.rounds && activeOrder.rounds.length > 0 ? (
                activeOrder.rounds.map((rnd: any) => (
                  <div key={rnd.round_number} className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-stone-200/60">
                      <span className="font-bold text-sm text-stone-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-xs flex items-center justify-center font-bold">
                          {rnd.round_number}
                        </span>
                        {getOrdinal(rnd.round_number)} Order
                      </span>
                      <span className="text-xs text-stone-600 font-semibold flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {formatOrderTime(rnd.ordered_at)}
                      </span>
                    </div>

                    {/* Server attribution */}
                    {rnd.served_by_username ? (
                      <div className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 font-medium">
                        <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                        <span>Served by staff: <strong>{rnd.served_by_username}</strong></span>
                      </div>
                    ) : (
                      <div className="mb-2 text-[11px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded inline-block">
                        Self-ordered via Table QR
                      </div>
                    )}

                    <div className="space-y-2 text-xs text-stone-700 pl-1">
                      {rnd.items?.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-1.5 border-b border-stone-200/60 last:border-b-0">
                          <div className="flex-1 pr-3">
                            <div className="font-semibold text-stone-900">
                              {it.item_name}
                              {it.served_by_username && rnd.served_by_usernames && rnd.served_by_usernames.length > 1 && (
                                <span className="ml-1.5 text-[10px] text-stone-500 bg-white px-1.5 py-0.5 rounded border border-stone-200 font-normal">
                                  Server: {it.served_by_username}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              Rs. {it.price.toFixed(2)} each &bull; <strong className="text-stone-800 font-bold">Rs. {(it.price * it.quantity).toFixed(2)}</strong>
                            </div>
                          </div>

                          {/* Interactive Edit / Delete Controls */}
                          {canEditOrder ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className="flex items-center bg-white rounded-xl p-1 border border-stone-300 shadow-2xs">
                                <button
                                  onClick={() => {
                                    if (it.quantity === 1) {
                                      promptEditConfirm(it.id, it.item_name, "remove", 1, 0);
                                    } else {
                                      promptEditConfirm(it.id, it.item_name, "decrease", it.quantity, it.quantity - 1);
                                    }
                                  }}
                                  disabled={updatingItemId === it.id}
                                  title={it.quantity === 1 ? "Remove item" : "Decrease quantity"}
                                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-600 transition-colors disabled:opacity-50"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-7 text-center font-bold text-xs text-stone-800">
                                  {updatingItemId === it.id ? "..." : it.quantity}
                                </span>
                                <button
                                  onClick={() => promptEditConfirm(it.id, it.item_name, "increase", it.quantity, it.quantity + 1)}
                                  disabled={updatingItemId === it.id}
                                  title="Increase quantity"
                                  className="w-6 h-6 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-green-50 hover:text-green-700 text-stone-600 transition-colors disabled:opacity-50"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                onClick={() => promptEditConfirm(it.id, it.item_name, "remove", it.quantity, 0)}
                                disabled={updatingItemId === it.id}
                                title="Delete item from order"
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white hover:bg-red-50 text-stone-400 hover:text-red-600 border border-stone-200 transition-colors shadow-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-semibold text-stone-900">
                              {it.quantity}x &bull; Rs. {(it.price * it.quantity).toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2.5 pt-1.5 border-t border-dashed border-stone-200 text-right text-xs font-bold text-stone-600">
                      Round subtotal: Rs. {(rnd.subtotal || 0).toFixed(2)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-stone-500 text-sm">
                  No previous rounds found.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between items-center">
              <div>
                <p className="text-xs text-stone-500">Total Bill (inc. 13% VAT)</p>
                <p className="text-2xl font-black text-green-700">
                  Rs. {((activeOrder.total_price || 0) * 1.13).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOrderHistoryModal(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm"
                  style={{ background: C.olive }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.oliveHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.olive)}
                >
                  Order More Food
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Order Edit Confirmation Modal ────────────────────── */}
      {editConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setEditConfirm(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center animate-in"
            onClick={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${C.cardBorder}` }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{
                background: editConfirm.action === "remove" ? "#fee2e2" : "#fef3c7",
                color: editConfirm.action === "remove" ? "#dc2626" : "#d97706"
              }}
            >
              {editConfirm.action === "remove" ? (
                <Trash2 className="w-7 h-7 text-red-600" />
              ) : (
                <ClipboardList className="w-7 h-7 text-amber-600" />
              )}
            </div>

            <h3 className="text-xl font-bold text-stone-900 mb-2">
              {editConfirm.action === "remove"
                ? "Remove Item?"
                : editConfirm.action === "increase"
                ? "Increase Quantity?"
                : "Decrease Quantity?"}
            </h3>

            <p className="text-sm text-stone-600 mb-4 leading-relaxed">
              {editConfirm.action === "remove" ? (
                <>
                  Are you sure you want to remove <strong className="text-stone-900 font-semibold">{editConfirm.itemName}</strong> from your active order?
                </>
              ) : (
                <>
                  Change <strong className="text-stone-900 font-semibold">{editConfirm.itemName}</strong> quantity from{" "}
                  <strong className="text-stone-900 font-bold">{editConfirm.currentQty}</strong> to{" "}
                  <strong className="text-amber-800 font-bold">{editConfirm.newQty}</strong>?
                </>
              )}
            </p>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 mb-6 text-left flex items-start gap-2">
              <span className="text-base">🔔</span>
              <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                Restaurant staff will be notified of this change immediately.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white shadow-sm transition-all"
                style={{
                  background: editConfirm.action === "remove" ? "#dc2626" : C.primary
                }}
              >
                {editConfirm.action === "remove" ? "Yes, Remove" : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}
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
