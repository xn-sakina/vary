interface IArgv extends Record<string, any> {
  tag?: string
}

export interface ICmdOpts {
  root: string
  argv: IArgv
}

export interface ICmd {
  cmd: string[]
  method: (opts: ICmdOpts) => Promise<any>
  description: string
}
