import * as React from "react";

export interface PacketWhiteBoardSVGProps {
  width?: number;   // CSS px
  height?: number;  // CSS px
  radius?: number;  // corner radius in px
  borderColor?: string;
  shadow?: boolean;
}

export default function PacketWhiteBoardSVG({
  width = 214,
  height = 128,
  radius = 16,
  borderColor = "rgba(226,232,240,1)",
  shadow = true,
}: PacketWhiteBoardSVGProps) {
  // Ensure stroke sits inside pixel grid for crisp edges
  const strokeWidth = 1.5;
  const w = Math.max(0, width - strokeWidth);
  const h = Math.max(0, height - strokeWidth);

  return (
    <div
      style={{
        width,
        height,
        boxShadow: shadow ? "0 12px 30px rgba(8,15,30,0.08)" : undefined,
        borderRadius: `${radius}px`,
        // Create stacking context to keep shadow crisp
        transform: "translateZ(0)",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", shapeRendering: "geometricPrecision" as any }}
      >
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill="#ffffff"
          stroke={borderColor}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}