// middleware.ts — Enhanced middleware with route protection and security headers
// NOTE: Admin email-based routing is handled in page.tsx (dashboard & admin)
// because Clerk sessionClaims don't reliably include email in middleware context.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  // Protect authenticated routes
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // Build response with security headers
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Add request ID for tracing
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  response.headers.set('X-Request-Id', requestId);

  return response;
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};