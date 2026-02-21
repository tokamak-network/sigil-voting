import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Kept for Vitest (vitest.config.ts uses @vitejs/plugin-react)
export default defineConfig({
  plugins: [react()],
})
