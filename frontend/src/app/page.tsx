'use client';

import React, { useState, useEffect } from 'react';
import { WhatsAppCrmModule } from '../components/WhatsAppCrmModule';
import { LoginModule } from '../components/LoginModule';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem('crm_authenticated') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  if (!mounted) return null;

  if (!isAuthenticated) {
    return <LoginModule onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="w-screen h-screen flex overflow-hidden bg-[#f0f2f5] relative">
      <WhatsAppCrmModule />
    </main>
  );
}
