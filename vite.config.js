import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'fit-sdk', test: /node_modules[\\/]@garmin[\\/]/ },
            { name: 'charts', test: /node_modules[\\/](echarts|zrender)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'map', test: /node_modules[\\/]leaflet[\\/]/ },
          ],
        },
      },
    },
  },
});
