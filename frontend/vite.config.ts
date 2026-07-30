import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { readFileSync } from 'node:fs'

const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isElectron = process.env.ELECTRON === 'true'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
    },
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron({
              main: {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    rollupOptions: {
                      // electron-updater has dynamic provider requires that don't
                      // bundle cleanly — keep it external so it's required from
                      // node_modules at runtime (electron-builder ships it).
                      external: ['electron-updater'],
                    },
                  },
                },
              },
              preload: {
                input: 'electron/preload.ts',
                // Force CommonJS .cjs output. Package has "type": "module",
                // which makes both .js and .mjs files ESM — and ESM can't use
                // require(), which the preload needs for `electron` / `node:*`
                // imports. .cjs extension forces CommonJS regardless of the
                // package type field.
                vite: {
                  build: {
                    rollupOptions: {
                      output: {
                        entryFileNames: 'preload.cjs',
                        format: 'cjs',
                      },
                    },
                  },
                },
              },
            }),
          ]
        : []),
    ],
    server: {
      port: 5180,
      // Fail rather than silently drift to 5181+ if the port is taken, so the
      // electron loadURL and the .claude/launch.json preview config stay valid.
      strictPort: true,
    },
    base: command === 'build' && isElectron ? './' : '/',
  }
})
