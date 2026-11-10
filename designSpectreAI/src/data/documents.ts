import type { Tone } from '../components/ui'

export type Doc = { name: string; status: string; tone: Tone; scenario: string }

// Материалы демонстрационного проекта «Проект Север».
export const docs: Doc[] = [
  { name: 'Договор_поставки_демо.docx', status: 'Готов к анализу', tone: 'success', scenario: 'default' },
  { name: 'Условия_демо.txt', status: 'Загружен', tone: 'info', scenario: 'uploaded' },
  { name: 'Приложение_1_демо.pdf', status: 'Обрабатывается', tone: 'warning', scenario: 'processing' },
  { name: 'Приложение_2_демо.pdf', status: 'Ошибка', tone: 'danger', scenario: 'error' },
  { name: 'Конфиденциальный документ', status: 'Нет доступа', tone: 'neutral', scenario: 'forbidden' },
]

export const chats = [{ id: 'ch1', title: 'Риски условия о неустойке', when: 'Сегодня, 11:36', preview: 'Проверь условие о неустойке в договоре поставки…' }]
export const drafts = [{ id: 'd1', title: 'Проект ответа на претензию', when: 'Сегодня, 10:42', version: 'версия 3' }]

// Документы принадлежат проектам: у каждого проекта собственный список.
const sporDocs: Doc[] = [
  { name: 'Претензия_о_сроках_демо.docx', status: 'Готов к анализу', tone: 'success', scenario: 'default' },
  { name: 'Акт_сверки_демо.pdf', status: 'Загружен', tone: 'info', scenario: 'uploaded' },
]
export const docsFor = (projectId?: string): Doc[] => (projectId === 'sever' ? docs : projectId === 'spor' ? sporDocs : [])

export const hasDemoContent = (projectId?: string) => projectId === 'sever'

// Недавно открытые документы. Документ всегда принадлежит проекту (projectId обязателен).
export type RecentDoc = { name: string; projectId: string; action: string; at: string; target: 'review' | 'analysis'; scenario?: string }
export const recentDocs: RecentDoc[] = [
  { name: 'Договор_поставки_демо.docx', projectId: 'sever', action: 'Правки нейросети', at: '2026-10-27T11:48:00', target: 'review' },
  { name: 'Претензия_о_сроках_демо.docx', projectId: 'spor', action: 'Анализ рисков', at: '2026-10-27T09:30:00', target: 'analysis' },
  { name: 'Условия_демо.txt', projectId: 'sever', action: 'Загружен', at: '2026-10-26T10:05:00', target: 'analysis', scenario: 'uploaded' },
]
