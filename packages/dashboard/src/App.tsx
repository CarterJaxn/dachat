import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient.js'
import ProtectedRoute from './components/ProtectedRoute.js'
import Login from './pages/Login.js'
import Register from './pages/Register.js'
import Conversations from './pages/Conversations.js'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<Register />} />
          {/* Support the server-generated /register?token= URL format too */}
          <Route path="/register" element={<RegisterTokenRedirect />} />
          <Route
            path="/conversations"
            element={
              <ProtectedRoute>
                <Conversations />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/conversations" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function RegisterTokenRedirect() {
  const token = new URLSearchParams(window.location.search).get('token')
  if (token) return <Navigate to={`/invite/${token}`} replace />
  return <Navigate to="/login" replace />
}
