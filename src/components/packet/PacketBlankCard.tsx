import * as React from "react";

export interface PacketBlankCardProps {
  width?: number;   // in CSS pixels
  height?: number;  // in CSS pixels
  padding?: number; // in CSS pixels
}

export default function PacketBlankCard({ width = 600, height = 360, padding = 24 }: PacketBlankCardProps) {
  return (
    <div
      className="bg-white rounded-2xl shadow-lg border border-slate-200"
      style={{
        width,
        height,
        padding,
        backgroundColor: '#ffffff',
        border: '1px solid rgb(226 232 240)',
        borderRadius: '1rem',
        boxShadow: '0 12px 30px rgba(8,15,30,0.08)',
        boxSizing: 'border-box',
      }}
    />
  );
}