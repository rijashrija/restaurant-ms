"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import {
  checkAuthStatus,
  ownerSignup,
  login,
  saveToken,
  saveUser,
  getToken,
} from "../../services/auth";
import { getRestaurantSettings, RestaurantSettings, API_BASE_URL } from "../../services/api";

type Mode = "login" | "setup";

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: "#1c1714",
  card: "#2a2119",
  border: "#3d2e22",
  inputBg: "#231a13",
  inputBorder: "#4a3728",
  inputFocus: "#6b7c4f",   // olive
  text: "#f0e6d8",
  muted: "#8a7260",
  primary: "#c2703e",      // terracotta
  primaryHover: "#a3622f",
  primaryText: "#fff",
  tabActive: "#3d2e22",
  error: "#ef4444",
  errorBg: "rgba(239,68,68,0.08)",
  errorBorder: "rgba(239,68,68,0.25)",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Splash screen state
  const [showSplash, setShowSplash] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const [restroSettings, setRestroSettings] = useState<RestaurantSettings | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      router.replace("/admin");
      return;
    }
    checkAuthStatus()
      .then(({ owner_exists }) => {
        setOwnerExists(owner_exists);
        if (!owner_exists) setMode("setup");
      })
      .catch((err) => {
        console.error("Auth status check failed:", err);
        setError("Failed to connect to backend server.");
        setOwnerExists(false);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let data;
      if (mode === "setup") {
        data = await ownerSignup(username, password);
      } else {
        data = await login(username, password);
      }

      saveToken(data.token);
      saveUser(data.user);

      // Fetch restaurant settings for splash
      let settings: RestaurantSettings | null = null;
      try {
        settings = await getRestaurantSettings();
      } catch (_) {}

      setRestroSettings(settings);
      setShowSplash(true);

      // Trigger fade-in on next paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSplashVisible(true));
      });

      // After 2.5s start fade-out, redirect at 3.1s
      setTimeout(() => setSplashFadingOut(true), 2500);
      setTimeout(() => router.replace("/admin"), 3100);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  // ── Splash Screen ─────────────────────────────────────────────────────────
  if (showSplash) {
    const logoUrl = restroSettings?.logo_url
      ? restroSettings.logo_url.startsWith("/")
        ? `${API_BASE_URL}${restroSettings.logo_url}`
        : restroSettings.logo_url
      : null;
    const restroName = restroSettings?.restro_name || "My Restaurant";
    const tagline = restroSettings?.tagline || "";

    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          .splash-bg {
            background: #1c1714;
            font-family: 'Inter', sans-serif;
          }
          .splash-wrap {
            opacity: 0;
            transform: scale(0.92);
            transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
          }
          .splash-wrap.visible { opacity: 1; transform: scale(1); }
          .splash-wrap.fading {
            opacity: 0; transform: scale(1.04);
            transition: opacity 0.55s ease-in, transform 0.55s ease-in;
          }
          .logo-ring {
            box-shadow: 0 0 32px rgba(194,112,62,0.08);
          }
          .splash-name {
            animation: slide-up 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.2s;
          }
          .splash-tagline {
            animation: slide-up 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.45s;
          }
          @keyframes slide-up {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .splash-divider {
            animation: grow-w 0.65s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.32s;
          }
          @keyframes grow-w {
            from { width: 0; opacity: 0; }
            to   { width: 72px; opacity: 1; }
          }
          .splash-dots span {
            display: inline-block;
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #c2703e;
            opacity: 0.4;
            animation: dot-b 1.2s ease-in-out infinite;
          }
          .splash-dots span:nth-child(2) { animation-delay: 0.2s; }
          .splash-dots span:nth-child(3) { animation-delay: 0.4s; }
          @keyframes dot-b {
            0%,80%,100% { transform: scale(0.8); opacity: 0.4; }
            40%          { transform: scale(1.3); opacity: 0.9; }
          }
        `}</style>

        <div className="splash-bg min-h-screen flex items-center justify-center relative overflow-hidden">
          {/* Content */}
          <div
            className={`splash-wrap${splashVisible ? " visible" : ""}${splashFadingOut ? " fading" : ""}`}
            style={{ textAlign: "center", padding: "0 28px", zIndex: 10, maxWidth: 480, width: "100%" }}
          >
            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <div
                className="logo-ring"
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
              className="splash-name"
              style={{
                fontSize: "clamp(1.9rem,5vw,2.8rem)", fontWeight: 800,
                color: "#f0e6d8", letterSpacing: "-0.5px",
                marginBottom: 14, lineHeight: 1.15,
              }}
            >
              {restroName}
            </h1>

            {/* Divider */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: tagline ? 14 : 36 }}>
              <div
                className="splash-divider"
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
                className="splash-tagline"
                style={{
                  fontSize: "clamp(0.95rem,2.5vw,1.18rem)",
                  color: "#d4c4a8", fontWeight: 500,
                  letterSpacing: "0.015em", marginBottom: 40,
                  lineHeight: 1.55,
                }}
              >
                {tagline}
              </p>
            )}

            {/* Loading dots */}
            <div
              className="splash-dots"
              style={{ display: "flex", gap: 9, justifyContent: "center" }}
            >
              <span /><span /><span />
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Login / Setup Form ────────────────────────────────────────────────────
  if (ownerExists === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <ChefHat className="w-10 h-10 animate-pulse" style={{ color: C.primary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.bg }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
            style={{
              background: "rgba(194,112,62,0.12)",
              border: `1px solid rgba(194,112,62,0.25)`,
            }}
          >
            <ChefHat className="w-10 h-10" style={{ color: C.primary }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>Restaurant Management System</h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>
            {mode === "setup" ? "Create your owner account to get started" : "Sign in to continue"}
          </p>
        </div>

        {/* Tab switcher */}
        {ownerExists && (
          <div
            className="flex rounded-xl p-1 mb-6"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: mode === "login" ? C.tabActive : "transparent",
                color: mode === "login" ? C.text : C.muted,
              }}
            >
              <LogIn className="inline w-4 h-4 mr-1.5 -mt-0.5" /> Sign In
            </button>
            <button
              onClick={() => { setMode("setup"); setError(null); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: mode === "setup" ? C.tabActive : "transparent",
                color: mode === "setup" ? C.text : C.muted,
              }}
            >
              <UserPlus className="inline w-4 h-4 mr-1.5 -mt-0.5" /> Owner Setup
            </button>
          </div>
        )}

        {/* Form Card */}
        <div
          className="rounded-2xl p-8"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>
            {mode === "setup" ? "Create Owner Account" : "Welcome back"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: C.muted }}>Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3 transition-colors outline-none"
                style={{
                  background: C.inputBg,
                  color: C.text,
                  border: `1px solid ${C.inputBorder}`,
                }}
                onFocus={e => (e.target.style.borderColor = C.inputFocus)}
                onBlur={e => (e.target.style.borderColor = C.inputBorder)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: C.muted }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "setup" ? "Min. 6 characters" : "Enter password"}
                  required
                  autoComplete={mode === "setup" ? "new-password" : "current-password"}
                  className="w-full rounded-xl px-4 py-3 pr-12 transition-colors outline-none"
                  style={{
                    background: C.inputBg,
                    color: C.text,
                    border: `1px solid ${C.inputBorder}`,
                  }}
                  onFocus={e => (e.target.style.borderColor = C.inputFocus)}
                  onBlur={e => (e.target.style.borderColor = C.inputBorder)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: C.muted }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="text-sm px-4 py-3 rounded-xl"
                style={{
                  background: C.errorBg,
                  border: `1px solid ${C.errorBorder}`,
                  color: "#fca5a5",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full font-bold py-3.5 rounded-xl transition-colors text-base"
              style={{
                background: isLoading ? "rgba(194,112,62,0.45)" : C.primary,
                color: C.primaryText,
              }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget.style.background = C.primaryHover); }}
              onMouseLeave={e => { if (!isLoading) (e.currentTarget.style.background = C.primary); }}
            >
              {isLoading
                ? "Please wait..."
                : mode === "setup"
                ? "Create Account & Continue"
                : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: C.muted }}>
          This portal is for restaurant staff only.
        </p>
      </div>
    </div>
  );
}
