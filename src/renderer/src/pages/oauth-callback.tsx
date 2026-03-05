import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function OAuthCallbackPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const success = searchParams.get('success')
    const providerId = searchParams.get('providerId')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setMessage(error)
    } else if (success === 'true' && providerId) {
      setStatus('success')
      setMessage(t('oauth.callback.success', { provider: providerId }))

      // Redirect to providers page after a delay
      setTimeout(() => {
        navigate('/providers')
      }, 2000)
    } else {
      setStatus('error')
      setMessage(t('oauth.callback.invalid'))
    }
  }, [searchParams, t, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
            {status === 'error' && (
              <XCircle className="h-12 w-12 text-destructive" />
            )}
          </div>
          <CardTitle>
            {status === 'loading' && t('oauth.callback.title.loading')}
            {status === 'success' && t('oauth.callback.title.success')}
            {status === 'error' && t('oauth.callback.title.error')}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => navigate('/providers')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('oauth.callback.backToProviders')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
