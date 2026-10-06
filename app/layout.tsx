import "./globals.css";
import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";

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
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
