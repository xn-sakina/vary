import { cmd } from '../utils/cmd'
import type { ICmdOpts } from './interface'

/**
 * Run changeset version command for up pkgs version
 */
export const vp = async (opts: ICmdOpts) => {
  await cmd(`changeset version`)
}
