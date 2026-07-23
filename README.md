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

[dependencies]                       # manifest deps the module needs;
"@minecraft/server" = "2.1.0-beta"   # `unified install` adds missing ones
                                     # to the pack's manifest.json
```

Every field is optional, but `version` powers update tracking and
`description` shows up in `unified available`.

## Consuming

```sh
unified available          # list modules in this registry
unified install requests   # vendor into <BP>/scripts/unified/requests/
unified uninstall requests
unified list
```

The CLI fetches the `main` branch as a zipball — no git required. Point
`[modules].registry` in `unified.toml` at a fork, a zip URL, or a local
checkout of this repo to test changes before pushing.

## Adding a module

1. Create `modules/JavaScript/<name>/` (and/or `modules/TypeScript/<name>/`).
2. Add the source files plus a `module.toml`.
3. Keep modules self-contained: no imports outside their own folder, except
   `@minecraft/*` modules declared in `[dependencies]`.
4. Bump `version` on every change — installs always fetch `main`.
