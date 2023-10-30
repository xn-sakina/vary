import { ICmdOpts } from './interface'
import { sortPackageJson } from '@xn-sakina/vary/compiled/sort-package-json'
import assert from 'assert'
import { difference, pick } from 'lodash'
import { basename, join } from 'path'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  removeSync,
  writeFileSync,
} from 'fs-extra'
import { readdirSync } from 'fs'
import { cmd } from '../utils/cmd'
import chalk from '@xn-sakina/vary/compiled/chalk'
import YAML from 'yaml'
import { releaseOnly } from './release'

interface IArch {
  /**
   * readme desc
   */
  desc: string
  /**
   * package json fields
   */
  pkg: Record<string, any>
  /**
   * rust target name
   */
  targetName: string
}

const ARCH_MAP: Record<string, IArch> = {
  'darwin-arm64': {
    desc: 'macOS ARM 64-bit',
    pkg: {
      os: ['darwin'],
      cpu: ['arm64'],
    },
    targetName: 'aarch64-apple-darwin',
  },
  'darwin-x64': {
    desc: 'macOS 64-bit',
    pkg: {
      os: ['darwin'],
      cpu: ['x64'],
    },
    targetName: 'x86_64-apple-darwin',
  },
  'linux-arm-gnueabihf': {
    desc: 'Linux ARM 32-bit',
    pkg: {
      os: ['linux'],
      cpu: ['arm'],
    },
    targetName: 'armv7-unknown-linux-gnueabihf',
  },
  'linux-arm64-gnu': {
    desc: 'Linux ARM 64-bit',
    pkg: {
      os: ['linux'],
      cpu: ['arm64'],
    },
    targetName: 'aarch64-unknown-linux-gnu',
  },
  'linux-arm64-musl': {
    desc: 'Linux ARM 64-bit (musl)',
    pkg: {
      os: ['linux'],
      cpu: ['arm64'],
    },
    targetName: 'aarch64-unknown-linux-musl',
  },
  'linux-x64-gnu': {
    desc: 'Linux 64-bit',
    pkg: {
      os: ['linux'],
      cpu: ['x64'],
    },
    targetName: 'x86_64-unknown-linux-gnu',
  },
  'linux-x64-musl': {
    desc: 'Linux 64-bit (musl)',
    pkg: {
      os: ['linux'],
      cpu: ['x64'],
    },
    targetName: 'x86_64-unknown-linux-musl',
  },
  'win32-arm64-msvc': {
    desc: 'Windows ARM 64-bit',
    pkg: {
      os: ['win32'],
      cpu: ['arm64'],
    },
    targetName: 'aarch64-pc-windows-msvc',
  },
  'win32-x64-msvc': {
    desc: 'Windows 64-bit',
    pkg: {
      os: ['win32'],
      cpu: ['x64'],
    },
    targetName: 'x86_64-pc-windows-msvc',
  },
}

export const napiPublish = async (opts: ICmdOpts) => {
  const { root, argv } = opts

  const rootPkgPath = join(root, 'package.json')
  const rootPkg = require(rootPkgPath)

  const packageName = rootPkg.name as string
  assert(packageName, `package.json#name is required`)
  const globalVersion = rootPkg.version
  assert(globalVersion, `package.json#version is required`)

  const repoUrl = rootPkg.repository?.url as string
  assert(
    repoUrl,
    `package.json#repository.url is required, e.g. https://github.com/user/repo`,
  )

  const release = async () => {
    const globalProps = pick(rootPkg, [
      'author',
      'homepage',
      'repository',
      'engines',
      'license',
      'publishConfig',
    ])
    const subPackagesPrefix = rootPkg.napi?.package?.name as string | undefined
    assert(
      subPackagesPrefix,
      `package.json#napi.package.name is required, e.g. @scope/pkg-prefix`,
    )

    // make sure napi config fields exist
    const nodeBinaryPrefix = rootPkg.napi?.name
    assert(
      nodeBinaryPrefix,
      `package.json#napi.name is required, e.g. package-name`,
    )
    const additional = rootPkg.napi?.triples?.additional as string[] | undefined
    assert(
      rootPkg.napi?.triples?.defaults === false && additional?.length,
      `package.json#napi.triples.defaults must be false, and manually config all platforms`,
    )

    const allSupportTargetList = Object.values(ARCH_MAP).map(
      (i) => i.targetName,
    )
    const notSupportPlatform = difference(additional, allSupportTargetList)
    if (notSupportPlatform?.length) {
      console.log(
        `Not support compililing these platforms config: ${notSupportPlatform.join(
          ', ',
        )}`,
      )
      console.log(`Supported platforms: ${additional.join(', ')}`)
      throw new Error(`Unsupported platform`)
    }

    const npmDir = join(root, './npm')
    if (!existsSync(npmDir)) {
      console.log(`The 'npm' dir does not exist, will be auto generated.`)
      mkdirSync(npmDir)
      Object.keys(ARCH_MAP).map((dirName) => {
        const dirPath = join(npmDir, dirName)
        // mkdir
        mkdirSync(dirPath)
        console.log(`Create 'npm/${dirName}' dir`)
        // create empty readme
        const readmePath = join(dirPath, 'README.md')
        writeFileSync(readmePath, '', 'utf-8')
        // create package.json
        const archPkgPath = join(dirPath, 'package.json')
        const pkgProps = ARCH_MAP[dirName].pkg
        writeFileSync(archPkgPath, JSON.stringify(pkgProps), 'utf-8')
      })
      console.log(`Create 'npm/*' dir successful`)
    } else {
      console.log(`The 'npm' dir exists`)
    }

    const dirs = readdirSync(npmDir)
      .filter((i) => i !== '.DS_Store')
      .map((p) => join(npmDir, p))

    const isReleaseRoot = argv?.root
    if (isReleaseRoot) {
      console.log(`Will release the root package.`)
      // build
      await cmd(`pnpm build`)

      const optionalDependencies = dirs.reduce<Record<string, string>>(
        (memo, cur) => {
          const arch = basename(cur)
          const pkgName = `${subPackagesPrefix}-${arch}`
          memo[pkgName] = globalVersion
          return memo
        },
        {},
      )
      // create publish dir
      const publishDir = join(root, 'dist')
      if (existsSync(publishDir)) {
        removeSync(publishDir)
      }
      mkdirSync(publishDir)
      const publishPkg = pick(rootPkg, [
        'name',
        'version',
        'main',
        'types',
        'description',
        'author',
        'homepage',
        'repository',
        'keywords',
        'license',
        'engines',
      ]) as Record<string, any>
      publishPkg.optionalDependencies = optionalDependencies
      writeFileSync(
        join(publishDir, 'package.json'),
        `${JSON.stringify(sortPackageJson(publishPkg), null, 2)}\n`,
        'utf-8',
      )
      assert(
        rootPkg.files?.length,
        `package.json#files is required, e.g. ['index.js']`,
      )
      // copy files
      const files = ['LICENSE', 'README.md', ...rootPkg.files]
      files.forEach((file) => {
        const sourcePath = join(root, file)
        if (!existsSync(sourcePath)) {
          // ensure index.js
          const isIndex = file === 'index.js'
          if (isIndex) {
            throw new Error(`File not found: ${sourcePath}`)
          }
          console.log(chalk.yellow(`File not found: ${sourcePath}, skip copy`))
          return
        }
        copyFileSync(sourcePath, join(publishDir, file))
      })
      // publish: root package only
      await cmd(
        `npm publish --registry https://registry.npmjs.com/`,
        {
          cwd: join(root, './dist')
        }
      )
      return
    }

    console.log(`Will release the sub packages.`)
    dirs.forEach((dir) => {
      const pkgPath = join(dir, 'package.json')
      const readmePath = join(dir, 'README.md')
      const pkg = require(pkgPath)
      const arch = basename(dir)
      const pkgName = `${subPackagesPrefix}-${arch}`
      const archInfo = ARCH_MAP[arch]
      const newReadmeContent = `
# \`${pkgName}\`

This is the \`${archInfo.desc}\` binary for [\`${packageName}\`](${repoUrl}).
`.trimStart()

      // patch pkg
      pkg.name = pkgName
      pkg.description = `This is the ${archInfo.desc} binary for ${packageName}.`
      pkg.version = globalVersion
      pkg.main = `${nodeBinaryPrefix}.${arch}.node`
      pkg.files = [pkg.main]
      // other props
      Object.assign(pkg, globalProps)

      // copy license
      const globalLicensePath = join(root, 'LICENSE')
      assert(
        existsSync(globalLicensePath),
        `LICENSE file is required in root dir`,
      )
      const licensePath = join(dir, 'LICENSE')
      copyFileSync(globalLicensePath, licensePath)

      // write readme
      writeFileSync(readmePath, newReadmeContent, 'utf-8')
      // write package.json
      writeFileSync(
        pkgPath,
        `${JSON.stringify(sortPackageJson(pkg), null, 2)}\n`,
        'utf-8',
      )

      console.log(chalk.green(`Patched: ${pkgName}`))
    })

    // add npm to workspace
    const pnpmWorkspacePath = join(root, 'pnpm-workspace.yaml')
    const workspaceContent = readFileSync(pnpmWorkspacePath, 'utf-8')
    const ws = YAML.parse(workspaceContent)
    ;(ws.packages as string[]).push('./npm/*')
    // write yaml
    writeFileSync(
      pnpmWorkspacePath,
      YAML.stringify(ws, { lineWidth: 1000 }),
      'utf-8',
    )

    // set root package to private
    rootPkg.private = true
    writeFileSync(
      rootPkgPath,
      `${JSON.stringify(sortPackageJson(rootPkg), null, 2)}\n`,
      'utf-8',
    )

    // reinstall
    console.log(`Reinstalling...`)
    await cmd(`pnpm i --no-frozen-lockfile`)

    // publish: sub packages only
    await publish()
  }

  const publish = async () => {
    let userNpmrcPath = `${process.env.HOME}/.npmrc`
    if (existsSync(userNpmrcPath)) {
      console.log('Found existing user .npmrc file')
      const userNpmrcContent = readFileSync(userNpmrcPath, 'utf8')
      const authLine = userNpmrcContent.split('\n').find((line) => {
        // check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
        return /^\s*\/\/registry\.npmjs\.com\/:[_-]authToken=/i.test(line)
      })
      if (authLine) {
        console.log(
          'Found existing auth token for the npm registry in the user .npmrc file',
        )
      } else {
        console.log(
          "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one",
        )
        if (!process.env.NPM_TOKEN?.length) {
          throw new Error(
            `'NPM_TOKEN' env var is required to publish, please set it`,
          )
        }
        appendFileSync(
          userNpmrcPath,
          `\n//registry.npmjs.com/:_authToken=${process.env.NPM_TOKEN}\n`,
        )
      }
    } else {
      console.log('No user .npmrc file found, creating one')
      if (!process.env.NPM_TOKEN?.length) {
        throw new Error(
          `'NPM_TOKEN' env var is required to publish, please set it`,
        )
      }
      writeFileSync(
        userNpmrcPath,
        `//registry.npmjs.com/:_authToken=${process.env.NPM_TOKEN}\n`,
      )
    }

    await releaseOnly(opts)
  }

  await release()
}
