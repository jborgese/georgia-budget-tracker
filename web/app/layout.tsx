import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteNav } from "@/components/SiteNav";
import { loadCountyOptions } from "@/lib/data";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: {
    default: "Georgia State Budget Tracker",
    template: "%s | Georgia State Budget Tracker",
  },
  description:
    "A public ledger for Georgia: how the state, down to each of its 159 counties, apportions its finances — built from publicly available data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const counties = loadCountyOptions();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav options={counties} />
        {children}
      </body>
    </html>
  );
}
