// app/admin/page.tsx — Admin Dashboard Server Component
// Only accessible by jatinnath1111@gmail.com
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import AdminDashboard from './AdminDashboard';

const ADMIN_EMAIL = 'jatinnath1111@gmail.com';

export default async function AdminPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const userEmail = user.emailAddresses[0]?.emailAddress;

  // Strict admin check
  if (userEmail !== ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  // Upsert admin user
  if (userEmail) {
    await prisma.user.upsert({
      where: { clerkId: user.id },
      update: {
        email: userEmail,
        role: 'admin',
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
      create: {
        clerkId: user.id,
        email: userEmail,
        role: 'admin',
        lastLoginAt: new Date(),
        loginCount: 1,
      },
    });
  }

  return (
    <AdminDashboard
      admin={{
        firstName: user.firstName || 'Admin',
        email: userEmail || ADMIN_EMAIL,
        imageUrl: user.imageUrl,
      }}
    />
  );
}
