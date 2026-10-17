import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis SRE — Investigation workspace",
  description: "Aegis SRE v0.4: model-generated diagnostics, deterministic policy and real CreateOS fixture evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
