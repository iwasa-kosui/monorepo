import type { ReactNode } from "react";

interface OgImageProps {
  title: string;
  date: string;
  siteName?: string;
}

export function OgImage({
  title,
  date,
  siteName = "iwasa-kosui blog",
}: OgImageProps): ReactNode {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        background: "linear-gradient(135deg, #fef2f0 0%, #fde8e4 50%, #f9d4ce 100%)",
        fontFamily: "Noto Sans JP",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <h1
          style={{
            fontSize: "52px",
            fontWeight: 700,
            color: "#c73f33",
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          {title}
        </h1>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "24px",
              color: "#7a5c50",
            }}
          >
            {date}
          </span>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "#c73f33",
            }}
          >
            {siteName}
          </span>
        </div>
      </div>
    </div>
  );
}
