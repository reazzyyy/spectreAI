import { useEffect, useState } from 'react'
import { useApp } from '../app-context'
import { Shell } from '../components/shell'
import { ProjectMenu } from '../components/ProjectMenu'
import { Badge, Button, StateCard, type ScreenProps } from '../components/ui'
import { clientName, clients, formatWhen, matterName, visLabel, type Visibility } from '../data/projects'
import { highlight, searchProjects, tokenize, type SearchHit, type SearchParams } from '../lib/projectSearch'

type Load = { status: 'loading' | 'ready' | 'error'; items: SearchHit[]; total: number }

export function ProjectsScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const [query, setQuery] = useState(ctx.route.list.query)
  const [debounced, setDebounced] = useState(query)
  const [vis, setVis] = useState<'all' | Visibility>(ctx.route.list.visibility)
  const [status, setStatus] = useState<SearchParams['status']>('active')
  const [clientId, setClientId] = useState('')
  const [membership, setMembership] = useState<SearchParams['membership']>('all')
  const [sort, setSort] = useState<'updated' | 'name' | 'created'>('updated')
  const [limit, setLimit] = useState(20)
  const [retry, setRetry] = useState(0)
  const [load, setLoad] = useState<Load>({ status: 'loading', items: [], total: 0 })

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 200); return () => clearTimeout(t) }, [query])
  useEffect(() => { setLimit(20) }, [debounced, vis, status, clientId, membership, sort])
  useEffect(() => {
    let alive = true
    setLoad((s) => ({ ...s, status: 'loading' }))
    searchProjects(ctx.projects, { query: debounced, visibility: vis, status, clientId, membership, sort, offset: 0, limit, includeRelated: true }, { fail: ctx.sim.listError, slow: ctx.sim.slow })
      .then((r) => alive && setLoad({ status: 'ready', ...r }))
      .catch(() => alive && setLoad((s) => ({ ...s, status: 'error' })))
    return () => { alive = false }
  }, [ctx.projects, debounced, vis, status, clientId, membership, sort, limit, retry, ctx.sim.listError, ctx.sim.slow])

  const tokens = tokenize(debounced)
  const filtered = vis !== 'all' || status !== 'active' || clientId !== '' || membership !== 'all' || query !== ''
  const reset = () => { setQuery(''); setVis('all'); setStatus('active'); setClientId(''); setMembership('all') }

  return (
    <Shell screen="projects" go={go}>
      <div className="page projects-page">
        <div className="page-head compact">
          <div>
            <h1>Проекты</h1>
            <p className="muted" aria-live="polite">{load.status === 'ready' || load.items.length ? `${load.total} ${plural(load.total)}` : 'Загрузка…'}</p>
          </div>
          <Button variant="primary" icon="plus" onClick={() => ctx.openCreate({ visibility: vis === 'team' ? 'team' : 'personal' })}>Создать проект</Button>
        </div>

        <div className="toolbar">
          <div className="grow"><label className="visible-label" htmlFor="proj-search">Поиск проектов</label><input id="proj-search" className="search-field" type="search" placeholder="Название, клиент или дело" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <select aria-label="Сортировка" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated">Сначала обновлённые</option>
            <option value="name">По названию</option>
            <option value="created">По дате создания</option>
          </select>
        </div>
        <div className="filters">
          <div className="tabs compact" role="tablist">
            {([['all', 'Все'], ['personal', 'Личные'], ['team', 'Командные']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={vis === id} className={vis === id ? 'active' : ''} onClick={() => setVis(id)}>{label}</button>
            ))}
          </div>
          <select aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Активные</option>
            <option value="restricted">Ограниченные</option>
            <option value="archived">Архив</option>
            <option value="all">Любой статус</option>
          </select>
          <select aria-label="Клиент" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Любой клиент</option>
            <option value="__none">Без клиента</option>
            {(ctx.identity.orgId === 'vector' ? clients : []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Участие" value={membership} onChange={(e) => setMembership(e.target.value as typeof membership)}>
            <option value="all">Любое участие</option>
            <option value="owner">Я владелец</option>
            <option value="member">Я участник</option>
          </select>
        </div>

        {load.status === 'error' && (
          <StateCard icon="warning" tone="danger" title="Не удалось загрузить проекты" text="Проверьте соединение и повторите попытку.">
            <Button variant="primary" icon="retry" onClick={() => setRetry(retry + 1)}>Повторить</Button>
          </StateCard>
        )}
        {load.status === 'loading' && load.items.length === 0 && <div className="skeleton rows-skeleton" aria-label="Загрузка"><i /><i /><i /><i /></div>}
        {load.status === 'ready' && load.total === 0 && (
          ctx.projects.length === 0 ? (
            <StateCard icon="folder" title="У вас пока нет проектов" text="Создайте проект, чтобы хранить чаты, документы и черновики по одной задаче.">
              <Button variant="primary" icon="plus" onClick={() => ctx.openCreate()}>Создать проект</Button>
            </StateCard>
          ) : (
            <StateCard icon="search" title="Ничего не найдено" text="Измените запрос или сбросьте фильтры.">
              {filtered && <Button onClick={reset}>Сбросить фильтры</Button>}
              {query.trim() && <Button variant="primary" icon="plus" onClick={() => ctx.openCreate({ name: query.trim() })}>Создать проект «{query.trim().slice(0, 30)}»</Button>}
            </StateCard>
          )
        )}

        {load.items.length > 0 && (
          <div className="proj-table" role="list" aria-label="Проекты">
            {load.items.map(({ project: p, matchedIn }) => (
              <div key={p.id} className="proj-row" role="listitem">
                <button className="proj-main" onClick={() => ctx.openProject(p.id)}>
                  <span className="proj-name">
                    {highlight(p.name, tokens)}
                    {p.status === 'archived' && <Badge>Архив</Badge>}
                    {p.status === 'deleting' && <Badge tone="warning">Удаляется</Badge>}
                  </span>
                  <small title={`${clientName(p.clientId) ?? "Без клиента"}${p.matterId ? " · " + matterName(p.matterId) : ""}`}>
                    {p.clientId ? highlight(clientName(p.clientId) ?? '', tokens) : 'Без клиента'}
                    {p.matterId && <> · {highlight(matterName(p.matterId) ?? '', tokens)}</>}
                    {matchedIn && matchedIn !== 'name' && ` · совпадение: ${matchedIn === 'client' ? 'клиент' : 'дело'}`}
                  </small>
                </button>
                <span className="kind">{visLabel(p)}{p.role === 'viewer' && ' · просмотр'}</span>
                <span className="when">{formatWhen(p.updatedAt)}</span>
                <ProjectMenu project={p} onAction={(a) => ctx.manage(p, a)} />
              </div>
            ))}
          </div>
        )}
        {load.items.length > 0 && load.items.length < load.total && (
          <div className="more">
            <Button onClick={() => setLimit(limit + 20)} disabled={load.status === 'loading'}>{load.status === 'loading' ? 'Загрузка…' : `Показать ещё (${load.total - load.items.length})`}</Button>
          </div>
        )}
        <p className="muted proto-note">Демонстрация: поиск и фильтры выполняются локально по вымышленным данным.</p>
      </div>
    </Shell>
  )
}

function plural(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'проект'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'проекта'
  return 'проектов'
}
