import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app-context'
import { clientName, formatWhen, matterName, visLabel } from '../data/projects'
import { highlight, searchProjects, tokenize, type SearchHit } from '../lib/projectSearch'
import { Dialog } from './Dialog'
import { Badge, Button, Icon } from './ui'

type Filter = 'all' | 'personal' | 'team'
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'personal', label: 'Личные' },
  { id: 'team', label: 'Командные' },
]

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const ctx = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'error' | 'ready'; items: SearchHit[]; total: number }>({ status: 'idle', items: [], total: 0 })
  const [active, setActive] = useState(0)
  const [retry, setRetry] = useState(0)
  const seq = useRef(0)
  const q = query.trim()
  const tokens = tokenize(q)

  useEffect(() => {
    if (!q) { setState({ status: 'idle', items: [], total: 0 }); return }
    const id = ++seq.current
    setState((s) => ({ ...s, status: 'loading' }))
    const t = setTimeout(() => {
      searchProjects(ctx.projects, { query: q, visibility: filter, status: 'all', clientId: '', membership: 'all', sort: 'relevance', offset: 0, limit: 8, includeRelated: true }, { fail: ctx.sim.searchError, slow: ctx.sim.slow })
        .then((r) => id === seq.current && setState({ status: 'ready', ...r }))
        .catch(() => id === seq.current && setState((s) => ({ ...s, status: 'error' })))
    }, 200)
    return () => clearTimeout(t)
  }, [q, filter, retry, ctx.projects, ctx.sim.searchError, ctx.sim.slow])
  useEffect(() => setActive(0), [q, filter, state.items])

  const recents: SearchHit[] = ctx.recents
    .filter((p) => filter === 'all' || p.visibility === filter)
    .map((project) => ({ project, matchedIn: null }))
  const items = q ? state.items : recents
  const open = (id: string) => { onClose(); ctx.openProject(id) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); open(items[active].project.id) }
  }
  const showSkeleton = q && state.status === 'loading' && state.items.length === 0
  const showEmpty = q && state.status === 'ready' && state.items.length === 0

  return (
    <Dialog label="Поиск проектов" onClose={onClose} variant="palette">
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input
          data-autofocus
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `opt-${active}` : undefined}
          aria-label="Название проекта, клиента или дела"
          placeholder="Найти проект по названию, клиенту или делу"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-filters">
        {filters.map((f) => (
          <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      <div className="palette-body">
        {!q && <p className="palette-label">Недавние</p>}
        {q && state.status === 'ready' && <p className="palette-label">Найдено: {state.total}</p>}
        <div id="palette-list" role="listbox" aria-label="Результаты">
          {items.map((h, i) => (
            <button key={h.project.id} id={`opt-${i}`} role="option" aria-selected={i === active} className={`palette-item ${i === active ? 'active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => open(h.project.id)}>
              <span className="palette-main">
                <strong title={h.project.name}>{highlight(h.project.name, tokens)}</strong>
                <small title={`${clientName(h.project.clientId) ?? "Без клиента"}${h.project.matterId ? " · " + matterName(h.project.matterId) : ""}`}>
                  {h.project.clientId ? highlight(clientName(h.project.clientId) ?? '', tokens) : 'Без клиента'}
                  {h.project.matterId && <> · {highlight(matterName(h.project.matterId) ?? '', tokens)}</>}
                </small>
              </span>
              {h.project.status === 'archived' && <Badge>Архив</Badge>}
              {h.project.status === 'deleting' && <Badge tone="warning">Удаляется</Badge>}
              <span className="kind">{visLabel(h.project)}</span>
              <span className="when">{formatWhen(h.project.updatedAt)}</span>
            </button>
          ))}
        </div>
        {showSkeleton && <div className="skeleton palette-skeleton"><i /><i /><i /></div>}
        {showEmpty && (
          <div className="palette-empty">
            <p><strong>Нет проектов по запросу «{q}»</strong></p>
            <Button variant="primary" icon="plus" onClick={() => { onClose(); ctx.openCreate({ name: q }) }}>Создать проект «{q.length > 30 ? q.slice(0, 30) + '…' : q}»</Button>
          </div>
        )}
        {q && state.status === 'error' && (
          <div className="palette-empty">
            <p><strong>Не удалось выполнить поиск</strong></p>
            <Button icon="retry" onClick={() => setRetry(retry + 1)}>Повторить</Button>
          </div>
        )}
        {!q && recents.length === 0 && <p className="palette-hint">Проектов пока нет. Создайте первый.</p>}
        <span className="sr-only" aria-live="polite">{state.status === 'ready' ? `Найдено проектов: ${state.total}` : ''}</span>
      </div>
      <div className="palette-footer">
        <span className="muted">↑↓ выбор · Enter открыть</span>
        <span className="spacer" />
        {q && state.status === 'ready' && state.total > 0 && <Button variant="ghost" onClick={() => { onClose(); ctx.openList({ query: q, visibility: filter }) }}>Все результаты ({state.total})</Button>}
        <Button variant="ghost" icon="plus" onClick={() => { onClose(); ctx.openCreate({ name: q }) }}>Создать проект</Button>
      </div>
    </Dialog>
  )
}
