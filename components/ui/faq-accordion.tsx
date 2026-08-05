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
    question: "What is DSAgent?",
    answer:
      "DSAgent is an autonomous AI-powered data science platform that analyzes CSV datasets, cleans data, generates visualizations, trains machine learning models, and creates detailed reports automatically.",
  },
  {
    question: "Do I need machine learning experience to use DSAgent?",
    answer:
      "No. Simply upload your dataset and DSAgent handles data cleaning, exploratory analysis, feature engineering, model training, evaluation, and report generation without requiring coding knowledge.",
  },
  {
    question: "What file formats does DSAgent support?",
    answer:
      "Currently, DSAgent supports CSV datasets. After uploading, the AI automatically extracts metadata, analyzes your data, and provides insights through interactive visualizations and machine learning pipelines.",
  },
  {
    question: "Can I build my own data science pipeline?",
    answer:
      "Yes. Along with the one-click autonomous workflow, DSAgent includes a drag-and-drop Pipeline Builder where you can customize every step, configure tools, and save reusable workflows.",
  },
  {
    question: "Can I download trained models and reports?",
    answer:
      "Absolutely. DSAgent automatically saves the best-performing machine learning model, lets you download it as a deployment-ready bundle, and generates PDF reports that can also be emailed directly to you.",
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