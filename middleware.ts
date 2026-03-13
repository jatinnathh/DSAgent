import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

// Notice we added 'async' here
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    // We removed the parenthesis after auth and added 'await'
    await auth.protect(); 
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};