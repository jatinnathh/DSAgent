"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

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
  title,
  className,
  ...props
}: FaqAccordionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div
      className={cn("w-full relative font-sans", className)}
      {...props}
    >
      {title && (
        <h2 className="text-center font-bold text-3xl md:text-4xl mb-12 text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
      )}

      <ul className="w-full list-none p-0 m-0 flex flex-col">
        {items.map((item, index) => {
          const isActive = activeIndex === index;

          return (
            <li
              key={index}
              className={cn(
                "w-full transition-all duration-300",
                "border-b border-white/[0.07]",
                "last:border-b-0"
              )}
            >
              <button
                onClick={() => toggleItem(index)}
                aria-expanded={isActive}
                style={{
                  paddingLeft: "32px",
                  paddingRight: "28px",
                  paddingTop: "24px",
                  paddingBottom: "24px",
                }}
                className={cn(
                  "relative flex items-center justify-between w-full cursor-pointer",
                  "border-l-[4px]",
                  "transition-all duration-300",
                  "text-left outline-none",
                  isActive
                    ? "border-l-white bg-white/[0.04]"
                    : "border-l-transparent hover:border-l-white/40 hover:bg-white/[0.02]"
                )}
              >
                {/* Question */}
                <span
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: "clamp(17px, 1.6vw, 20px)",
                    letterSpacing: "-0.015em",
                    lineHeight: 1.4,
                  }}
                  className={cn(
                    "flex-1 pr-6 transition-colors duration-300",
                    isActive
                      ? "font-medium text-white"
                      : "font-normal text-white/70 hover:text-white"
                  )}
                >
                  {item.question}
                </span>

                {/* Chevron */}
                <ChevronDown
                  className={cn(
                    "w-5 h-5 shrink-0 transition-transform duration-300 text-white/40",
                    isActive && "rotate-180 text-white"
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-in-out",
                  "border-l-[4px]",
                  isActive
                    ? "grid-rows-[1fr] border-l-white bg-white/[0.04]"
                    : "grid-rows-[0fr] border-l-transparent"
                )}
              >
                <div className="overflow-hidden">
                  <div
                    style={{
                      paddingLeft: "32px",
                      paddingRight: "36px",
                      paddingTop: "4px",
                      paddingBottom: "26px",
                      fontFamily: "var(--sans)",
                      fontSize: 15,
                      lineHeight: 1.75,
                      color: "rgba(255, 255, 255, 0.45)",
                    }}
                  >
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