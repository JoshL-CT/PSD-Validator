import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Stand ins for the licensed NFL typeface. Swap for the approved brand fonts.
const body = Barlow({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "PSD Validator",
  description: "Check a PSD against the template best practices, fix what it finds, and download the clean file.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
