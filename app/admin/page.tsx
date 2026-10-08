"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat, ClipboardList, Utensils, LayoutDashboard, Home,
  Clock, Eye, EyeOff, LogOut, Users, PlusCircle, Printer, Download, Trash2, Tags, ChevronDown, ChevronRight, Edit2, GripVertical, ArrowRightLeft, ShoppingBag, LayoutGrid, Menu, X
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import { getOrders, getOrderDetails, updateOrderStatus, getAllMenu, updateMenuAvailability, getTables, addTable, deleteTable, updateTableStatus, addMenuItem, updateMenuItem, exportOrderHistory, getRestaurantSettings, updateRestaurantSettings, RestaurantSettings, uploadLogo, getCategories, Category, addCategory, toggleCategory, updateCategory, transferTable, getDashboardStats, API_BASE_URL } from "../../services/api";
import { getToken, getUser, clearToken, createManager, listManagers, updateManager, deleteManager, AuthUser } from "../../services/auth";
import { Table } from "../../lib/types";

type Tab = "home" | "orders" | "menu" | "staff" | "tables" | "settings" | "place_order";

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Orders State
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Transfer Table State
  const [isTransferringTable, setIsTransferringTable] = useState(false);
  const [fromTableId, setFromTableId] = useState<string>("");
  const [toTableId, setToTableId] = useState<string>("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  // Menu State
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [isAddingMenu, setIsAddingMenu] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);

  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Category UI State
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");

  // Menu Form
  const [menuName, setMenuName] = useState("");
  const [menuDescription, setMenuDescription] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [menuCategory, setMenuCategory] = useState("");
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuSuccess, setMenuSuccess] = useState<string | null>(null);
  const [isSubmittingMenu, setIsSubmittingMenu] = useState(false);

  // Tables State
  const [restaurantTables, setRestaurantTables] = useState<Table[]>([]);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableSuccess, setTableSuccess] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [updatingTableId, setUpdatingTableId] = useState<number | null>(null);
  // Unpaid warning dialog state
  const [unpaidWarning, setUnpaidWarning] = useState<{ tableId: number; tableNumber: number } | null>(null);

  // Home State
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const ALL_MODULES = [
    { id: "home", label: "Home Dashboard", desc: "Overview and statistics" },
    { id: "orders", label: "Recent Orders", desc: "View and update order status, transfer tables" },
    { id: "menu", label: "Menu & Categories", desc: "Add/edit food items, prices, and categories" },
    { id: "tables", label: "Table Management", desc: "Manage physical tables and print QR codes" },
    { id: "staff", label: "Staff Management", desc: "Create and edit staff/manager accounts" },
    { id: "settings", label: "Restaurant Settings", desc: "Update restaurant profile, tax rate, & branding" },
    { id: "place_order", label: "Place Order", desc: "Place orders on behalf of customers" },
  ];

  // Staff State
  const [managers, setManagers] = useState<any[]>([]);
  const [newManagerUsername, setNewManagerUsername] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [newManagerRole, setNewManagerRole] = useState("manager");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["orders", "menu"]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffSuccess, setStaffSuccess] = useState<string | null>(null);
  const [isCreatingManager, setIsCreatingManager] = useState(false);
  const [editingManagerId, setEditingManagerId] = useState<number | null>(null);
  const [showAddStaffForm, setShowAddStaffForm] = useState(false);

  // Tables State (Moving showAddTableForm here too)
  const [showAddTableForm, setShowAddTableForm] = useState(false);

  // Restaurant Settings State
  const [restroSettings, setRestroSettings] = useState<RestaurantSettings>({ restro_name: "", tagline: "", description: "", logo_url: "" });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  // ── Auth Guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      router.replace("/login");
      return;
    }
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
    setCurrentUser(user);
    loadOrders();
    setIsLoading(false);

    const intervalId = setInterval(loadOrders, 15000);
    return () => clearInterval(intervalId);
  }, [router]);

  useEffect(() => {
    if (currentUser) {
      if (!hasPermission(activeTab)) {
        const permittedTab = ALL_MODULES.find(mod => hasPermission(mod.id))?.id || "home";
        setActiveTab(permittedTab as Tab);
      }
    }
  }, [currentUser, activeTab]);

  const handleLogout = () => {
    clearToken();
    router.replace("/login");
  };

  // ── Home Dashboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "home" && currentUser?.role === "owner") {
      const token = getToken();
      if (token) {
        getDashboardStats(token).then(setDashboardStats).catch(console.error);
      }
    }
  }, [activeTab, currentUser]);

  // ── Orders ────────────────────────────────────────────────────────────────
  const loadOrders = async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  };

  const handleTransferTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    setTransferSuccess(null);
    setIsSubmittingTransfer(true);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }

      const fromId = parseInt(fromTableId);
      const toId = parseInt(toTableId);
      if (!fromId || !toId) throw new Error("Please select both source and destination tables.");
      if (fromId === toId) throw new Error("Source and destination tables must be different.");

      const res = await transferTable(fromId, toId, token);
      setTransferSuccess(res.message);
      setFromTableId("");
      setToTableId("");
      await loadOrders();
      setTimeout(() => {
        setTransferSuccess(null);
        setIsTransferringTable(false);
      }, 2500);
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) {
        clearToken();
        router.replace("/login");
        return;
      }
      setTransferError(err.message || "Failed to transfer table.");
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // ── Menu ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "menu") {
      getAllMenu().then(setMenuItems).catch(console.error);
    }
  }, [activeTab]);

  // ── Staff ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "staff") {
      listManagers().then((data) => setManagers(data.managers)).catch(console.error);
    }
  }, [activeTab]);

  // ── Tables ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "tables") {
      getTables().then(setRestaurantTables).catch(console.error);
    }
  }, [activeTab]);

  // ── Restaurant Settings & Categories ────────────────────────────────────────────────────
  useEffect(() => {
    getRestaurantSettings()
      .then((s) => setRestroSettings(s))
      .catch(console.error);

    getCategories(true)
      .then((c) => setCategories(c))
      .catch(console.error);
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);
    setIsSavingSettings(true);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const updated = await updateRestaurantSettings(restroSettings, token);
      setRestroSettings(updated);
      setSettingsSuccess("Restaurant settings saved successfully!");
      setTimeout(() => setSettingsSuccess(null), 3000);
    } catch (err: any) {
      setSettingsError(err.message || "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setSettingsError(null);
    setIsUploadingLogo(true);

    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }

      const logoUrl = await uploadLogo(file, token);

      // Update the settings state with the new URL, prefixed with API_BASE_URL
      // if it's a relative path so the preview works
      const previewUrl = logoUrl.startsWith("/") ? `http://localhost:5000${logoUrl}` : logoUrl;
      setRestroSettings({ ...restroSettings, logo_url: previewUrl });
      setSettingsSuccess("Logo uploaded successfully! Don't forget to save.");
      setTimeout(() => setSettingsSuccess(null), 3000);
    } catch (err: any) {
      setSettingsError(err.message || "Failed to upload logo.");
    } finally {
      setIsUploadingLogo(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);
    setIsAddingCategory(true);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const newCat = await addCategory(newCategoryName, token);
      setCategories([...categories, newCat]);
      setNewCategoryName("");
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) {
        clearToken();
        router.replace("/login");
        return;
      }
      setCategoryError(err.message || "Failed to add category.");
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleToggleCategory = async (id: number, currentStatus: boolean) => {
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      await toggleCategory(id, !currentStatus, token);
      setCategories(categories.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) {
        clearToken();
        router.replace("/login");
        return;
      }
      alert(err.message || "Failed to toggle category.");
    }
  };

  const startEditingCategory = (c: Category) => {
    setEditingCategoryId(c.id);
    setEditCategoryName(c.name);
  };

  const handleUpdateCategory = async (id: number) => {
    if (!editCategoryName.trim()) return;
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }

      const oldCat = categories.find(c => c.id === id);
      if (oldCat?.name === editCategoryName) {
        setEditingCategoryId(null);
        return;
      }

      const updatedCat = await updateCategory(id, editCategoryName, token);

      setCategories(categories.map(c => c.id === id ? updatedCat : c));

      setMenuItems(menuItems.map(item =>
        item.category === oldCat?.name ? { ...item, category: updatedCat.name } : item
      ));

      if (oldCat && expandedCategories[oldCat.name]) {
        setExpandedCategories(prev => {
          const newExpanded = { ...prev };
          delete newExpanded[oldCat.name];
          newExpanded[updatedCat.name] = true;
          return newExpanded;
        });
      }

      setEditingCategoryId(null);
    } catch (err: any) {
      if (err.message?.includes("Invalid token")) clearToken();
      alert(err.message || "Failed to update category.");
    }
  };

  const toggleCategoryExpand = (catName: string) => {
    setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const handleDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData("itemId", item.id.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetCategoryName: string) => {
    e.preventDefault();
    const itemIdStr = e.dataTransfer.getData("itemId");
    if (!itemIdStr) return;
    const itemId = parseInt(itemIdStr);

    const item = menuItems.find(i => i.id === itemId);
    if (!item || item.category === targetCategoryName) return;

    setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, category: targetCategoryName } : i));

    try {
      const token = getToken();
      if (!token) return;
      await updateMenuItem(itemId, {
        name: item.name,
        description: item.description,
        price: item.price,
        category: targetCategoryName
      }, token);
    } catch (err) {
      setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, category: item.category } : i));
      alert("Failed to move item.");
    }
  };

  const hasPermission = (moduleName: string) => {
    if (!currentUser) return false;
    if (currentUser.role === "owner" || moduleName === "home") return true;
    const result = currentUser.permissions?.includes(moduleName) ?? false;
    return result;
  };

  const togglePermission = (permId: string) => {
    if (selectedPermissions.includes(permId)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permId));
    } else {
      setSelectedPermissions([...selectedPermissions, permId]);
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    setStaffSuccess(null);
    setIsCreatingManager(true);
    try {
      await createManager(newManagerUsername, newManagerPassword, selectedPermissions, newManagerRole);
      setStaffSuccess(`Staff '${newManagerUsername}' created successfully!`);
      setNewManagerUsername("");
      setNewManagerPassword("");
      setNewManagerRole("manager");
      setShowNewPassword(false);
      setSelectedPermissions(["orders", "menu"]);
      // Refresh the list
      const data = await listManagers();
      setManagers(data.managers);
    } catch (err: any) {
      setStaffError(err.message);
    } finally {
      setIsCreatingManager(false);
    }
  };

  // ── Tables ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "tables" || activeTab === "place_order") {
      getTables().then(setRestaurantTables).catch(console.error);
    }
  }, [activeTab]);


  // ── Staff Management Handlers ─────────────────────────────────────────────
  const handleEditManager = (manager: any) => {
    setEditingManagerId(manager.id);
    setNewManagerUsername(manager.username);
    setNewManagerPassword("");
    setNewManagerRole(manager.role || "manager");
    setShowNewPassword(false);
    setSelectedPermissions(manager.permissions || []);
    setStaffError(null);
    setStaffSuccess(null);
  };

  const handleCancelEditManager = () => {
    setEditingManagerId(null);
    setNewManagerUsername("");
    setNewManagerPassword("");
    setNewManagerRole("manager");
    setShowNewPassword(false);
    setSelectedPermissions(["orders", "menu"]);
    setStaffError(null);
    setStaffSuccess(null);
  };

  const handleDeleteManager = async (id: number, username: string) => {
    if (!confirm(`Are you sure you want to delete manager "${username}"? This cannot be undone.`)) return;
    try {
      await deleteManager(id);
      setManagers((prev) => prev.filter((m) => m.id !== id));
      setStaffSuccess(`Manager "${username}" deleted successfully.`);
      setTimeout(() => setStaffSuccess(null), 3000);
    } catch (err: any) {
      setStaffError(err.message || "Failed to delete manager.");
    }
  };

  const handleUpdateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingManagerId) return;
    setStaffError(null);
    setStaffSuccess(null);
    setIsCreatingManager(true);
    try {
      const payload: { username: string; password?: string; permissions?: string[]; role?: string } = {
        username: newManagerUsername,
        permissions: selectedPermissions,
        role: newManagerRole
      };
      if (newManagerPassword) payload.password = newManagerPassword;
      await updateManager(editingManagerId, payload);
      setManagers((prev) => prev.map((m) => m.id === editingManagerId ? { ...m, username: newManagerUsername, permissions: selectedPermissions, role: newManagerRole } : m));
      setStaffSuccess("Staff member updated successfully!");
      setShowNewPassword(false);
      handleCancelEditManager();
    } catch (err: any) {
      setStaffError(err.message || "Failed to update manager.");
    } finally {
      setIsCreatingManager(false);
    }
  };


  // ── Order Details / Status ────────────────────────────────────────────────
  const handleViewOrder = async (orderId: number) => {
    try {
      const data = await getOrderDetails(orderId);
      setSelectedOrder(data);
    } catch { alert("Failed to load order details."); }
  };

  const handleExportOrders = async () => {
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }

      // We can use a simple state to show loading on the button if we want, but for CSV it's usually fast enough
      await exportOrderHistory(token);
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) {
        clearToken();
        router.replace("/login");
        return;
      }
      alert(err.message || "Failed to export orders");
    }
  };

  const handleUpdateStatus = async (orderId: number, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder({ ...selectedOrder, status: newStatus });
    } catch { alert("Failed to update status."); }
  };

  const handleToggleAvailability = async (itemId: number, current: boolean) => {
    try {
      await updateMenuAvailability(itemId, !current);
      setMenuItems((prev) => prev.map((item) => item.id === itemId ? { ...item, is_available: !current } : item));
    } catch { alert("Failed to update availability."); }
  };

  const handleEditMenuClick = (item: any) => {
    setIsAddingMenu(true);
    setEditingMenuId(item.id);
    setMenuName(item.name);
    setMenuDescription(item.description || "");
    setMenuPrice(item.price.toString());
    setMenuCategory(item.category);
    setMenuError(null);
    setMenuSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleResetMenuForm = () => {
    setIsAddingMenu(false);
    setEditingMenuId(null);
    setMenuName("");
    setMenuDescription("");
    setMenuPrice("");
    setMenuCategory("");
    setMenuError(null);
    setMenuSuccess(null);
  };

  const handleMenuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMenuError(null);
    setMenuSuccess(null);
    setIsSubmittingMenu(true);

    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }

      const priceVal = parseFloat(menuPrice);
      if (isNaN(priceVal) || priceVal < 0) throw new Error("Please enter a valid positive price.");

      const payload = {
        name: menuName,
        description: menuDescription,
        price: priceVal,
        category: menuCategory
      };

      if (editingMenuId) {
        await updateMenuItem(editingMenuId, payload, token);
        setMenuSuccess("Menu item updated successfully!");
      } else {
        await addMenuItem(payload, token);
        setMenuSuccess("Menu item added successfully!");
      }

      // Refresh menu
      const data = await getAllMenu();
      setMenuItems(data);

      setTimeout(() => {
        handleResetMenuForm();
      }, 1500);

    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) {
        clearToken();
        router.replace("/login");
        return;
      }
      setMenuError(err.message || "Failed to save menu item.");
    } finally {
      setIsSubmittingMenu(false);
    }
  };

  // ── Table Handlers ────────────────────────────────────────────────────────
  const loadTables = async () => {
    try { setRestaurantTables(await getTables()); } catch { /* silent */ }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTableError(null);
    setTableSuccess(null);
    setIsAddingTable(true);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const num = parseInt(newTableNumber);
      if (isNaN(num) || num < 1) throw new Error("Please enter a valid table number.");
      const qrId = `table-${num}`;
      await addTable(num, qrId, token);
      setTableSuccess(`Table ${num} added successfully!`);
      setNewTableNumber("");
      await loadTables();
      setTimeout(() => setTableSuccess(null), 3000);
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) { clearToken(); router.replace("/login"); return; }
      setTableError(err.message || "Failed to add table.");
    } finally {
      setIsAddingTable(false);
    }
  };

  const handleDeleteTable = async (tableId: number, tableNumber: number) => {
    if (!confirm(`Delete Table ${tableNumber}? This will also remove its QR code.`)) return;
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      await deleteTable(tableId, token);
      setRestaurantTables(prev => prev.filter(t => t.id !== tableId));
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) { clearToken(); router.replace("/login"); return; }
      alert(err.message || "Failed to delete table.");
    }
  };

  const handleDownloadQR = (tableNumber: number) => {
    const svgEl = document.querySelector(`#qr-svg-${tableNumber} svg`) as SVGElement | null;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${tableNumber}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkTableStatus = async (tableId: number, tableNumber: number, currentStatus: string) => {
    // If trying to mark available, check if there are unpaid orders first
    if (currentStatus === "occupied") {
      setUnpaidWarning({ tableId, tableNumber });
      return;
    }
    // Mark as occupied directly
    await doUpdateTableStatus(tableId, "occupied");
  };

  const doUpdateTableStatus = async (tableId: number, newStatus: "available" | "occupied") => {
    setUpdatingTableId(tableId);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      await updateTableStatus(tableId, newStatus, token);
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: newStatus } : t));
    } catch (err: any) {
      if (err.message?.includes("Invalid token") || err.message?.includes("expired")) { clearToken(); router.replace("/login"); return; }
      alert(err.message || "Failed to update table status.");
    } finally {
      setUpdatingTableId(null);
      setUnpaidWarning(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStatusColor = (status: string) => {
    switch (status) {
      case "new": return "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-200 border-transparent";
      case "preparing": return "bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-950 shadow-sm shadow-yellow-200 border-transparent";
      case "ready": return "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-200 border-transparent";
      case "completed": return "bg-gray-100 text-gray-700 border-gray-200";
      case "cancelled": return "bg-red-50 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1c1714" }}>
        <ChefHat className="w-10 h-10 animate-bounce" style={{ color: "#c2703e" }} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden relative" style={{ background: "#f5efe6" }}>

      {/* ── Mobile Header ────────────────────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between p-4 z-30 shadow-md shrink-0" style={{ background: "#1f170f", color: "#f0e6d8" }}>
        <div className="flex items-center gap-2">
          {restroSettings?.logo_url ? (
            <img src={restroSettings.logo_url.startsWith('/') ? `${API_BASE_URL}${restroSettings.logo_url}` : restroSettings.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-md bg-white p-0.5" />
          ) : (
            <ChefHat className="w-6 h-6" style={{ color: "#c2703e" }} />
          )}
          <h2 className="text-lg font-bold truncate max-w-[200px]">{restroSettings?.restro_name || "Panel"}</h2>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-white/10 rounded-lg">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div
        className={`${isMobileMenuOpen ? "flex absolute inset-0 z-40" : "hidden md:flex"} w-full md:w-64 text-white flex-col print:hidden overflow-y-auto md:relative shrink-0`}
        style={{ background: "linear-gradient(180deg, #2c2118 0%, #1f170f 100%)", borderRight: "1px solid #3d2e22", boxShadow: "4px 0 20px rgba(0,0,0,0.2)" }}
      >
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-4 right-4 z-50">
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-white/10 rounded-lg text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
        )}
        <div className="p-6" style={{ borderBottom: "1px solid #3d2e22" }}>
          <div
            onClick={() => {
              if (currentUser?.role === "owner") {
                setActiveTab("settings");
                setIsMobileMenuOpen(false);
              }
            }}
            className={`flex flex-col items-center mb-6 p-3 -mx-3 rounded-xl transition-colors ${currentUser?.role === "owner" ? "cursor-pointer" : ""}`}
            style={currentUser?.role === "owner" ? { cursor: "pointer" } : {}}
            onMouseEnter={e => { if (currentUser?.role === "owner") e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            title={currentUser?.role === "owner" ? "Edit Restaurant Profile" : ""}
          >
            {restroSettings?.logo_url ? (
              <img
                src={restroSettings.logo_url.startsWith('/') ? `${API_BASE_URL}${restroSettings.logo_url}` : restroSettings.logo_url}
                alt="Logo"
                className="w-16 h-16 object-contain rounded-xl bg-white p-1 mb-3"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(194,112,62,0.15)" }}>
                <ChefHat className="w-8 h-8" style={{ color: "#c2703e" }} />
              </div>
            )}
            <h2 className="text-lg font-bold text-center leading-tight" style={{ color: "#f0e6d8" }}>
              {restroSettings?.restro_name || "My Restaurant"}
            </h2>
          </div>

          <h1 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: "#8a7260" }}>
            <LayoutDashboard className="w-4 h-4" style={{ color: "#c2703e" }} /> {currentUser?.role ? `${currentUser.role} Panel` : 'Panel'}
          </h1>
        </div>

        <nav className="p-4 space-y-1.5 flex-1">
          {([
            { id: "home", label: "Home", icon: Home },
            { id: "orders", label: "Recent Orders", icon: ClipboardList },
            { id: "menu", label: "Menu & Categories", icon: Utensils },
            { id: "tables", label: "Table Management", icon: PlusCircle },
            { id: "staff", label: "Staff Management", icon: Users },
            { id: "place_order", label: "Place Order", icon: ShoppingBag },
          ] as const).map(({ id, label, icon: Icon }) =>
            hasPermission(id) && (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(id as Tab);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200"
                style={activeTab === id
                  ? { background: "#c2703e", color: "#fff", boxShadow: "0 4px 14px rgba(194,112,62,0.3)" }
                  : { color: "#8a7260" }
                }
                onMouseEnter={e => { if (activeTab !== id) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#f0e6d8"; e.currentTarget.style.transform = "translateX(4px)"; } }}
                onMouseLeave={e => { if (activeTab !== id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8a7260"; e.currentTarget.style.transform = ""; } }}
              >
                <Icon className="w-5 h-5" />
                {label}
                {id === "orders" && orders.filter(o => o.status === "new").length > 0 && (
                  <span
                    className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                    style={activeTab === "orders"
                      ? { background: "rgba(255,255,255,0.2)", color: "#fff" }
                      : { background: "#c2703e", color: "#fff" }
                    }
                  >
                    {orders.filter(o => o.status === "new").length}
                  </span>
                )}
              </button>
            )
          )}
        </nav>

        {/* User info + Logout */}
        <div className="p-4" style={{ borderTop: "1px solid #3d2e22" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "#f0e6d8" }}>{currentUser?.username}</p>
              <p className="text-xs capitalize" style={{ color: "#8a7260" }}>{currentUser?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 transition-colors rounded-lg"
              style={{ color: "#8a7260" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "#8a7260")}
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === "menu" ? "" : "p-6 overflow-y-auto"} ${selectedOrder && activeTab === "orders" ? "hidden md:flex md:border-r md:border-gray-200" : ""}`}>

          {/* Home Tab */}
          {activeTab === "home" && hasPermission("home") && (
            <div className="space-y-8 animate-fade-in">
              {/* Greeting Section */}
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(135deg, #fff9f5 0%, #ffffff 100%)" }}>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">
                    Welcome back, {currentUser?.username || "Staff"}! 👋
                  </h2>
                  <p className="text-gray-600 text-lg">
                    Have a great day at {restroSettings.restro_name || "the restaurant"}.
                  </p>
                </div>
                <div className="flex flex-col items-end text-right">
                  <div className="text-2xl font-bold" style={{ color: "#c2703e" }}>
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-gray-600 font-medium">
                    {currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Owner Statistics */}
              {currentUser?.role === "owner" && dashboardStats && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { title: "Today's Sales", value: dashboardStats.today_sales, color: "#10b981", bg: "#d1fae5" },
                      { title: "This Week", value: dashboardStats.week_sales, color: "#3b82f6", bg: "#dbeafe" },
                      { title: "This Month", value: dashboardStats.month_sales, color: "#8b5cf6", bg: "#ede9fe" },
                      { title: "This Year", value: dashboardStats.year_sales, color: "#f59e0b", bg: "#fef3c7" },
                    ].map((stat, idx) => (
                      <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                          <span className="font-bold text-lg" style={{ color: stat.color }}>₹</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{stat.title}</p>
                          <h3 className="text-2xl font-bold text-gray-900">₹{stat.value.toFixed(2)}</h3>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chart */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Sales Trend (Last 7 Days)</h3>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dashboardStats.chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(val: any) => `₹${val}`} />
                          <Tooltip 
                            cursor={{ stroke: '#f3f4f6', strokeWidth: 2 }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                            // @ts-ignore
                            formatter={(value: any) => [`₹${Number(value || 0).toFixed(2)}`, 'Sales']}
                          />
                          <Line type="monotone" dataKey="sales" stroke="#c2703e" strokeWidth={3} dot={{ fill: '#c2703e', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && hasPermission("orders") && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Recent Orders</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsTransferringTable(!isTransferringTable);
                      setTransferError(null);
                      setTransferSuccess(null);
                      getTables().then(setRestaurantTables).catch(console.error);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    style={isTransferringTable
                      ? { background: "#e8ddd2", color: "#5a4535" }
                      : { background: "#c2703e", color: "#fff" }
                    }
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    {isTransferringTable ? "Cancel Transfer" : "Transfer Table"}
                  </button>

                  {currentUser?.role === "owner" && (
                    <button onClick={handleExportOrders}
                      className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Download className="w-4 h-4" /> Export (CSV)
                    </button>
                  )}
                </div>
              </div>

              {/* Transfer Table Inline Form */}
              {isTransferringTable && (
                <div className="rounded-xl p-5 mb-6" style={{ background: "#f5ebe4", border: "1px solid #d4a882" }}>
                  <h3 className="font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "#6b3d1e" }}>
                    <ArrowRightLeft className="w-4 h-4" /> Transfer Customer / Orders to Another Table
                  </h3>
                  <form onSubmit={handleTransferTableSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">From Table (Current Table)</label>
                        <select
                          value={fromTableId}
                          onChange={(e) => setFromTableId(e.target.value)}
                          required
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          style={{ borderColor: "#c4956a" }}
                        >
                          <option value="">Select source table...</option>
                          {restaurantTables.map((t) => (
                            <option key={t.id} value={t.id}>
                              Table {t.table_number}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">To Table (New Table)</label>
                        <select
                          value={toTableId}
                          onChange={(e) => setToTableId(e.target.value)}
                          required
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          style={{ borderColor: "#c4956a" }}
                        >
                          <option value="">Select destination table...</option>
                          {restaurantTables
                            .filter((t) => t.id.toString() !== fromTableId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                Table {t.table_number}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {transferError && <p className="text-red-600 text-sm">{transferError}</p>}
                    {transferSuccess && <p className="text-green-600 text-sm">{transferSuccess}</p>}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={isSubmittingTransfer || !fromTableId || !toTableId}
                        onClick={() => {
                          if (!fromTableId || !toTableId) return;
                          setShowTransferConfirm(true);
                        }}
                        className="font-semibold px-6 py-2 rounded-lg text-sm transition-colors"
                        style={{ background: "#c2703e", color: "#fff", opacity: (isSubmittingTransfer || !fromTableId || !toTableId) ? 0.5 : 1 }}
                      >
                        {isSubmittingTransfer ? "Transferring..." : "Confirm Transfer"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ── Transfer Confirmation Modal ─────────────────────────── */}
              {showTransferConfirm && (() => {
                const fromTable = restaurantTables.find(t => t.id.toString() === fromTableId);
                const toTable = restaurantTables.find(t => t.id.toString() === toTableId);
                return (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
                    onClick={() => setShowTransferConfirm(false)}
                  >
                    <div
                      className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 animate-in"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Icon */}
                      <div className="flex justify-center mb-4">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#f5ebe4" }}>
                          <ArrowRightLeft className="w-7 h-7" style={{ color: "#c2703e" }} />
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-bold text-gray-900 text-center mb-1">Confirm Table Transfer</h3>
                      <p className="text-gray-800 text-sm text-center mb-6">
                        This will move all active orders to the destination table.
                      </p>

                      {/* Table summary */}
                      <div className="flex items-center justify-center gap-4 bg-gray-50 border border-gray-200 rounded-xl px-6 py-4 mb-6">
                        <div className="text-center">
                          <p className="text-xs text-gray-700 font-medium uppercase tracking-wider mb-1">From</p>
                          <p className="text-2xl font-extrabold text-gray-900">Table {fromTable?.table_number ?? fromTableId}</p>
                        </div>
                        <ArrowRightLeft className="w-6 h-6 text-amber-500 flex-shrink-0" />
                        <div className="text-center">
                          <p className="text-xs text-gray-700 font-medium uppercase tracking-wider mb-1">To</p>
                          <p className="text-2xl font-extrabold" style={{ color: "#c2703e" }}>Table {toTable?.table_number ?? toTableId}</p>
                        </div>
                      </div>

                      {/* Warning */}
                      <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-6" style={{ background: "#f5ebe4", border: "1px solid #d4a882" }}>
                        <span className="text-lg leading-none mt-0.5" style={{ color: "#c2703e" }}>⚠️</span>
                        <p className="text-sm" style={{ color: "#6b3d1e" }}>
                          Are you sure you want to transfer all orders from <strong>Table {fromTable?.table_number ?? fromTableId}</strong> to <strong>Table {toTable?.table_number ?? toTableId}</strong>? This action cannot be undone.
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowTransferConfirm(false)}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={isSubmittingTransfer}
                          onClick={async () => {
                            setShowTransferConfirm(false);
                            const fakeEvent = { preventDefault: () => { } } as React.FormEvent;
                            await handleTransferTableSubmit(fakeEvent);
                          }}
                          className="flex-1 font-bold py-2.5 rounded-xl text-sm transition-colors"
                          style={{ background: "#c2703e", color: "#fff", opacity: isSubmittingTransfer ? 0.5 : 1 }}
                        >
                          {isSubmittingTransfer ? "Transferring..." : "Yes, Transfer"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {orders.length === 0 ? (
                <div className="text-center py-12 text-gray-800 bg-white rounded-xl border border-dashed border-gray-300">
                  No orders yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} onClick={() => handleViewOrder(order.id)}
                      className={`p-5 bg-white rounded-2xl border transition-all duration-300 cursor-pointer premium-shadow hover:premium-shadow-hover hover:-translate-y-1 ${selectedOrder?.id === order.id ? "-translate-y-1" : ""}`}
                      style={{ borderColor: selectedOrder?.id === order.id ? "#c2703e" : "transparent", boxShadow: selectedOrder?.id === order.id ? "0 0 0 2px rgba(194,112,62,0.2)" : undefined }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-lg">Order #{order.id}</span>
                          <span className="ml-3 text-sm font-medium text-gray-800">Table {order.table_number}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)} uppercase`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {order.placed_by_username && (
                          <span className="ml-2 bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">by {order.placed_by_username}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Menu & Categories Tab — two-column master/detail */}
          {activeTab === "menu" && hasPermission("menu") && (() => {
            // Which category is "selected" — reuse expandedCategories[name] as single-select
            const selectedCatName = Object.keys(expandedCategories).find(k => expandedCategories[k]) ?? (categories.length > 0 ? categories[0].name : null);
            const selectedCat = categories.find(c => c.name === selectedCatName) ?? null;
            const activeCategoryNames = categories.map(c => c.name);
            const orphans = menuItems.filter(item => !activeCategoryNames.includes(item.category));
            const displayItems = selectedCatName
              ? menuItems.filter(item => item.category === selectedCatName)
              : [];

            const selectCategory = (name: string) => {
              setExpandedCategories({ [name]: true });
              setIsAddingMenu(false);
            };

            return (
              <div className="flex flex-col md:flex-row gap-0 w-full flex-1" style={{ minHeight: 0, height: 0 }}>

                {/* Left: Category sidebar */}
                <div
                  className="flex flex-col shrink-0 overflow-hidden w-full md:w-[230px] h-[35%] md:h-full border-b md:border-b-0 border-r-0 md:border-r"
                  style={{
                    borderColor: "#e8ddd2",
                    background: "#faf6f2",
                  }}
                >
                  {/* Sidebar header */}
                  <div className="px-4 pt-5 pb-3" style={{ borderBottom: "1px solid #e8ddd2" }}>
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9a7c65" }}>Categories</p>
                    {!isAddingCategory ? (
                      <button
                        onClick={() => { setIsAddingCategory(true); setCategoryError(null); setNewCategoryName(""); }}
                        className="w-full flex items-center gap-2 text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
                        style={{ background: "rgba(194,112,62,0.1)", color: "#c2703e" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(194,112,62,0.18)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(194,112,62,0.1)")}
                      >
                        <Tags className="w-3.5 h-3.5" /> + New Category
                      </button>
                    ) : (
                      <form
                        onSubmit={handleAddCategory}
                        className="space-y-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          placeholder="Category name..."
                          required
                          autoFocus
                          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          style={{ border: "1px solid #c4956a" }}
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={!newCategoryName.trim()}
                            className="flex-1 text-xs font-bold py-1.5 rounded-md transition-colors"
                            style={{ background: "#c2703e", color: "#fff", opacity: !newCategoryName.trim() ? 0.5 : 1 }}
                          >Add</button>
                          <button
                            type="button"
                            onClick={() => setIsAddingCategory(false)}
                            className="flex-1 text-xs font-bold py-1.5 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                          >Cancel</button>
                        </div>
                        {categoryError && <p className="text-red-600 text-[11px]">{categoryError}</p>}
                      </form>
                    )}
                  </div>

                  {/* Category list */}
                  <div className="flex-1 overflow-y-auto py-2">
                    {categories.map(c => {
                      const count = menuItems.filter(i => i.category === c.name).length;
                      const isSelected = selectedCatName === c.name;
                      const isEditing = editingCategoryId === c.id;
                      return (
                        <div key={c.id}>
                          {isEditing ? (
                            <form
                              onSubmit={e => { e.preventDefault(); handleUpdateCategory(c.id); }}
                              className="mx-2 my-1 flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                type="text"
                                value={editCategoryName}
                                onChange={e => setEditCategoryName(e.target.value)}
                                className="flex-1 rounded px-2 py-1 text-xs font-bold focus:outline-none"
                                style={{ border: "1px solid #c4956a", minWidth: 0 }}
                              />
                              <button type="submit" className="text-[10px] text-white px-1.5 py-1 rounded" style={{ background: "#c2703e" }}>&#10003;</button>
                              <button type="button" onClick={() => setEditingCategoryId(null)} className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-1 rounded">&#10005;</button>
                            </form>
                          ) : (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => selectCategory(c.name)}
                              onKeyDown={e => e.key === "Enter" && selectCategory(c.name)}
                              className="w-full text-left px-4 py-2.5 flex items-center justify-between group transition-all cursor-pointer"
                              style={{
                                background: isSelected ? "#fff" : "transparent",
                                borderLeft: isSelected ? "3px solid #c2703e" : "3px solid transparent",
                                color: isSelected ? "#2c1f14" : "#6b5040",
                              }}
                              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f0ebe4"; }}
                              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? "#fff" : "transparent"; }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {!c.is_active && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Hidden" />
                                )}
                                <span className="text-sm font-semibold truncate">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span
                                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: isSelected ? "#f5ebe4" : "#e8ddd2",
                                    color: isSelected ? "#8b5e3c" : "#9a7c65",
                                  }}
                                >{count}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); startEditingCategory(c); }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                                  style={{ color: "#9a7c65" }}
                                  onMouseEnter={e => (e.currentTarget.style.color = "#c2703e")}
                                  onMouseLeave={e => (e.currentTarget.style.color = "#9a7c65")}
                                  title="Rename"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Orphans indicator */}
                    {orphans.length > 0 && (
                      <div className="mx-3 mt-3 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "#f5ebe4", color: "#8b5e3c", border: "1px solid #d4a882" }}>
                        &#9888; {orphans.length} uncategorized item{orphans.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Item Grid */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                  {/* Top toolbar */}
                  <div
                    className="flex flex-wrap items-center justify-between gap-4 px-4 md:px-6 py-4 shrink-0"
                    style={{ borderBottom: "1px solid #e8ddd2", background: "#fff" }}
                  >
                    <div>
                      {selectedCat ? (
                        <div className="flex items-center gap-3">
                          <h2 className="text-lg font-bold text-gray-900">{selectedCat.name}</h2>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f5ebe4", color: "#8b5e3c" }}>
                            {displayItems.length} item{displayItems.length !== 1 ? "s" : ""}
                          </span>
                          {!selectedCat.is_active && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-600">Hidden from customers</span>
                          )}
                        </div>
                      ) : (
                        <h2 className="text-lg font-bold text-gray-400">Select a category</h2>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedCat && (
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleCategory(selectedCat.id, selectedCat.is_active); }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                          style={selectedCat.is_active
                            ? { borderColor: "#e5e7eb", color: "#6b5040", background: "#fff" }
                            : { borderColor: "#fca5a5", color: "#dc2626", background: "#fef2f2" }
                          }
                        >
                          {selectedCat.is_active ? "Hide Category" : "Show Category"}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setIsAddingMenu(true);
                          setEditingMenuId(null);
                          setMenuName(""); setMenuDescription(""); setMenuPrice("");
                          setMenuCategory(selectedCatName || "");
                        }}
                        className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        style={{ background: "#4a6741", color: "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#3d5636")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#4a6741")}
                      >
                        <PlusCircle className="w-4 h-4" /> Add Item
                      </button>
                    </div>
                  </div>

                  {/* Add / Edit Item Form */}
                  {isAddingMenu && (
                    <div className="mx-6 mt-5 rounded-xl p-5 shrink-0" style={{ background: "#fff", border: "1px solid #e8ddd2", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-base flex items-center gap-2">
                          <PlusCircle className="w-4 h-4" style={{ color: "#c2703e" }} />
                          {editingMenuId ? "Edit Item" : "New Menu Item"}
                        </h3>
                        <button onClick={handleResetMenuForm} className="text-sm text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
                      </div>
                      <form onSubmit={handleMenuSubmit} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Item Name *</label>
                            <input type="text" value={menuName} onChange={e => setMenuName(e.target.value)} required placeholder="e.g. Chicken Momo" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Price (Rs.) *</label>
                            <input type="number" min="0" step="0.01" value={menuPrice} onChange={e => setMenuPrice(e.target.value)} required placeholder="250" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                          <textarea value={menuDescription} onChange={e => setMenuDescription(e.target.value)} placeholder="Short description..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none focus:border-gray-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
                          <select value={menuCategory} onChange={e => setMenuCategory(e.target.value)} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white focus:border-gray-400">
                            <option value="">Select a category...</option>
                            {categories.filter(c => c.is_active).map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        {menuError && <p className="text-red-500 text-sm">{menuError}</p>}
                        {menuSuccess && <p className="text-green-600 text-sm">{menuSuccess}</p>}
                        <button
                          type="submit"
                          disabled={isSubmittingMenu}
                          className="font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                          style={{ background: "#c2703e", color: "#fff", opacity: isSubmittingMenu ? 0.5 : 1 }}
                        >
                          {isSubmittingMenu ? "Saving..." : (editingMenuId ? "Save Changes" : "Add Item")}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Items grid */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {!selectedCat ? (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-3" style={{ color: "#9a7c65" }}>
                        <Utensils className="w-14 h-14 opacity-20" />
                        <p className="text-sm font-medium">Pick a category on the left to see its items</p>
                      </div>
                    ) : displayItems.length === 0 ? (
                      <div
                        className="flex flex-col items-center justify-center py-16 rounded-2xl text-center"
                        style={{ border: "2px dashed #e8ddd2", color: "#9a7c65" }}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, selectedCat.name)}
                      >
                        <PlusCircle className="w-10 h-10 opacity-30 mb-3" />
                        <p className="text-sm font-medium">No items in <strong>{selectedCat.name}</strong></p>
                        <p className="text-xs mt-1 opacity-70">Add one above or drag an item here</p>
                      </div>
                    ) : (
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, selectedCat.name)}
                      >
                        {displayItems.map(item => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={e => handleDragStart(e, item)}
                            className="rounded-xl p-4 flex flex-col gap-2 cursor-grab active:cursor-grabbing group transition-all"
                            style={{
                              background: "#fff",
                              border: "1px solid #e8ddd2",
                              opacity: item.is_available ? 1 : 0.6,
                              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                            }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(0,0,0,0.09)")}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)")}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 mt-1 shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors" />
                                <h4 className="font-bold text-sm text-gray-900 leading-tight">{item.name}</h4>
                              </div>
                              <span className="font-bold text-sm shrink-0" style={{ color: "#8b5e3c" }}>Rs.{item.price}</span>
                            </div>

                            {item.description && (
                              <p className="text-xs text-gray-500 line-clamp-2 pl-5">{item.description}</p>
                            )}

                            <div className="flex items-center justify-between pt-2 pl-5" style={{ borderTop: "1px solid #f0ebe4" }}>
                              <span className={`text-[11px] font-bold ${item.is_available ? "text-green-600" : "text-red-500"}`}>
                                {item.is_available ? "Available" : "Hidden"}
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleEditMenuClick(item)}
                                  className="text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors"
                                  style={{ borderColor: "#e5e7eb", color: "#6b5040", background: "#f9f5f2" }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "#f0ebe4")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "#f9f5f2")}
                                >Edit</button>
                                <button
                                  onClick={() => handleToggleAvailability(item.id, item.is_available)}
                                  className="text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors"
                                  style={item.is_available
                                    ? { borderColor: "#e5e7eb", color: "#6b7280", background: "#f9fafb" }
                                    : { borderColor: "#fca5a5", color: "#dc2626", background: "#fef2f2" }
                                  }
                                >
                                  {item.is_available ? "Hide" : "Show"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {orphans.length > 0 && (
                      <div className="mt-8 rounded-xl p-4" style={{ background: "#f5ebe4", border: "1px solid #d4a882" }}>
                        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: "#6b3d1e" }}>
                          Uncategorized ({orphans.length})
                          <span className="text-xs font-normal" style={{ color: "#9a6845" }}>Drag these into a category on the left</span>
                        </h3>
                        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))" }}>
                          {orphans.map(item => (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={e => handleDragStart(e, item)}
                              className="bg-white rounded-lg p-3 flex items-center justify-between cursor-grab transition-colors"
                              style={{ border: "1px solid #d4a882" }}
                              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#c2703e")}
                              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#d4a882")}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <GripVertical className="w-3.5 h-3.5 shrink-0" style={{ color: "#c4956a" }} />
                                <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                              </div>
                              <span className="text-xs font-bold shrink-0 ml-2" style={{ color: "#8b5e3c" }}>Rs.{item.price}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Staff Tab */}
          {activeTab === "staff" && hasPermission("staff") && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Staff Management</h2>
                {!(showAddStaffForm || editingManagerId) && (
                  <button
                    onClick={() => setShowAddStaffForm(true)}
                    className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    style={{ background: "#4a6741", color: "#fff" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#3d5636")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#4a6741")}
                  >
                    <PlusCircle className="w-4 h-4" /> Add Staff
                  </button>
                )}
              </div>

              {/* Create OR Edit Manager Form */}
              {(showAddStaffForm || editingManagerId) && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <PlusCircle className="w-5 h-5" style={{ color: "#c2703e" }} />
                      {editingManagerId ? "Edit Manager Account" : "Add New Manager"}
                    </h3>
                    <button
                      onClick={() => { setShowAddStaffForm(false); handleCancelEditManager(); }}
                      className="text-sm text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <form onSubmit={editingManagerId ? handleUpdateManager : handleCreateManager} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">Username</label>
                        <input
                          type="text"
                          id="new-manager-username"
                          value={newManagerUsername}
                          onChange={(e) => setNewManagerUsername(e.target.value)}
                          required
                          placeholder="e.g. manager_ram"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">
                          Password {editingManagerId && <span className="text-gray-700 font-normal">(leave blank to keep unchanged)</span>}
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            id="new-manager-password"
                            value={newManagerPassword}
                            onChange={(e) => setNewManagerPassword(e.target.value)}
                            required={!editingManagerId}
                            placeholder={editingManagerId ? "Leave blank to keep current" : "Min. 6 characters"}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none"
                          />
                          <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">Role</label>
                        <select
                          value={newManagerRole}
                          onChange={(e) => setNewManagerRole(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                        >
                          <option value="manager">Manager</option>
                          <option value="staff">Staff/Waiter</option>
                        </select>
                      </div>
                    </div>

                    {/* Module Access Checkboxes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Module Access Permissions</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        {ALL_MODULES.map((mod) => {
                          const checked = selectedPermissions.includes(mod.id);
                          return (
                            <label key={mod.id} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" style={checked ? { background: "#f5ebe4", borderColor: "#c4956a" } : { background: "#fff", borderColor: "#e5e7eb" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(mod.id)}
                                className="mt-1 rounded"
                                style={{ accentColor: "#c2703e" }}
                              />
                              <div>
                                <p className="text-xs font-bold text-gray-800">{mod.label}</p>
                                <p className="text-[11px] text-gray-800 leading-snug">{mod.desc}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {staffError && <p className="text-red-500 text-sm">{staffError}</p>}
                    {staffSuccess && <p className="text-green-600 text-sm">{staffSuccess}</p>}
                    <div className="flex gap-3">
                      <button type="submit" disabled={isCreatingManager}
                        className="font-semibold px-6 py-2.5 rounded-lg transition-colors"
                        style={{ background: "#c2703e", color: "#fff", opacity: isCreatingManager ? 0.5 : 1 }}
                      >
                        {isCreatingManager
                          ? (editingManagerId ? "Saving..." : "Creating...")
                          : (editingManagerId ? "Save Changes" : "Create Staff Account")}
                      </button>
                      {editingManagerId && (
                        <button type="button" onClick={handleCancelEditManager}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-2.5 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              {/* Manager List */}
              <h3 className="font-bold text-lg mb-4">Current Staff Accounts ({managers.length})</h3>
              {managers.length === 0 ? (
                <div className="text-center py-8 text-gray-800 bg-white rounded-xl border border-dashed border-gray-300">
                  No staff accounts created yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {managers.map((m) => (
                    <div key={m.id} className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors" style={{ borderColor: editingManagerId === m.id ? "#c2703e" : "#e5e7eb", outline: editingManagerId === m.id ? "1.5px solid rgba(194,112,62,0.3)" : undefined }}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-base text-gray-900">{m.username}</p>
                          <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
                            Staff / Manager
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-0.5">
                          Created: {new Date(m.created_at).toLocaleDateString()}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.permissions?.map((p: string) => {
                            const modObj = ALL_MODULES.find(mod => mod.id === p);
                            return (
                              <span key={p} className="text-[11px] font-semibold px-2 py-0.5 rounded border" style={{ background: "#f5ebe4", color: "#8b5e3c", borderColor: "#d4a882" }}>
                                {modObj?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button onClick={() => handleEditManager(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          Edit Access
                        </button>
                        <button onClick={() => handleDeleteManager(m.id, m.username)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* Tables Tab */}
          {activeTab === "tables" && hasPermission("tables") && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Table Management</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 print:hidden">
                {/* Add Table Form */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col justify-center">
                  <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-gray-900">
                    <PlusCircle className="w-5 h-5" style={{ color: "#c2703e" }} /> Add New Table
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">Create a new table and generate its QR code.</p>
                  
                  <form onSubmit={handleAddTable} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">Table Number</label>
                        <input
                          type="number"
                          min="1"
                          value={newTableNumber}
                          onChange={(e) => setNewTableNumber(e.target.value)}
                          required
                          placeholder="e.g. 11"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" disabled={isAddingTable}
                          className="w-full font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center h-[42px]"
                          style={{ background: "#c2703e", color: "#fff", opacity: isAddingTable ? 0.7 : 1 }}
                        >
                          {isAddingTable ? "Adding..." : "Add Table"}
                        </button>
                      </div>
                    </div>
                    {tableError && <p className="text-red-500 text-sm mt-2">{tableError}</p>}
                    {tableSuccess && <p className="text-green-600 text-sm mt-2">{tableSuccess}</p>}
                  </form>
                </div>

                {/* Table Info Widget */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutGrid className="w-5 h-5" style={{ color: "#c2703e" }} />
                    <h3 className="font-bold text-lg text-gray-900">Table Info</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-6">Real-time status of your dining floor.</p>
                  
                  <hr className="border-gray-100 mb-6" />

                  <div className="flex gap-4">
                    <div className="flex-1 rounded-xl p-4 flex items-center gap-4 border" style={{ backgroundColor: "#fffdf9", borderColor: "#fbe4d4" }}>
                      <span className="text-4xl font-extrabold" style={{ color: "#c2703e" }}>{restaurantTables.length}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-0.5">Total</span>
                        <span className="text-sm font-medium text-gray-500 leading-none">Tables</span>
                      </div>
                    </div>

                    <div className="flex-1 rounded-xl p-4 flex items-center gap-4 border" style={{ backgroundColor: "#fef8f8", borderColor: "#fce8e8" }}>
                      <span className="text-4xl font-extrabold text-red-500">{restaurantTables.filter(t => t.status === "occupied").length}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-0.5">In Use</span>
                        <span className="text-sm font-medium text-gray-500 leading-none">Now</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tables List & QR Codes */}
              <div className="flex justify-between items-center mb-4 print:hidden">
                <h3 className="font-bold text-lg">Current Tables & QR Codes ({restaurantTables.length})</h3>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "#4a6741", color: "#fff" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#3d5636")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#4a6741")}
                >
                  <Printer className="w-4 h-4" /> Print QR Sheet
                </button>
              </div>

              {restaurantTables.length === 0 ? (
                <div className="text-center py-8 text-gray-800 bg-white rounded-xl border border-dashed border-gray-300 print:hidden">
                  No tables found.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:gap-4 print:grid-cols-3">
                  {restaurantTables.map((t) => {
                    const orderUrl = `${baseUrl}/menu?table=${t.qr_identifier}`;
                    const isOccupied = t.status === "occupied";
                    const isUpdating = updatingTableId === t.id;
                    return (
                      <div key={t.id} className="bg-white rounded-2xl border p-6 flex flex-col items-center justify-center text-center shadow-sm print:border-dashed print:border-gray-400 print:shadow-none print:break-inside-avoid"
                        style={{ borderColor: isOccupied ? "#f97316" : "#e5e7eb" }}>

                        {/* Status Badge */}
                        <div className="w-full flex justify-between items-center mb-3 print:hidden">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                            style={isOccupied
                              ? { background: "#fff3e0", color: "#c2703e", border: "1px solid #f97316" }
                              : { background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }}>
                            {isOccupied ? "🔴 In Use" : "🟢 Available"}
                          </span>
                          <button
                            disabled={isUpdating}
                            onClick={() => handleMarkTableStatus(t.id, t.table_number, t.status)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                            style={isOccupied
                              ? { background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }
                              : { background: "#fff3e0", color: "#c2703e", border: "1px solid #f97316" }}
                          >
                            {isUpdating ? "..." : isOccupied ? "Mark Available" : "Mark In Use"}
                          </button>
                        </div>

                        <div className="mb-2 font-bold text-xl text-gray-900 bg-gray-100 px-4 py-1 rounded-full print:bg-white print:border">
                          Table {t.table_number}
                        </div>

                        <div id={`qr-svg-${t.table_number}`} className="bg-white p-2 rounded-xl mb-4 border border-gray-100 print:border-0">
                          {/* @ts-ignore */}
                          <QRCodeSVG
                            value={orderUrl}
                            size={140}
                            level="H"
                            includeMargin={true}
                          />
                        </div>

                        <p className="text-xs text-gray-700 font-mono break-all max-w-full mt-1 print:text-black">
                          {orderUrl}
                        </p>
                        <p className="text-sm font-medium mt-1 print:text-black" style={{ color: "#c2703e" }}>
                          Scan to order food
                        </p>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadQR(t.table_number); }}
                          className="mt-3 flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors print:hidden"
                        >
                          <Download className="w-3.5 h-3.5" /> Download QR
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTable(t.id, t.table_number); }}
                          className="mt-2 flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors print:hidden"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Restaurant Profile/Settings Tab */}
          {activeTab === "settings" && hasPermission("settings") && (
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold mb-2">Restaurant Profile</h2>
              <p className="text-gray-800 text-sm mb-8">This information will be displayed to all customers on the menu page.</p>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <form onSubmit={handleSaveSettings} className="space-y-6">

                  {/* Restaurant Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Restaurant Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={restroSettings.restro_name}
                      onChange={(e) => setRestroSettings({ ...restroSettings, restro_name: e.target.value })}
                      placeholder="e.g. Momo Palace"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    />
                  </div>

                  {/* Tagline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Tagline</label>
                    <input
                      type="text"
                      value={restroSettings.tagline}
                      onChange={(e) => setRestroSettings({ ...restroSettings, tagline: e.target.value })}
                      placeholder="e.g. Best Momos in Kathmandu"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                    <textarea
                      rows={3}
                      value={restroSettings.description}
                      onChange={(e) => setRestroSettings({ ...restroSettings, description: e.target.value })}
                      placeholder="e.g. A family restaurant serving authentic Newari cuisine since 2010."
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none resize-none"
                    />
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Restaurant Logo</label>
                    <div className="flex items-center gap-4">
                      <label className={`cursor-pointer bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isUploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploadingLogo ? "Uploading..." : "Choose Image File"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                        />
                      </label>
                      <span className="text-xs text-gray-800">Max size: 5MB. Formats: PNG, JPG, WEBP.</span>
                    </div>

                    {/* Live logo preview */}
                    {restroSettings.logo_url && (
                      <div className="mt-4 flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <img
                          src={restroSettings.logo_url.startsWith('/') ? `http://localhost:5000${restroSettings.logo_url}` : restroSettings.logo_url}
                          alt="Logo preview"
                          className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Logo Preview</p>
                          <p className="text-xs text-gray-700">This is how it will appear on the menu.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {settingsError && <p className="text-red-500 text-sm">{settingsError}</p>}
                  {settingsSuccess && <p className="text-green-600 text-sm font-medium">{settingsSuccess}</p>}

                  <button type="submit" disabled={isSavingSettings}
                    className="w-full font-semibold py-3 rounded-xl transition-colors"
                    style={{ background: "#c2703e", color: "#fff", opacity: isSavingSettings ? 0.5 : 1 }}
                  >
                    {isSavingSettings ? "Saving..." : "Save Restaurant Profile"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Place Order Tab */}
          {activeTab === "place_order" && hasPermission("place_order") && (
            <div>
              <h2 className="text-2xl font-bold mb-2">Place Order</h2>
              <p className="text-gray-800 text-sm mb-6">Select a table to place an order on behalf of a customer.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {restaurantTables.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-700 bg-white rounded-xl border border-dashed border-gray-300">
                    No tables found. Ask an owner to add tables.
                  </div>
                )}
                {restaurantTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      window.open(`/menu?table=${t.qr_identifier}`, "_blank");
                    }}
                    className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-gray-200 rounded-2xl py-8 transition-all group"
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#c2703e"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
                  >
                    <ShoppingBag className="w-8 h-8 transition-colors" style={{ color: "#c2703e" }} />
                    <span className="font-bold text-lg">Table {t.table_number}</span>
                    <span className="text-xs text-gray-700">Tap to order</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Order Detail Panel */}
        {activeTab === "orders" && selectedOrder && (
          <div className="w-full md:w-96 bg-white shadow-xl flex flex-col h-screen md:h-auto border-l border-gray-200 z-10 absolute md:static top-0 right-0">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold">Order #{selectedOrder.id}</h2>
              <button onClick={() => setSelectedOrder(null)} className="md:hidden p-2 text-gray-800 bg-white rounded-full">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm text-gray-800 font-medium">Table</p>
                  <p className="text-2xl font-bold">{selectedOrder.table_number}</p>
                  {selectedOrder.placed_by_username && (
                    <p className="text-xs text-blue-600 font-medium mt-1">📋 Placed by <strong>{selectedOrder.placed_by_username}</strong></p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-800 font-medium mb-1">Status</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(selectedOrder.status)} uppercase`}>
                    {selectedOrder.status}
                  </span>
                </div>
              </div>
              <h3 className="font-bold text-gray-900 mb-4 uppercase tracking-wider text-sm border-b pb-2">Items</h3>
              <div className="space-y-4 mb-8">
                {selectedOrder.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between">
                    <span><span className="font-semibold">{item.quantity}x</span> {item.item_name}</span>
                    <span className="font-medium">Rs. {item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 py-4 border-t border-b border-dashed border-gray-200 mb-8">
                <div className="flex justify-between text-sm text-gray-800">
                  <span>Subtotal</span>
                  <span className="font-medium text-gray-700">Rs. {selectedOrder.total_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-800">
                  <span>VAT (13%)</span>
                  <span className="font-medium text-gray-700">Rs. {(selectedOrder.total_price * 0.13).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t border-dashed border-gray-200">
                  <span className="font-bold text-gray-900">Grand Total</span>
                  <span className="text-2xl font-bold text-green-600">Rs. {(selectedOrder.total_price * 1.13).toFixed(2)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={selectedOrder.status === "preparing"} onClick={() => handleUpdateStatus(selectedOrder.id, "preparing")}
                  className="p-3 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >Preparing</button>
                <button disabled={selectedOrder.status === "ready"} onClick={() => handleUpdateStatus(selectedOrder.id, "ready")}
                  className="p-3 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >Ready</button>
                <button disabled={selectedOrder.status === "completed"} onClick={() => handleUpdateStatus(selectedOrder.id, "completed")}
                  className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 col-span-2"
                >Complete & Archive</button>
                <button disabled={selectedOrder.status === "cancelled"} onClick={() => handleUpdateStatus(selectedOrder.id, "cancelled")}
                  className="p-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 col-span-2 mt-2"
                >Cancel Order</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "orders" && !selectedOrder && (
          <div className="hidden md:flex w-96 bg-gray-50 border-l border-gray-200 flex-col items-center justify-center p-8 text-center text-gray-700">
            <ClipboardList className="w-16 h-16 opacity-20 mb-4" />
            <p>Select an order to view details.</p>
          </div>
        )}
      </div>

      {/* ── Unpaid Warning Dialog ──────────────────────────────────────────── */}
      {unpaidWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4">
            <div className="text-3xl text-center mb-3">⚠️</div>
            <h3 className="font-bold text-lg text-center text-gray-900 mb-2">
              Payment Not Confirmed
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              Table <strong>{unpaidWarning.tableNumber}</strong> may still have an unpaid bill. 
              Are you sure you want to mark it as <strong>Available</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setUnpaidWarning(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doUpdateTableStatus(unpaidWarning.tableId, "available")}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-colors"
                style={{ background: "#c2703e" }}
              >
                Yes, Mark Available
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
