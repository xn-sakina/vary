# @xn-sakina/vary

[Changesets](https://github.com/changesets/changesets) command shortcut sets

## Install

```bash
  pnpm add -DW @xn-sakina/vary
```

## Usage

In monorepo root initial all `changesets` shortcut commands:

```bash
  pnpm vary init
```

### Commands

command|description
:-:|:-
`clean:output`|Clean all pkgs build output (`dist`/`build`/`es`)
`init`|Init changeset shortcut command sets
`push`|Refresh changeset config file `ignore` field then run `changeset` command (All `private: true` packages will add to `ignore`)
`release`|First build all pkgs(`npm run build`), then publish to npm
`release:only`|Only use changeset publish to npm
`release:quick`|First up pkgs version, then publish to npm
`vp`|Run `changeset version` command for up pkgs version

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

## License

MIT
