import { Context, Next } from 'hono'

// Rate limiting store (in production, you'd use KV storage or external store)
interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked?: boolean;
  blockUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Security configuration
const SECURITY_CONFIG = {
  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 30, // Max requests per window
    STRICT_ENDPOINTS: {
      '/api/predictions': { max: 5, window: 60 * 1000 }, // 5 predictions per minute
      '/api/predictions/*/verify': { max: 10, window: 60 * 1000 }, // 10 verifications per minute
    }
  },
  
  // Blocking thresholds
  BLOCKING: {
    SUSPICIOUS_THRESHOLD: 100, // Block after 100 requests in window
    BLOCK_DURATION: 15 * 60 * 1000, // 15 minutes
  },
  
  // Input limits
  INPUT_LIMITS: {
    PREDICTION_TEXT_MAX: 2000,
    PREDICTOR_NAME_MAX: 100,
    DESCRIPTION_MAX: 500,
    URL_MAX: 2048,
    NOTES_MAX: 1000,
  },
  
  // Suspicious patterns
  SUSPICIOUS_PATTERNS: [
    /script/i,
    /<.*>/,
    /javascript:/i,
    /vbscript:/i,
    /onload/i,
    /onclick/i,
    /eval\(/i,
    /expression\(/i,
  ],
  
  // Bot user agents (basic detection)
  BOT_PATTERNS: [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /requests/i,
  ],
}

// Clean up old entries
function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.blockUntil && now > entry.blockUntil) {
      // Remove expired blocks
      rateLimitStore.delete(key);
    } else if (now - entry.windowStart > SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS * 2) {
      // Remove old entries
      rateLimitStore.delete(key);
    }
  }
}

// Rate limiting middleware
export function rateLimiter(endpoint?: string) {
  return async (c: Context, next: Next) => {
    const clientIP = c.req.header('CF-Connecting-IP') || 
                    c.req.header('X-Forwarded-For') || 
                    c.req.header('X-Real-IP') || 
                    'unknown';
    
    const now = Date.now();
    const key = `${clientIP}:${endpoint || 'global'}`;
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) {
      cleanupRateLimit();
    }
    
    let entry = rateLimitStore.get(key);
    
    // Check if IP is currently blocked
    if (entry?.blocked && entry.blockUntil && now < entry.blockUntil) {
      return c.json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((entry.blockUntil - now) / 1000)
      }, 429);
    }
    
    // Get rate limit config for specific endpoint
    const config = endpoint && SECURITY_CONFIG.RATE_LIMIT.STRICT_ENDPOINTS[endpoint] 
      ? SECURITY_CONFIG.RATE_LIMIT.STRICT_ENDPOINTS[endpoint]
      : { max: SECURITY_CONFIG.RATE_LIMIT.MAX_REQUESTS, window: SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS };
    
    // Initialize or update rate limit entry
    if (!entry || (now - entry.windowStart) > config.window) {
      entry = {
        count: 1,
        windowStart: now,
        blocked: false
      };
    } else {
      entry.count++;
    }
    
    rateLimitStore.set(key, entry);
    
    // Check if limit exceeded
    if (entry.count > config.max) {
      // Block for suspicious activity
      if (entry.count > SECURITY_CONFIG.BLOCKING.SUSPICIOUS_THRESHOLD) {
        entry.blocked = true;
        entry.blockUntil = now + SECURITY_CONFIG.BLOCKING.BLOCK_DURATION;
        rateLimitStore.set(key, entry);
        
        console.log(`IP ${clientIP} blocked for suspicious activity: ${entry.count} requests`);
        
        return c.json({ 
          error: 'Suspicious activity detected. Access temporarily blocked.',
          retryAfter: SECURITY_CONFIG.BLOCKING.BLOCK_DURATION / 1000
        }, 429);
      }
      
      return c.json({ 
        error: 'Rate limit exceeded. Please slow down.',
        limit: config.max,
        window: config.window / 1000,
        retryAfter: Math.ceil((entry.windowStart + config.window - now) / 1000)
      }, 429);
    }
    
    // Add rate limit headers
    c.header('X-RateLimit-Limit', config.max.toString());
    c.header('X-RateLimit-Remaining', (config.max - entry.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil((entry.windowStart + config.window) / 1000).toString());
    
    await next();
  }
}

// Input validation and sanitization
export function validateInput(data: any, type: 'prediction' | 'verification'): { isValid: boolean; errors: string[]; sanitized?: any } {
  const errors: string[] = [];
  const sanitized: any = {};
  
  // Common validation
  function sanitizeString(str: string, maxLength: number, fieldName: string): string {
    if (!str) return '';
    
    // Check for suspicious patterns
    for (const pattern of SECURITY_CONFIG.SUSPICIOUS_PATTERNS) {
      if (pattern.test(str)) {
        errors.push(`${fieldName} contains potentially malicious content`);
        return '';
      }
    }
    
    // Trim and limit length
    const cleaned = str.trim().substring(0, maxLength);
    
    // Basic HTML escape (additional to prevent XSS)
    return cleaned
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  function validateURL(url: string): boolean {
    if (!url) return true; // Optional field
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }
  
  if (type === 'prediction') {
    // Validate prediction data
    const { predictor_name, prediction_text, predicted_date, target_date, target_description, category, confidence_level, source_url, notes } = data;
    
    // Required fields
    if (!predictor_name?.trim()) errors.push('Predictor name is required');
    if (!prediction_text?.trim()) errors.push('Prediction text is required');
    if (!predicted_date) errors.push('Predicted date is required');
    
    // Sanitize and validate
    sanitized.predictor_name = sanitizeString(predictor_name, SECURITY_CONFIG.INPUT_LIMITS.PREDICTOR_NAME_MAX, 'Predictor name');
    sanitized.prediction_text = sanitizeString(prediction_text, SECURITY_CONFIG.INPUT_LIMITS.PREDICTION_TEXT_MAX, 'Prediction text');
    sanitized.target_description = sanitizeString(target_description, SECURITY_CONFIG.INPUT_LIMITS.DESCRIPTION_MAX, 'Target description');
    sanitized.notes = sanitizeString(notes, SECURITY_CONFIG.INPUT_LIMITS.NOTES_MAX, 'Notes');
    
    // Date validation
    const predDate = new Date(predicted_date);
    const targetDate = target_date ? new Date(target_date) : null;
    
    if (isNaN(predDate.getTime())) errors.push('Invalid predicted date');
    if (predDate > new Date()) errors.push('Predicted date cannot be in the future');
    if (targetDate && isNaN(targetDate.getTime())) errors.push('Invalid target date');
    if (targetDate && targetDate <= predDate) errors.push('Target date must be after predicted date');
    
    sanitized.predicted_date = predicted_date;
    sanitized.target_date = target_date;
    
    // Category validation
    const validCategories = ['general', 'technology', 'economics', 'politics', 'climate', 'sports', 'health', 'society', 'science'];
    sanitized.category = validCategories.includes(category) ? category : 'general';
    
    // Confidence level validation
    const confidence = parseInt(confidence_level);
    if (isNaN(confidence) || confidence < 1 || confidence > 10) {
      errors.push('Confidence level must be between 1 and 10');
    }
    sanitized.confidence_level = Math.max(1, Math.min(10, confidence || 5));
    
    // URL validation
    if (source_url && !validateURL(source_url)) {
      errors.push('Invalid source URL');
    } else {
      sanitized.source_url = source_url;
    }
    
  } else if (type === 'verification') {
    // Validate verification data
    const { outcome, outcome_description, evidence_url, verified_by, confidence_score, notes } = data;
    
    // Required fields
    if (!outcome) errors.push('Outcome is required');
    if (!outcome_description?.trim()) errors.push('Outcome description is required');
    if (!verified_by?.trim()) errors.push('Verified by is required');
    
    // Sanitize and validate
    sanitized.outcome_description = sanitizeString(outcome_description, SECURITY_CONFIG.INPUT_LIMITS.DESCRIPTION_MAX, 'Outcome description');
    sanitized.verified_by = sanitizeString(verified_by, SECURITY_CONFIG.INPUT_LIMITS.PREDICTOR_NAME_MAX, 'Verified by');
    sanitized.notes = sanitizeString(notes, SECURITY_CONFIG.INPUT_LIMITS.NOTES_MAX, 'Verification notes');
    
    // Outcome validation
    const validOutcomes = ['correct', 'incorrect', 'partially_correct', 'too_early', 'unprovable'];
    if (!validOutcomes.includes(outcome)) {
      errors.push('Invalid outcome value');
    }
    sanitized.outcome = outcome;
    
    // Confidence score validation
    const confidence = parseInt(confidence_score);
    if (isNaN(confidence) || confidence < 1 || confidence > 10) {
      errors.push('Confidence score must be between 1 and 10');
    }
    sanitized.confidence_score = Math.max(1, Math.min(10, confidence || 5));
    
    // URL validation
    if (evidence_url && !validateURL(evidence_url)) {
      errors.push('Invalid evidence URL');
    } else {
      sanitized.evidence_url = evidence_url;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined
  };
}

// Bot detection middleware
export function botDetection() {
  return async (c: Context, next: Next) => {
    const userAgent = c.req.header('User-Agent') || '';
    
    // Check for bot patterns
    for (const pattern of SECURITY_CONFIG.BOT_PATTERNS) {
      if (pattern.test(userAgent)) {
        console.log(`Bot detected: ${userAgent}`);
        return c.json({ error: 'Automated requests are not allowed' }, 403);
      }
    }
    
    // Check for missing user agent (suspicious)
    if (!userAgent.trim()) {
      console.log('Request with missing User-Agent');
      return c.json({ error: 'Invalid request' }, 400);
    }
    
    await next();
  }
}

// Request size limiting middleware
export function requestSizeLimit(maxSize: number = 50 * 1024) { // 50KB default
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return c.json({ 
        error: 'Request too large',
        maxSize: maxSize,
        received: contentLength
      }, 413);
    }
    
    await next();
  }
}

// Honeypot validation (to be used with frontend)
export function validateHoneypot(honeypotValue: any): boolean {
  // Honeypot fields should always be empty
  return !honeypotValue || honeypotValue === '';
}

// CAPTCHA validation
export function validateCaptcha(userAnswer: any, expectedAnswer: any): boolean {
  const userNum = parseInt(userAnswer);
  const expectedNum = parseInt(expectedAnswer);
  
  if (isNaN(userNum) || isNaN(expectedNum)) {
    return false;
  }
  
  return userNum === expectedNum;
}

// CORS security middleware
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    // Security headers
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Only for HTML responses
    if (c.req.path === '/' || !c.req.path.startsWith('/api/')) {
      c.header('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "font-src 'self' https://cdn.jsdelivr.net; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://www.google-analytics.com;"
      );
    }
    
    await next();
  }
}