import { createElement, Fragment, type ReactNode } from 'react'
import { clientName, matterName, type Project, type Visibility } from '../data/projects'

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
export const tokenize = (q: string) => norm(q).replace(/[«»"“”]/g, ' ').split(/\s+/).filter(Boolean)

export type SearchParams = {
  query: string
  visibility: 'all' | Visibility
  status: 'active' | 'archived' | 'restricted' | 'all'
  clientId: string
  membership: 'all' | 'owner' | 'member'
  sort: 'relevance' | 'updated' | 'name' | 'created'
  offset: number
  limit: number
  includeRelated: boolean
}
export type SearchHit = { project: Project; matchedIn: 'name' | 'client' | 'matter' | null }
export type SearchResult = { items: SearchHit[]; total: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Контракт повторяет GET /api/v1/workspaces; в прототипе выполняется в памяти. */
export async function searchProjects(all: Project[], p: SearchParams, sim: { fail?: boolean; slow?: boolean }): Promise<SearchResult> {
  await wait(sim.slow ? 1400 : 150)
  if (sim.fail) throw new Error('search_failed')
  const tokens = tokenize(p.query)
  const scored: { hit: SearchHit; score: number }[] = []
  for (const project of all) {
    if (p.visibility !== 'all' && project.visibility !== p.visibility) continue
    if (p.status === 'active' && project.status !== 'active') continue
    if (p.status === 'archived' && project.status !== 'archived') continue
    if (p.status === 'restricted' && project.status !== 'restricted') continue
    if (p.membership === 'owner' && project.role !== 'owner') continue
    if (p.membership === 'member' && project.role === 'owner') continue
    if (p.clientId === '__none' && project.clientId) continue
    if (p.clientId && p.clientId !== '__none' && project.clientId !== p.clientId) continue
    let matchedIn: SearchHit['matchedIn'] = null
    let score = 0
    if (tokens.length) {
      const name = norm(project.name)
      const client = norm(clientName(project.clientId) ?? '')
      const matter = norm(matterName(project.matterId) ?? '')
      const inName = tokens.every((t) => name.includes(t))
      if (inName) {
        matchedIn = 'name'
        score = name.startsWith(tokens[0]) ? 0 : name.split(/[\s—«»(),-]+/).some((w) => w.startsWith(tokens[0])) ? 1 : 2
      } else if (p.includeRelated && tokens.every((t) => name.includes(t) || client.includes(t) || matter.includes(t))) {
        matchedIn = tokens.every((t) => name.includes(t) || client.includes(t)) ? 'client' : 'matter'
        score = 3
      } else continue
    }
    if (project.status === 'archived') score += 10
    if (project.status === 'deleting') score += 20
    scored.push({ hit: { project, matchedIn }, score })
  }
  const byUpdated = (a: Project, b: Project) => b.updatedAt.localeCompare(a.updatedAt)
  scored.sort((a, b) => {
    if (p.sort === 'name') return a.hit.project.name.localeCompare(b.hit.project.name, 'ru')
    if (p.sort === 'created') return b.hit.project.createdAt.localeCompare(a.hit.project.createdAt)
    if (p.sort === 'relevance' && a.score !== b.score) return a.score - b.score
    return byUpdated(a.hit.project, b.hit.project)
  })
  return { total: scored.length, items: scored.slice(p.offset, p.offset + p.limit).map((s) => s.hit) }
}

export function highlight(text: string, tokens: string[]): ReactNode {
  if (!tokens.length) return text
  const lower = norm(text)
  const marks: [number, number][] = []
  for (const t of tokens) {
    let i = lower.indexOf(t)
    while (i !== -1) {
      marks.push([i, i + t.length])
      i = lower.indexOf(t, i + t.length)
    }
  }
  if (!marks.length) return text
  marks.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const m of marks) {
    const last = merged[merged.length - 1]
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1])
    else merged.push([...m])
  }
  const out: ReactNode[] = []
  let pos = 0
  merged.forEach(([s, e], k) => {
    if (s > pos) out.push(text.slice(pos, s))
    out.push(createElement('mark', { key: k }, text.slice(s, e)))
    pos = e
  })
  if (pos < text.length) out.push(text.slice(pos))
  return createElement(Fragment, null, ...out)
}
