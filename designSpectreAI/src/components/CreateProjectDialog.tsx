import { useState } from 'react'
import { clients, matters, PROTO_NOW, type Project, type Visibility } from '../data/projects'
import { norm } from '../lib/projectSearch'
import { Dialog } from './Dialog'
import { Button } from './ui'
import { useApp } from '../app-context'

type Option = { id: string; name: string }

function Picker({ label, options, value, onChange, placeholder }: { label: string; options: Option[]; value: string; onChange: (id: string) => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)
  const list = options.filter((o) => norm(o.name).includes(norm(q)))
  return (
    <div className="field">
      <label>{label} <span className="muted">· необязательно</span></label>
      {selected ? (
        <div className="picked">
          <span>{selected.name}</span>
          <button type="button" onClick={() => { onChange(''); setQ('') }}>Сбросить</button>
        </div>
      ) : (
        <div className="picker">
          <input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} aria-label={label} />
          {open && (
            <div className="picker-list" role="listbox">
              {list.length === 0 && <p className="muted">Ничего не найдено</p>}
              {list.map((o) => (
                <button type="button" role="option" aria-selected={false} key={o.id} onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setQ(''); setOpen(false) }}>{o.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CreateProjectDialog({ initialVisibility, initialName, failNext, onCreate, onClose }: {
  initialVisibility: Visibility
  initialName: string
  failNext: boolean
  onCreate: (p: Project) => void
  onClose: () => void
}) {
  const ctx = useApp()
  const tenantClients = ctx.identity.orgId === 'vector' ? clients : []
  const tenantMatters = ctx.identity.orgId === 'vector' ? matters : []
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility)
  const [clientId, setClientId] = useState('')
  const [matterId, setMatterId] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameError = touched && !name.trim() ? 'Укажите название проекта' : ''
  const matterOptions = tenantMatters.filter((m) => !clientId || !m.clientId || m.clientId === clientId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    await new Promise((r) => setTimeout(r, 600))
    if (failNext) {
      setBusy(false)
      setError('Не удалось создать проект. Введённые данные сохранены, попробуйте ещё раз.')
      return
    }
    const now = PROTO_NOW.toISOString()
    onCreate({ id: `new-${Date.now()}`, name: name.trim(), description: description.trim() || undefined, visibility, status: 'active', role: 'owner', clientId: clientId || undefined, matterId: matterId || undefined, memberCount: 1, createdAt: now, updatedAt: now })
  }

  return (
    <Dialog label="Создать проект" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-head"><h2>Создать проект</h2></div>
        <div className="dialog-body">
          <div className="field">
            <label htmlFor="pname">Название</label>
            <input id="pname" data-autofocus maxLength={160} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} aria-describedby={nameError ? 'pname-err' : undefined} />
            {nameError && <p id="pname-err" className="field-error">{nameError}</p>}
          </div>
          <div className="field">
            <label htmlFor="pdesc">Описание <span className="muted">· необязательно</span></label>
            <textarea id="pdesc" maxLength={2000} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>Тип</label>
            <div className="segmented-2" role="radiogroup" aria-label="Тип проекта">
              {([['personal', 'Личное'], ['team', 'Командное']] as const).map(([v, l]) => (
                <button type="button" key={v} role="radio" aria-checked={visibility === v} className={visibility === v ? 'active' : ''} onClick={() => setVisibility(v)}>{l}</button>
              ))}
            </div>
            <p className="help">{visibility === 'personal' ? 'Проект виден только вам.' : 'Доступ получат только добавленные участники. Администратор организации не получает доступ к содержимому автоматически.'}</p>
          </div>
          <Picker label="Клиент" options={tenantClients} value={clientId} onChange={(id) => { setClientId(id); const m = tenantMatters.find((x) => x.id === matterId); if (m?.clientId && id && m.clientId !== id) setMatterId('') }} placeholder="Найдите клиента" />
          <Picker label="Юридическое дело" options={matterOptions} value={matterId} onChange={(id) => { setMatterId(id); const m = tenantMatters.find((x) => x.id === id); if (m?.clientId && !clientId) setClientId(m.clientId) }} placeholder="Найдите дело" />
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-foot">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <button className="button primary" type="submit" disabled={busy}>{busy ? 'Создание…' : error ? 'Повторить' : 'Создать'}</button>
        </div>
      </form>
    </Dialog>
  )
}
