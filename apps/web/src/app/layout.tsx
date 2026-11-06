import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/shared/api";
import "./styles/index.scss";

export const metadata: Metadata = {
  title: "НейроЮрист Спектр",
  description: "Синтетический режим до разрешения передачи реальных данных внешнему провайдеру",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
