export type Visibility = 'personal' | 'team'
export type ProjectStatus = 'active' | 'archived' | 'deleting' | 'restricted'
export type Role = 'owner' | 'editor' | 'viewer'

export type Project = {
  id: string
  organizationId?: string
  ownerUserId?: string
  previousStatus?: 'active' | 'archived'
  name: string
  description?: string
  visibility: Visibility
  status: ProjectStatus
  role: Role
  clientId?: string
  matterId?: string
  memberCount: number
  createdAt: string
  updatedAt: string
}
export type Client = { id: string; name: string }
export type Matter = { id: string; name: string; clientId?: string }

// Фиксированное «текущее время» прототипа, чтобы даты в демо не зависели от часов устройства.
export const PROTO_NOW = new Date('2026-10-27T12:00:00')

export const clients: Client[] = [
  { id: 'c1', name: 'ООО «Альтаир Девелопмент»' },
  { id: 'c2', name: 'АО «Меридиан»' },
  { id: 'c3', name: 'ООО «Линия»' },
  { id: 'c4', name: 'ООО «Север-Проект»' },
  { id: 'c5', name: 'АО «Вектор Логистик»' },
  { id: 'c6', name: 'ООО «Ладога Трейд»' },
  { id: 'c7', name: 'АО «Новатех Софт»' },
  { id: 'c8', name: 'ООО «Берег»' },
  { id: 'c9', name: 'ЗАО «Каскад»' },
  { id: 'c10', name: 'ООО «Орион Фарм»' },
]
const shorts = ['Альтаир', 'Меридиан', 'Линия', 'Север-Проект', 'Вектор Логистик', 'Ладога', 'Новатех', 'Берег', 'Каскад', 'Орион']

export const matters: Matter[] = [
  { id: 'm1', name: 'Поставка по договору № ДП-14 (демо)', clientId: 'c1' },
  { id: 'm2', name: 'Претензия по срокам поставки (демо)', clientId: 'c2' },
  { id: 'm3', name: 'Реструктуризация группы (демо)', clientId: 'c3' },
  { id: 'm4', name: 'Субаренда склада (демо)', clientId: 'c4' },
  { id: 'm5', name: 'Перевозка грузов (демо)', clientId: 'c5' },
  { id: 'm6', name: 'Лицензионное соглашение (демо)', clientId: 'c7' },
  { id: 'm7', name: 'Взыскание задолженности (демо)', clientId: 'c6' },
  { id: 'm8', name: 'Трудовой спор № 7 (демо)', clientId: 'c8' },
  { id: 'm9', name: 'Проверка контрагента (демо)', clientId: 'c9' },
  { id: 'm10', name: 'Регистрация препарата (демо)', clientId: 'c10' },
  { id: 'm11', name: 'Внутренняя политика закупок (демо)' },
  { id: 'm12', name: 'Консультация по персональным данным (демо)' },
]

const hours = (n: number) => new Date(PROTO_NOW.getTime() - n * 3600 * 1000).toISOString()

const handmade: Project[] = [
  { id: 'sever', name: 'Проект Север', description: 'Договорная работа по поставке.', visibility: 'team', status: 'active', role: 'owner', clientId: 'c1', matterId: 'm1', memberCount: 4, createdAt: hours(24 * 21), updatedAt: '2026-10-27T11:42:00' },
  { id: 'spor', name: 'Спор о поставке', visibility: 'team', status: 'active', role: 'editor', clientId: 'c2', matterId: 'm2', memberCount: 3, createdAt: hours(24 * 30), updatedAt: '2026-10-26T17:08:00' },
  { id: 'korp', name: 'Корпоративная реструктуризация', visibility: 'team', status: 'active', role: 'owner', clientId: 'c3', matterId: 'm3', memberCount: 6, createdAt: hours(24 * 60), updatedAt: '2026-10-24T10:15:00' },
]

const topics = ['Поставка', 'Аренда помещений', 'Подряд', 'Лицензионный договор', 'Реструктуризация долга', 'Взыскание задолженности', 'Корпоративный договор', 'Трудовой спор', 'Банкротство', 'Проверка контрагента', 'Налоговый спор', 'Сделка M&A']

function generate(): Project[] {
  const list: Project[] = []
  for (let i = 0; i < 54; i++) {
    const ci = (i * 7 + 3) % 10
    const hasClient = i % 5 !== 3
    const personal = i % 3 === 0
    const matter = hasClient && i % 3 === 1 ? matters.find((m) => m.clientId === clients[ci].id) : undefined
    const updated = new Date(PROTO_NOW.getTime() - (30 + i * 17) * 3600 * 1000)
    list.push({
      id: `p-${i + 1}`,
      name: hasClient ? `${topics[i % 12]} — ${shorts[ci]}` : `${topics[i % 12]} (внутренний)`,
      visibility: personal ? 'personal' : 'team',
      status: i === 17 ? 'deleting' : i % 11 === 5 ? 'archived' : 'active',
      role: personal ? 'owner' : i % 7 === 2 ? 'viewer' : i % 4 === 1 ? 'editor' : 'owner',
      clientId: hasClient ? clients[ci].id : undefined,
      matterId: matter?.id,
      memberCount: personal ? 1 : 2 + (i % 6),
      createdAt: new Date(updated.getTime() - (10 + (i % 9)) * 24 * 3600 * 1000).toISOString(),
      updatedAt: updated.toISOString(),
    })
  }
  return list
}

export const seedProjects: Project[] = [...handmade, ...generate()]

export const clientName = (id?: string) => clients.find((c) => c.id === id)?.name
export const matterName = (id?: string) => matters.find((m) => m.id === id)?.name
export const visLabel = (p: Project) => (p.visibility === 'personal' ? 'Личное' : `Команда · ${p.memberCount}`)

export function formatWhen(iso: string) {
  const d = new Date(iso)
  const day = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000)
  const diff = day(PROTO_NOW) - day(d)
  if (diff === 0) return `Сегодня, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== PROTO_NOW.getFullYear() ? { year: 'numeric' } : {}) })
}
