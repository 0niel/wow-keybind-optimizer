import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { AbilityCategory } from '@/core/model/ability-category'
import type { SpellTextShard } from '@/core/model/snapshot'

export interface AddonLocaleStrings {
  categories: Record<AbilityCategory, string>
  optionsTitle: string
  colorsLabel: string
  colorsTooltip: string
  legendLabel: string
  legendTooltip: string
}

export interface AddonDecor {
  colorByCategory: Record<AbilityCategory, string>
  ru: AddonLocaleStrings
  en: AddonLocaleStrings
}

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

const MODIFIER_RANK: Record<string, number> = { none: 0, shift: 1, ctrl: 2, alt: 3 }

const KEY_POSITION_ORDER = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'Minus', 'Equal',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash',
  'Backquote', 'Tab', 'CapsLock', 'Space',
  'Mouse4', 'Mouse5',
  'MouseG1', 'MouseG2', 'MouseG3', 'MouseG4', 'MouseG5', 'MouseG6',
  'MouseG7', 'MouseG8', 'MouseG9', 'MouseG10', 'MouseG11', 'MouseG12',
  'WheelUp', 'WheelDown',
]

const KEY_POSITION_INDEX = new Map(KEY_POSITION_ORDER.map((keyId, index) => [keyId, index]))

function bindOrder(bind: ExportBind): [number, number] {
  return [
    MODIFIER_RANK[bind.slot.modifier] ?? 9,
    KEY_POSITION_INDEX.get(bind.slot.keyId) ?? 999,
  ]
}

function compareBinds(a: ExportBind, b: ExportBind): number {
  const [modA, keyA] = bindOrder(a)
  const [modB, keyB] = bindOrder(b)
  return modA - modB || keyA - keyB
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
  return binds.sort(compareBinds)
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
  category?: string
  variant?: string
}

export function buildLuaBindEntries(binds: ExportBind[], decor?: AddonDecor): LuaBindEntry[] {
  const entries: LuaBindEntry[] = []

  for (const bind of binds) {
    const entry: LuaBindEntry = { key: bind.wowKey }
    if (bind.ability.id === 'trinket:1') {
      entry.item = 13
    } else if (bind.ability.id === 'trinket:pvp') {
      entry.item = 14
    } else if (bind.ability.spellId > 0) {
      entry.spell = bind.ability.spellId
      if (bind.ability.variantKind === 'focus') entry.target = 'focus'
      else if (bind.ability.variantKind.startsWith('arena')) entry.target = bind.ability.variantKind
      else if (bind.ability.targeting === 'ally') entry.mouseover = true
    } else {
      continue
    }

    if (decor) {
      entry.category = bind.ability.category
      if (bind.ability.variantKind !== 'base') entry.variant = variantTarget(bind.ability.variantKind)
    }

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
  if (entry.category !== undefined) parts.push(`category = "${entry.category}"`)
  if (entry.variant !== undefined) parts.push(`variant = "${entry.variant}"`)
  return `  { ${parts.join(', ')} },`
}

function escapeLua(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildLegendCategories(binds: ExportBind[]): string[] {
  const seen = new Set<string>()
  const categories: string[] = []
  for (const bind of binds) {
    if (seen.has(bind.ability.category)) continue
    seen.add(bind.ability.category)
    categories.push(bind.ability.category)
  }
  return categories
}

function localeStringsLiteral(strings: AddonLocaleStrings, colorKeys: string[]): string {
  const categoryLines = colorKeys
    .map((key) => `    ["${key}"] = "${escapeLua(strings.categories[key as AbilityCategory] ?? key)}"`)
    .join(',\n')
  return [
    `{`,
    `  categories = {`,
    categoryLines,
    `  },`,
    `  optionsTitle = "${escapeLua(strings.optionsTitle)}",`,
    `  colorsLabel = "${escapeLua(strings.colorsLabel)}",`,
    `  colorsTooltip = "${escapeLua(strings.colorsTooltip)}",`,
    `  legendLabel = "${escapeLua(strings.legendLabel)}",`,
    `  legendTooltip = "${escapeLua(strings.legendTooltip)}",`,
    `}`,
  ].join('\n')
}

const DEFAULT_LOCALE_STRINGS = (categories: Record<string, string>): AddonLocaleStrings => ({
  categories: categories as Record<AbilityCategory, string>,
  optionsTitle: 'Keybind Optimizer',
  colorsLabel: 'Category colors',
  colorsTooltip: 'Color action buttons by ability category.',
  legendLabel: 'Color legend',
  legendTooltip: 'Show the draggable color legend.',
})

export function renderLuaAddon(binds: ExportBind[], addonName: string, decor?: AddonDecor): string {
  const entries = buildLuaBindEntries(binds, decor)
  const legendCategories = decor ? buildLegendCategories(binds) : []
  const colorKeys = Object.keys(decor?.colorByCategory ?? {})
  const ru = decor?.ru ?? DEFAULT_LOCALE_STRINGS({})
  const en = decor?.en ?? DEFAULT_LOCALE_STRINGS({})
  return [
    `local ADDON = "${addonName}"`,
    `local COLORS = {`,
    ...colorKeys.map((key) => `  ["${key}"] = "${decor?.colorByCategory[key as AbilityCategory]}",`),
    `}`,
    `local STRINGS = {`,
    `  ru = ${localeStringsLiteral(ru, colorKeys)},`,
    `  en = ${localeStringsLiteral(en, colorKeys)},`,
    `}`,
    `local LOCALE = (GetLocale and string.sub(GetLocale(), 1, 2) == "ru") and "ru" or "en"`,
    `local L = STRINGS[LOCALE]`,
    `local TEXT = L`,
    `local BINDS = {`,
    ...entries.map(luaBindLiteral),
    `}`,
    ``,
    `local LEGEND_CATEGORIES = { ${legendCategories.map((c) => `"${c}"`).join(', ')} }`,
    ``,
    `local BARS = {`,
    `  { base = 0, command = "ACTIONBUTTON", frame = "ActionButton", main = true },`,
    `  { base = 60, command = "MULTIACTIONBAR1BUTTON", frame = "MultiBarBottomLeftButton", toggle = 1 },`,
    `  { base = 48, command = "MULTIACTIONBAR2BUTTON", frame = "MultiBarBottomRightButton", toggle = 2 },`,
    `  { base = 24, command = "MULTIACTIONBAR3BUTTON", frame = "MultiBarRightButton", toggle = 3 },`,
    `  { base = 36, command = "MULTIACTIONBAR4BUTTON", frame = "MultiBarLeftButton", toggle = 4 },`,
    `}`,
    ``,
    `local function hexColor(hex)`,
    `  return tonumber(string.sub(hex, 1, 2), 16) / 255, tonumber(string.sub(hex, 3, 4), 16) / 255, tonumber(string.sub(hex, 5, 6), 16) / 255`,
    `end`,
    ``,
    `local decoratedButtons = {}`,
    ``,
    `local function db()`,
    `  KeybindOptimizerDB = KeybindOptimizerDB or {}`,
    `  if KeybindOptimizerDB.decor == nil then KeybindOptimizerDB.decor = true end`,
    `  if KeybindOptimizerDB.legend == nil then KeybindOptimizerDB.legend = true end`,
    `  if KeybindOptimizerDB.mainbar == nil then KeybindOptimizerDB.mainbar = true end`,
    `  return KeybindOptimizerDB`,
    `end`,
    ``,
    `local function mainBarPages()`,
    `  local _, class = UnitClass("player")`,
    `  return class == "DRUID" or class == "ROGUE"`,
    `end`,
    ``,
    `local function usableBars()`,
    `  local bars = {}`,
    `  local useMain = db().mainbar and not mainBarPages()`,
    `  for _, bar in ipairs(BARS) do`,
    `    if not bar.main or useMain then`,
    `      table.insert(bars, bar)`,
    `    end`,
    `  end`,
    `  return bars`,
    `end`,
    ``,
    `local function buildTargets()`,
    `  local targets = {}`,
    `  for _, bar in ipairs(usableBars()) do`,
    `    for i = 1, 12 do`,
    `      table.insert(targets, { slot = bar.base + i, command = bar.command .. i, frame = _G[bar.frame .. i], toggle = bar.toggle })`,
    `    end`,
    `  end`,
    `  return targets`,
    `end`,
    ``,
    `local function isProtectedSlot(slot)`,
    `  local actionType, id = GetActionInfo(slot)`,
    `  if not actionType then return false end`,
    `  if actionType == "spell" then return false end`,
    `  if actionType == "macro" then`,
    `    local name = GetMacroInfo(id)`,
    `    return not (name and string.sub(name, 1, 2) == "KO")`,
    `  end`,
    `  return true`,
    `end`,
    ``,
    `local function placeableTargets()`,
    `  local placeable = {}`,
    `  for _, target in ipairs(buildTargets()) do`,
    `    if not isProtectedSlot(target.slot) then`,
    `      if HasAction(target.slot) then`,
    `        PickupAction(target.slot)`,
    `        ClearCursor()`,
    `      end`,
    `      table.insert(placeable, target)`,
    `    end`,
    `  end`,
    `  return placeable`,
    `end`,
    ``,
    `local function noteFor(category, variant)`,
    `  local label = L.categories[category] or category`,
    `  if variant and variant ~= "" then`,
    `    return label .. " [@" .. variant .. "]"`,
    `  end`,
    `  return label`,
    `end`,
    ``,
    `local function decorateButton(button, category, variant)`,
    `  if not button or not category then return end`,
    `  local color = COLORS[category]`,
    `  if not color then return end`,
    `  local note = noteFor(category, variant)`,
    `  local r, g, b = hexColor(color)`,
    `  local bar = button.koCategoryBar`,
    `  if not bar then`,
    `    bar = button:CreateTexture(nil, "OVERLAY", nil, 7)`,
    `    button.koCategoryBar = bar`,
    `  end`,
    `  bar:ClearAllPoints()`,
    `  bar:SetPoint("BOTTOMLEFT", button, "BOTTOMLEFT", 1, 1)`,
    `  bar:SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", -1, 1)`,
    `  bar:SetHeight(5)`,
    `  bar:SetColorTexture(r, g, b, 1)`,
    `  bar:SetShown(db().decor)`,
    `  button.koNote = note`,
    `  button.koR, button.koG, button.koB = r, g, b`,
    `  decoratedButtons[button] = true`,
    `  if not button.koHooked then`,
    `    button.koHooked = true`,
    `    button:HookScript("OnEnter", function(self)`,
    `      if self.koNote and db().decor then`,
    `        GameTooltip:AddLine(self.koNote, self.koR, self.koG, self.koB)`,
    `        GameTooltip:Show()`,
    `      end`,
    `    end)`,
    `  end`,
    `end`,
    ``,
    `local function setDecorShown(shown)`,
    `  for button in pairs(decoratedButtons) do`,
    `    if button.koCategoryBar then`,
    `      button.koCategoryBar:SetShown(shown)`,
    `    end`,
    `  end`,
    `end`,
    ``,
    `local updateLegend`,
    `local optColors, optLegend`,
    `local function syncOptions()`,
    `  if optColors then optColors:SetChecked(db().decor) end`,
    `  if optLegend then optLegend:SetChecked(db().legend) end`,
    `end`,
    ``,
    `local legendFrame = nil`,
    ``,
    `local function buildLegendFrame()`,
    `  if legendFrame then return legendFrame end`,
    `  local frame = CreateFrame("Frame", "KeybindOptimizerLegend", UIParent, "BackdropTemplate")`,
    `  frame:SetSize(200, 34 + #LEGEND_CATEGORIES * 18)`,
    `  frame:SetPoint("RIGHT", UIParent, "RIGHT", -220, 0)`,
    `  frame:SetBackdrop({ bgFile = "Interface/Tooltips/UI-Tooltip-Background", edgeFile = "Interface/Tooltips/UI-Tooltip-Border", edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 } })`,
    `  frame:SetBackdropColor(0.06, 0.06, 0.08, 0.92)`,
    `  frame:SetMovable(true)`,
    `  frame:EnableMouse(true)`,
    `  frame:RegisterForDrag("LeftButton")`,
    `  frame:SetScript("OnDragStart", frame.StartMoving)`,
    `  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)`,
    `  frame:SetClampedToScreen(true)`,
    `  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")`,
    `  title:SetPoint("TOPLEFT", 10, -8)`,
    `  title:SetText(ADDON)`,
    `  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")`,
    `  close:SetSize(24, 24)`,
    `  close:SetPoint("TOPRIGHT", 2, 2)`,
    `  close:SetScript("OnClick", function()`,
    `    db().legend = false`,
    `    updateLegend()`,
    `    syncOptions()`,
    `  end)`,
    `  for index, category in ipairs(LEGEND_CATEGORIES) do`,
    `    local swatch = frame:CreateTexture(nil, "OVERLAY")`,
    `    swatch:SetSize(10, 10)`,
    `    swatch:SetPoint("TOPLEFT", 10, -10 - index * 18)`,
    `    local r, g, b = hexColor(COLORS[category] or "888888")`,
    `    swatch:SetColorTexture(r, g, b, 1)`,
    `    local text = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")`,
    `    text:SetPoint("LEFT", swatch, "RIGHT", 6, 0)`,
    `    text:SetText(L.categories[category] or category)`,
    `  end`,
    `  legendFrame = frame`,
    `  return frame`,
    `end`,
    ``,
    `updateLegend = function()`,
    `  if #LEGEND_CATEGORIES == 0 then return end`,
    `  local frame = buildLegendFrame()`,
    `  frame:SetShown(db().legend and db().decor)`,
    `end`,
    ``,
    `local function makeCheck(panel, y, label, tooltip, checked, onToggle)`,
    `  local cb = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")`,
    `  cb:SetPoint("TOPLEFT", 18, y)`,
    `  local fs = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")`,
    `  fs:SetPoint("LEFT", cb, "RIGHT", 4, 0)`,
    `  fs:SetText(label)`,
    `  cb:SetChecked(checked)`,
    `  cb.tooltipText = tooltip`,
    `  cb:SetScript("OnClick", function(self)`,
    `    onToggle(self:GetChecked() and true or false)`,
    `  end)`,
    `  return cb`,
    `end`,
    ``,
    `local function buildOptions()`,
    `  local panel = CreateFrame("Frame")`,
    `  panel.name = TEXT.optionsTitle`,
    `  local title = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")`,
    `  title:SetPoint("TOPLEFT", 16, -16)`,
    `  title:SetText(TEXT.optionsTitle)`,
    `  optColors = makeCheck(panel, -52, TEXT.colorsLabel, TEXT.colorsTooltip, db().decor, function(checked)`,
    `    db().decor = checked`,
    `    setDecorShown(checked)`,
    `    updateLegend()`,
    `  end)`,
    `  optLegend = makeCheck(panel, -84, TEXT.legendLabel, TEXT.legendTooltip, db().legend, function(checked)`,
    `    db().legend = checked`,
    `    updateLegend()`,
    `  end)`,
    `  if Settings and Settings.RegisterCanvasLayoutCategory then`,
    `    local category = Settings.RegisterCanvasLayoutCategory(panel, TEXT.optionsTitle)`,
    `    category.ID = TEXT.optionsTitle`,
    `    Settings.RegisterAddOnCategory(category)`,
    `  elseif InterfaceOptions_AddCategory then`,
    `    InterfaceOptions_AddCategory(panel)`,
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
    `local function bindKeyToCommand(key, command)`,
    `  local first, second = GetBindingKey(command)`,
    `  if first and first ~= key then SetBinding(first) end`,
    `  if second and second ~= key then SetBinding(second) end`,
    `  SetBinding(key, command)`,
    `end`,
    ``,
    `local function placeVerified(slot)`,
    `  PlaceAction(slot)`,
    `  ClearCursor()`,
    `  return HasAction(slot)`,
    `end`,
    ``,
    `local function apply()`,
    `  if InCombatLockdown() then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: leave combat first, then /kbo")`,
    `    return`,
    `  end`,
    `  local targets = placeableTargets()`,
    `  local bound, placed, cursor = 0, 0, 0`,
    `  local skipped = {}`,
    `  local usedToggles = {}`,
    `  for index, bind in ipairs(BINDS) do`,
    `    local name = nil`,
    `    local known = true`,
    `    if bind.spell then`,
    `      name = resolveSpellName(bind.spell)`,
    `      known = name ~= nil and knowsSpell(bind.spell)`,
    `    elseif bind.item then`,
    `      known = GetInventoryItemID("player", bind.item) ~= nil`,
    `    end`,
    `    if known then`,
    `      local target = targets[cursor + 1]`,
    `      local body = buildMacroBody(bind, name)`,
    `      if body then`,
    `        local label = string.format("KO%02d", index)`,
    `        if makeMacro(label, body) then`,
    `          local onBar = false`,
    `          if target then`,
    `            ClearCursor()`,
    `            PickupMacro(label)`,
    `            onBar = placeVerified(target.slot)`,
    `          end`,
    `          if onBar then`,
    `            cursor = cursor + 1`,
    `            placed = placed + 1`,
    `            bindKeyToCommand(bind.key, target.command)`,
    `            if target.toggle then usedToggles[target.toggle] = true end`,
    `            decorateButton(target.frame, bind.category, bind.variant)`,
    `          else`,
    `            SetBindingMacro(bind.key, label)`,
    `          end`,
    `          bound = bound + 1`,
    `        else`,
    `          table.insert(skipped, label)`,
    `        end`,
    `      elseif bind.spell then`,
    `        local onBar = false`,
    `        if target then`,
    `          ClearCursor()`,
    `          pickupSpell(bind.spell)`,
    `          onBar = placeVerified(target.slot)`,
    `        end`,
    `        if onBar then`,
    `          cursor = cursor + 1`,
    `          placed = placed + 1`,
    `          bindKeyToCommand(bind.key, target.command)`,
    `          if target.toggle then usedToggles[target.toggle] = true end`,
    `          decorateButton(target.frame, bind.color, bind.note)`,
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
    `  updateLegend()`,
    `  print(string.format("|cff7c78ff%s|r: %d keys bound, %d abilities placed", ADDON, bound, placed))`,
    `  if #skipped > 0 then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: skipped (not known by this character): " .. table.concat(skipped, ", "))`,
    `  end`,
    `  if GetActionBarToggles then`,
    `    local toggles = { GetActionBarToggles() }`,
    `    for barNumber = 1, 4 do`,
    `      if usedToggles[barNumber] and not toggles[barNumber] then`,
    `        print("|cff7c78ff" .. ADDON .. "|r: enable Action Bar " .. (barNumber + 1) .. " in Edit Mode to see the placed abilities")`,
    `      end`,
    `    end`,
    `  end`,
    `end`,
    ``,
    `local function clearMainBar()`,
    `  if InCombatLockdown() then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: leave combat first")`,
    `    return`,
    `  end`,
    `  for slot = 1, 12 do`,
    `    if HasAction(slot) and not isProtectedSlot(slot) then`,
    `      PickupAction(slot)`,
    `      ClearCursor()`,
    `    end`,
    `  end`,
    `  print("|cff7c78ff" .. ADDON .. "|r: main action bar spells cleared (mounts, toys and macros kept)")`,
    `end`,
    ``,
    `local function handleCommand(message)`,
    `  local command = string.lower(string.gsub(message or "", "%s+", ""))`,
    `  if command == "colors" then`,
    `    db().decor = not db().decor`,
    `    setDecorShown(db().decor)`,
    `    updateLegend()`,
    `    syncOptions()`,
    `    print("|cff7c78ff" .. ADDON .. "|r: category colors " .. (db().decor and "ON" or "OFF"))`,
    `  elseif command == "legend" then`,
    `    db().legend = not db().legend`,
    `    updateLegend()`,
    `    syncOptions()`,
    `    print("|cff7c78ff" .. ADDON .. "|r: legend " .. (db().legend and "ON" or "OFF"))`,
    `  elseif command == "clearmain" then`,
    `    clearMainBar()`,
    `  elseif command == "mainbar" then`,
    `    db().mainbar = not db().mainbar`,
    `    print("|cff7c78ff" .. ADDON .. "|r: main bar usage " .. (db().mainbar and "ON" or "OFF") .. " — run /kbo to re-apply")`,
    `  elseif command == "help" then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: /kbo — apply layout, /kbo colors — toggle category colors, /kbo legend — toggle legend, /kbo mainbar — use the main bar too, /kbo clearmain — clear the main action bar")`,
    `  else`,
    `    apply()`,
    `  end`,
    `end`,
    ``,
    `local frame = CreateFrame("Frame")`,
    `frame:RegisterEvent("PLAYER_LOGIN")`,
    `frame:SetScript("OnEvent", function()`,
    `  db()`,
    `  pcall(buildOptions)`,
    `  C_Timer.After(2, apply)`,
    `end)`,
    ``,
    `SLASH_KEYBINDOPT1 = "/kbo"`,
    `SlashCmdList["KEYBINDOPT"] = handleCommand`,
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
    `## Version: 1.1.0`,
    `## SavedVariables: KeybindOptimizerDB`,
    ``,
    `${addonName}.lua`,
  ].join('\n')
}
