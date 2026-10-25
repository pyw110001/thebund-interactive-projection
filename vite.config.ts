import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.PAGES_BASE_PATH || './',build:{chunkSizeWarningLimit:800,rollupOptions:{output:{manualChunks:{three:['three','three/addons/loaders/GLTFLoader.js','three/addons/controls/OrbitControls.js']}}}}});
