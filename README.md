# metal-rules 

Foundry VTT Module

Homebrew Rules

1 - Stress - Add a stress counter for D&D 5.5 that acts as Exhaustion
    The penalty applied is whichever is higher, Stress or Exhaustion

2 - Homebrew Classes
    - Accursed 

## Accursed compendium-driven features

Maledictions and other features are configured on the Item itself (no code edits required). Create each feature as a Feat in the module's Item compendium and set these fields:

- system.identifier (preferred) or flags.metal-rules.handler
  - A stable key that maps to a handler in the module. Examples:
    - `accursed.malediction.evil-eye`
    - `accursed.malediction.hex-armor`
    - `accursed.malediction.shadow-step`
    - `accursed.malediction.unholy-fury`
    - `accursed.malediction.brutal-fury`
    - `accursed.malediction.hex-shield`
    - `accursed.malediction.improved-shadow-step`
    - `accursed.malediction.shroud-of-darkness`

- flags.metal-rules.uses (optional)
  - Controls how the feature consumes/refreshes uses:
    - `doom-refresh` (default): 1 use; refreshes on Doom activation and long rest
    - `doom-only`: usable only while Doom is active; infinite uses
    - `permanent`: passive; no usage gating

- Optional tuning flags per item (read by handlers when applicable)
  - flags.metal-rules.range: number (e.g., 60)
  - flags.metal-rules.dcFormula: string (e.g., `8 + @prof + @abilities.con.mod`)

### How it works

- When a Feat is used, the module listens to `dnd5e.useItem` and looks up the handler key from `system.identifier` or `flags.metal-rules.handler`.
- If a handler exists, it runs the appropriate effect and consumes/validates uses based on `flags.metal-rules.uses`.
- Usage tracking is stored per-actor under `flags.metal-rules.malediction-uses` keyed by the handler key.
- Existing Doom refresh logic also refreshes malediction uses.

### Class Advancements

- Add Item Choice advancements on the Accursed class at levels 2 (+2), 9 (+1), and 13 (+1), filtering for Feats whose name starts with `Malediction:` or tagged appropriately.
- Add Scale advancements for `doom-uses` and `doom-die`. Reference them in descriptions/effects via `@scale.accursed.doom-uses` and `@scale.accursed.doom-die`.

