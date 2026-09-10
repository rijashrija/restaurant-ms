"use client";

import Link from "next/link";
import { ChefHat, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center text-white"
      style={{ background: "#1c1714" }}
    >
      <div className="text-center space-y-8 p-8 max-w-md w-full">

        <div className="flex justify-center">
          <div
            className="p-6 rounded-full"
            style={{
              background: "rgba(194, 112, 62, 0.12)",
              border: "1px solid rgba(194, 112, 62, 0.25)",
            }}
          >
            <ChefHat className="w-20 h-20" style={{ color: "#c2703e" }} />
          </div>
        </div>

        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to Restaurant Management System
        </h1>

        <div className="pt-4">
          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 px-6 py-4 text-white rounded-xl font-bold text-lg transition-colors shadow-lg"
            style={{ background: "#c2703e" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#a3622f")}
            onMouseLeave={e => (e.currentTarget.style.background = "#c2703e")}
          >
            Continue
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

      </div>
    </main>
  );
}
