'use client'

import { useTranslations } from 'next-intl'

const COMMANDS = [
  { suffix: '', key: 'browser' },
  { suffix: 'apply', key: 'apply' },
  { suffix: 'force', key: 'force' },
  { suffix: 'check', key: 'check' },
  { suffix: 'import', key: 'import' },
  { suffix: 'profile N', key: 'profile N' },
  { suffix: 'bars', key: 'bars' },
  { suffix: 'auto', key: 'auto' },
  { suffix: 'colors', key: 'colors' },
  { suffix: 'legend', key: 'legend' },
  { suffix: 'mainbar', key: 'mainbar' },
  { suffix: 'mouseover', key: 'mouseover' },
  { suffix: 'clearmain', key: 'clearmain' },
  { suffix: 'wipe', key: 'wipe' },
] as const

export function AddonGuide() {
  const t = useTranslations('export.guide')

  const card: React.CSSProperties = {
    background: 'var(--inset)',
    borderRadius: 14,
    padding: '14px 16px',
  }
  const title: React.CSSProperties = {
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    margin: '0 0 10px',
  }
  const body: React.CSSProperties = {
    fontSize: '0.84rem',
    color: 'var(--text-soft)',
    margin: 0,
    lineHeight: 1.5,
  }

  return (
    <div
      style={{
        marginTop: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12,
      }}
    >
      <div style={card}>
        <p style={title}>{t('installTitle')}</p>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['step1', 'step2', 'step3'] as const).map((step, index) => (
            <li key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {index + 1}
              </span>
              <span style={body}>{t(step)}</span>
            </li>
          ))}
        </ol>
        <p style={{ ...body, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--accent)' }}>{t('updateTitle')}.</b> {t('updateText')}
        </p>
      </div>
      <div style={card}>
        <p style={title}>{t('howTitle')}</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['how1', 'how2', 'how3', 'how4'] as const).map((item) => (
            <li key={item} style={body}>
              {t(item)}
            </li>
          ))}
        </ul>
      </div>
      <div style={card}>
        <p style={title}>{t('commandsTitle')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {COMMANDS.map(({ suffix, key }) => (
            <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <code
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  whiteSpace: 'nowrap',
                  minWidth: 118,
                }}
              >
                /kbo{suffix ? ` ${suffix}` : ''}
              </code>
              <span style={{ ...body, fontSize: '0.8rem' }}>{t(`commands.${key}` as never)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
