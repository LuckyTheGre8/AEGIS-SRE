import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis SRE — Investigation workspace",
  description: "Aegis SRE v0.5: model-generated diagnostics and patches with fresh CreateOS sandbox verification.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
