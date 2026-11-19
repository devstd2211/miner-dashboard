import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Miners" };

// Sets the theme before the first paint (no flash of the wrong theme): the choice saved by the
// ☀/☾ button (components/useTheme.ts), otherwise the system setting.
const themeScript = `try{var t=localStorage.getItem("miners.theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script changes data-theme before hydration.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
