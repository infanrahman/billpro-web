import type { Metadata } from "next";
import { trackingConfig } from "../lib/tracking/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(trackingConfig.publicUrl),
  title: "Billing Pro Operations",
  description:
    "Connected Billing Pro POS operations for sales, purchases, inventory, finance, users, and Saudi e-invoicing.",
  icons: {
    icon: "/app-icon.png",
    shortcut: "/app-icon.png",
    apple: "/app-icon.png",
  },
  openGraph: {
    title: "Billing Pro Operations",
    description:
      "Run your connected POS, sales, inventory, finance, and ZATCA Phase 2 workflows.",
    images: ["/logo-cyber.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
