import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/lib/theme-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GridSense // SCADA Power Telemetry & FDIR Control",
  description:
    "Distribution Office Real-Time SCADA Dashboard for Power Telemetry and Central FDIR Grid Protection",
};

import { DashboardProvider } from "@/context/DashboardContext";
import { AppLayoutShell } from "@/components/AppLayoutShell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] font-mono transition-colors duration-150">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('gridsense-theme');
                if (stored === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else if (stored === 'dark') {
                  document.documentElement.classList.remove('light');
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
        <ThemeProvider>
          <ToastProvider>
            <DashboardProvider>
              <AppLayoutShell>{children}</AppLayoutShell>
            </DashboardProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
