import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Web Content Cleaner — Clean & Copy',
  description: 'Extract main content from any URL and get clean Markdown. One click to copy.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 font-sans antialiased">{children}</body>
    </html>
  );
}
