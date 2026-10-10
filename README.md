# Hearth Community Content

Homebrew races, subclasses, spells, feats, backgrounds, monsters, weapons, magic items and battle maps for
**[Hearth](https://hearthdnd.org)**, the D&D 5e companion app.

Everything here is made and shared by the community. Approved items appear in the
**Content Library** inside Hearth, where anyone can preview them and add them to their app
with one tap.

> Want to add something? Read **[CONTRIBUTING.md](CONTRIBUTING.md)**. You can open a pull
> request, or use the [submission form](https://github.com/voodoo573/hearth-community/issues/new/choose)
> if you'd rather not touch Git.

## How content gets into Hearth

1. A contributor adds one JSON file (plus an image, for maps) and opens a pull request.
2. GitHub Actions checks it automatically (`.github/workflows/validate.yml`).
3. A maintainer reviews it and merges it into `main`.
4. On merge, a second workflow (`.github/workflows/build-index.yml`) regenerates
   [`index.json`](index.json), the catalogue of everything in the repo.
5. Hearth's Content Library fetches `index.json` from the raw URL below, lists each item on
   its shelf, shows a preview, and downloads the item's file when someone taps **Add**.

Raw base URL used by the app:

```
https://raw.githubusercontent.com/voodoo573/hearth-community/main/
```

So the index is at `https://raw.githubusercontent.com/voodoo573/hearth-community/main/index.json`,
and each entry's `path` (for example `races/example-emberkin.json`) is appended to the same base.

## What's in the repo

| Folder         | Shelf in Hearth | One file per                                    |
|----------------|-----------------|-------------------------------------------------|
| `races/`       | Races           | playable race, with optional subraces           |
| `subclasses/`  | Subclasses      | subclass for an existing class                  |
| `spells/`      | Spells          | spell                                           |
| `feats/`       | Feats           | feat                                            |
| `backgrounds/` | Backgrounds     | background                                      |
| `monsters/`    | Monsters        | creature for the DM bestiary                    |
| `maps/`        | Maps            | battle map: an image plus a small JSON metadata file |
| `weapons/`     | Weapons         | weapon (same fields as Hearth's Custom Weapon builder) |
| `magic-items/` | Magic Items     | magic item (same fields as Hearth's Magic Item Forge) |
| `schema/`      | (none)          | JSON Schema for each type, plus `index.schema.json` |
| `scripts/`     | (none)          | `build-index.mjs`, the validator and index generator |

Each folder has one example item, marked **(Example)** in its name, `"example": true` and the
`example` tag. They show the format and can be removed once real content arrives.

Item files use the same shapes Hearth uses internally (its `RACES`, `SUBCLASSES`, `SPELLS`,
`FEATS`, `BACKGROUNDS` and `MONSTERS` data, the object its Custom Weapon builder saves, and
the items its Magic Item Forge stores), so imported items work just like built-in ones.

## `index.json`

`index.json` is **generated**, so please never edit it by hand. It looks like this:

```json
{
  "schemaVersion": 1,
  "updated": "2026-10-09T21:29:48Z",
  "items": [
    {
      "id": "example-emberkin",
      "type": "race",
      "name": "Emberkin (Example)",
      "author": "voodoo573",
      "summary": "Example race: small hearth-born folk with a warm inner glow.",
      "path": "races/example-emberkin.json",
      "version": "1.0.0",
      "tags": ["example", "small", "fire"],
      "example": true
    }
  ]
}
```

Map entries also have a `thumbnail` path. The full format is in
[`schema/index.schema.json`](schema/index.schema.json).

## Running the checks locally

You need Node.js 18 or later. No `npm install` is needed.

```sh
node scripts/build-index.mjs --check   # validate only
node scripts/build-index.mjs           # validate and rewrite index.json (maintainers / CI)
```

## Licences

- **Content** (everything in the content folders, plus `index.json`) is licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `LICENSE-CONTENT.txt`.
  If you reuse an item, credit its author, which is the GitHub handle in its `author` field.
  Items reused from CC BY 4.0 publications (A5E SRD, Black Flag Reference Document) carry the
  publisher's attribution in their `credits` field; keep it when you reuse them.
- **OGL items**: items whose `license` is `OGL-1.0a` (for example races and subclasses from
  Kobold Press's Tome of Heroes) are Open Game Content under the Open Game License v1.0a, not
  CC BY 4.0. See `LICENSE-OGL.txt` for the licence and its Section 15 copyright notices.
- **Code** (`scripts/`, `schema/`, `.github/`) is licensed under the MIT License. See `LICENSE`.

Hearth is an unofficial fan project and isn't affiliated with or endorsed by Wizards of the
Coast. Only original homebrew and SRD-compatible material is accepted here.
