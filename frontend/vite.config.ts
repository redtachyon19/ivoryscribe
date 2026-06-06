import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isElectron = process.env.ELECTRON === 'true'

  return {
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron({
              main: {
                entry: 'electron/main.ts',
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
