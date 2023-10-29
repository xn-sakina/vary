import chalk from '@xn-sakina/vary/compiled/chalk'
import { getPkgs } from '../utils/getPkgs'
import { ICmdOpts } from './interface'
import execa from 'execa'

export const sync = async (opts: ICmdOpts) => {
  const pkgs = await getPkgs(opts)
  const publicPackages: string[] = []
  pkgs.packages.forEach((submodule) => {
    const isPrivate = submodule.packageJson?.private
    const name = submodule.packageJson?.name
    if (!isPrivate && name?.length) {
      publicPackages.push(name)
    }
  })

  if (!publicPackages.length) {
    console.log(chalk.red(`Not found any public packages.`))
    return
  }

  const syncToAgents = process.env.VARY_SYNC_AGENTS || 'cnpm' // e.g. 'cnpm,tnpm'
  const agents = syncToAgents.split(',') || []
  console.log(`Will sync to ${agents.length} agents: ${agents.join(', ')}`)

  if (!agents.length) {
    console.log(
      chalk.red(`Not found any agents, please set VARY_SYNC_AGENTS env.`),
    )
    return
  }

  console.log(`Will sync ${publicPackages.length} packages.`)
  console.log(`Packages: \n ${JSON.stringify(publicPackages, null, 2)}`)

  const trySync = async (agent: string) => {
    try {
      await execa(agent, ['--version'])
    } catch {
      // ignore
      console.log(chalk.red(`Not found ${agent}, please install it first.`))
      return
    }

    // sync
    console.log(`Try sync to ${chalk.cyan(agent)}...`)
    try {
      await execa(agent, ['sync', ...publicPackages], {
        stdio: 'inherit',
      })
    } catch (e) {
      console.log(chalk.red(`Sync to ${agent} failed.`))
      console.log(e)
      return
    }

    console.log(chalk.green(`Sync to ${agent} success.`))
  }

  // parallel sync
  for (const agent of agents) {
    await trySync(agent)
  }
}
