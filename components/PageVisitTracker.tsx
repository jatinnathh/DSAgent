'use client';

import { useEffect, useRef } from 'react';

export function PageVisitTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

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

  return null;
}
