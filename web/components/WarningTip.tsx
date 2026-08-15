import { GOLD } from "@/lib/theme";
import { Tip } from "./Tip";

export function WarningTip({ text, subject }: { text: string; subject: string }) {
  return (
    <Tip
      ariaLabel={`Data availability: ${subject}`}
      text={text}
      buttonClassName="ml-1.5 inline-flex h-4 w-4 items-center justify-center"
      color={GOLD}
      maxWidth={280}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M7 1.2 13.2 12.3 H0.8 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <rect x="6.3" y="5" width="1.4" height="4" rx="0.7" fill="currentColor" />
        <circle cx="7" cy="10.6" r="0.85" fill="currentColor" />
      </svg>
    </Tip>
  );
}
