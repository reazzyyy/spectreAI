import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Golos_Text, Noto_Serif } from "next/font/google";
import { QueryProvider } from "@/shared/api";
import "./styles/index.scss";

const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-golos",
  display: "swap",
});

const notoSerif = Noto_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "НейроЮрист Спектр",
  description: "Синтетический режим до разрешения передачи реальных данных внешнему провайдеру",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${notoSerif.variable}`}>
      <body className={golos.className}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
