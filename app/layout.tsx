import { Work_Sans } from "next/font/google";
import "./globals.css";

const work = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-work" });

export const metadata = { title: "Conaltura · Inteligencia de suelo", description: "Estudios de competencia, norma y mercado por lote" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={work.variable}>
      <body>{children}</body>
    </html>
  );
}
