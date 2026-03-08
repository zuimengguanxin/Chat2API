import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Login() {
  const [password, setPassword] = useState('')
  const [isSetup, setIsSetup] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.auth.status().then((res) => {
      console.log('Auth status check:', res)
      // 明确设置isSetup状态
      setIsSetup(!res.hasPassword)
    }).catch((err) => {
      console.error('Auth status check failed:', err)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      console.log('Submitting form, isSetup:', isSetup)
      if (isSetup) {
        const setupResult = await api.auth.setup(password)
        console.log('Setup result:', setupResult)
      } else {
        const loginResult = await api.auth.login(password)
        console.log('Login result:', loginResult)
      }
      console.log('Navigating to /...')
      navigate('/')
    } catch (err: any) {
      console.error('Submit error:', err)
      setError(err.response?.data?.error || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>{isSetup ? 'Set Password' : 'Login'}</CardTitle>
          <CardDescription>
            {isSetup ? 'Create a password to protect your Chat2API' : 'Enter your password to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Processing...' : (isSetup ? 'Set Password' : 'Login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
