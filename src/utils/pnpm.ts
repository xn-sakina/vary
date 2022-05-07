import execa from 'execa'

export const getPnpmVersion = async () => {
  return (await execa('pnpm', ['--version'])).stdout.trim()
}
