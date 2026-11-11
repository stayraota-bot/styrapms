import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "STAYRA PMS", template: "%s · STAYRA PMS" },
  description: "Property management & revenue-sharing platform for STAYRA properties.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#163c2d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
