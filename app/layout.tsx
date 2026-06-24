import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LightDMV Ops Calendar",
  description: "Recurring task board for Chris & Liam",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
