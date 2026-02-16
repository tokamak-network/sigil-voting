import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy crypto libraries - loaded on demand via preload.ts
          'circomlibjs': ['circomlibjs'],
          // wagmi + viem (Web3 stack)
          'web3': ['wagmi', 'viem', '@tanstack/react-query'],
          // React core
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
})
