import type { AnchorHTMLAttributes, ReactNode } from "react"

export function NavigationLink({ onNavigate, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate: () => void }) {
  return <a {...props} onClick={(event) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return
    event.preventDefault()
    onNavigate()
  }} />
}

export type Screen = "home" | "projects" | "project" | "chat" | "analysis" | "review" | "draft" | "research" | "auth" | "members" | "organization" | "audit" | "notifications"
export type ScreenProps = {
  go: (screen: Screen, scenario?: string) => void
  scenario: string
  setScenario: (scenario: string) => void
}

const paths = {
  bell: <><path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9M9 20v-6h6v6" />
    </>
  ),
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  chat: <path d="M4 5h16v11H8l-4 4z" />,
  file: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5M9 13h6M9 17h6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13 7 4 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  down: <path d="m6 9 6 6 6-6" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M16 8V4H5v12h3" />
    </>
  ),
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  warning: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9v5M12 17v.1" />
    </>
  ),
  sparkle: (
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  retry: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2 5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2.5.6 4 2.2 4 5" />
    </>
  ),
}
export type IconName = keyof typeof paths

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function Button({
  children,
  icon,
  variant = "secondary",
  onClick,
  disabled,
  title,
}: {
  children?: ReactNode
  icon?: IconName
  variant?: "primary" | "secondary" | "ghost"
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      className={`button ${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info"
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: Tone
}) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function StateCard({
  icon,
  tone = "neutral",
  title,
  text,
  children,
}: {
  icon: IconName
  tone?: "neutral" | "danger" | "accent"
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="state-card">
      <span className={`state-icon ${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children && <div className="state-actions">{children}</div>}
    </div>
  )
}
