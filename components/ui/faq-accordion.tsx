"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

export interface FaqAccordionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items?: FaqItem[];
  title?: string;
}

const DEFAULT_ITEMS: FaqItem[] = [
  {
    question: "What is Vengeance UI?",
    answer:
      "Vengeance UI is a high-performance, dark-mode first component library designed for the next generation of web applications.",
  },
  {
    question: "Can I use it with Tailwind CSS?",
    answer:
      "Yes! All components are built on top of Tailwind CSS and highly customizable using utility classes.",
  },
  {
    question: "Are the components accessible?",
    answer:
      "Accessibility is a core focus. We ensure proper ARIA attributes, keyboard navigation, and semantic HTML structure.",
  },
  {
    question: "Do I need to install a heavy npm package?",
    answer:
      "No. Vengeance UI provides a CLI that lets you copy and paste only the components you need directly into your project.",
  },
  {
    question: "Is it compatible with React and Next.js?",
    answer:
      "Absolutely. The library is built with React in mind and perfectly supports Next.js Server Components and client-side rendering.",
  },
];

export function FaqAccordion({
  items = DEFAULT_ITEMS,
  title = "Vengeance UI FAQs",
  className,
  ...props
}: FaqAccordionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div
      className={cn(
        "w-full max-w-6xl mx-auto py-10 relative font-sans",
        className
      )}
      {...props}
    >
      {title && (
        <h2 className="text-center font-bold text-3xl md:text-4xl mb-12 text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
      )}

      <ul className="w-full list-none p-0 flex flex-col">
        {items.map((item, index) => {
          const isActive = activeIndex === index;

          return (
            <li
              key={index}
              className={cn(
                "w-full transition-all duration-300",
                "border-b border-neutral-200 dark:border-neutral-800",
                "last:border-b-0"
              )}
            >
              <button
                onClick={() => toggleItem(index)}
                aria-expanded={isActive}
                className={cn(
                  "relative flex items-center w-full",
                  "min-h-[90px]",
                  "pl-24 pr-10 py-6",
                  "border-l-[8px]",
                  "transition-all duration-300",
                  "text-left outline-none",

                  isActive
                    ? "border-l-neutral-900 dark:border-l-white bg-neutral-100/40 dark:bg-neutral-900/40"
                    : "border-l-neutral-300 dark:border-l-neutral-700 hover:border-l-neutral-500 dark:hover:border-l-neutral-500 hover:bg-neutral-100/20 dark:hover:bg-neutral-900/20"
                )}
              >
            
                {/* Question */}
                <span
                  className={cn(
                    "flex-1 pr-16 text-xl md:text-2xl transition-colors duration-300",
                    isActive
                      ? "font-semibold text-neutral-900 dark:text-white"
                      : "font-medium text-neutral-600 dark:text-neutral-400"
                  )}
                >
                  {item.question}
                </span>

                {/* Chevron */}
                <span
                  className={cn(
                    "absolute right-8 block w-3 h-3 border-t-[3px] border-r-[3px] transition-transform duration-300",
                    isActive
                      ? "rotate-[-45deg] border-neutral-900 dark:border-white"
                      : "rotate-[135deg] border-neutral-400 dark:border-neutral-500"
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-in-out",
                  "border-l-[8px]",
                  isActive
                    ? "grid-rows-[1fr] border-l-neutral-900 dark:border-l-white bg-neutral-100/40 dark:bg-neutral-900/40"
                    : "grid-rows-[0fr] border-l-neutral-300 dark:border-l-neutral-700"
                )}
              >
                <div className="overflow-hidden">
                  <div className="pl-24 pr-12 pb-8 pt-2 text-lg leading-8 text-neutral-700 dark:text-neutral-300">
                    {item.answer}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default FaqAccordion;