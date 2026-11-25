import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Intelligent Cleaning Audit",
    short_name: "ICA",
    description: "Guided sanitation and audit-ready records for food plants.",
    start_url: "/app/cleaner",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f243e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
