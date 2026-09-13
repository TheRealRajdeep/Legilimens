import type { Metadata } from "next";
import localFont from "next/font/local";
import { Playfair_Display } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const grostel = localFont({
  src: "../assets/fonts/grostel/GrostelRegular-V43ye.ttf",
  variable: "--font-grostel",
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guessworker — the Seer reads your trade",
  description: "Stake 1 USDC. Seal your job. The Seer has ten questions to name it, and every seal is kept on-chain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grostel.variable} ${playfair.variable} antialiased`}>
      <body className="booth-room">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
