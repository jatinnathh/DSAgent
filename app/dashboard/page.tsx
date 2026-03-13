import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const userEmail = user.emailAddresses[0]?.emailAddress;

  if (userEmail) {
    await prisma.user.upsert({
      where: { clerkId: user.id },
      update: { email: userEmail },
      create: {
        clerkId: user.id,
        email: userEmail,
      },
    });
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