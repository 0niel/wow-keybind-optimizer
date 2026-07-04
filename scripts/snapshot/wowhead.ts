import { fetchJsonCached } from '../lib/http'

const WOWHEAD_LOCALE_IDS: Record<string, number> = {
  enUS: 0,
  ruRU: 7,
}

interface WowheadTooltip {
  name?: string
  icon?: string
  tooltip?: string
}

export interface WowheadSpellText {
  name: string | null
  icon: string | null
  description: string | null
}

export async function fetchWowheadSpell(
  spellId: number,
  locale: string,
): Promise<WowheadSpellText | null> {
  const localeId = WOWHEAD_LOCALE_IDS[locale]
  if (localeId === undefined) return null
  try {
    const payload = await fetchJsonCached<WowheadTooltip>(
      `https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=${localeId}`,
      { minIntervalMs: 120, cacheKey: `wowhead-${localeId}-${spellId}` },
    )
    return {
      name: payload.name ?? null,
      icon: payload.icon ?? null,
      description: payload.tooltip ? extractDescription(payload.tooltip) : null,
    }
  } catch {
    return null
  }
}

function extractDescription(tooltipHtml: string): string | null {
  const matches = [...tooltipHtml.matchAll(/<div class="q">([\s\S]*?)<\/div>/g)]
  const last = matches.at(-1)?.[1]
  if (!last) return null
  const text = last
    .replace(/<br\s*\/?>(?=.)/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
  return text.length > 0 ? text : null
}
