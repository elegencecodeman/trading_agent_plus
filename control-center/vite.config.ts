import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { inspectorServer } from '@react-dev-inspector/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 仅开发环境注入 react-dev-inspector，避免污染生产构建
  const isDev = mode === 'development'

  return {
    plugins: [
      react({
        babel: {
          // 编译期注入组件源码位置信息（react-dev-inspector 必需）
          plugins: isDev ? ['@react-dev-inspector/babel-plugin'] : [],
        },
      }),
      // 启动 launch-editor 中间件，用于点击后唤起本地 IDE
      ...(isDev ? [inspectorServer()] : []),
    ],
    server: {
      port: 5173,
      host: true,
    },
  }
})
