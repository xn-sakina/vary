import { cleanOutput } from './clean'
import { ICmd, ICmdOpts } from './interface'
import { push } from './push'
import { release, releaseOnly, releaseQuick } from './release'
import { vp } from './vp'
import { program } from 'commander'
import { init } from './init'
import yParser from 'yargs-parser'

const CMDS: Record<string, ICmd> = {
  push: {
    cmd: ['push'],
    method: push,
    description: `Refresh changeset config file 'ignore' field then run 'changeset' command`,
  },
  vp: {
    cmd: ['vp', 'version-packages'],
    method: vp,
    description: `Run 'changeset version' command for up pkgs version`,
  },
  release: {
    cmd: ['release'],
    method: release,
    description: `First build all pkgs, then publish to npm`,
  },
  releaseQuick: {
    cmd: ['release:quick'],
    method: releaseQuick,
    description: `First up pkgs version, then publish to npm`,
  },
  releaseOnly: {
    cmd: ['release:only'],
    method: releaseOnly,
    description: `Only use changeset publish to npm`,
  },
  cleanOutput: {
    cmd: ['clean:output'],
    method: cleanOutput,
    description: `Clean all pkgs build output (dist/build/es)`,
  },
  init: {
    cmd: ['init'],
    method: init,
    description: `Init changeset shortcut command sets`,
  },
}

export const registry = () => {
  const opts: ICmdOpts = {
    root: process.cwd(),
    argv: yParser(process.argv.slice(2)),
  }
  Object.keys(CMDS)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      const { cmd, method, description } = CMDS[key]
      const [mainCmd, aliasCmd] = cmd
      let chain = program.command(mainCmd)
      if (aliasCmd?.length) {
        chain = chain.alias(aliasCmd)
      }
      chain.description(description).allowUnknownOption(true).action(async () => {
        await method(opts)
      })
    })
}
