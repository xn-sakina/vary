import execa, { type Options } from 'execa'

export const cmd = async (cmd: string, opts?: Options) => {
  await execa.command(cmd, {
    stdio: 'inherit',
    ...opts,
  })
}
