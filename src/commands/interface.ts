type IArgv<T> = {
  tag?: string
} & T

export interface ICmdOpts<T extends Record<string, any> = Record<string, any>> {
  root: string
  argv: IArgv<T>
}

export interface ICmd {
  cmd: string[]
  method: (opts: ICmdOpts) => Promise<any>
  description: string
}

export interface IPkg {
  name?: string
  version?: string
  description?: string
  homepage?: string
  repository?: {
    type: string
    url: string
  }
  license?: string
  author?: string
  main?: string
  types?: string
  publishConfig?: Record<string, any>
  scripts?: Record<string, string>
  napi?: INapi
  files?: string[]
  vary?: any
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

type INapi = INapiV2 | INapiV3

export interface INapiV2 {
  // for @scope package name
  package?: {
    name?: string
  }
  // for binary
  name?: string
  // for build targets
  triples?: {
    additional?: string[]
    defaults?: boolean
  }
}

export interface INapiV3 {
  /**
   * @example "my-package"
   */
  binaryName?: string
  /**
   * @example "@scope/my-package"
   */
  packageName?: string
  /**
   * @example ["..."]
   */
  targets?: string[]
}
