import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Leitstand",
  description: "Übersicht über Projekte, Worker, Tokens und Abläufe.",
  // Vom Home-Bildschirm als eigene App öffnen (Voraussetzung für Push auf dem iPhone, SIN-421).
  appleWebApp: { capable: true, title: "Leitstand", statusBarStyle: "black" },
};

// Meta-Tag kann kein CSS-Token lesen: Wert = bg/base aus Figma.
export const viewport: Viewport = { themeColor: "#0c0a09" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
