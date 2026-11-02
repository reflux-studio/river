import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
export default defineConfig({
  base: '/play/',
  plugins: [react(), tailwind()],
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } }
})
