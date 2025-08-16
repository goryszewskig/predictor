import { Context, Next } from 'hono'

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyGenerator: (c: Context) => string
  skipSuccessfulRequests?: boolean
}

// In-memory store for rate limiting (in production, use Redis or KV)
// Note: This will be created per request in Cloudflare Workers environment
let rateLimitStore: Map<string, { count: number; resetTime: number }>

function getRateLimitStore() {
  if (!rateLimitStore) {
    rateLimitStore = new Map()
  }
  return rateLimitStore
}

/**
 * Rate Limiter Middleware
 */
export function rateLimiter(config?: Partial<RateLimitConfig>) {
  const defaultConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // requests per window
    keyGenerator: (c) => {
      const cf = c.req.raw.cf as any
      return cf?.colo + ':' + (cf?.clientIP || c.req.header('x-forwarded-for') || 'unknown')
    }
  }
  
  const finalConfig = { ...defaultConfig, ...config }

  return async (c: Context, next: Next) => {
    const store = getRateLimitStore()
    const key = finalConfig.keyGenerator(c)
    const now = Date.now()
    const windowStart = now - finalConfig.windowMs

    let record = store.get(key)
    
    if (!record || record.resetTime <= now) {
      record = { count: 0, resetTime: now + finalConfig.windowMs }
      store.set(key, record)
    }

    record.count++

    // Set rate limit headers
    c.header('X-RateLimit-Limit', finalConfig.maxRequests.toString())
    c.header('X-RateLimit-Remaining', Math.max(0, finalConfig.maxRequests - record.count).toString())
    c.header('X-RateLimit-Reset', new Date(record.resetTime).toISOString())

    if (record.count > finalConfig.maxRequests) {
      c.header('Retry-After', Math.ceil((record.resetTime - now) / 1000).toString())
      return c.json({ 
        error: 'Rate limit exceeded', 
        message: 'Too many requests. Please try again later.',
        retryAfter: record.resetTime - now
      }, 429)
    }

    await next()
  }
}

/**
 * Stricter rate limiting for API endpoints
 */
export function apiRateLimiter() {
  return rateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20, // 20 requests per 5 minutes for API calls
  })
}

/**
 * Even stricter rate limiting for POST endpoints
 */
export function postRateLimiter() {
  return rateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes  
    maxRequests: 5, // 5 POST requests per 10 minutes
  })
}

/**
 * Security Headers Middleware
 */
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    // Security headers
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    
    // CSP header
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
      "font-src 'self' https://cdn.jsdelivr.net",
      "img-src 'self' data: https: http:",
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
    
    c.header('Content-Security-Policy', csp)

    await next()
  }
}

/**
 * Bot Detection Middleware
 */
export function botDetection() {
  const suspiciousUserAgents = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /curl/i, /wget/i, /python/i, /java/i,
    /perl/i, /php/i, /ruby/i, /go-http/i,
    /postman/i, /insomnia/i, /httpie/i
  ]

  const suspiciousHeaders = [
    'x-forwarded-for', 'x-real-ip', 'x-originating-ip'
  ]

  return async (c: Context, next: Next) => {
    const userAgent = c.req.header('user-agent') || ''
    const cf = c.req.raw.cf as any

    // Check for suspicious user agents
    if (suspiciousUserAgents.some(pattern => pattern.test(userAgent))) {
      // Allow some legitimate bots but rate limit them heavily
      if (!/googlebot|bingbot|slurp/i.test(userAgent)) {
        return c.json({ 
          error: 'Access denied',
          message: 'Automated requests are not allowed'
        }, 403)
      }
    }

    // Check for missing or suspicious headers
    if (!userAgent || userAgent.length < 10) {
      return c.json({
        error: 'Access denied',
        message: 'Invalid user agent'
      }, 403)
    }

    // Check for too many proxy headers (potential bot farm)
    const proxyHeaders = suspiciousHeaders.filter(header => c.req.header(header))
    if (proxyHeaders.length > 2) {
      return c.json({
        error: 'Access denied', 
        message: 'Suspicious request headers'
      }, 403)
    }

    // Cloudflare bot score check (if available)
    if (cf && cf.botManagement && cf.botManagement.score < 30) {
      return c.json({
        error: 'Access denied',
        message: 'Automated traffic detected'
      }, 403)
    }

    await next()
  }
}

/**
 * Input Validation Middleware
 */
export function validateInput() {
  return async (c: Context, next: Next) => {
    if (c.req.method === 'POST') {
      try {
        const body = await c.req.json()
        
        // Check for common injection patterns
        const dangerousPatterns = [
          /<script/i, /javascript:/i, /on\w+=/i,
          /union.*select/i, /drop.*table/i, /delete.*from/i,
          /insert.*into/i, /update.*set/i, /--/,
          /\/\*.*\*\//,  /eval\(/i, /exec\(/i
        ]

        const checkValue = (value: any): boolean => {
          if (typeof value === 'string') {
            return dangerousPatterns.some(pattern => pattern.test(value))
          }
          if (typeof value === 'object' && value !== null) {
            return Object.values(value).some(checkValue)
          }
          return false
        }

        if (checkValue(body)) {
          return c.json({
            error: 'Invalid input',
            message: 'Potentially malicious content detected'
          }, 400)
        }

        // Length checks
        Object.entries(body).forEach(([key, value]) => {
          if (typeof value === 'string') {
            if (key === 'prediction_text' && value.length > 1000) {
              throw new Error('Prediction text too long')
            }
            if (key === 'outcome_description' && value.length > 2000) {
              throw new Error('Outcome description too long')
            }
            if (key === 'predictor_name' && value.length > 100) {
              throw new Error('Predictor name too long')
            }
            if (value.length > 5000) {
              throw new Error('Input field too long')
            }
          }
        })

      } catch (error) {
        return c.json({
          error: 'Invalid input',
          message: error instanceof Error ? error.message : 'Invalid request format'
        }, 400)
      }
    }

    await next()
  }
}

/**
 * Request Size Limiter
 */
export function requestSizeLimit(maxSize: number = 50 * 1024) { // 50KB default
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length')
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return c.json({
        error: 'Request too large',
        message: `Request size exceeds ${maxSize} bytes limit`
      }, 413)
    }

    await next()
  }
}

/**
 * Honeypot Field Validation (for forms)
 */
export function validateHoneypot() {
  return async (c: Context, next: Next) => {
    if (c.req.method === 'POST') {
      try {
        const body = await c.req.json()
        
        // Check honeypot fields (should be empty)
        if (body.website || body.phone || body.address) {
          return c.json({
            error: 'Bot detected',
            message: 'Automated submission detected'
          }, 403)
        }
      } catch (error) {
        // If parsing fails, let it continue to be handled by other middleware
      }
    }

    await next()
  }
}

/**
 * Simple CAPTCHA-like validation
 */
export function validateCaptcha() {
  return async (c: Context, next: Next) => {
    if (c.req.method === 'POST') {
      try {
        const body = await c.req.json()
        
        // Simple math captcha validation
        if (body.captcha_answer) {
          const expectedAnswer = c.req.header('x-captcha-token')
          if (body.captcha_answer !== expectedAnswer) {
            return c.json({
              error: 'CAPTCHA verification failed',
              message: 'Please solve the CAPTCHA correctly'
            }, 400)
          }
        }
      } catch (error) {
        // Continue if parsing fails
      }
    }

    await next()
  }
}

/**
 * IP Whitelist/Blacklist (optional)
 */
export function ipFilter(whitelist?: string[], blacklist?: string[]) {
  return async (c: Context, next: Next) => {
    const cf = c.req.raw.cf as any
    const clientIP = cf?.clientIP || c.req.header('x-forwarded-for') || c.req.header('x-real-ip')

    if (blacklist && clientIP && blacklist.includes(clientIP)) {
      return c.json({
        error: 'Access denied',
        message: 'Your IP address is blocked'
      }, 403)
    }

    if (whitelist && whitelist.length > 0 && clientIP && !whitelist.includes(clientIP)) {
      return c.json({
        error: 'Access denied',
        message: 'Your IP address is not authorized'
      }, 403)
    }

    await next()
  }
}

/**
 * Suspicious behavior detection
 */
let suspiciousActivities: Map<string, { actions: string[]; timestamps: number[] }>

function getSuspiciousActivitiesStore() {
  if (!suspiciousActivities) {
    suspiciousActivities = new Map()
  }
  return suspiciousActivities
}

export function behaviorAnalysis() {
  return async (c: Context, next: Next) => {
    const store = getSuspiciousActivitiesStore()
    const cf = c.req.raw.cf as any
    const clientIP = cf?.clientIP || c.req.header('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000

    if (!store.has(clientIP)) {
      store.set(clientIP, { actions: [], timestamps: [] })
    }

    const activity = store.get(clientIP)!
    
    // Clean old timestamps
    activity.timestamps = activity.timestamps.filter(t => t > fiveMinutesAgo)
    activity.actions = activity.actions.slice(-10) // Keep last 10 actions

    // Record current action
    activity.actions.push(c.req.method + ' ' + c.req.path)
    activity.timestamps.push(now)

    // Check for suspicious patterns
    const recentRequests = activity.timestamps.length
    const uniqueActions = new Set(activity.actions).size

    // Too many requests with too few unique actions (potential bot)
    if (recentRequests > 30 && uniqueActions < 3) {
      return c.json({
        error: 'Suspicious activity detected',
        message: 'Please wait before making more requests'
      }, 429)
    }

    // Too many POST requests in short time
    const recentPosts = activity.actions.filter(action => action.startsWith('POST')).length
    if (recentPosts > 10) {
      return c.json({
        error: 'Too many submissions',
        message: 'Please slow down your submissions'
      }, 429)
    }

    await next()
  }
}