import type { SVGProps } from "react";

export type IconName = "award" | "cards" | "chevron" | "city" | "close" | "dice" | "hand" | "helmet" | "home" | "minus" | "plus" | "road" | "ship" | "spark" | "target" | "trade" | "zoomIn" | "zoomOut";

export function Icon({ name, ...props }: { readonly name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g {...common}>
        {name === "dice" && <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r=".8" fill="currentColor" /><circle cx="16" cy="8" r=".8" fill="currentColor" /><circle cx="12" cy="12" r=".8" fill="currentColor" /><circle cx="8" cy="16" r=".8" fill="currentColor" /><circle cx="16" cy="16" r=".8" fill="currentColor" /></>}
        {name === "road" && <><path d="M7 21 10 3h4l3 18" /><path d="M11.5 7h1M11 12h2M10.5 17h3" /></>}
        {name === "home" && <><path d="m3 11 9-8 9 8" /><path d="M5.5 9.5V21h13V9.5M10 21v-6h4v6" /></>}
        {name === "city" && <><path d="M3 21h18M5 21V8l5-3v16M10 21V3l9 4v14" /><path d="M7 11h1M7 15h1M13 8h2M13 12h2M13 16h2" /></>}
        {name === "cards" && <><rect x="5" y="4" width="13" height="16" rx="2" transform="rotate(-8 11.5 12)" /><path d="m10 9 2-2 2 2-2 3z" /></>}
        {name === "trade" && <><path d="M4 7h14l-3-3M20 17H6l3 3" /></>}
        {name === "ship" && <><path d="M3 16h18l-3 4H7zM12 4v12M12 5l6 7h-6M11 7l-4 5h4" /></>}
        {name === "helmet" && <><path d="M5 17v-5a7 7 0 0 1 14 0v5M3 17h18M9 5v12" /></>}
        {name === "award" && <><circle cx="12" cy="9" r="6" /><path d="m8 14-2 7 6-3 6 3-2-7" /></>}
        {name === "spark" && <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>}
        {name === "target" && <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>}
        {name === "hand" && <path d="M7 11V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-1-7-4l-2-3a2 2 0 0 1 3-2z" />}
        {name === "plus" && <path d="M12 5v14M5 12h14" />}
        {name === "minus" && <path d="M5 12h14" />}
        {name === "zoomIn" && <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M10 7v6M7 10h6" /></>}
        {name === "zoomOut" && <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6" /></>}
        {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
        {name === "chevron" && <path d="m9 5 7 7-7 7" />}
      </g>
    </svg>
  );
}
