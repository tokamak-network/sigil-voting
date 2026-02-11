"use client"

import React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { StationCard } from "./station-card"
import { ScrollProgress } from "./scroll-progress"

const stations = [
  { number: 2, title: "DESIGN", subtitle: "FUNDAMENTALS" },
  { number: 3, title: "RULES OF SUCCESSFUL", subtitle: "DESIGN" },
  { number: 4, title: "VISUAL", subtitle: "EXPERIENCE" },
  {
    number: 5,
    title: "PERSONAL",
    subtitle: "BRANDING",
    variant: "highlight" as const,
  },
  { number: 6, title: "TILDA", subtitle: "" },
  { number: 7, title: "CREATIVE", subtitle: "SPRINT" },
  { number: 8, title: "MARKETING", subtitle: "& ADVERTISING" },
  { number: 9, title: "CLIENT", subtitle: "ACQUISITION" },
  { number: 10, title: "NETWORKING", subtitle: "" },
  { number: 11, title: "FINANCE", subtitle: "& ANALYTICS" },
  { number: 12, title: "PORTFOLIO", subtitle: "BUILDING" },
  { number: 13, title: "PRESENTATION", subtitle: "SKILLS" },
]

const CARD_WIDTH = 180
const CARD_GAP = 16
const CARD_STEP = CARD_WIDTH * 0.62 + CARD_GAP

export function StationsScroll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [offset, setOffset] = useState(0)

  // Pointer drag state
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(0)

  // Momentum animation
  const velocityRef = useRef(0)
  const lastPointerX = useRef(0)
  const lastPointerTime = useRef(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    window.addEventListener("resize", updateWidth)
    return () => window.removeEventListener("resize", updateWidth)
  }, [])

  const totalWidth = stations.length * CARD_STEP
  const minOffset = -(totalWidth - containerWidth / 2 - CARD_STEP / 2)
  const maxOffset = containerWidth / 2 - CARD_STEP / 2

  const clamp = useCallback(
    (val: number) => Math.max(minOffset, Math.min(maxOffset, val)),
    [minOffset, maxOffset],
  )

  // Momentum decay animation
  const startMomentum = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const decay = () => {
      velocityRef.current *= 0.94
      if (Math.abs(velocityRef.current) < 0.3) {
        velocityRef.current = 0
        return
      }
      setOffset((prev) => clamp(prev + velocityRef.current))
      rafRef.current = requestAnimationFrame(decay)
    }
    rafRef.current = requestAnimationFrame(decay)
  }, [clamp])

  // Pointer events for drag
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      cancelAnimationFrame(rafRef.current)
      velocityRef.current = 0
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartOffset.current = offset
      lastPointerX.current = e.clientX
      lastPointerTime.current = Date.now()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [offset],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStartX.current
      const now = Date.now()
      const dt = now - lastPointerTime.current
      if (dt > 0) {
        velocityRef.current = (e.clientX - lastPointerX.current) / dt * 16
      }
      lastPointerX.current = e.clientX
      lastPointerTime.current = now
      setOffset(clamp(dragStartOffset.current + dx))
    },
    [clamp],
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    startMomentum()
  }, [startMomentum])

  // Wheel event for scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaX !== 0 ? -e.deltaX : -e.deltaY
      setOffset((prev) => clamp(prev + delta * 0.8))
    },
    [clamp],
  )

  const getCardTransforms = useCallback(
    (index: number) => {
      const cardX = index * CARD_STEP + offset

      // Alternating vertical stagger like the reference image
      const staggerPattern = [10, 4, -2, -6, -2, 4, 8, 12, 6, 2, 8, 0]
      const translateY = staggerPattern[index % staggerPattern.length]

      // Fade cards that go off-screen
      const leftEdge = cardX
      const rightEdge = cardX + CARD_WIDTH
      let opacity = 1
      if (rightEdge < -40) opacity = 0
      else if (leftEdge < 0) opacity = Math.max(0.2, leftEdge / 40 + 1)
      if (leftEdge > containerWidth + 40) opacity = 0
      else if (rightEdge > containerWidth)
        opacity = Math.min(opacity, Math.max(0.2, (containerWidth + 40 - rightEdge) / 80))

      // Z-index: earlier cards on top (overlapping to the right)
      const zIndex = stations.length - index

      return { translateX: cardX, translateY, zIndex, opacity }
    },
    [containerWidth, offset],
  )

  const progress = containerWidth
    ? Math.max(
        0,
        Math.min(
          100,
          ((maxOffset - offset) / (maxOffset - minOffset)) * 100,
        ),
      )
    : 0

  return (
    <section className="w-full max-w-[1000px] mx-auto flex flex-col items-center gap-10 py-12 px-4">
      {/* Title */}
      <div className="w-full text-left pl-2">
        <h2 className="font-sans text-white text-4xl md:text-5xl font-black tracking-tight text-balance">
          <span className="italic">18</span>
          <span className="ml-3">STATIONS:</span>
        </h2>
      </div>

      {/* 3D Card Carousel */}
      <div
        ref={containerRef}
        className="w-full relative overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ height: "220px" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* Fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-[200] bg-gradient-to-r from-[#121212] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-[200] bg-gradient-to-l from-[#121212] to-transparent" />

        {stations.map((station, index) => {
          const t = getCardTransforms(index)
          return (
            <StationCard
              key={station.number}
              number={station.number}
              title={station.title}
              subtitle={station.subtitle}
              variant={station.variant || "default"}
              translateX={t.translateX}
              translateY={t.translateY}
              zIndex={t.zIndex}
              opacity={t.opacity}
            />
          )
        })}
      </div>

      {/* Progress bar */}
      <ScrollProgress progress={progress} />
    </section>
  )
}
