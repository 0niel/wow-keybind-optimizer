import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodeBlock } from '@/components/CodeBlock'

describe('CodeBlock', () => {
  it('limits syntax highlighting to the requested line count', () => {
    const code = Array.from({ length: 2_000 }, (_, index) => `local value${index} = ${index}`).join('\n')
    const html = renderToStaticMarkup(createElement(CodeBlock, { code, maxLines: 120 }))

    expect(html).toContain('value119')
    expect(html).not.toContain('value120')
    expect(html).toContain('…')
    expect((html.match(/<span/g) ?? []).length).toBeLessThanOrEqual(360)
  })
})
