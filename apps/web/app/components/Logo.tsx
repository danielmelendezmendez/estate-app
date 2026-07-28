/**
 * The brand mark: three dots growing in size along a rising diagonal —
 * deliberately the same visual idea as CertaintyBar's confidence dots
 * (see app/review/CertaintyBar.tsx), just turned into a badge instead of
 * an inline indicator. "Clarity increasing" as a mark, not a generic
 * icon bolted onto a name after the fact.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#43467E" />
      <circle cx="9" cy="21" r="2.5" fill="white" opacity="0.55" />
      <circle cx="16" cy="16" r="3.5" fill="white" opacity="0.8" />
      <circle cx="24" cy="10" r="4.5" fill="white" />
    </svg>
  );
}
