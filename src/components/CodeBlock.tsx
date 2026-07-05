'use client'

import { Fragment, useMemo } from 'react'

const LUA_KEYWORDS = new Set([
  'local', 'function', 'end', 'if', 'then', 'else', 'elseif', 'for', 'do', 'while',
  'return', 'true', 'false', 'nil', 'not', 'and', 'or', 'in', 'repeat', 'until', 'break',
])

const TOKEN_RE = /(--.*$)|("(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w.]*)|(\s+)|([^\s])/g

const COLOR_BY_KIND: Record<string, string | undefined> = {
  comment: 'var(--code-comment)',
  string: 'var(--code-string)',
  number: 'var(--code-number)',
  keyword: 'var(--code-keyword)',
}

interface Token {
  text: string
  color?: string
}

function tokenizeLine(line: string): Token[] {
  if (/^\s*##/.test(line)) return [{ text: line, color: 'var(--code-directive)' }]
  const tokens: Token[] = []
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match[1] !== undefined) tokens.push({ text: match[1], color: COLOR_BY_KIND.comment })
    else if (match[2] !== undefined) tokens.push({ text: match[2], color: COLOR_BY_KIND.string })
    else if (match[3] !== undefined) tokens.push({ text: match[3], color: COLOR_BY_KIND.number })
    else if (match[4] !== undefined)
      tokens.push({ text: match[4], color: LUA_KEYWORDS.has(match[4]) ? COLOR_BY_KIND.keyword : undefined })
    else tokens.push({ text: match[0] })
  }
  return tokens
}

export function CodeBlock({ code, maxHeight = 420 }: { code: string; maxHeight?: number }) {
  const lines = useMemo(() => code.split('\n').map(tokenizeLine), [code])
  return (
    <pre
      style={{
        background: 'var(--inset)',
        borderRadius: 'var(--r-control)',
        padding: 16,
        fontSize: '0.78rem',
        lineHeight: 1.65,
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      }}
    >
      {lines.map((tokens, lineIndex) => (
        <Fragment key={lineIndex}>
          {tokens.map((token, tokenIndex) => (
            <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
              {token.text}
            </span>
          ))}
          {'\n'}
        </Fragment>
      ))}
    </pre>
  )
}
