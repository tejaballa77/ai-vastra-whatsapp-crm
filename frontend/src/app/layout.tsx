import './globals.css';
import { SocketProvider } from '../context/SocketContext';

export const metadata = {
  title: 'AI Vastra CRM — WhatsApp & Instagram Real-Time Workspace',
  description: 'Real-time clone of WhatsApp Web & Instagram Direct Messages with non-intrusive CRM capabilities.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen w-screen overflow-hidden bg-wa-bg text-wa-textPrimary">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
