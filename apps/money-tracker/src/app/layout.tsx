import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "./AppProviders";

export const metadata: Metadata = {
  title: "Money Tracker — Ledgerline",
  description: "AA-native personal finance with a never-negative envelope ledger.",
};

// The four brand faces (Gen Z / Millennial / Senior + the quote serif).
const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@10..48,400;10..48,600;10..48,700&family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=Josefin+Sans:wght@500;600;700&family=Playfair+Display:ital,wght@1,400;1,600;0,600&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
