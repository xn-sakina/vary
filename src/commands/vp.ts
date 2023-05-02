import { cmd } from '../utils/cmd'

/**
 * Run changeset version command for up pkgs version
 */
export const vp = async () => {
  await cmd(`changeset version`)
}
