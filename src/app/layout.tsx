import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intelligent Cleaning Audit",
  description:
    "Sanitation compliance for food processing plants: guided cleans, proof capture and audit-ready records.",
};

export const viewport: Viewport = {
  themeColor: "#0f243e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
