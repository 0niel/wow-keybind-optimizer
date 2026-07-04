const SCALING_HINT =
  /(spell power|attack power|percent damage|универсальн|сила атаки|сил[аы] закл|% of)/i

const PURE_MATH = /^[\d%.,\s*+/x×()-]+$/

function collapseScaling(input: string): string {
  let text = input
  for (let pass = 0; pass < 12; pass++) {
    const before = text
    text = text.replace(/\[[^[\]]*\]/g, (match) => {
      const inner = match.slice(1, -1)
      return SCALING_HINT.test(inner) || /[\d%*]/.test(inner) ? '' : match
    })
    text = text.replace(/\(([^()]*)\)/g, (match, inner: string) => {
      const trimmed = inner.trim()
      if (trimmed === '') return ''
      return SCALING_HINT.test(match) || PURE_MATH.test(trimmed) ? '' : match
    })
    if (text === before) break
  }
  return text
}

const VALUE_PLACEHOLDER = 'X'

function stripGameVariables(text: string): string {
  let out = text
  for (let pass = 0; pass < 4; pass++) {
    const before = out
    out = out
      .replace(/\$@[a-z]+\d*/gi, '')
      .replace(/\$\?[a-z]?\d*\s*\[([^\]]*)\]\s*\[[^\]]*\]/gi, '$1')
      .replace(/\$[lg]\s*([^:;$]*)(?::[^;$]*)+;/gi, '$1')
      .replace(/\$\{[^}]*\}/g, VALUE_PLACEHOLDER)
      .replace(/\$\d+[a-z]\d*/gi, VALUE_PLACEHOLDER)
      .replace(/\$[a-z]\d+/gi, VALUE_PLACEHOLDER)
      .replace(/\$[a-z](?![a-z0-9])/gi, VALUE_PLACEHOLDER)
    if (out === before) break
  }
  return out
    .replace(/\$\?[a-z]?\d*\s*\[[^\]]*\]/gi, '')
    .replace(/\$\?[a-z]?\d*/gi, '')
    .replace(/\$+/g, '')
    .replace(/\bX\s*X\b/g, VALUE_PLACEHOLDER)
}

function dedupeParagraphs(text: string): string {
  const seen = new Set<string>()
  const blocks: string[] = []
  for (const raw of text.split(/\n\s*\n/)) {
    const block = raw.trim()
    if (block === '') continue
    if (seen.has(block)) continue
    seen.add(block)
    blocks.push(block)
  }
  return blocks.join('\n\n')
}

export function formatSpellDescription(input: string): string {
  if (!input) return ''
  return dedupeParagraphs(
    stripGameVariables(collapseScaling(input))
      .replace(/\[\s*\]/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s*ед\.\s+урона/gi, ' урон')
      .replace(/\s*ед\.\s+здоровья/gi, ' здоровье')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.;:)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim()
}
