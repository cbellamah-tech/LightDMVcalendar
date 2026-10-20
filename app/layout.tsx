import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import Shell from "@/components/Shell";

// Served from the app itself (no Google Fonts request on load): Inter for reading, Montserrat for headings.
const body = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const display = Montserrat({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Light DMV",
  description: "Light DMV crew and owner app: yard sign routes, job checklists, calendar",
  appleWebApp: { capable: true, title: "Light DMV", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#112E5B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
