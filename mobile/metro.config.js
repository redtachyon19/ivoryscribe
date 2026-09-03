// Metro config that lets the app import the repo's platform-agnostic code via
// the `@shared/*` alias, the same alias the Vite apps use.
//
// The repo does NOT use npm workspaces (each package has its own node_modules),
// so Metro needs two things to resolve files that live OUTSIDE this project:
//   1. watchFolders — so Metro is allowed to read ../shared at all.
//   2. extraNodeModules — so the bare specifier `@shared` maps to ../shared/src.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '..', 'shared')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [sharedRoot]

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@shared': path.resolve(sharedRoot, 'src'),
}

// Always resolve dependencies (react, react-native, …) from THIS app's
// node_modules, never from a stray copy under ../shared.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
