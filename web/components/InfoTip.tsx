import { MUTED } from "@/lib/theme";
import { Tip } from "./Tip";

export function InfoTip({ text, subject }: { text: string; subject: string }) {
  return (
    <Tip
      ariaLabel={`What is ${subject}?`}
      text={text}
      buttonClassName="relative ml-2 -my-1 inline-flex h-6 w-6 items-center justify-center rounded-full align-middle before:absolute before:-inset-2"
      color={MUTED}
      maxWidth={280}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="7" cy="4.2" r="0.9" fill="currentColor" />
        <rect x="6.25" y="6" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
      </svg>
    </Tip>
  );
}
