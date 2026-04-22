import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      '/auth': 'http://localhost:3001',
      '/conversations': 'http://localhost:3001',
      '/messages': 'http://localhost:3001',
      '/widget': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
