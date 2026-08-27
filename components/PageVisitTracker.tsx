'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function PageVisitTracker() {
  const visitTracked = useRef(false);
  const scrollTracked = useRef(false);
  const pathname = usePathname();

  // 1. Initial Page Visit Notification
  useEffect(() => {
    if (visitTracked.current) return;
    visitTracked.current = true;

    fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'dsagent page visit',
        details: `A visitor accessed the dsagent site. URL: ${window.location.href}`,
        scenario: 'Page Visit Alert',
        result: 'Success',
      }),
    }).catch(console.error);
  }, []);

  // 2. Landing Page Scroll Notification (triggers on even a slight scroll)
  useEffect(() => {
    // Only track scroll on the landing page
    if (pathname !== '/' || scrollTracked.current) return;

    const handleScroll = () => {
      if (scrollTracked.current) return;

      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      // Trigger when user scrolls even slightly (> 10px)
      if (scrollY > 10) {
        scrollTracked.current = true;
        window.removeEventListener('scroll', handleScroll);

        const maxScroll = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1
        );
        const scrollPercent = Math.min(Math.round((scrollY / maxScroll) * 100), 100);

        fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event: 'Landing Page Scrolled',
            details: `A visitor scrolled the landing page (scrolled ${Math.round(scrollY)}px, ~${scrollPercent}%). URL: ${window.location.href}`,
            scenario: 'Landing Page Scroll Alert',
            result: 'Success',
          }),
        }).catch(console.error);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Check if user reloaded the page and is already scrolled down
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname]);

  return null;
}

