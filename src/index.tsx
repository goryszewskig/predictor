import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'
import { 
  rateLimiter, 
  validateInput, 
  botDetection, 
  requestSizeLimit, 
  securityHeaders,
  validateHoneypot,
  apiRateLimiter,
  postRateLimiter,
  behaviorAnalysis
} from './security'

// Type definitions for Cloudflare bindings
type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Apply security headers globally
app.use('*', securityHeaders())

// Apply bot detection to all routes
app.use('*', botDetection())

// Apply behavior analysis
app.use('*', behaviorAnalysis())

// Apply global rate limiting (generous for regular browsing)
app.use('*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 200, // 200 requests per 15 minutes for browsing
}))

// Stricter rate limiting for API routes
app.use('/api/*', apiRateLimiter())

// Enable CORS for API routes with restrictions
app.use('/api/*', cors({
  origin: (origin) => {
    // Allow same origin and prediction-tracker.pages.dev subdomains
    if (!origin) return true // Allow requests without origin (same-origin)
    return origin.includes('prediction-tracker.pages.dev') || 
           origin === 'https://prediction-tracker.pages.dev'
  },
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400,
}))

// Request size limiting for API routes
app.use('/api/*', requestSizeLimit(50 * 1024)) // 50KB limit

// Input validation for all POST routes
app.use('*', validateInput())

// Honeypot validation for forms
app.use('/api/predictions*', validateHoneypot())

// Serve static files from public directory
app.use('/static/*', serveStatic({ root: './public' }))

// Use the renderer for HTML responses
app.use(renderer)

// Main page
app.get('/', (c) => {
  return c.render(
    <div>
      <h1>Prediction Tracker</h1>
      <p>Track predictions and verify their accuracy over time</p>
      
      <div className="container">
        <div className="nav-buttons">
          <button onclick="showAddPrediction()" className="btn btn-primary">Add Prediction</button>
          <button onclick="showPredictions()" className="btn btn-secondary">View Predictions</button>
          <button onclick="showStats()" className="btn btn-info">Statistics</button>
        </div>

        {/* Add Prediction Form */}
        <div id="add-prediction" className="section" style="display: none;">
          <h2>Add New Prediction</h2>
          <form id="prediction-form" onsubmit="addPrediction(event)">
            {/* Honeypot fields - hidden from users but visible to bots */}
            <div style="display: none;">
              <input type="text" name="website" tabindex="-1" autocomplete="off" />
              <input type="email" name="email_address" tabindex="-1" autocomplete="off" />
              <input type="text" name="full_name" tabindex="-1" autocomplete="off" />
            </div>
            
            <div className="form-group">
              <label htmlFor="predictor_name">Predictor Name:</label>
              <input type="text" id="predictor_name" name="predictor_name" required />
            </div>
            
            <div className="form-group">
              <label htmlFor="prediction_text">Prediction:</label>
              <textarea id="prediction_text" name="prediction_text" rows="4" required></textarea>
            </div>
            
            <div className="form-group">
              <label htmlFor="predicted_date">Date Predicted:</label>
              <input type="date" id="predicted_date" name="predicted_date" required />
            </div>
            
            <div className="form-group">
              <label htmlFor="target_date">Target Date (when to evaluate):</label>
              <input type="date" id="target_date" name="target_date" />
            </div>
            
            <div className="form-group">
              <label htmlFor="target_description">What to look for:</label>
              <input type="text" id="target_description" name="target_description" 
                     placeholder="Specific event or outcome to verify" />
            </div>
            
            <div className="form-group">
              <label htmlFor="category">Category:</label>
              <select id="category" name="category">
                <option value="general">General</option>
                <option value="technology">Technology</option>
                <option value="economics">Economics</option>
                <option value="politics">Politics</option>
                <option value="climate">Climate</option>
                <option value="sports">Sports</option>
                <option value="health">Health</option>
                <option value="society">Society</option>
                <option value="science">Science</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="confidence_level">Confidence Level (1-10):</label>
              <input type="range" id="confidence_level" name="confidence_level" 
                     min="1" max="10" value="5" oninput="updateConfidenceLabel(this.value)" />
              <span id="confidence-label">5</span>
            </div>
            
            <div className="form-group">
              <label htmlFor="source_url">Source URL (optional):</label>
              <input type="url" id="source_url" name="source_url" />
            </div>
            
            <div className="form-group">
              <label htmlFor="notes">Notes (optional):</label>
              <textarea id="notes" name="notes" rows="2"></textarea>
            </div>
            

            
            <button type="submit" className="btn btn-success">Add Prediction</button>
          </form>
        </div>

        {/* Predictions List */}
        <div id="predictions-list" className="section" style="display: none;">
          <h2>All Predictions</h2>
          <div className="filters">
            <select id="filter-category" onchange="loadPredictions()">
              <option value="">All Categories</option>
              <option value="technology">Technology</option>
              <option value="economics">Economics</option>
              <option value="politics">Politics</option>
              <option value="climate">Climate</option>
              <option value="sports">Sports</option>
              <option value="health">Health</option>
              <option value="society">Society</option>
              <option value="science">Science</option>
            </select>
            <select id="filter-status" onchange="loadPredictions()">
              <option value="">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div id="predictions-container"></div>
        </div>

        {/* Statistics Dashboard */}
        <div id="stats-dashboard" className="section" style="display: none;">
          <h2>Prediction Statistics</h2>
          <div id="stats-container"></div>
        </div>

        {/* Verification Modal */}
        <div id="verification-modal" className="modal" style="display: none;">
          <div className="modal-content">
            <span className="close" onclick="closeModal()">&times;</span>
            <h2>Verify Prediction</h2>
            <div id="prediction-details"></div>
            <form id="verification-form" onsubmit="submitVerification(event)">
              <input type="hidden" id="verify-prediction-id" />
              
              {/* Honeypot fields - hidden from users but visible to bots */}
              <div style="display: none;">
                <input type="text" name="website" tabindex="-1" autocomplete="off" />
                <input type="email" name="email_address" tabindex="-1" autocomplete="off" />
                <input type="text" name="company" tabindex="-1" autocomplete="off" />
              </div>
              
              <div className="form-group">
                <label htmlFor="outcome">Outcome:</label>
                <select id="outcome" name="outcome" required>
                  <option value="">Select outcome</option>
                  <option value="correct">Correct</option>
                  <option value="incorrect">Incorrect</option>
                  <option value="partially_correct">Partially Correct</option>
                  <option value="too_early">Too Early to Tell</option>
                  <option value="unprovable">Unprovable</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="outcome_description">What actually happened:</label>
                <textarea id="outcome_description" name="outcome_description" rows="3" required></textarea>
              </div>
              
              <div className="form-group">
                <label htmlFor="evidence_url">Evidence URL:</label>
                <input type="url" id="evidence_url" name="evidence_url" />
              </div>
              
              <div className="form-group">
                <label htmlFor="verified_by">Verified by:</label>
                <input type="text" id="verified_by" name="verified_by" required />
              </div>
              
              <div className="form-group">
                <label htmlFor="confidence_score">Confidence in Verification (1-10):</label>
                <input type="range" id="confidence_score" name="confidence_score" 
                       min="1" max="10" value="5" oninput="updateVerificationConfidenceLabel(this.value)" />
                <span id="verification-confidence-label">5</span>
              </div>
              
              <div className="form-group">
                <label htmlFor="verification_notes">Verification Notes:</label>
                <textarea id="verification_notes" name="verification_notes" rows="2"></textarea>
              </div>
              

              
              <button type="submit" className="btn btn-success">Submit Verification</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
})

// API Routes

// Get all predictions with optional filters
app.get('/api/predictions', async (c) => {
  const { env } = c
  const category = c.req.query('category')
  const status = c.req.query('status')
  
  try {
    let query = `
      SELECT 
        p.*,
        v.outcome,
        v.outcome_description,
        v.verified_by,
        v.verification_date,
        CASE 
          WHEN v.id IS NOT NULL THEN 'verified'
          WHEN p.target_date IS NOT NULL AND p.target_date < date('now') THEN 'overdue'
          ELSE 'pending'
        END as verification_status
      FROM predictions p
      LEFT JOIN verifications v ON p.id = v.prediction_id
    `
    
    const conditions = []
    const params = []
    
    if (category) {
      conditions.push('p.category = ?')
      params.push(category)
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }
    
    query += ' ORDER BY p.created_at DESC'
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    // Filter by verification status if requested
    let filteredResults = results
    if (status) {
      filteredResults = results.filter(r => r.verification_status === status)
    }
    
    return c.json({ predictions: filteredResults })
  } catch (error) {
    console.error('Error fetching predictions:', error)
    return c.json({ error: 'Failed to fetch predictions' }, 500)
  }
})

// Get specific prediction by ID
app.get('/api/predictions/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')
  
  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        p.*,
        v.outcome,
        v.outcome_description,
        v.evidence_url,
        v.verified_by,
        v.verification_date,
        v.confidence_score as verification_confidence,
        v.notes as verification_notes
      FROM predictions p
      LEFT JOIN verifications v ON p.id = v.prediction_id
      WHERE p.id = ?
    `).bind(id).all()
    
    if (results.length === 0) {
      return c.json({ error: 'Prediction not found' }, 404)
    }
    
    return c.json({ prediction: results[0] })
  } catch (error) {
    console.error('Error fetching prediction:', error)
    return c.json({ error: 'Failed to fetch prediction' }, 500)
  }
})

// Add new prediction (with strict rate limiting)
app.post('/api/predictions', postRateLimiter(), async (c) => {
  const { env } = c
  
  try {
    const body = await c.req.json()
    const {
      predictor_name,
      prediction_text,
      predicted_date,
      target_date,
      target_description,
      category = 'general',
      confidence_level,
      source_url,
      notes
    } = body
    
    // Additional validation for required fields
    if (!predictor_name || !prediction_text || !predicted_date) {
      return c.json({ 
        error: 'Missing required fields', 
        message: 'Predictor name, prediction text, and predicted date are required' 
      }, 400)
    }
    
    // Validate confidence level
    if (confidence_level && (confidence_level < 1 || confidence_level > 10)) {
      return c.json({ 
        error: 'Invalid confidence level', 
        message: 'Confidence level must be between 1 and 10' 
      }, 400)
    }
    
    const { success, meta } = await env.DB.prepare(`
      INSERT INTO predictions 
      (predictor_name, prediction_text, predicted_date, target_date, target_description, 
       category, confidence_level, source_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      predictor_name,
      prediction_text,
      predicted_date,
      target_date || null,
      target_description || null,
      category,
      confidence_level || null,
      source_url || null,
      notes || null
    ).run()
    
    if (success) {
      return c.json({ id: meta.last_row_id, message: 'Prediction added successfully' })
    } else {
      return c.json({ error: 'Failed to add prediction' }, 500)
    }
  } catch (error) {
    console.error('Error adding prediction:', error)
    return c.json({ error: 'Failed to add prediction' }, 500)
  }
})

// Add verification for a prediction (with strict rate limiting)
app.post('/api/predictions/:id/verify', postRateLimiter(), async (c) => {
  const { env } = c
  const predictionId = c.req.param('id')
  
  // Validate prediction ID
  const idNum = parseInt(predictionId)
  if (isNaN(idNum) || idNum <= 0) {
    return c.json({ error: 'Invalid prediction ID' }, 400)
  }
  
  try {
    const body = await c.req.json()
    const {
      outcome,
      outcome_description,
      evidence_url,
      verified_by,
      confidence_score,
      notes
    } = body
    
    // Validate required fields
    if (!outcome || !outcome_description || !verified_by) {
      return c.json({ 
        error: 'Missing required fields', 
        message: 'Outcome, description, and verifier name are required' 
      }, 400)
    }
    
    // Validate outcome value
    const validOutcomes = ['correct', 'incorrect', 'partially_correct', 'too_early', 'unprovable']
    if (!validOutcomes.includes(outcome)) {
      return c.json({ 
        error: 'Invalid outcome', 
        message: 'Outcome must be one of: ' + validOutcomes.join(', ') 
      }, 400)
    }
    
    // Validate confidence score
    if (confidence_score && (confidence_score < 1 || confidence_score > 10)) {
      return c.json({ 
        error: 'Invalid confidence score', 
        message: 'Confidence score must be between 1 and 10' 
      }, 400)
    }
    
    // Check if prediction exists
    const prediction = await env.DB.prepare('SELECT id FROM predictions WHERE id = ?').bind(predictionId).first()
    if (!prediction) {
      return c.json({ error: 'Prediction not found' }, 404)
    }
    
    // Check if already verified
    const existingVerification = await env.DB.prepare('SELECT id FROM verifications WHERE prediction_id = ?').bind(predictionId).first()
    if (existingVerification) {
      return c.json({ error: 'Prediction already verified' }, 400)
    }
    
    const { success, meta } = await env.DB.prepare(`
      INSERT INTO verifications 
      (prediction_id, outcome, outcome_description, evidence_url, verified_by, confidence_score, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      predictionId,
      outcome,
      outcome_description,
      evidence_url || null,
      verified_by,
      confidence_score || null,
      notes || null
    ).run()
    
    if (success) {
      return c.json({ id: meta.last_row_id, message: 'Verification added successfully' })
    } else {
      return c.json({ error: 'Failed to add verification' }, 500)
    }
  } catch (error) {
    console.error('Error adding verification:', error)
    return c.json({ error: 'Failed to add verification' }, 500)
  }
})

// Get statistics
app.get('/api/stats', async (c) => {
  const { env } = c
  
  try {
    // Total predictions
    const totalResult = await env.DB.prepare('SELECT COUNT(*) as count FROM predictions').first()
    const totalPredictions = totalResult?.count || 0
    
    // Verified predictions
    const verifiedResult = await env.DB.prepare('SELECT COUNT(*) as count FROM verifications').first()
    const verifiedPredictions = verifiedResult?.count || 0
    
    // Accuracy by outcome
    const outcomeStats = await env.DB.prepare(`
      SELECT outcome, COUNT(*) as count 
      FROM verifications 
      GROUP BY outcome
    `).all()
    
    // Predictions by category
    const categoryStats = await env.DB.prepare(`
      SELECT category, COUNT(*) as count 
      FROM predictions 
      GROUP BY category
    `).all()
    
    // Top predictors accuracy
    const predictorStats = await env.DB.prepare(`
      SELECT 
        p.predictor_name,
        COUNT(p.id) as total_predictions,
        COUNT(v.id) as verified_predictions,
        SUM(CASE WHEN v.outcome = 'correct' THEN 1 ELSE 0 END) as correct_predictions
      FROM predictions p
      LEFT JOIN verifications v ON p.id = v.prediction_id
      GROUP BY p.predictor_name
      HAVING COUNT(p.id) > 0
      ORDER BY total_predictions DESC
    `).all()
    
    return c.json({
      totalPredictions,
      verifiedPredictions,
      pendingPredictions: totalPredictions - verifiedPredictions,
      outcomeStats: outcomeStats.results || [],
      categoryStats: categoryStats.results || [],
      predictorStats: predictorStats.results || []
    })
  } catch (error) {
    console.error('Error fetching statistics:', error)
    return c.json({ error: 'Failed to fetch statistics' }, 500)
  }
})

export default app