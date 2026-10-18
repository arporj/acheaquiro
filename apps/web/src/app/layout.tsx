import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { ProvedorAnuncios } from "@/components/prototipo/ProvedorAnuncios";
import { SeletorAnuncios } from "@/components/prototipo/SeletorAnuncios";
import { Rodape } from "@/components/Rodape";
import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ache Aqui RO · Profissionais e comércios de Rio das Ostras",
    template: "%s · Ache Aqui RO",
  },
  description:
    "Encontre eletricistas, diaristas, bombeiros hidráulicos, restaurantes, farmácias e muito mais em Rio das Ostras. Fale direto pelo WhatsApp.",
};

export const viewport: Viewport = {
  themeColor: "#1747C9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${baloo.variable} ${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ProvedorAnuncios>
          {children}
          <Rodape />
          <SeletorAnuncios />
        </ProvedorAnuncios>
      </body>
    </html>
  );
}
