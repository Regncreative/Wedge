/** The app mark: three stacked shelves in the tab colors. */
export function StashMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1.8" fill="#8d97ff" />
      <rect x="3" y="10" width="18" height="4" rx="1.8" fill="#43d8aa" />
      <rect x="3" y="16" width="12" height="4" rx="1.8" fill="#ff7fac" />
    </svg>
  )
}
