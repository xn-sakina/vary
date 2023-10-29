import chalk from '@xn-sakina/vary/compiled/chalk'
import { remove, existsSync } from 'fs-extra'
import { join } from 'path'
import { getPkgs } from '../utils/getPkgs'
import { ICmdOpts } from './interface'

const DEFAULT_OUTPUT = ['dist', 'es', 'build']

/**
 * Clean all pkgs build output (dist/build/es)
 */
export const cleanOutput = async (opts: ICmdOpts) => {
  const pkgs = await getPkgs(opts)
  pkgs.packages.forEach(({ dir, packageJson }) => {
    DEFAULT_OUTPUT.forEach(async (output) => {
      const outputPath = join(dir, output)
      if (!existsSync(outputPath)) {
        return
      }
      await remove(outputPath)
      console.log(
        `Delete pkg ${chalk.green(packageJson.name)} output ${chalk.blue(
          output
        )} success`
      )
    })
  })
}
