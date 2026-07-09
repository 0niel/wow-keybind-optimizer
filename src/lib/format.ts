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

function resolveConditionals(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('$?', i)
    if (start === -1) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, start)
    let cursor = start + 2
    const branches: string[] = []
    let valid = false
    while (cursor < text.length) {
      const open = text.indexOf('[', cursor)
      if (open === -1) break
      const condition = text.slice(cursor, open)
      if (condition.includes(']') || condition.includes('\n') || condition.length > 60) break
      let depth = 0
      let close = open
      for (; close < text.length; close++) {
        if (text[close] === '[') depth++
        else if (text[close] === ']') {
          depth--
          if (depth === 0) break
        }
      }
      if (close >= text.length) break
      branches.push(text.slice(open + 1, close))
      cursor = close + 1
      valid = true
      if (text[cursor] === '?') {
        cursor++
        continue
      }
      if (text[cursor] === '[') continue
      break
    }
    if (!valid) {
      out += '$'
      i = start + 1
      continue
    }
    out += branches.find((branch) => branch.trim() !== '') ?? ''
    i = cursor
  }
  return out
}

function stripGameVariables(text: string): string {
  let out = text
  for (let pass = 0; pass < 6; pass++) {
    const before = out
    out = resolveConditionals(out)
      .replace(/\$@[a-z]+\d*/gi, '')
      .replace(/\$[lg]\s*([^:;$]*)(?::[^;$]*)+;/gi, '$1')
      .replace(/\$\{[^}]*\}/g, VALUE_PLACEHOLDER)
      .replace(/\$\d+[a-z]\d*/gi, VALUE_PLACEHOLDER)
      .replace(/\$[a-z]\d+/gi, VALUE_PLACEHOLDER)
      .replace(/\$[a-z](?![a-z0-9])/gi, VALUE_PLACEHOLDER)
    if (out === before) break
  }
  return out
    .replace(/\$\?[!&a-z0-9]*/gi, '')
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
    collapseScaling(stripGameVariables(input))
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
