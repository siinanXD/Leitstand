import type { MetadataRoute } from "next";

// PWA-Manifest (SIN-424). Das Manifest kann kein CSS-Token lesen: Farben = bg/base aus Figma, wie `viewport` in layout.tsx.
// Icon A „Schiene“ (Figma 7Ti9iVUjUjw3rh9WYhSu9K, Komponente 40:2), Quelle: src/app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leitstand",
    short_name: "Leitstand",
    description: "Übersicht über Projekte, Worker, Tokens und Abläufe.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
