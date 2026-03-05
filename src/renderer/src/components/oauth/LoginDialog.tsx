/**
 * OAuth Login Dialog Component - Web Version
 * Provides manual token input interface and OAuth extraction for multiple providers
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TokenInput } from './TokenInput'
import { OAuthProgress, OAuthProgressStatus } from './OAuthProgress'
import { AlertCircle, ExternalLink, Copy, Check, RefreshCw, HelpCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/api'

type ProviderType = 'deepseek' | 'glm' | 'kimi' | 'minimax' | 'qwen' | 'zai'

interface ManualTokenConfig {
  providerType: ProviderType
  tokenType: string
  labelKey: string
  placeholderKey: string
  descriptionKey: string
  helpUrl?: string
}

interface ProviderConfig {
  nameKey: string
  loginUrl: string
  manualTokenConfigs: ManualTokenConfig[]
}

const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  deepseek: {
    nameKey: 'deepseek.name',
    loginUrl: 'https://chat.deepseek.com',
    manualTokenConfigs: [
      {
        providerType: 'deepseek',
        tokenType: 'token',
        labelKey: 'deepseek.userToken',
        placeholderKey: 'deepseek.userTokenPlaceholder',
        descriptionKey: 'deepseek.userTokenHelp',
        helpUrl: 'https://chat.deepseek.com',
      },
    ],
  },
  glm: {
    nameKey: 'glm.name',
    loginUrl: 'https://chatglm.cn',
    manualTokenConfigs: [
      {
        providerType: 'glm',
        tokenType: 'refresh',
        labelKey: 'glm.refreshToken',
        placeholderKey: 'glm.refreshTokenPlaceholder',
        descriptionKey: 'glm.refreshTokenHelp',
        helpUrl: 'https://chatglm.cn',
      },
    ],
  },
  kimi: {
    nameKey: 'kimi.name',
    loginUrl: 'https://www.kimi.com',
    manualTokenConfigs: [
      {
        providerType: 'kimi',
        tokenType: 'jwt',
        labelKey: 'kimi.accessToken',
        placeholderKey: 'kimi.accessTokenPlaceholder',
        descriptionKey: 'kimi.accessTokenHelp',
        helpUrl: 'https://www.kimi.com',
      },
      {
        providerType: 'kimi',
        tokenType: 'refresh',
        labelKey: 'providers.refreshToken',
        placeholderKey: 'providers.enterRefreshToken',
        descriptionKey: 'kimi.accessTokenHelp',
        helpUrl: 'https://kimi.moonshot.cn',
      },
    ],
  },
  minimax: {
    nameKey: 'minimax.name',
    loginUrl: 'https://agent.minimaxi.com',
    manualTokenConfigs: [
      {
        providerType: 'minimax',
        tokenType: 'token',
        labelKey: 'minimax.jwtToken',
        placeholderKey: 'minimax.jwtTokenPlaceholder',
        descriptionKey: 'minimax.jwtTokenHelp',
        helpUrl: 'https://agent.minimaxi.com',
      },
      {
        providerType: 'minimax',
        tokenType: 'realUserID',
        labelKey: 'minimax.realUserID',
        placeholderKey: 'minimax.realUserIDPlaceholder',
        descriptionKey: 'minimax.realUserIDHelp',
        helpUrl: 'https://agent.minimaxi.com',
      },
    ],
  },
  qwen: {
    nameKey: 'qwen.name',
    loginUrl: 'https://tongyi.aliyun.com',
    manualTokenConfigs: [
      {
        providerType: 'qwen',
        tokenType: 'cookie',
        labelKey: 'qwen.ssoTicket',
        placeholderKey: 'qwen.ssoTicketPlaceholder',
        descriptionKey: 'qwen.ssoTicketHelp',
        helpUrl: 'https://tongyi.aliyun.com',
      },
    ],
  },
  zai: {
    nameKey: 'zai.name',
    loginUrl: 'https://z.ai',
    manualTokenConfigs: [
      {
        providerType: 'zai',
        tokenType: 'token',
        labelKey: 'zai.token',
        placeholderKey: 'zai.tokenPlaceholder',
        descriptionKey: 'zai.tokenHelp',
        helpUrl: 'https://z.ai',
      },
    ],
  },
}

// OAuth helper code for browser console
const getOAuthHelperCode = (providerType: ProviderType): string => {
  const scripts: Record<ProviderType, string> = {
    deepseek: `// Paste this in DevTools Console at https://chat.deepseek.com
const token = localStorage.getItem('userToken');
if (token) {
  const tokenData = JSON.parse(token);
  console.log('Token:', tokenData.value);
  navigator.clipboard.writeText(tokenData.value);
  console.log('Token copied to clipboard!');
} else {
  console.error('Token not found');
  console.log('Available keys:', Object.keys(localStorage));
}`,

    glm: `// Paste this in DevTools Console at https://chatglm.cn
const token = localStorage.getItem('chatglm_refresh_token');
if (token) {
  console.log('Refresh Token:', token);
  navigator.clipboard.writeText(token);
  console.log('Token copied to clipboard!');
} else {
  console.error('Token not found');
  console.log('Available keys:', Object.keys(localStorage));
}`,

    kimi: `// Paste this in DevTools Console at https://www.kimi.com
const token = localStorage.getItem('token') || localStorage.getItem('refreshToken');
if (token) {
  console.log('Token:', token);
  navigator.clipboard.writeText(token);
  console.log('Token copied to clipboard!');
} else {
  console.error('Token not found');
  console.log('Available keys:', Object.keys(localStorage));
}`,

    minimax: `// Paste this in DevTools Console at https://agent.minimaxi.com
const token = localStorage.getItem('token');
const userId = localStorage.getItem('userID') || localStorage.getItem('userInfo');
if (token) {
  console.log('Token:', token);
  if (userId) {
    console.log('UserID:', userId);
    navigator.clipboard.writeText(JSON.stringify({token, userId}));
  } else {
    navigator.clipboard.writeText(token);
  }
  console.log('Token copied to clipboard!');
} else {
  console.error('Token not found');
  console.log('Available keys:', Object.keys(localStorage));
}`,

    qwen: `// Paste this in DevTools Console at https://www.qianwen.com
// Method 1: Get from Cookies
const getCookie = (name) => {
  const value = '; ' + document.cookie;
  const parts = value.split('; ' + name + '=');
  if (parts.length === 2) return parts.pop().split(';').shift();
};
const ticket = getCookie('tongyi_sso_ticket');
if (ticket) {
  console.log('SSO Ticket:', ticket);
  navigator.clipboard.writeText(ticket);
  console.log('Ticket copied to clipboard!');
} else {
  console.error('Ticket not found in cookies');
  console.log('Available cookies:', document.cookie.split(';').map(c => c.trim().split('=')[0]));
}`,

    zai: `// Paste this in DevTools Console at https://z.ai
const token = localStorage.getItem('token');
if (token) {
  console.log('Token:', token);
  navigator.clipboard.writeText(token);
  console.log('Token copied to clipboard!');
} else {
  console.error('Token not found');
  console.log('Available keys:', Object.keys(localStorage));
}`,
  }

  return scripts[providerType]
}

export interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerId: string
  providerType: ProviderType
  providerName?: string
  onSuccess?: (credentials: Record<string, string>) => void
  onError?: (error: string) => void
}

export function LoginDialog({
  open,
  onOpenChange,
  providerId,
  providerType,
  providerName,
  onSuccess,
  onError,
}: LoginDialogProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('manual')
  const [token, setToken] = useState('')
  const [realUserID, setRealUserID] = useState('') // For MiniMax
  const [tokenType, setTokenType] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState<{
    status: OAuthProgressStatus
    message: string
    progress?: number
  }>({
    status: 'idle',
    message: '',
  })
  const [copied, setCopied] = useState(false)
  const [showScript, setShowScript] = useState(false)

  const config = PROVIDER_CONFIGS[providerType]
  const displayName = providerName || t(config?.nameKey || '') || providerType
  const isMiniMax = providerType === 'minimax'

  useEffect(() => {
    if (config?.manualTokenConfigs.length) {
      setTokenType(config.manualTokenConfigs[0].tokenType)
    }
  }, [config])

  const resetState = useCallback(() => {
    setToken('')
    setRealUserID('')
    setError('')
    setIsLoading(false)
    setProgress({ status: 'idle', message: '' })
    setActiveTab('manual')
    setShowScript(false)
  }, [])

  useEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  const handleOAuthExtract = async () => {
    if (!token.trim()) {
      setError(t('oauth.enterToken'))
      return
    }

    setIsLoading(true)
    setError('')
    setProgress({ status: 'pending', message: t('oauth.extractingCredentials') })

    try {
      // Extract credentials via OAuth API
      const data: Record<string, string> = {
        token: token,
      }
      if (isMiniMax && realUserID.trim()) {
        data.realUserID = realUserID.trim()
      }

      const result = await api.oauth.extractCredentials(providerType, data)

      if (result.success) {
        setProgress({ status: 'success', message: t('oauth.extractionSuccess') })
        onSuccess?.(result.credentials)
        setTimeout(() => onOpenChange(false), 1500)
      } else {
        const errorMsg = result.error || t('oauth.extractionFailed')
        setProgress({ status: 'error', message: errorMsg })
        setError(errorMsg)
        onError?.(errorMsg)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('oauth.unknownError')
      setProgress({ status: 'error', message: errorMessage })
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualSubmit = async () => {
    if (!token.trim()) {
      setError(t('oauth.enterToken'))
      return
    }

    setIsLoading(true)
    setError('')
    setProgress({ status: 'pending', message: t('oauth.validatingToken') })

    try {
      // Validate token via API
      const credentials: Record<string, string> = {
        token,
      }
      if (isMiniMax && realUserID.trim()) {
        credentials.realUserID = realUserID.trim()
      }

      const result = await api.accounts.validateToken(providerId, credentials)

      if (result.valid) {
        setProgress({ status: 'success', message: t('oauth.loginSuccess') })
        onSuccess?.(credentials)
        setTimeout(() => onOpenChange(false), 1500)
      } else {
        const errorMsg = result.error || t('oauth.loginFailed')
        setProgress({ status: 'error', message: errorMsg })
        setError(errorMsg)
        onError?.(errorMsg)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('oauth.unknownError')
      setProgress({ status: 'error', message: errorMessage })
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const copyScript = async () => {
    await navigator.clipboard.writeText(getOAuthHelperCode(providerType))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openProviderLogin = () => {
    window.open(config?.loginUrl || '', '_blank')
  }

  const currentTokenConfig = config?.manualTokenConfigs.find(c => c.tokenType === tokenType) || config?.manualTokenConfigs[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('oauth.loginTo', { provider: displayName })}
          </DialogTitle>
          <DialogDescription>
            {t('oauth.chooseLoginMethod')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">{t('oauth.manualInput')}</TabsTrigger>
            <TabsTrigger value="browser">{t('oauth.browserExtract')}</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            {config?.manualTokenConfigs.length && config.manualTokenConfigs.length > 1 && !isMiniMax && (
              <div className="flex gap-2">
                {config.manualTokenConfigs.map((tc) => (
                  <Button
                    key={tc.tokenType}
                    type="button"
                    variant={tokenType === tc.tokenType ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTokenType(tc.tokenType)}
                  >
                    {t(tc.labelKey)}
                  </Button>
                ))}
              </div>
            )}

            {currentTokenConfig && (
              <TokenInput
                label={t(currentTokenConfig.labelKey)}
                placeholder={t(currentTokenConfig.placeholderKey)}
                description={t(currentTokenConfig.descriptionKey)}
                helpUrl={currentTokenConfig.helpUrl}
                value={token}
                onChange={setToken}
                onSubmit={handleManualSubmit}
                disabled={isLoading}
                error={error}
              />
            )}

            {isMiniMax && (
              <TokenInput
                label={t('minimax.realUserID')}
                placeholder={t('minimax.realUserIDPlaceholder')}
                description={t('minimax.realUserIDHelp')}
                helpUrl="https://agent.minimaxi.com"
                value={realUserID}
                onChange={setRealUserID}
                onSubmit={handleManualSubmit}
                disabled={isLoading}
              />
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>{t('oauth.tokenStoredLocally')}</span>
            </div>
          </TabsContent>

          <TabsContent value="browser" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium mb-1">{t('oauth.steps.title')}</h4>
                    <ol className="text-xs text-muted-foreground space-y-1.5 ml-4 list-decimal">
                      <li>{t('oauth.steps.loginTo', { provider: displayName })} <Button variant="link" size="sm" className="h-auto p-0" onClick={openProviderLogin}><ExternalLink className="h-3 w-3" /></Button></li>
                      <li>{t('oauth.steps.openDevTools')}</li>
                      <li>{t('oauth.steps.findToken', { provider: providerType })}</li>
                      <li>{t('oauth.steps.pasteBelow')}</li>
                    </ol>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">{t('oauth.autoExtractScript')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setShowScript(!showScript)}
                    >
                      {showScript ? t('oauth.hide') : t('oauth.show')}
                    </Button>
                  </div>

                  {showScript && (
                    <div className="relative">
                      <ScrollArea className="h-32">
                        <pre className="text-[10px] bg-muted p-2 rounded leading-tight font-mono whitespace-pre-wrap break-all">
                          {getOAuthHelperCode(providerType)}
                        </pre>
                      </ScrollArea>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={copyScript}
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <TokenInput
                label={t('oauth.extractedToken')}
                placeholder={t('oauth.pasteExtractedToken')}
                description={t('oauth.extractedTokenDesc')}
                value={token}
                onChange={setToken}
                onSubmit={handleOAuthExtract}
                disabled={isLoading}
                error={error}
              />

              {isMiniMax && (
                <TokenInput
                  label={t('minimax.realUserID')}
                  placeholder={t('minimax.realUserIDPlaceholder')}
                  description={t('minimax.realUserIDHelp')}
                  value={realUserID}
                  onChange={setRealUserID}
                  onSubmit={handleOAuthExtract}
                  disabled={isLoading}
                />
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={handleOAuthExtract}
                disabled={isLoading || !token.trim()}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {t('oauth.extracting')}
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('oauth.extractAndValidate')}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {progress.status !== 'idle' && (
          <OAuthProgress
            status={progress.status}
            message={progress.message}
            progress={progress.progress}
            className="border-t pt-4"
          />
        )}

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          {activeTab === 'manual' && (
            <Button
              onClick={handleManualSubmit}
              disabled={isLoading || !token.trim()}
            >
              {isLoading ? t('oauth.validating') : t('oauth.confirmLogin')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default LoginDialog
