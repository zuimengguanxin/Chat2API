import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '@/api'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const location = useLocation()

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        console.log('ProtectedRoute: Checking authentication...')
        const res = await api.auth.verify()
        console.log('ProtectedRoute: Auth verification result:', res)
        if (!mounted) return
        setIsAuthenticated(res.authenticated === true)
      } catch (err) {
        console.error('ProtectedRoute: Auth verification failed:', err)
        if (!mounted) return
        setIsAuthenticated(false)
      }
    }

    checkAuth()

    return () => {
      mounted = false
    }
  }, [])

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
