// /app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'
import { Analytics } from '@vercel/analytics/react'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { PageVisitTracker } from "@/components/PageVisitTracker";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "DSAgent — Autonomous Data Science Agent",
  description:
    "Upload a dataset. Get insights, models, and reports — automatically. DSAgent is your autonomous AI data scientist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <Analytics />
        <PageVisitTracker />
      </body>
    </html>
  );
}
