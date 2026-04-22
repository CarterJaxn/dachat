import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Widget } from './Widget.js'

const container = document.getElementById('dachat-widget') ?? (() => {
  const el = document.createElement('div')
  el.id = 'dachat-widget'
  document.body.appendChild(el)
  return el
})()

createRoot(container).render(
  <StrictMode>
    <Widget />
  </StrictMode>,
)
