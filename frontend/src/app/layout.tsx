import './globals.css';
import { Inter } from 'next/font/google';
import { SocketProvider } from '../context/SocketContext';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata = {
  title: 'AI Vastra CRM — WhatsApp & Instagram Real-Time Workspace',
  description: 'Real-time clone of WhatsApp Web & Instagram Direct Messages with non-intrusive CRM capabilities.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.className}`}>
      <body className={`h-screen w-screen overflow-hidden bg-wa-bg text-wa-textPrimary ${inter.className}`}>
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
