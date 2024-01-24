import { resolve, join } from 'path'
import * as assert from 'assert'

const pkg = require(join(__dirname, './package.json'))
const pkgName = pkg.name
const binaryEnv = pkgName.replace('-', '_').toUpperCase() + '_BINARY_PATH'
const getWasmName = () => {
  if (pkg?.vary?.wasmName) {
    return pkg.vary.wasmName
  }
  const packageName = pkg.napi?.package.name || pkg.napi?.packageName
  const wasmPkgName = `${packageName}-wasm`
  return wasmPkgName
}
const wasmPkgName = getWasmName()

// Allow overrides to the location of the .node binding file
const bindingsOverride = process.env[binaryEnv]
// @ts-ignore
const bindings: typeof import('./binding') = (() => {
  let binding
  try {
    binding = !!bindingsOverride
      ? require(resolve(bindingsOverride))
      : require('./binding')

    // If native binding loaded successfully, it should return proper target triple constant.
    const triple = binding.getTargetTriple()
    assert.ok(triple, 'Failed to read target triple from native binary.')
    return binding
  } catch (_) {
    binding = require(wasmPkgName)
  } finally {
    return binding
  }
})()

export = bindings
