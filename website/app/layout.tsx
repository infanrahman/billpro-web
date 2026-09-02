import type { Metadata } from "next";
import { trackingConfig } from "../lib/tracking/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(trackingConfig.publicUrl),
  title: "Billing Pro Tracking Dashboard",
  description:
    "Company and branch operations tracker for Billing Pro POS sync, audit, sales, inventory, purchases, expenses, and cashbook data.",
  openGraph: {
    title: "Billing Pro Tracking Dashboard",
    description:
      "Monitor synced POS activity across companies, branches, permissions, and business modules.",
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
