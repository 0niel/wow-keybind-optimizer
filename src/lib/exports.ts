import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { SpellTextShard } from '@/core/model/snapshot'

const WOW_KEY_BY_KEY_ID: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Tab: 'TAB',
  CapsLock: 'CAPSLOCK',
  Space: 'SPACE',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Mouse4: 'BUTTON4',
  Mouse5: 'BUTTON5',
  WheelUp: 'MOUSEWHEELUP',
  WheelDown: 'MOUSEWHEELDOWN',
}

export function wowKeyName(slot: Slot): string {
  let key = WOW_KEY_BY_KEY_ID[slot.keyId]
  if (key === undefined) {
    if (slot.keyId.startsWith('Key')) key = slot.keyId.slice(3)
    else if (slot.keyId.startsWith('Digit')) key = slot.keyId.slice(5)
    else if (slot.keyId.startsWith('MouseG')) key = `BUTTON${Number(slot.keyId.slice(6)) + 5}`
    else key = slot.keyId.toUpperCase()
  }
  const prefix =
    slot.modifier === 'shift'
      ? 'SHIFT-'
      : slot.modifier === 'ctrl'
        ? 'CTRL-'
        : slot.modifier === 'alt'
          ? 'ALT-'
          : ''
  return `${prefix}${key}`
}

export interface ExportBind {
  ability: Ability
  slot: Slot
  name: string
  wowKey: string
}

export function buildExportBinds(
  assignments: BindAssignment[],
  abilities: Ability[],
  slots: Slot[],
  spells: SpellTextShard,
  trinketLabel: string,
  pvpTrinketLabel: string,
): ExportBind[] {
  const abilityById = new Map(abilities.map((ability) => [ability.id, ability]))
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const binds: ExportBind[] = []
  for (const assignment of assignments) {
    const ability = abilityById.get(assignment.abilityId)
    const slot = slotById.get(assignment.slotId)
    if (!ability || !slot) continue
    const name =
      ability.spellId === 0
        ? ability.id === 'trinket:pvp'
          ? pvpTrinketLabel
          : trinketLabel
        : (spells[String(ability.spellId)]?.name ?? `#${ability.spellId}`)
    binds.push({ ability, slot, name, wowKey: wowKeyName(slot) })
  }
  return binds.sort((a, b) => a.wowKey.localeCompare(b.wowKey))
}

export function renderPlainList(binds: ExportBind[]): string {
  const width = Math.max(...binds.map((bind) => bind.wowKey.length), 4)
  return binds
    .map((bind) => {
      const variant =
        bind.ability.variantKind === 'base' ? '' : ` [@${variantTarget(bind.ability.variantKind)}]`
      return `${bind.wowKey.padEnd(width)}  ${bind.name}${variant}`
    })
    .join('\n')
}

function variantTarget(kind: string): string {
  if (kind === 'focus') return 'focus'
  if (kind === 'arena1') return 'arena1'
  if (kind === 'arena2') return 'arena2'
  if (kind === 'arena3') return 'arena3'
  return kind
}

export function macroName(bind: ExportBind): string {
  const target = variantTarget(bind.ability.variantKind)
  const compactName = bind.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12)
  return `KO${target === 'base' ? '' : target[0]?.toUpperCase()}${target.slice(1, 3)}${compactName}`.slice(0, 16)
}

export function macroBody(bind: ExportBind): string | null {
  const kind = bind.ability.variantKind
  if (kind === 'focus') return `#showtooltip ${bind.name}\n/cast [@focus,exists][] ${bind.name}`
  if (kind === 'arena1' || kind === 'arena2' || kind === 'arena3') {
    return `#showtooltip ${bind.name}\n/cast [@${kind}] ${bind.name}`
  }
  if (bind.ability.targeting === 'ally' && bind.ability.spellId > 0) {
    return `#showtooltip ${bind.name}\n/cast [@mouseover,help,nodead][help][@player] ${bind.name}`
  }
  if (bind.ability.id === 'trinket:1') return `/use 13`
  if (bind.ability.id === 'trinket:pvp') return `/use 14`
  return null
}

export function renderMacroList(binds: ExportBind[]): string {
  const sections: string[] = []
  for (const bind of binds) {
    const body = macroBody(bind)
    if (body === null) continue
    sections.push(`-- ${macroName(bind)} (${bind.wowKey})\n${body}`)
  }
  return sections.join('\n\n')
}

export function renderLuaAddon(binds: ExportBind[], addonName: string): string {
  const lines: string[] = [
    `local frame = CreateFrame("Frame")`,
    `frame:RegisterEvent("PLAYER_LOGIN")`,
    `frame:SetScript("OnEvent", function()`,
  ]
  for (const bind of binds) {
    const body = macroBody(bind)
    if (body !== null) {
      const name = macroName(bind)
      const escaped = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      lines.push(`  if not GetMacroInfo("${name}") then`)
      lines.push(`    CreateMacro("${name}", "INV_MISC_QUESTIONMARK", "${escaped}", false)`)
      lines.push(`  end`)
      lines.push(`  SetBindingMacro("${bind.wowKey}", "${name}")`)
    } else if (bind.ability.spellId > 0) {
      const escapedName = bind.name.replace(/"/g, '\\"')
      lines.push(`  SetBindingSpell("${bind.wowKey}", "${escapedName}")`)
    }
  }
  lines.push(`  SaveBindings(GetCurrentBindingSet())`)
  lines.push(`  print("|cff7c78ff${addonName}|r: keybinds applied")`)
  lines.push(`end)`)
  return lines.join('\n')
}

export function renderAddonToc(addonName: string, gameBuild: string): string {
  const interfaceVersion = gameBuild.split('.').slice(0, 3).map((part, index) =>
    index === 0 ? part : part.padStart(2, '0'),
  )
  return [
    `## Interface: ${interfaceVersion.join('')}`,
    `## Title: ${addonName}`,
    `## Notes: Generated keybind layout`,
    `## Version: 1.0.0`,
    ``,
    `${addonName}.lua`,
  ].join('\n')
}
