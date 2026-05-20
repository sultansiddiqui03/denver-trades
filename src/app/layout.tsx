import type { Metadata } from "next";
import { Outfit, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Denver-Trades | AI-Powered Trade Intelligence & CRM",
  description:
    "The autonomous operating system for global trade. AI-powered buyer discovery, shipment-grade enrichment, document compliance, and WhatsApp CRM for commodity exporters.",
  keywords: [
    "trade intelligence",
    "export CRM",
    "commodity trading",
    "buyer discovery",
    "AI trade platform",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
