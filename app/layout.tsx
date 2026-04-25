import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ToastContainer from "@/components/Toast";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CoachFlow - Fitness Coaching Platform",
    template: "%s | CoachFlow",
  },
  description: "Coach others, get coached, or both - all in one place.",
  metadataBase: new URL("https://coachflow.app"),
  openGraph: {
    title: "CoachFlow - Fitness Coaching Platform",
    description: "Coach others, get coached, or both - all in one place.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
