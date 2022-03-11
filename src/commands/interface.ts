export interface ICmdOpts {
  root: string
}

export interface ICmd {
  cmd: string[]
  method: (opts: ICmdOpts) => Promise<any>
  description: string
}
