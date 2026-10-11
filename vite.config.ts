import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5218,proxy:{'/api':{target:process.env.MONITOR_HUB||'http://127.0.0.1:9911',changeOrigin:true,ws:true}}}});
