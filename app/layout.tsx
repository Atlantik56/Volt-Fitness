import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_MOTTO } from "@/lib/brand";
import { headers } from "next/headers";
import "./globals.css";
import "./fitness-features.css";
import "./advanced-features.css";
import "./body-map-realistic.css";
import "./mobile-shell.css";
// VOLT 2.0 — слой редизайна Главной. Импортируется последним намеренно:
// он переопределяет визуал поверх всех предыдущих таблиц стилей, не меняя
// их саму разметку и логику (см. шапку файла).
import "./volt2.css";
import "./volt-navigation.css";
import "./legacy-module-palette.css";
import "./auth-glass.css";
import PwaRegister from "./pwa-register";
import { ToastProvider } from "./toast";

export const viewport: Viewport = { themeColor: "#081426" };

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = `${APP_NAME} — ${APP_MOTTO}`;
  const description = `${APP_MOTTO} Силовые, велосипед и плавание в одном персональном плане.`;
  return {
    title,
    applicationName: APP_NAME,
    description,
    icons: { icon: [{ url: "/icon-192.png?v=ritmovis-20260905", type: "image/png", sizes: "192x192" }, { url: "/icon-512.png?v=ritmovis-20260905", sizes: "512x512" }], shortcut: "/icon-192.png?v=ritmovis-20260905", apple: "/icon-192.png?v=ritmovis-20260905" },
    openGraph: { title, description, images: [{ url: `${origin}/og.png`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
