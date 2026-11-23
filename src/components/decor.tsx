/**
 * Decorative shapes: soft blobs, a squiggle and a 4-point spark. All are aria-hidden,
 * sit behind content (pointer-events: none) and only drift when motion is allowed.
 */

const BLOBS = [
  "M44.7,-58.6C57.3,-49.9,66.5,-35.7,71.2,-19.9C75.9,-4.1,76.1,13.3,69.6,27.6C63.1,41.9,49.9,53.1,35.2,60.9C20.5,68.7,4.3,73.1,-12.5,71.6C-29.3,70.1,-46.7,62.7,-58.6,50.1C-70.5,37.5,-76.9,19.7,-76.4,2.5C-75.9,-14.7,-68.5,-31.3,-56.7,-40.6C-44.9,-49.9,-28.7,-51.9,-13.9,-58.4C0.9,-64.9,32.1,-67.3,44.7,-58.6Z",
  "M39.5,-49.1C52.6,-41.4,65.2,-30.5,70.6,-16.1C76,-1.7,74.2,16.2,65.7,29.6C57.2,43,42,51.9,26.3,57.9C10.6,63.9,-5.6,67,-21.6,63.6C-37.6,60.2,-53.4,50.3,-62.3,36C-71.2,21.7,-73.2,3,-68.9,-13.3C-64.6,-29.6,-54,-43.5,-40.8,-51.1C-27.6,-58.7,-13.8,-60,0.3,-60.4C14.4,-60.8,26.4,-56.8,39.5,-49.1Z",
  "M51.2,-60.2C64.1,-49.4,70.6,-31.1,72.4,-13.3C74.2,4.5,71.3,21.8,62.3,35.4C53.3,49,38.2,58.9,21.6,64.7C5,70.5,-13.1,72.2,-28.6,66.4C-44.1,60.6,-57,47.3,-65.1,31.3C-73.2,15.3,-76.5,-3.4,-71.6,-19.6C-66.7,-35.8,-53.6,-49.5,-38.8,-59.9C-24,-70.3,-7.5,-77.4,8.8,-77.9C25.1,-78.4,38.3,-71,51.2,-60.2Z",
  "M36.9,-46.4C48.8,-40.6,59.8,-30.3,65.4,-17C71,-3.7,71.2,12.6,64.7,25.6C58.2,38.6,45,48.3,30.7,55.7C16.4,63.1,1,68.2,-15.4,67.2C-31.8,66.2,-49.2,59.1,-59.7,46.4C-70.2,33.7,-73.8,15.4,-71.3,-1.6C-68.8,-18.6,-60.2,-34.3,-47.6,-40.2C-35,-46.1,-18.5,-42.2,-2.6,-39C13.3,-35.8,25,-52.2,36.9,-46.4Z",
];

export function Blob({
  variant = 0,
  className = "",
  tone = "hi",
  outline = false,
  float = false,
}: {
  variant?: 0 | 1 | 2 | 3;
  className?: string;
  tone?: "hi" | "sunk" | "fg" | "inv-fg" | "line";
  outline?: boolean;
  float?: boolean;
}) {
  const color = `var(--${tone === "inv-fg" ? "inv-fg" : tone})`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className={`pointer-events-none absolute select-none ${float ? "blob-float" : ""} ${className}`}
    >
      <path
        d={BLOBS[variant]}
        transform="translate(100 100)"
        fill={outline ? "none" : color}
        stroke={outline ? color : "none"}
        strokeWidth={outline ? 1.4 : 0}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Squiggle({ className = "", tone = "fg" }: { className?: string; tone?: "fg" | "hi" | "muted" | "inv-fg" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 24" fill="none" className={`pointer-events-none absolute ${className}`}>
      <path
        d="M2 12c8-10 16-10 24 0s16 10 24 0 16-10 24 0 16 10 24 0 16-10 20-4"
        stroke={`var(--${tone})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Spark({ className = "", tone = "fg" }: { className?: string; tone?: "fg" | "hi" | "inv-fg" | "muted" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`pointer-events-none absolute ${className}`}>
      <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill={`var(--${tone})`} />
    </svg>
  );
}

/** Soft blobs + dots behind auth and onboarding pages. */
export function PageBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="dot-grid absolute inset-0 opacity-60" />
      <Blob variant={0} float className="-right-40 -top-40 size-[520px] opacity-80" />
      <Blob variant={2} tone="sunk" float className="-bottom-48 -left-40 size-[560px]" />
      <Blob variant={1} outline tone="line" className="bottom-10 right-[8%] size-[260px]" />
      <Spark tone="fg" className="left-[12%] top-[18%] size-4 opacity-70" />
      <Spark tone="hi" className="right-[22%] top-[62%] size-6" />
    </div>
  );
}
