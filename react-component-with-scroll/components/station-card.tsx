"use client"

import { cn } from "@/lib/utils"

interface StationCardProps {
  number: number
  title: string
  subtitle?: string
  variant?: "default" | "highlight"
  translateX: number
  translateY: number
  zIndex: number
  opacity: number
}

export function StationCard({
  number,
  title,
  subtitle,
  variant = "default",
  translateX,
  translateY,
  zIndex,
  opacity,
}: StationCardProps) {
  return (
    <div
      className="absolute"
      style={{
        transform: `translateX(${translateX}px) translateY(${translateY}px)`,
        opacity,
        zIndex,
        top: "50%",
        marginTop: "-70px",
        perspective: "600px",
        willChange: "transform, opacity",
        transition: "transform 0.15s ease-out, opacity 0.2s ease-out",
      }}
    >
      {/* 3D rotated card */}
      <div
        className={cn(
          "w-[180px] h-[130px] flex flex-col justify-between select-none pointer-events-none px-5 py-4 rounded-sm",
          variant === "default"
            ? "bg-white text-[#121212]"
            : "bg-[#4ADE50] text-[#121212]",
        )}
        style={{
          transform: "rotateY(-35deg)",
          transformOrigin: "left center",
          boxShadow:
            "8px 4px 24px rgba(0,0,0,0.4), -2px -1px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-baseline">
          <span className="font-sans text-[24px] font-black tracking-tighter italic leading-none">
            No
          </span>
          <span className="font-sans text-[24px] font-black tracking-tighter leading-none">
            {number}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-sans text-[10px] font-bold uppercase leading-tight tracking-wider">
            {title}
          </span>
          {subtitle && (
            <span className="font-sans text-[9px] font-semibold uppercase leading-tight tracking-wider opacity-50">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
