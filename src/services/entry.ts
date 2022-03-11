import { join } from 'path'
import { program } from 'commander'
import { registry } from '../commands/registry'

const pkgPath = join(__dirname, '../../package.json')
const pkg = require(pkgPath)

registry()

program.version(pkg.version)
program.parse(process.argv)
