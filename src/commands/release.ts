import assert from 'assert'
import chalk from 'chalk'
import { existsSync, readJsonSync } from 'fs-extra'
import { join } from 'path'
import { cmd } from '../utils/cmd'
import { ICmdOpts } from './interface'
import { vp } from './vp'

/**
 * Only use changeset publish to npm
 */
export const releaseOnly = async () => {
  await cmd(`changeset publish`, {
    env: {
      ...process.env,
      npm_config_registry: 'https://registry.npmjs.com/',
    },
  })
}

/**
 * First up pkgs version, then publish to npm
 */
export const releaseQuick = async () => {
  await vp()
  await releaseOnly()
}

/**
 * First build all pkgs, then publish to npm
 */
export const release = async (opts: ICmdOpts) => {
  const pkgPath = join(opts.root, './package.json')
  assert(existsSync(pkgPath), chalk.red(`package.json not found !`))

  const pkg = readJsonSync(pkgPath, { encoding: 'utf-8' })
  const scripts = pkg?.scripts
  assert(
    Boolean(scripts?.build?.length),
    chalk.red(`package.json#script.build must exist !`)
  )

  await cmd(`npm run build`)
  await releaseOnly()
}
