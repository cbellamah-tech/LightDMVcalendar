import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#112E5B", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 220, fontWeight: 800 }}>
        <span>L</span><span style={{ color: "#F10800" }}>D</span>
      </div>
    ),
    size,
  );
}
