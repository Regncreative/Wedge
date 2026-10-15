import { useId } from 'react'

/** The Wedge mark: three shelf tabs coming out of the right edge (assets/brand/wedge-icon.svg). */
export function WedgeMark({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <clipPath id={`${id}tile`}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2c3a" />
          <stop offset="1" stopColor="#14151c" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}tile)`}>
        <rect width="64" height="64" fill={`url(#${id}bg)`} />
        <rect x="23" y="12" width="51" height="11" rx="5.5" fill="#8d97ff" />
        <circle cx="29" cy="17.5" r="2.3" fill="#14151c" fillOpacity=".26" />
        <rect x="11" y="26.5" width="63" height="11" rx="5.5" fill="#ff7fac" />
        <circle cx="17" cy="32" r="2.3" fill="#14151c" fillOpacity=".26" />
        <rect x="27" y="41" width="47" height="11" rx="5.5" fill="#f6bb45" />
        <circle cx="33" cy="46.5" r="2.3" fill="#14151c" fillOpacity=".26" />
      </g>
      <rect
        x=".5"
        y=".5"
        width="63"
        height="63"
        rx="14.5"
        fill="none"
        stroke="#fff"
        strokeOpacity=".08"
      />
    </svg>
  )
}
