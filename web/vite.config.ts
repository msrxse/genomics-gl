import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '/pkg/genome_engine.js': path.resolve(__dirname, 'src/pkg/genome_engine.js'),
    },
  },
})
