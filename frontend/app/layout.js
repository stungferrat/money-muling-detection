import './globals.css'

export const metadata = {
  title: 'RIFT 2026 — Money Muling Detection Engine',
  description: 'Graph-based financial crime detection. Upload transaction CSV to expose money muling networks.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}