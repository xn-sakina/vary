import { getPackages } from '@manypkg/get-packages'

export const getPkgs = async ({ root }: { root: string }) => getPackages(root)
