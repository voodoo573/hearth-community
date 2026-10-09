# Contributing to Hearth Community Content

Thanks for sharing your homebrew! Everything merged here shows up in the Content Library of
[Hearth](https://hearthdnd.org) for every player.

## The rules

1. **Original or properly licensed content only.** Submit your own work, or work you have
   permission to share under CC BY 4.0, and credit others in the `credits` field.
2. **No copyrighted non-SRD text.** Don't copy from the Player's Handbook, Xanathar's, Tasha's,
   Monster Manual or any other book beyond the free 5e System Reference Document (SRD 5.1).
   Don't reuse non-SRD names, such as specific setting characters, places or monsters.
3. **Family-friendly.** Hearth is played by all ages, so no sexual content, gore, slurs or hateful
   themes.
4. **Maps must be under 5 MB.** PNG, JPG or WebP only. About 1400 px on the long edge is plenty,
   because Hearth scales maps to that size anyway.
5. **By submitting, you license your content under
   [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**, with credit to your GitHub handle.

Maintainers may ask for balance tweaks, or decline items that duplicate existing content or
don't fit.

## How to submit (fork and pull request)

1. **Fork** this repo: <https://github.com/voodoo573/hearth-community/fork>
2. In your fork, add **one JSON file per item** to the right folder. Copy the example in that
   folder as a starting point.
   - The file name must be the item's `id` plus `.json`, for example `spells/frost-lantern.json`.
   - For a map, put the image in `maps/` too, named after the id, such as `maps/sunken-crypt.png`.
3. (Optional, recommended) Check it locally with Node.js 18 or later:
   `node scripts/build-index.mjs --check`
4. **Don't edit `index.json`.** It's rebuilt automatically when your PR is merged.
5. Open a **pull request** against `main`. The template has a short checklist. An automatic
   check validates your files, and if it fails, the log tells you exactly what to fix.
6. A maintainer reviews it and merges it. Your item appears in Hearth shortly afterwards.

You can also use the editor on github.com: open the folder, choose **Add file → Create new
file**, paste your JSON, and GitHub will offer to fork the repo and open a PR for you.

Not comfortable with Git? Use the
[submission form](https://github.com/voodoo573/hearth-community/issues/new/choose) instead.

## File format

Every item is one JSON object with these **common fields**:

| Field         | Required | Notes |
|---------------|----------|-------|
| `id`          | yes | kebab-case (`a-z`, `0-9`, `-`), unique across the whole repo, same as the file name |
| `name`        | yes | Display name, 2–60 characters |
| `type`        | yes | `race`, `subclass`, `spell`, `feat`, `background`, `monster` or `map`. It must match the folder. |
| `version`     | yes | `1.0.0` for a new item. Bump it when you change it, e.g. `1.0.1` for fixes or `1.1.0` for rules changes. |
| `author`      | yes | Your GitHub handle, without `@` |
| `source`      | yes | Always `"homebrew"` |
| `edition`     | yes | Always `"5e"` |
| `description` | yes | Plain text for the card and preview, 10–2000 characters |
| `tags`        | yes | Up to 12 kebab-case tags, e.g. `["fire", "low-cr"]`. Use `[]` for none. |
| `summary`     | no  | A one-liner of up to 140 characters for the library list. Defaults to the start of `description`. |
| `credits`     | no  | Co-authors, art credit, inspiration |
| `license`     | no  | If present, must be `"CC-BY-4.0"` |
| `$schema`     | no  | e.g. `"../schema/spell.schema.json"`, which gives you autocomplete in VS Code |
| `data`        | yes | Type-specific fields, described below |

Anything else at the top level is rejected. Inside `data`, `name` must be the same as the top-level
`name`.

Keys follow Hearth's conventions. Abilities are `str` `dex` `con` `int` `wis` `cha`. Skills
are snake_case, such as `sleight_of_hand` or `animal_handling`. Classes are lowercase:
`barbarian` `bard` `cleric` `druid` `fighter` `monk` `paladin` `ranger` `rogue` `sorcerer`
`warlock` `wizard`. A "feature" is always `{ "name": "...", "desc": "..." }`.

### Race (`races/`): see `schema/race.schema.json`

`data`: `name`, `speed` (feet), `size` (`Small` or `Medium`), `bonuses`, `languages`, `traits`
are required.
- `bonuses`: e.g. `{ "con": 2 }`, `{ "all": 1 }`, or `{ "cha": 2, "choose": { "count": 2, "value": 1 } }`
- Optional: `proficiencies` (`{ "skills": [...] }`), `spellAbility`,
  `racialSpells` (`[{ "spell": "Light", "level": 0, "atLevel": 3, "freePerLongRest": 1 }]`),
  `racialAbilities` (`[{ "id", "name", "action": "action|bonus|reaction", "usesPerLongRest": 2 | "prof", "recovery": "short|long", "desc" }]`)
- `subraces`: an object keyed by a snake_case key. Each subrace has `name` and `traits`, and
  optionally `bonuses`, `speed`, `spellAbility`, `racialSpells`, `racialAbilities` and `proficiencies`.

### Subclass (`subclasses/`): see `schema/subclass.schema.json`

`data`: `klass` (parent class), `id` (snake_case, usually your id with `-` replaced by `_`),
`name`, `desc` (one line), `levelFeatures`.
- `levelFeatures` is keyed by class level: `{ "3": [ {feature}, ... ], "7": [...] }`
- Features may carry optional structured `effects` that Hearth's Subclass Forge understands,
  such as `{ "kind": "skill", "skill": "perception", "level": "prof" }` or
  `{ "kind": "resist", "dtype": "necrotic" }`. If you're unsure, leave `effects` out, because the
  text alone works.

### Spell (`spells/`): see `schema/spell.schema.json`

`data`: `name`, `level` (0 for cantrips, up to 9), `school`, `classes`, `time` (`action`,
`bonus_action`, `reaction` or text like `1 minute`), `range`, `components` (`"V, S, M"`),
`duration`, `desc`, `kind` (`attack`, `save`, `heal`, `auto` or `utility`).
- Optional: `save` (required when `kind` is `save`), `damageType`, `concentration`, `ritual`,
  `dice` (`{ "count": 2, "sides": 8 }`, required for `attack`, `heal` and `auto`),
  `scaleType` (`cantrip` or `slot`) and `scaleAt` (`{ "dice": 1 }` = +1 die per step).

### Feat (`feats/`): see `schema/feat.schema.json`

`data`: `id` (snake_case), `name`, `desc`. Optional: `prerequisite` and `hpPerLevel`
(as in the Tough feat).

### Background (`backgrounds/`): see `schema/background.schema.json`

`data`: `name`, `skills` (exactly 2), `gold`, `equipment` (list), and `feature` (`{name, desc}`).

### Monster (`monsters/`): see `schema/monster.schema.json`

`data`: `name`, `cr` (0, 0.125, 0.25, 0.5, then 1 to 30), `size`, `type` (`beast`, `undead`, …),
`ac`, `hp`, `hpFormula` (`"4d8+4"`), `speed` (`{ "walk": 30, "fly": 60 }`),
`abilities` (all six scores) and `actions` (a list of features) are required.
- Optional: `skills` (`{ "stealth": "+5" }`), `senses`, `damageVulnerabilities`,
  `damageResistances`, `damageImmunities`, `conditionImmunities` (text), `legendary` and `traits`.
- Write attacks the way Hearth does: `"Melee Attack: +5 to hit, 5 ft. Hit: 1d6+3 slashing."`

### Map (`maps/`): see `schema/map.schema.json`

Two or three files: `maps/<id>.json`, `maps/<id>.png` (or `.jpg`/`.webp`) and, optionally, a
thumbnail of about 220 px wide, under 200 KB, e.g. `maps/<id>-thumb.png`.

`data`: `image` (file name), `widthPx` and `heightPx` (must match the image) are required.
Optional: `thumbnail`, `gridSizePx` (pixels per 5-ft square), `gridCols`, `gridRows`, `setting`.

## What the automatic check enforces

- Valid JSON that matches the schema for its type
- `type` matches the folder, and the file name equals `id`
- `id` is unique across the repo
- No unknown top-level fields
- Map images exist, are under 5 MB, match `widthPx`/`heightPx`, and every image in `maps/` is
  used by a map file
- No sub-folders or stray files in content folders

Questions? Open an issue.
