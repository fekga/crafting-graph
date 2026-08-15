import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the built app works from any path,
  // including a GitHub Pages project site like
  // https://<user>.github.io/<repo>/
  base: './',
  plugins: [react()],
})
