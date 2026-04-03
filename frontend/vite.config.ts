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
              },
            }),
          ]
        : []),
    ],
    server: {
      port: 5173,
    },
    base: command === 'build' && isElectron ? './' : '/',
  }
})
