export const metadata = { title: "Planning Digest" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          {children}
        </main>
      </body>
    </html>
  );
}


