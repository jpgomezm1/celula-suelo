import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const base = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-base" });
const titulos = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-titulos" });

export const metadata = { title: "Inteligencia de suelo · irrelevant", description: "Norma, mercado, competencia y oportunidades de suelo por lote" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${base.variable} ${titulos.variable}`}>
      <body>{children}</body>
    </html>
  );
}
