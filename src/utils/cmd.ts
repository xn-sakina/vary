import chalk from '@xn-sakina/vary/compiled/chalk'
import execa, { type Options } from 'execa'

export const cmd = async (cmd: string, opts?: Options) => {

  if (process.env.DEBUG_VARY) {
    console.log(`${chalk.blue('vary: ')} ${cmd}`)
    return
  }

  await execa.command(cmd, {
    stdio: 'inherit',
    ...opts,
  })
}
