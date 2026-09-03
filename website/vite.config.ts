import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The marketing site. Deployed independently of the product app (frontend/).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 5180 is the product app; the site runs alongside it on 5181.
    port: 5181,
    strictPort: true,
  },
})
