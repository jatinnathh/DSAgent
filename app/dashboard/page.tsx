import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

const ADMIN_EMAIL = 'jatinnath1111@gmail.com';

export default async function DashboardPage() {
  let user;
  try {
    user = await currentUser();
  } catch (err: any) {
    // Handle Clerk rate limiting (429) gracefully
    if (err?.status === 429) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0f', color: '#e0e0e0', fontFamily: 'system-ui' }}>
          <div style={{ textAlign: 'center' }}>
            <h2>Too Many Requests</h2>
            <p>Please wait a moment and refresh the page.</p>
          </div>
        </div>
      );
    }
    throw err;
  }

  if (!user) {
    redirect("/");
  }

  const userEmail = user.emailAddresses[0]?.emailAddress;

  // Admin redirect — admin users go to /admin
  if (userEmail === ADMIN_EMAIL) {
    redirect("/admin");
  }

  if (userEmail) {
    try {
      await prisma.user.upsert({
        where: { clerkId: user.id },
        update: {
          email: userEmail,
          lastLoginAt: new Date(),
          loginCount: { increment: 1 },
        },
        create: {
          clerkId: user.id,
          email: userEmail,
          lastLoginAt: new Date(),
          loginCount: 1,
        },
      });
    } catch {
      // Don't block page render if DB upsert fails
    }
  }

  return (
    <DashboardClient
      user={{
        firstName: user.firstName,
        email: userEmail,
      }}
    />
  );
}