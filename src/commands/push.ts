import { getPkgs } from '../utils/getPkgs'
import { ICmdOpts } from './interface'
import { join } from 'path'
import { existsSync, readJSONSync } from 'fs-extra'
import assert from 'assert'
import chalk from '@xn-sakina/vary/compiled/chalk'
import { isEqual } from 'lodash'
import { writeFileSync } from 'fs'
import { cmd } from '../utils/cmd'

/**
 * Refresh changeset config file `ignore` field then run `changeset` command
 */
export const push = async (opts: ICmdOpts) => {
  const pkgs = await getPkgs(opts)
  const appNames: string[] = []
  pkgs.packages.forEach((submodule) => {
    const isPrivate = submodule.packageJson?.private
    const name = submodule.packageJson?.name
    if (isPrivate && name) {
      appNames.push(name)
    }
  })

  const changesetsConfigPath = join(opts.root, './.changeset/config.json')
  assert(
    existsSync(changesetsConfigPath),
    chalk.red(`Changesets config file not found !`),
  )

  const config = readJSONSync(changesetsConfigPath, { encoding: 'utf-8' })
  if (!isEqual(config.ignore, appNames)) {
    config.ignore = appNames
    writeFileSync(
      changesetsConfigPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8',
    )
  }

  console.log(chalk.cyan(`Refresh config ignore list complete`))

  await cmd('changeset')
}
