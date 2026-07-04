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

interface LuaBindEntry {
  key: string
  spell?: number
  item?: number
  target?: string
  mouseover?: boolean
}

export function buildLuaBindEntries(binds: ExportBind[]): LuaBindEntry[] {
  const entries: LuaBindEntry[] = []
  for (const bind of binds) {
    if (bind.ability.id === 'trinket:1') {
      entries.push({ key: bind.wowKey, item: 13 })
      continue
    }
    if (bind.ability.id === 'trinket:pvp') {
      entries.push({ key: bind.wowKey, item: 14 })
      continue
    }
    if (bind.ability.spellId <= 0) continue
    const entry: LuaBindEntry = { key: bind.wowKey, spell: bind.ability.spellId }
    if (bind.ability.variantKind === 'focus') entry.target = 'focus'
    if (bind.ability.variantKind.startsWith('arena')) entry.target = bind.ability.variantKind
    if (entry.target === undefined && bind.ability.targeting === 'ally') entry.mouseover = true
    entries.push(entry)
  }
  return entries
}

function luaBindLiteral(entry: LuaBindEntry): string {
  const parts = [`key = "${entry.key}"`]
  if (entry.spell !== undefined) parts.push(`spell = ${entry.spell}`)
  if (entry.item !== undefined) parts.push(`item = ${entry.item}`)
  if (entry.target !== undefined) parts.push(`target = "${entry.target}"`)
  if (entry.mouseover) parts.push(`mouseover = true`)
  return `  { ${parts.join(', ')} },`
}

export function renderLuaAddon(binds: ExportBind[], addonName: string): string {
  const entries = buildLuaBindEntries(binds)
  return [
    `local ADDON = "${addonName}"`,
    `local BINDS = {`,
    ...entries.map(luaBindLiteral),
    `}`,
    ``,
    `local SLOTS = {}`,
    `local COMMANDS = {}`,
    `local BARS = { { 60, "MULTIACTIONBAR1BUTTON" }, { 48, "MULTIACTIONBAR2BUTTON" }, { 24, "MULTIACTIONBAR3BUTTON" }, { 36, "MULTIACTIONBAR4BUTTON" } }`,
    `for _, bar in ipairs(BARS) do`,
    `  for i = 1, 12 do`,
    `    table.insert(SLOTS, bar[1] + i)`,
    `    table.insert(COMMANDS, bar[2] .. i)`,
    `  end`,
    `end`,
    ``,
    `local function resolveSpellName(spellId)`,
    `  if C_Spell and C_Spell.GetSpellName then`,
    `    return C_Spell.GetSpellName(spellId)`,
    `  end`,
    `  if C_Spell and C_Spell.GetSpellInfo then`,
    `    local info = C_Spell.GetSpellInfo(spellId)`,
    `    if info then return info.name end`,
    `  end`,
    `  if GetSpellInfo then`,
    `    return (GetSpellInfo(spellId))`,
    `  end`,
    `  return nil`,
    `end`,
    ``,
    `local function pickupSpell(spellId)`,
    `  if C_Spell and C_Spell.PickupSpell then`,
    `    C_Spell.PickupSpell(spellId)`,
    `  elseif PickupSpell then`,
    `    PickupSpell(spellId)`,
    `  end`,
    `end`,
    ``,
    `local function knowsSpell(spellId)`,
    `  if C_SpellBook and C_SpellBook.IsSpellKnown then`,
    `    return C_SpellBook.IsSpellKnown(spellId)`,
    `  end`,
    `  if IsPlayerSpell then`,
    `    return IsPlayerSpell(spellId)`,
    `  end`,
    `  return true`,
    `end`,
    ``,
    `local function makeMacro(label, body)`,
    `  if GetMacroInfo(label) then`,
    `    EditMacro(label, label, 134400, body)`,
    `    return true`,
    `  end`,
    `  local accountCount, characterCount = GetNumMacros()`,
    `  if characterCount < 18 then`,
    `    CreateMacro(label, 134400, body, true)`,
    `  elseif accountCount < 120 then`,
    `    CreateMacro(label, 134400, body, false)`,
    `  end`,
    `  return GetMacroInfo(label) ~= nil`,
    `end`,
    ``,
    `local function buildMacroBody(bind, name)`,
    `  if bind.item then`,
    `    return "#showtooltip " .. bind.item .. "\\n/use " .. bind.item`,
    `  end`,
    `  if bind.target == "focus" then`,
    `    return "#showtooltip " .. name .. "\\n/cast [@focus,exists][] " .. name`,
    `  end`,
    `  if bind.target then`,
    `    return "#showtooltip " .. name .. "\\n/cast [@" .. bind.target .. "] " .. name`,
    `  end`,
    `  if bind.mouseover then`,
    `    return "#showtooltip " .. name .. "\\n/cast [@mouseover,help,nodead][help][@player] " .. name`,
    `  end`,
    `  return nil`,
    `end`,
    ``,
    `local function apply()`,
    `  if InCombatLockdown() then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: leave combat first, then /kbo")`,
    `    return`,
    `  end`,
    `  local bound, placed = 0, 0`,
    `  local skipped = {}`,
    `  local slotIndex = 0`,
    `  for index, bind in ipairs(BINDS) do`,
    `    local name = nil`,
    `    local known = true`,
    `    if bind.spell then`,
    `      name = resolveSpellName(bind.spell)`,
    `      known = name ~= nil and knowsSpell(bind.spell)`,
    `    end`,
    `    if known then`,
    `      slotIndex = slotIndex + 1`,
    `      local slot = SLOTS[slotIndex]`,
    `      local command = COMMANDS[slotIndex]`,
    `      local body = buildMacroBody(bind, name)`,
    `      if body then`,
    `        local label = string.format("KO%02d", index)`,
    `        if makeMacro(label, body) then`,
    `          if slot then`,
    `            ClearCursor()`,
    `            PickupMacro(label)`,
    `            PlaceAction(slot)`,
    `            ClearCursor()`,
    `            placed = placed + 1`,
    `            SetBinding(bind.key, command)`,
    `          else`,
    `            SetBindingMacro(bind.key, label)`,
    `          end`,
    `          bound = bound + 1`,
    `        else`,
    `          table.insert(skipped, label)`,
    `        end`,
    `      elseif bind.spell then`,
    `        if slot then`,
    `          ClearCursor()`,
    `          pickupSpell(bind.spell)`,
    `          PlaceAction(slot)`,
    `          ClearCursor()`,
    `          placed = placed + 1`,
    `          SetBinding(bind.key, command)`,
    `        else`,
    `          SetBindingSpell(bind.key, name)`,
    `        end`,
    `        bound = bound + 1`,
    `      end`,
    `    else`,
    `      table.insert(skipped, name or ("spell:" .. tostring(bind.spell)))`,
    `    end`,
    `  end`,
    `  SaveBindings(GetCurrentBindingSet())`,
    `  print(string.format("|cff7c78ff%s|r: %d keys bound, %d abilities placed on bars 2-5", ADDON, bound, placed))`,
    `  if #skipped > 0 then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: skipped (not known by this character): " .. table.concat(skipped, ", "))`,
    `  end`,
    `  if GetActionBarToggles and placed > 0 then`,
    `    local bar1, bar2, bar3, bar4 = GetActionBarToggles()`,
    `    local toggles = { bar1, bar2, bar3, bar4 }`,
    `    local barsUsed = math.ceil(placed / 12)`,
    `    for barIndex = 1, math.min(barsUsed, 4) do`,
    `      if not toggles[barIndex] then`,
    `        print("|cff7c78ff" .. ADDON .. "|r: enable action bar " .. (barIndex + 1) .. " in Edit Mode to see the placed abilities")`,
    `      end`,
    `    end`,
    `  end`,
    `end`,
    ``,
    `local frame = CreateFrame("Frame")`,
    `frame:RegisterEvent("PLAYER_LOGIN")`,
    `frame:SetScript("OnEvent", function()`,
    `  C_Timer.After(2, apply)`,
    `end)`,
    ``,
    `SLASH_KEYBINDOPT1 = "/kbo"`,
    `SlashCmdList["KEYBINDOPT"] = apply`,
  ].join('\n')
}

export function interfaceVersionFromBuild(gameBuild: string): string {
  const [major = '1', minor = '0', patch = '0'] = gameBuild.split('.')
  return `${major}${minor.padStart(2, '0')}${patch.padStart(2, '0')}`
}

export function renderAddonToc(addonName: string, gameBuild: string): string {
  return [
    `## Interface: ${interfaceVersionFromBuild(gameBuild)}`,
    `## Title: Keybind Optimizer`,
    `## Notes: Applies a generated keybind layout`,
    `## Version: 1.0.0`,
    ``,
    `${addonName}.lua`,
  ].join('\n')
}
