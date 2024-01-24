# @xn-sakina/vary

[Changesets](https://github.com/changesets/changesets) command shortcut sets

## Install

```bash
  # pnpm v8
  pnpm add -D -w @xn-sakina/vary
  # pnpm v7
  pnpm add -DW @xn-sakina/vary
```

## Usage

In monorepo root initial all `changesets` shortcut commands:

```bash
  pnpm vary init
```

### Commands

command|alias|description
:-:|:-:|:-
`clean:output`|`clean`|Clean all pkgs build output (`dist`/`build`/`es`)
`init`|`i`|Init changeset shortcut command sets
`push`|`p`|Refresh changeset config file `ignore` field then run `changeset` command (All `private: true` packages will add to `ignore`)
`release`|`r`|First build all pkgs(`npm run build`), then publish to npm
`release:only`|`ro`|Only use changeset publish to npm
`release:quick`|`rq`|First up pkgs version, then publish to npm
`vp`|`version-packages`|Run `changeset version` command for up pkgs version
`sync`|`s`|Sync all public packages to some registry
`napi-publish`|`np`|Publish multi platforms pkgs to npm with napi

## Example

#### Case 1: 3 steps normal publish

```bash
  # 1. Select will publish pkg and write changelog 
  pnpm push
  # 2. Upgrade pkgs version
  pnpm vp
  # 3. Build all pkgs output(auto `npm run build`) then publish to npm
  pnpm release
```

#### Case 2: 2 steps quick publish

```bash
  # 1. Select will publish pkg and write changelog 
  pnpm push
  # 2. Direct publish to npm, still not need build pkg
  pnpm release:quick
```

#### Case 3: only publish package

```bash
  # Only execute publish
  pnpm release:only
```

## Sync packages

### Sync command

```bash
  # Will auto sync all public packages to cnpm by default
  pnpm vary sync
```

Use `process.env.VARY_SYNC_AGENTS` to sync multi registries:

```bash
  # Sync to `cnpm` and `tnpm`
  VARY_SYNC_AGENTS=cnpm,tnpm pnpm vary sync
```

### Sync Github actions

```yml
name: Sync packages

on:
  push:
    # An event will not be created when you create more than three tags at once.
    # https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#create
    tags:
      - '*'
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout 🛎️
        uses: actions/checkout@v3

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          registry-url: 'https://registry.npmjs.com/'

      - name: Sync dependencies
        run: |
          npm i -g cnpm @xn-sakina/vary
          vary sync
```

## Napi publish

Manually publish napi packages without `napi-build` and `build.rs`

```bash
  pnpm vary napi-publish
  # or `pnpm vary np`
```

Publish root package:

```bash
  pnpm vary np --root
```

Publish wasm package:

```bash
  # for Node.js
  pnpm vary np --wasm
  # for web
  pnpm vary np --wasm-web
```

Wasm-opt:

```bash
  pnpm vary np --wasm-opt ./target/wasm/index.wasm
```

## License

MIT
