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
