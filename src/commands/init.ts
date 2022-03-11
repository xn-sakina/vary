import assert from 'assert'
import chalk from 'chalk'
import { existsSync, readJsonSync, writeFileSync } from 'fs-extra'
import { join } from 'path'
import { ICmdOpts } from './interface'

const DEFAULT_COMMADS: Record<string, string> = {
  push: 'vary push',
  vp: 'vary vp',
  release: 'vary release',
  'release:only': 'vary release:only',
  'release:quick': 'vary release:quick',
  'clean:output': 'vary clean:output',
  build: 'pnpm -r --filter ./packages run build',
}

/**
 * Init changeset shortcut command sets
 */
export const init = async (opts: ICmdOpts) => {
  const pkgPath = join(opts.root, './package.json')
  assert(existsSync(pkgPath), chalk.red(`package.json not found !`))

  const pkg = readJsonSync(pkgPath, { encoding: 'utf-8' })
  pkg.scripts ??= {}
  Object.entries(DEFAULT_COMMADS).forEach(([name, script]) => {
    if (!pkg.scripts[name]) {
      pkg.scripts[name] = script
      console.log(`Set ${chalk.green(name)} command success`)
      return
    }
    console.log(`Command ${chalk.yellow(name)} existed`)
  })

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, {
    encoding: 'utf-8',
  })
}
