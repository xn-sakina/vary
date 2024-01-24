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
  napi?: Record<string, any>
  files?: string[]
  vary?: any
  private?: boolean
}
