"use client"

import { useSearchParams } from "next/navigation"

export default function ViewChart() {
  const params = useSearchParams()
  const src = params.get("src")

  if (!src) {
    return (
      <div style={{padding:40}}>
        No image provided
      </div>
    )
  }

  return (
    <div
      style={{
        background: "#000",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <img
        src={src}
        style={{
          maxWidth: "95%",
          maxHeight: "95%",
        }}
      />
    </div>
  )
}