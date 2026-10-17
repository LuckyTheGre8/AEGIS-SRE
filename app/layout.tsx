import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis SRE — Investigation workspace",
  description: "Aegis SRE v0.3: bounded Gemini recommendations, deterministic policy and real CreateOS baseline evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
