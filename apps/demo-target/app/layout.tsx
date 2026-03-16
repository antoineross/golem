import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { appConfig } from "./data";
import { ConfigScript } from "./config-script";
import { SupportFab } from "./support-fab";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TechShop - Demo Store",
  description: "A demo e-commerce application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased bg-gray-50 text-gray-900`}>
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-blue-600">TechShop</Link>
            <div className="flex gap-6 text-sm font-medium">
              <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
              <Link href="/shop" className="hover:text-blue-600 transition-colors">Shop</Link>
              <Link href="/profile" className="hover:text-blue-600 transition-colors">Profile</Link>
            </div>
          </div>
        </nav>
        {children}
        <ConfigScript config={appConfig} />
        <SupportFab />
      </body>
    </html>
  );
}
