# unified-modules

Script-module registry for the [Unified CLI](https://github.com/vertX-dev/unified-cli).
`unified install <name>` fetches this repo and vendors a module's files into a
behavior pack at `scripts/unified/<name>/`.

## Layout

```
README.md
modules/
  JavaScript/
    <name>/
      module.toml      # metadata (not copied into packs)
      *.js             # the module's source files
  TypeScript/
    <name>/
      module.toml
      *.ts
```

A module may exist in one or both flavors. The CLI picks the flavor from the
behavior pack's manifest (`script` module `language`), overridable with
`--js` / `--ts`. Keep the two flavors functionally in sync.

## `module.toml`

```toml
name        = "requests"
version     = "0.1.0"
description = "Promise-based request/response messaging over script events"
include     = ["requests.js"]        # default install set (omit = every file)

[parts]                              # optional file groups:
debug = ["debug/"]                   # `unified install requests --with debug`

[dependencies]                       # manifest deps the module needs;
"@minecraft/server" = "2.1.0-beta"   # `unified install` adds missing ones
                                     # to the pack's manifest.json
```

Every field is optional, but `version` powers update tracking and
`description` shows up in `unified available`. `include` and `[parts]` list
paths inside the module; a folder takes everything under it. `default` and
`all` are reserved part names.

## Consuming

```sh
unified available                          # list modules (and their parts)
unified install requests                   # vendor into <BP>/scripts/unified/requests/
unified install requests --with debug      # default set + a part
unified install requests --files util.js   # only this file (+ siblings it imports)
unified uninstall requests
unified list
```

Sibling files a selected script imports are installed with it, and the
selection is remembered in `unified.cfg` for updates.

The CLI fetches the `main` branch as a zipball — no git required. Point
`[modules].registry` in `unified.toml` at a fork, a zip URL, or a local
checkout of this repo to test changes before pushing.

## Adding a module

1. Create `modules/JavaScript/<name>/` (and/or `modules/TypeScript/<name>/`).
2. Add the source files plus a `module.toml`.
3. Keep modules self-contained: no imports outside their own folder, except
   `@minecraft/*` modules declared in `[dependencies]`. Import siblings with
   relative paths (`./colorLib.js`) so partial installs can follow them.
4. Keep build tooling (generators, fixtures) out of the module folder. Every
   file in it can end up in a pack.
5. Bump `version` on every change — installs always fetch `main`.
