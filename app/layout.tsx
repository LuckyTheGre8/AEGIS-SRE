import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis SRE — Investigation workspace",
  description: "Evidence-driven incident investigation. Aegis SRE v0.1 foundation workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
