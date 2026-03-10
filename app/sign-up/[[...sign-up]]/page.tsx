"use client";

import { useState, useEffect } from "react";
import { SignUp } from "@clerk/nextjs";
import Spline from '@splinetool/react-spline';
import BackButton from "@/app/components/BackButton";

export default function SignUpPage() {
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAuth(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <BackButton />
      
      <div className="absolute inset-0 z-0">
        <Spline scene="https://prod.spline.design/IyXsuwBL5wOwbdoh/scene.splinecode" />
      </div>

      <div className="absolute inset-0 z-50 pointer-events-none">
        
        <div 
            className={`absolute top-96 left-1/2 -translate-x-1/2 pointer-events-auto transition-all duration-1000 ease-in-out ${
                showAuth ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
        >
          <SignUp />
        </div>

      </div>

    </main>
  );
}