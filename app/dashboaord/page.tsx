import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

export default async function DashboardPage() {
  // 1. Fetch the authenticated user's details on the server
  const user = await currentUser();

  // 2. Protect the page: Redirect to home if there is no logged-in user
  if (!user) {
    redirect("/");
  }

  // 3. Sync Clerk user with our Prisma database
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
    <div className="min-h-screen bg-gray-50 flex">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <span className="text-xl font-bold text-gray-900">DSagent</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <a href="#" className="block px-4 py-2 rounded-md bg-blue-50 text-blue-700 font-medium">
            Overview
          </a>
          <a href="#" className="block px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors">
            Pipelines
          </a>
          <a href="#" className="block px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors">
            Datasets
          </a>
          <a href="#" className="block px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors">
            Settings
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {/* Dynamically display the user's first name */}
              Welcome back, {user.firstName || "User"}
            </span>
            {/* Clerk User Profile and Logout Button */}
            <UserButton />
          </div>
        </header>

        {/* Dashboard Widgets & Data */}
        <main className="flex-1 p-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">Active Models</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">3</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">Processed Datasets</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">12</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">API Requests</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">1,248</p>
            </div>
          </div>

          {/* Main Panel */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 min-h-[300px]">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h2>
            <div className="text-gray-600">
              <p>Your workspace is ready. Select a dataset to begin training or run a new script.</p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}