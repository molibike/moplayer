import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 在生产环境抑制冗余日志，保留 warn/error 便于定位问题
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)