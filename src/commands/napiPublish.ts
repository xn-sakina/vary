import { ICmdOpts, INapiV2, INapiV3, IPkg } from './interface'
import { sortPackageJson } from '@xn-sakina/vary/compiled/sort-package-json'
import assert from 'assert'
import { difference, get, pick, set } from 'lodash'
import { basename, join, relative } from 'path'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdirpSync,
  readFileSync,
  removeSync,
  statSync,
  writeFileSync,
} from 'fs-extra'
import { readdirSync } from 'fs'
import { cmd } from '../utils/cmd'
import chalk from '@xn-sakina/vary/compiled/chalk'
import YAML from 'yaml'
import { releaseOnly } from './release'
import os from 'os'
import resolve from 'resolve'

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

interface IVaryConfig {
  keepKeys?: string[]
  wasmName?: string
  wasmWebName?: string
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

interface INapiArgv {
  /**
   * wheather release root package
   */
  root?: boolean
  /**
   * wheather release wasm package for node.js
   */
  wasm?: boolean
  /**
   * wheather release wasm (web) package
   */
  wasmWeb?: boolean
  /**
   * wasm-opt file or dir path
   */
  wasmOpt?: string | boolean
  /**
   * use napi to build wasm
   */
  napiWasm?: boolean
}

const NAPI_PKGS = {
  wasmRuntime: '@napi-rs/wasm-runtime',
  cli: '@napi-rs/cli',
} as const

interface IDetectNapiCLIVersion {
  isV2: boolean
  isV3: boolean
}

function detectNapiCLIVersion(opts: { root: string }): IDetectNapiCLIVersion {
  const { root } = opts
  const rootPkgPath = join(root, 'package.json')
  if (!existsSync(rootPkgPath)) {
    throw new Error(`package.json not found in root dir`)
  }
  const rootPkg = require(rootPkgPath) as IPkg
  const deps = {
    ...(rootPkg?.dependencies || {}),
    ...(rootPkg?.devDependencies || {}),
  }
  const hasCliDep = deps?.[NAPI_PKGS.cli]
  if (!hasCliDep?.length) {
    throw new Error(
      `Cannot find ${NAPI_PKGS.cli} in root package.json, please install it`,
    )
  }
  const resolvedDepPkg = resolve.sync(`${NAPI_PKGS.cli}/package.json`, {
    basedir: root,
  })
  const cliVersion = require(resolvedDepPkg).version as string
  const isV2 = cliVersion.startsWith('2.')
  const isV3 = cliVersion.startsWith('3.')

  console.log(`Using ${chalk.cyan(NAPI_PKGS.cli)}@${chalk.cyan(cliVersion)}`)

  return {
    isV2,
    isV3,
  }
}

export const napiPublish = async (opts: ICmdOpts<INapiArgv>) => {
  const { root, argv } = opts

  const rootPkgPath = join(root, 'package.json')
  const rootPkg = require(rootPkgPath) as IPkg

  // for wasm-opt
  const shouldCallWasmOptTask = argv?.wasmOpt
  if (shouldCallWasmOptTask) {
    await performWasmOpt({
      root,
      wasmPathOrDir:
        typeof shouldCallWasmOptTask === 'string'
          ? shouldCallWasmOptTask
          : undefined,
    })
    return
  }

  // detect napi cli version
  const { isV2, isV3 } = detectNapiCLIVersion({ root })

  const packageName = rootPkg.name as string
  assert(packageName, `package.json#name is required`)
  const globalVersion = rootPkg.version
  assert(globalVersion, `package.json#version is required`)

  const repoUrl = rootPkg.repository?.url as string
  assert(
    repoUrl,
    `package.json#repository.url is required, e.g. https://github.com/user/repo`,
  )

  const getNapiCompatConfig = (): Required<INapiV3> => {
    const napiConfig = rootPkg?.napi
    if (!napiConfig) {
      throw new Error(`package.json#napi is required`)
    }
    const napiConfigV2 = napiConfig as INapiV2
    const napiConfigV3 = napiConfig as INapiV3
    const throwMissingError = (key: string) => {
      throw new Error(`package.json#napi.${key} is required`)
    }
    if (isV2) {
      // ensure `triples.defaults` is false
      const isMannualConfig =
        napiConfigV2.triples?.defaults === false &&
        napiConfigV2.triples?.additional?.length
      if (!isMannualConfig) {
        throw new Error(
          `package.json#napi.triples.defaults must be false, and manually config all platforms`,
        )
      }
      return {
        binaryName: napiConfigV2.name || throwMissingError('name'),
        packageName: napiConfigV2.package?.name || throwMissingError('package'),
        targets:
          napiConfigV2.triples?.additional || throwMissingError('triples'),
      }
    }
    if (isV3) {
      const hasTargets = napiConfigV3.targets?.length
      if (!hasTargets) {
        throw new Error(`package.json#napi.targets is required and not empty`)
      }
      return {
        binaryName: napiConfigV3.binaryName || throwMissingError('binaryName'),
        packageName:
          napiConfigV3.packageName || throwMissingError('packageName'),
        targets: napiConfigV3.targets || throwMissingError('targets'),
      }
    }
    throw new Error(`Unsupported napi cli version`)
  }
  const napiFinalConfig = getNapiCompatConfig()

  const release = async () => {
    const globalProps = pick(rootPkg, [
      'author',
      'homepage',
      'repository',
      'engines',
      'license',
      'publishConfig',
    ])
    const subPackagesPrefix = napiFinalConfig.packageName

    // make sure napi config fields exist
    const nodeBinaryPrefix = napiFinalConfig.binaryName
    const additional = napiFinalConfig.targets

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
        'napi',
      ]) as Record<string, any>
      publishPkg.optionalDependencies = optionalDependencies
      // postinstall
      if (rootPkg?.scripts?.postinstall?.length) {
        publishPkg.scripts = {
          postinstall: rootPkg.scripts.postinstall,
        }
      }
      const varyConfig = rootPkg.vary as IVaryConfig | undefined
      if (varyConfig) {
        const extraKeys = varyConfig.keepKeys
        if (extraKeys?.length) {
          extraKeys.forEach((key) => {
            set(publishPkg, key, get(rootPkg, key))
          })
        }
        // keep vary config
        publishPkg.vary = rootPkg.vary
      }
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
      await cmd(`npm publish --registry https://registry.npmjs.com/`, {
        cwd: join(root, './dist'),
      })
      return
    }

    const isReleaseWasm = argv?.wasm
    const isReleaseNapiWasm = argv?.napiWasm
    if (isReleaseWasm || isReleaseNapiWasm) {
      if (isReleaseWasm && isReleaseNapiWasm) {
        throw new Error(`You cannot use --wasm and --napi-wasm together`)
      }
      if (isReleaseWasm) {
        console.log(`Will release the wasm package.`)
      }
      if (isReleaseNapiWasm) {
        console.log(
          `Will release the wasm (${chalk.bold.cyan('napi wasi')}) package.`,
        )
      }
      // get napi wasm runtime deps version
      let napiWasmRuntimeVersion: string
      if (isReleaseNapiWasm) {
        const allRootDeps = {
          ...rootPkg?.dependencies,
          ...rootPkg?.devDependencies,
        }
        napiWasmRuntimeVersion = allRootDeps?.[NAPI_PKGS.wasmRuntime]
        if (!napiWasmRuntimeVersion?.length) {
          throw new Error(`Please install ${NAPI_PKGS.wasmRuntime}`)
        }
      }
      // build
      await cmd(`pnpm build:wasm`)
      // add wasm files to root
      const wasmFiles = [
        join(__dirname, '../helpers/napi/index.js'),
        join(__dirname, '../helpers/napi/postinstall.js'),
      ]
      // copy to root
      wasmFiles.forEach((file) => {
        console.log(`Generate wasm file: ${basename(file)}`)
        copyFileSync(file, join(root, basename(file)))
      })
      // check binding.js exists
      const bindingFile = join(root, 'binding.js')
      if (!existsSync(bindingFile)) {
        throw new Error(`The 'binding.js' file does not exist.`)
      }
      // check package.json#files
      const files = rootPkg.files as string[]
      const mustHasFiles = ['binding.js', 'index.js', 'postinstall.js']
      mustHasFiles.forEach((file) => {
        if (!files.includes(file)) {
          throw new Error(
            `package.json#files must includes ${mustHasFiles.join(', ')}`,
          )
        }
      })
      const recommandHasFiles = ['index.d.ts', 'CHANGELOG.md']
      recommandHasFiles.forEach((file) => {
        if (!files.includes(file)) {
          console.warn(
            `The file ${chalk.yellow(
              file,
            )} is recommended to be included in package.json#files`,
          )
        }
      })
      // entry must be index.js
      if (rootPkg.main !== 'index.js') {
        console.warn(
          `package.json#main must be index.js, but got ${rootPkg.main}`,
        )
      }
      // must have `postinstall` script
      const postinstallScript = rootPkg?.scripts?.postinstall
      if (!postinstallScript?.length) {
        throw new Error(
          `package.json must include the 'scripts.postinstall' for wasm fallback`,
        )
      }
      // need build first
      const targetDir = join(root, 'target/wasm')
      if (!existsSync(targetDir)) {
        throw new Error(
          `The 'target/wasm' dir does not exist. Please build first`,
        )
      }
      // perform wasm opt
      await performWasmOpt({
        root,
        wasmPathOrDir: targetDir,
      })
      // start mkdir
      const wasmPublishDir = join(root, 'target', 'wasm_publish')
      if (existsSync(wasmPublishDir)) {
        removeSync(wasmPublishDir)
      }
      mkdirSync(wasmPublishDir)
      const wasmOutputs: string[] = []
      if (isReleaseWasm) {
        const outputs = readdirSync(targetDir)
          .filter((i) => {
            return (
              i.endsWith('.wasm') || i.endsWith('.js') || i.endsWith('.d.ts')
            )
          })
          .map((i) => join(targetDir, i))
        wasmOutputs.push(...outputs)
      }
      let napiWasmOutputs: INapiWasiOutput | undefined
      if (isReleaseNapiWasm) {
        napiWasmOutputs = resolveWasiOutput({ dir: targetDir })
        const ouputs = napiWasmOutputs.allFiles
        wasmOutputs.push(...ouputs)
      }
      // copy
      wasmOutputs.forEach((file) => {
        copyFileSync(file, join(wasmPublishDir, basename(file)))
        console.log(`Copy wasm output: ${basename(file)}`)
      })
      const getWasmName = () => {
        if ((rootPkg?.vary as IVaryConfig | undefined)?.wasmName?.length) {
          return rootPkg.vary.wasmName
        }
        return `${subPackagesPrefix}-wasm`
      }
      const wasmName = getWasmName() as string
      console.log(`Wasm package name: ${wasmName}`)
      // create readme
      const pkgName = rootPkg.name as string
      const repoUrl = rootPkg.repository?.url as string
      const generateReadmeContent = () => {
        if (isReleaseWasm) {
          const content = `
# ${wasmName}

This is the WASM binary for [\`${pkgName}\`](${repoUrl}).
`.trimStart()
          return content
        }
        if (isReleaseNapiWasm) {
          const content = `
# ${wasmName} (wasi)

> This package can be used for both Node.js and Web envs.

This is the WASM binary for [\`${pkgName}\`](${repoUrl}).
`.trimStart()
          return content
        }
        throw new Error(`Unreachable`)
      }
      const readmeContent = generateReadmeContent()
      const readmePath = join(wasmPublishDir, 'README.md')
      console.log(`Create readme: ${basename(readmePath)}`)
      writeFileSync(readmePath, readmeContent, 'utf-8')
      // create package.json
      const newPkg = pick(rootPkg, [
        'version',
        'description',
        'author',
        'homepage',
        'repository',
        'keywords',
        'license',
        'publishConfig',
      ]) as Record<string, any>
      // set main/types
      if (isReleaseWasm) {
        newPkg.main = 'index.js'
      }
      if (isReleaseNapiWasm) {
        newPkg.main = napiWasmOutputs!.entryForNode
        newPkg.browser = napiWasmOutputs!.entryForBrowser
        // custom field
        newPkg.__wasi = true
        // add runtime deps
        newPkg.dependencies = {
          [NAPI_PKGS.wasmRuntime]: napiWasmRuntimeVersion!,
          // we need keep all `dependencies` ?
        }
      }
      newPkg.types = 'index.d.ts'
      // set name
      newPkg.name = wasmName
      // write package.json
      const newPkgPath = join(wasmPublishDir, 'package.json')
      writeFileSync(
        newPkgPath,
        `${JSON.stringify(sortPackageJson(newPkg), null, 2)}\n`,
        'utf-8',
      )
      // copy license
      const globalLicensePath = join(root, 'LICENSE')
      assert(
        existsSync(globalLicensePath),
        `LICENSE file is required in root dir`,
      )
      const licensePath = join(wasmPublishDir, 'LICENSE')
      copyFileSync(globalLicensePath, licensePath)
      // publish: wasm package only
      await cmd(`npm publish --registry https://registry.npmjs.com/`, {
        cwd: wasmPublishDir,
      })
      return
    }

    const isReleaseWasmForWeb = argv?.wasmWeb
    if (isReleaseWasmForWeb) {
      console.log(`Will release the wasm (web) package.`)
      // build
      await cmd(`pnpm build:wasm:web`)
      // need build first
      const targetDir = join(root, 'target/wasm_web')
      if (!existsSync(targetDir)) {
        throw new Error(
          `The 'target/wasm_web' dir does not exist. Please build first`,
        )
      }
      // perform wasm opt
      await performWasmOpt({
        root,
        wasmPathOrDir: targetDir,
      })
      // start mkdir
      const wasmPublishDir = join(root, 'target', 'wasm_web_publish')
      if (existsSync(wasmPublishDir)) {
        removeSync(wasmPublishDir)
      }
      mkdirSync(wasmPublishDir)
      const wasmOutputs = readdirSync(targetDir)
        .filter((i) => {
          return i.endsWith('.wasm') || i.endsWith('.js') || i.endsWith('.d.ts')
        })
        .map((i) => join(targetDir, i))
      // copy
      wasmOutputs.forEach((file) => {
        copyFileSync(file, join(wasmPublishDir, basename(file)))
        console.log(`Copy wasm output: ${basename(file)}`)
      })
      const getWasmWebName = () => {
        if ((rootPkg?.vary as IVaryConfig | undefined)?.wasmWebName?.length) {
          return rootPkg.vary.wasmWebName
        }
        return `${subPackagesPrefix}-wasm-web`
      }
      const wasmName = getWasmWebName() as string
      console.log(`Wasm (web) package name: ${wasmName}`)
      // create readme
      const pkgName = rootPkg.name as string
      const repoUrl = rootPkg.repository?.url as string
      const readmeContent = `
# ${wasmName}

This is the WASM (Web) binary for [\`${pkgName}\`](${repoUrl}).
`.trimStart()
      const readmePath = join(wasmPublishDir, 'README.md')
      console.log(`Create readme: ${basename(readmePath)}`)
      writeFileSync(readmePath, readmeContent, 'utf-8')
      // create package.json
      const newPkg = pick(rootPkg, [
        'version',
        'description',
        'author',
        'homepage',
        'repository',
        'keywords',
        'license',
        'publishConfig',
      ]) as Record<string, any>
      // set module(esm) / types
      newPkg.module = 'index.js'
      newPkg.types = 'index.d.ts'
      // set name
      newPkg.name = wasmName
      // write package.json
      const newPkgPath = join(wasmPublishDir, 'package.json')
      writeFileSync(
        newPkgPath,
        `${JSON.stringify(sortPackageJson(newPkg), null, 2)}\n`,
        'utf-8',
      )
      // copy license
      const globalLicensePath = join(root, 'LICENSE')
      assert(
        existsSync(globalLicensePath),
        `LICENSE file is required in root dir`,
      )
      const licensePath = join(wasmPublishDir, 'LICENSE')
      copyFileSync(globalLicensePath, licensePath)
      // publish: wasm package only
      await cmd(`npm publish --registry https://registry.npmjs.com/`, {
        cwd: wasmPublishDir,
      })
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

export async function performWasmOpt(opts: {
  wasmPathOrDir?: string
  root: string
}) {
  const { wasmPathOrDir, root } = opts

  console.log(chalk.cyan(`Start wasm opt ...`))

  // check wasm opt option, recommand disable it
  // https://github.com/rustwasm/wasm-pack/issues/864#issuecomment-957818452
  const wasmOptShouldCloseTips = () => {
    if (process.env.VARY_SKIP_WASM_OPT_TIPS?.length) {
      return
    }
    const wasmOptTitle = `[package.metadata.wasm-pack.profile.release]`
    const rootCargoFilePath = join(root, './Cargo.toml')
    if (!existsSync(rootCargoFilePath)) {
      return
    }
    const printTips = (target: string) => {
      const relativePath = relative(root, target)
      console.log()
      console.log(
        `Cannot find the 'wasm-opt' config in ${relativePath}, please set:`,
      )
      console.log(chalk.yellow(wasmOptTitle))
      console.log(chalk.yellow(`wasm-opt = false`))
      console.log()
    }
    const checkWasmOpt = (tomlFilePath: string) => {
      const content = readFileSync(tomlFilePath, 'utf-8')
      const hasTitle = content.includes(wasmOptTitle)
      const hasOpt = content.includes('wasm-opt')
      const hasConfig = hasTitle && hasOpt
      if (!hasConfig) {
        printTips(tomlFilePath)
      }
    }
    const rootCargoFileContent = readFileSync(rootCargoFilePath, 'utf-8')
    const hasWorkspace = rootCargoFileContent.includes('[workspace]')
    if (!hasWorkspace) {
      // check wasm-opt
      checkWasmOpt(rootCargoFilePath)
      return
    }
    // is workspace
    const maybeWasmPkgTomlPath: string[] = [
      join(root, './crates/binding_wasm/Cargo.toml'),
      join(root, './crates/wasm/Cargo.toml'),
    ]
    // check first exists toml only
    maybeWasmPkgTomlPath.some((path) => {
      const hasTomlFile = existsSync(path)
      if (hasTomlFile) {
        checkWasmOpt(path)
        return true
      }
    })
  }
  wasmOptShouldCloseTips()

  const platform = os.platform()
  const arch = os.arch()

  const runOpt = async () => {
    if (process.env.VARY_SKIP_WASM_OPT?.length) {
      return
    }
    const defaultWasmFilePath: string[] = [
      join(root, './target/wasm'),
      join(root, './target/wasm_web'),
    ]
    // ensure `wasmPathOrDir` exists
    if (wasmPathOrDir && !existsSync(wasmPathOrDir)) {
      throw new Error(`The specified wasm file or dir does not exist`)
    }
    const wasmOutputDir: string[] = wasmPathOrDir?.length
      ? []
      : defaultWasmFilePath
    // handle dir
    if (wasmPathOrDir) {
      const isSpecifiedWasmPathIsDir = statSync(wasmPathOrDir).isDirectory()
      if (isSpecifiedWasmPathIsDir) {
        wasmOutputDir.push(wasmPathOrDir)
      }
    }
    const wasmFilePath: string[] = []
    wasmOutputDir.forEach((dir) => {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        const wasmFiles = readdirSync(dir).filter((i) => i.endsWith('.wasm'))
        if (wasmFiles?.length) {
          wasmFiles.forEach((p) => {
            const wasmFileAbsPath = join(dir, p)
            const relativePath = relative(root, wasmFileAbsPath)
            console.log(`Wasm-opt: ${chalk.blue(relativePath)}`)
            wasmFilePath.push(wasmFileAbsPath)
          })
        }
      }
    })
    // handle file
    if (wasmPathOrDir && statSync(wasmPathOrDir).isFile()) {
      console.log(`Wasm-opt: ${chalk.blue(wasmPathOrDir)}`)
      wasmFilePath.push(wasmPathOrDir)
    }
    if (!wasmFilePath.length) {
      console.log(`Cannot find wasm file, skip wasm-opt`)
      return
    }

    const version = 'version_116'
    const platformMark =
      platform === 'darwin'
        ? 'macos'
        : platform === 'linux'
        ? 'linux'
        : (() => {
            throw new Error(`Unsupported platform: ${platform}`)
          })()
    const archMark =
      arch === 'x64'
        ? 'x86_64'
        : arch === 'arm64'
        ? 'arm64'
        : (() => {
            throw new Error(`Unsupported arch: ${arch}`)
          })()
    const url = `https://github.com/WebAssembly/binaryen/releases/download/${version}/binaryen-${version}-${archMark}-${platformMark}.tar.gz`
    console.log(`Platform: ${platform}`)
    console.log(`Arch: ${arch}`)
    console.log(`Version: ${version}`)
    console.log(`URL: ${url}`)
    const cacheDir = join(root, 'target', '.wasm-cache')
    if (!existsSync(cacheDir)) {
      mkdirpSync(cacheDir)
    }
    const filePath = join(cacheDir, 'binaryen.tar.gz')
    if (!existsSync(filePath)) {
      // download
      console.log(`Downloading ${url}`)
      await cmd(`curl -L ${url} -o ${filePath}`)
      // unzip
      console.log(`Unzip ${filePath}`)
      await cmd(`tar -xvf ${filePath} -C ${cacheDir}`)
    }
    // opt
    console.log(`Optimizing`)
    const optBinPath = join(cacheDir, `./binaryen-${version}/bin/wasm-opt`)
    const optTasks = wasmFilePath.map((wasmFile) => {
      return cmd(`${optBinPath} -Oz -o ${wasmFile} ${wasmFile}`)
    })
    await Promise.all(optTasks)
  }
  try {
    await runOpt()
  } catch (e) {
    console.log(chalk.yellow(`Wasm opt failed, Error: `, e))
  }

  console.log(chalk.cyan(`Wasm opt done`))
}

type WasiWorker = `${string}.mjs`
interface INapiWasiOutput {
  wasiWorker: WasiWorker[]
  wasm: `${string}.wasm`
  entryForNode: `${string}.wasi.cjs`
  entryForBrowser: `${string}.wasi-browser.js`
  extra: string[]
  allFiles: string[]
}

function resolveWasiOutput(opts: { dir: string }): INapiWasiOutput {
  let wasiWorker: any[] = []
  let wasm: any
  let entryForNode: any
  let entryForBrowser: any
  const { dir } = opts
  if (!existsSync(dir)) {
    throw new Error(`The wasi output dir does not exist`)
  }
  const files = readdirSync(dir)
    .filter((p) => p !== '.DS_Store')
    .map((p) => join(dir, p))
    .filter((p) => statSync(p).isFile())
  files.forEach((p: any) => {
    const file = basename(p)
    if (file.includes('wasi-worker')) {
      wasiWorker.push(p)
      return
    }
    if (file.endsWith('.wasm')) {
      wasm = p
      return
    }
    if (file.endsWith('.wasi.cjs')) {
      entryForNode = p
      return
    }
    if (file.endsWith('.wasi-browser.js')) {
      entryForBrowser = p
      return
    }
  })
  if (!wasiWorker?.length) {
    throw new Error(`Not found wasi worker files, like "name.mjs"`)
  }
  if (!wasm?.length) {
    throw new Error(`Not found wasi file, like "name.wasm"`)
  }
  if (!entryForNode?.length) {
    throw new Error(`Not found wasi cjs entry file, like "name.wasi.cjs"`)
  }
  if (!entryForBrowser?.length) {
    throw new Error(
      `Not found wasi browser entry file, like "name.wasi-browser.js"`,
    )
  }
  const extraFiles: string[] = ['index.d.ts']
  const allFiles: string[] = [
    ...wasiWorker,
    wasm,
    entryForNode,
    entryForBrowser,
    ...extraFiles,
  ]
  return {
    wasiWorker,
    wasm: wasm!,
    entryForBrowser: entryForBrowser!,
    entryForNode: entryForNode!,
    extra: extraFiles,
    allFiles,
  }
}
