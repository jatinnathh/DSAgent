"use client"; // Required for useState and useEffect

import { useState, useEffect } from "react";
import { SignIn } from "@clerk/nextjs";
import Spline from '@splinetool/react-spline';

export default function SignInPage() {
    const [showAuth, setShowAuth] = useState(false);

    useEffect(() => {
        // Wait 3 seconds (3000 milliseconds) before showing the auth box
        const timer = setTimeout(() => {
            setShowAuth(true);
        }, 4000); 
        
        // Cleanup the timer
        return () => clearTimeout(timer);
    }, []);

    return (
        <main className="relative w-full h-screen overflow-hidden bg-black">

            {/* 1. Spline Background Layer */}
            <div className="absolute inset-0 z-0">
                <Spline scene="https://prod.spline.design/IyXsuwBL5wOwbdoh/scene.splinecode" />
            </div>

            {/* 2. Clerk Auth Layer */}
            <div className="absolute inset-0 z-50 pointer-events-none">

                {/* We use Tailwind's transition classes to smoothly fade and slide it in */}
                <div 
                    className={`absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-auto transition-all duration-1000 ease-in-out ${
                        showAuth ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                    }`}
                >
                    {/* The SignIn component is always here, just invisible until the timer finishes */}
                    <SignIn />
                </div>

            </div>

        </main>
    );
}