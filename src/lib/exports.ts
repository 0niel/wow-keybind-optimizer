import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { AbilityCategory } from '@/core/model/ability-category'
import type { SpellTextShard } from '@/core/model/snapshot'

export interface AddonDecor {
  colorByCategory: Record<AbilityCategory, string>
  labelByCategory: Record<AbilityCategory, string>
  settings: {
    optionsTitle: string
    colorsLabel: string
    colorsTooltip: string
    legendLabel: string
    legendTooltip: string
  }
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
  slot?: number
  command?: string
  color?: string
  note?: string
}

const PLACEMENT_BARS = [
  { base: 60, command: 'MULTIACTIONBAR1BUTTON' },
  { base: 48, command: 'MULTIACTIONBAR2BUTTON' },
  { base: 24, command: 'MULTIACTIONBAR3BUTTON' },
  { base: 36, command: 'MULTIACTIONBAR4BUTTON' },
]

export function buildLuaBindEntries(binds: ExportBind[], decor?: AddonDecor): LuaBindEntry[] {
  const entries: LuaBindEntry[] = []
  let placementIndex = 0

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
      entry.color = decor.colorByCategory[bind.ability.category]
      const label = decor.labelByCategory[bind.ability.category]
      const variantSuffix =
        bind.ability.variantKind === 'base' ? '' : ` [@${variantTarget(bind.ability.variantKind)}]`
      entry.note = `${label}${variantSuffix}`
    }

    const bar = PLACEMENT_BARS[Math.floor(placementIndex / 12)]
    if (bar) {
      const button = (placementIndex % 12) + 1
      entry.slot = bar.base + button
      entry.command = `${bar.command}${button}`
      placementIndex += 1
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
  if (entry.slot !== undefined) parts.push(`slot = ${entry.slot}`)
  if (entry.command !== undefined) parts.push(`command = "${entry.command}"`)
  if (entry.color !== undefined) parts.push(`color = "${entry.color}"`)
  if (entry.note !== undefined) parts.push(`note = "${escapeLua(entry.note)}"`)
  return `  { ${parts.join(', ')} },`
}

function escapeLua(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildLegendEntries(binds: ExportBind[], decor: AddonDecor): Array<[string, string]> {
  const seen = new Set<string>()
  const legend: Array<[string, string]> = []
  for (const bind of binds) {
    const category = bind.ability.category
    if (seen.has(category)) continue
    seen.add(category)
    legend.push([decor.colorByCategory[category], decor.labelByCategory[category]])
  }
  return legend
}

export function renderLuaAddon(binds: ExportBind[], addonName: string, decor?: AddonDecor): string {
  const entries = buildLuaBindEntries(binds, decor)
  const legend = decor ? buildLegendEntries(binds, decor) : []
  const settings = decor?.settings ?? {
    optionsTitle: 'Keybind Optimizer',
    colorsLabel: 'Category colors',
    colorsTooltip: 'Color action buttons by ability category.',
    legendLabel: 'Color legend',
    legendTooltip: 'Show the draggable color legend.',
  }
  return [
    `local ADDON = "${addonName}"`,
    `local TEXT = {`,
    `  optionsTitle = "${escapeLua(settings.optionsTitle)}",`,
    `  colorsLabel = "${escapeLua(settings.colorsLabel)}",`,
    `  colorsTooltip = "${escapeLua(settings.colorsTooltip)}",`,
    `  legendLabel = "${escapeLua(settings.legendLabel)}",`,
    `  legendTooltip = "${escapeLua(settings.legendTooltip)}",`,
    `}`,
    `local BINDS = {`,
    ...entries.map(luaBindLiteral),
    `}`,
    ``,
    `local LEGEND = {`,
    ...legend.map(([color, label]) => `  { color = "${color}", label = "${escapeLua(label)}" },`),
    `}`,
    ``,
    `local MANAGED_SLOTS = {}`,
    `for _, base in ipairs({ 60, 48, 24, 36 }) do`,
    `  for i = 1, 12 do`,
    `    table.insert(MANAGED_SLOTS, base + i)`,
    `  end`,
    `end`,
    ``,
    `local BUTTON_FRAMES = {`,
    `  MULTIACTIONBAR1BUTTON = "MultiBarBottomLeftButton",`,
    `  MULTIACTIONBAR2BUTTON = "MultiBarBottomRightButton",`,
    `  MULTIACTIONBAR3BUTTON = "MultiBarRightButton",`,
    `  MULTIACTIONBAR4BUTTON = "MultiBarLeftButton",`,
    `}`,
    ``,
    `local function hexColor(hex)`,
    `  return tonumber(string.sub(hex, 1, 2), 16) / 255, tonumber(string.sub(hex, 3, 4), 16) / 255, tonumber(string.sub(hex, 5, 6), 16) / 255`,
    `end`,
    ``,
    `local function buttonForCommand(command)`,
    `  local prefix, number = string.match(command, "(MULTIACTIONBAR%dBUTTON)(%d+)")`,
    `  if not prefix then return nil end`,
    `  local base = BUTTON_FRAMES[prefix]`,
    `  if not base then return nil end`,
    `  return _G[base .. number]`,
    `end`,
    ``,
    `local decoratedButtons = {}`,
    ``,
    `local function db()`,
    `  KeybindOptimizerDB = KeybindOptimizerDB or {}`,
    `  if KeybindOptimizerDB.decor == nil then KeybindOptimizerDB.decor = true end`,
    `  if KeybindOptimizerDB.legend == nil then KeybindOptimizerDB.legend = true end`,
    `  return KeybindOptimizerDB`,
    `end`,
    ``,
    `local function decorateButton(bind)`,
    `  if not bind.command or not bind.color then return end`,
    `  local button = buttonForCommand(bind.command)`,
    `  if not button then return end`,
    `  local r, g, b = hexColor(bind.color)`,
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
    `  button.koNote = bind.note`,
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
    `  frame:SetSize(190, 34 + #LEGEND * 18)`,
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
    `  for index, entry in ipairs(LEGEND) do`,
    `    local swatch = frame:CreateTexture(nil, "OVERLAY")`,
    `    swatch:SetSize(10, 10)`,
    `    swatch:SetPoint("TOPLEFT", 10, -10 - index * 18)`,
    `    local r, g, b = hexColor(entry.color)`,
    `    swatch:SetColorTexture(r, g, b, 1)`,
    `    local text = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")`,
    `    text:SetPoint("LEFT", swatch, "RIGHT", 6, 0)`,
    `    text:SetText(entry.label)`,
    `  end`,
    `  legendFrame = frame`,
    `  return frame`,
    `end`,
    ``,
    `updateLegend = function()`,
    `  if #LEGEND == 0 then return end`,
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
    `local function wipeManagedBars()`,
    `  for _, slot in ipairs(MANAGED_SLOTS) do`,
    `    if HasAction(slot) then`,
    `      PickupAction(slot)`,
    `      ClearCursor()`,
    `    end`,
    `  end`,
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
    `  wipeManagedBars()`,
    `  local bound, placed = 0, 0`,
    `  local skipped = {}`,
    `  local usedBars = {}`,
    `  for index, bind in ipairs(BINDS) do`,
    `    local name = nil`,
    `    local known = true`,
    `    if bind.spell then`,
    `      name = resolveSpellName(bind.spell)`,
    `      known = name ~= nil and knowsSpell(bind.spell)`,
    `    end`,
    `    if known then`,
    `      local body = buildMacroBody(bind, name)`,
    `      if body then`,
    `        local label = string.format("KO%02d", index)`,
    `        if makeMacro(label, body) then`,
    `          local onBar = false`,
    `          if bind.slot then`,
    `            ClearCursor()`,
    `            PickupMacro(label)`,
    `            onBar = placeVerified(bind.slot)`,
    `          end`,
    `          if onBar then`,
    `            placed = placed + 1`,
    `            bindKeyToCommand(bind.key, bind.command)`,
    `            usedBars[tonumber(string.match(bind.command, "MULTIACTIONBAR(%d)"))] = true`,
    `            decorateButton(bind)`,
    `          else`,
    `            SetBindingMacro(bind.key, label)`,
    `          end`,
    `          bound = bound + 1`,
    `        else`,
    `          table.insert(skipped, label)`,
    `        end`,
    `      elseif bind.spell then`,
    `        local onBar = false`,
    `        if bind.slot then`,
    `          ClearCursor()`,
    `          pickupSpell(bind.spell)`,
    `          onBar = placeVerified(bind.slot)`,
    `        end`,
    `        if onBar then`,
    `          placed = placed + 1`,
    `          bindKeyToCommand(bind.key, bind.command)`,
    `          usedBars[tonumber(string.match(bind.command, "MULTIACTIONBAR(%d)"))] = true`,
    `          decorateButton(bind)`,
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
    `  print(string.format("|cff7c78ff%s|r: %d keys bound, %d abilities placed on bars 2-5", ADDON, bound, placed))`,
    `  if #skipped > 0 then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: skipped (not known by this character): " .. table.concat(skipped, ", "))`,
    `  end`,
    `  if GetActionBarToggles and placed > 0 then`,
    `    local bar1, bar2, bar3, bar4 = GetActionBarToggles()`,
    `    local toggles = { bar1, bar2, bar3, bar4 }`,
    `    for barNumber = 1, 4 do`,
    `      if usedBars[barNumber] and not toggles[barNumber] then`,
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
    `    if HasAction(slot) then`,
    `      PickupAction(slot)`,
    `      ClearCursor()`,
    `    end`,
    `  end`,
    `  print("|cff7c78ff" .. ADDON .. "|r: main action bar cleared")`,
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
    `  elseif command == "help" then`,
    `    print("|cff7c78ff" .. ADDON .. "|r: /kbo — apply layout, /kbo colors — toggle category colors, /kbo legend — toggle legend, /kbo clearmain — clear the main action bar")`,
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
