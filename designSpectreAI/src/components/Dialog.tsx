import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export function Dialog({ label, onClose, children, variant = 'modal' }: { label: string; onClose: () => void; children: ReactNode; variant?: 'modal' | 'palette' | 'wide' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('input,textarea,select,button:not(:disabled)')
    el?.focus()
    return () => prev?.focus?.()
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
    if (e.key === 'Tab' && ref.current) {
      const f = [...ref.current.querySelectorAll<HTMLElement>('input,textarea,select,button:not(:disabled),[tabindex="0"]')]
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
  return (
    <div className={`overlay ${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={`dialog ${variant}`} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  )
}
