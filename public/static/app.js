// Prediction Tracker Frontend JavaScript

// Global state
let currentPredictions = [];
let currentStats = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Hide all sections initially except the main nav
    hideAllSections();
    
    // Show predictions by default
    showPredictions();
});

// Navigation functions
function hideAllSections() {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
}

function showAddPrediction() {
    hideAllSections();
    document.getElementById('add-prediction').style.display = 'block';
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('predicted_date').value = today;
    
    // Track form start time for bot detection
    window.predictionFormStartTime = Date.now();
}

function showPredictions() {
    hideAllSections();
    document.getElementById('predictions-list').style.display = 'block';
    loadPredictions();
}

function showStats() {
    hideAllSections();
    document.getElementById('stats-dashboard').style.display = 'block';
    loadStatistics();
}

// Form handling functions
function updateConfidenceLabel(value) {
    document.getElementById('confidence-label').textContent = value;
}

function updateVerificationConfidenceLabel(value) {
    document.getElementById('verification-confidence-label').textContent = value;
}

// Security and validation functions

// Rate limiting and error handling
function handleApiError(error) {
    console.error('API Error:', error);
    
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        switch(status) {
            case 429:
                if (data.retryAfter) {
                    return `Rate limit exceeded. Please wait ${data.retryAfter} seconds before trying again.`;
                }
                return 'Too many requests. Please slow down and try again later.';
            case 400:
                if (data.details && Array.isArray(data.details)) {
                    return 'Validation errors: ' + data.details.join(', ');
                }
                return data.error || 'Invalid request. Please check your input.';
            case 403:
                return 'Access forbidden. Please refresh the page and try again.';
            case 500:
                return 'Server error. Please try again later.';
            default:
                return data.error || `Error ${status}: Please try again.`;
        }
    }
    
    return 'Network error. Please check your connection and try again.';
}

// Add new prediction
async function addPrediction(event) {
    event.preventDefault();
    
    const form = document.getElementById('prediction-form');
    const formData = new FormData(form);
    
    // Honeypot validation (should be empty)
    if (formData.get('website') || formData.get('email_address') || formData.get('full_name')) {
        // Don't alert - just silently fail for bots
        console.log('Bot detected via honeypot fields');
        return;
    }
    
    // Basic form completion time check (too fast = bot)
    const formStartTime = window.predictionFormStartTime || Date.now();
    const completionTime = Date.now() - formStartTime;
    if (completionTime < 3000) { // Less than 3 seconds
        alert('Please take your time to fill out the form properly.');
        return;
    }
    
    // Check for bot behavior (rapid submissions, suspicious patterns)
    const submissionTime = Date.now();
    const lastSubmission = localStorage.getItem('lastPredictionSubmission');
    if (lastSubmission && (submissionTime - parseInt(lastSubmission)) < 5000) {
        alert('Please wait a moment before submitting another prediction.');
        return;
    }
    localStorage.setItem('lastPredictionSubmission', submissionTime.toString());
    
    const predictionData = {
        predictor_name: formData.get('predictor_name'),
        prediction_text: formData.get('prediction_text'),
        predicted_date: formData.get('predicted_date'),
        target_date: formData.get('target_date') || null,
        target_description: formData.get('target_description') || null,
        category: formData.get('category'),
        confidence_level: parseInt(formData.get('confidence_level')),
        source_url: formData.get('source_url') || null,
        notes: formData.get('notes') || null
    };
    
    try {
        const response = await axios.post('/api/predictions', predictionData);
        
        if (response.data.id) {
            alert('Prediction added successfully!');
            form.reset();
            document.getElementById('predicted_date').value = new Date().toISOString().split('T')[0];
            document.getElementById('confidence-label').textContent = '5';
            showPredictions(); // Switch to predictions view
        } else {
            alert('Error adding prediction: ' + (response.data.error || 'Unknown error'));
        }
    } catch (error) {
        const errorMessage = handleApiError(error);
        alert('Error adding prediction: ' + errorMessage);
    }
}

// Load and display predictions
async function loadPredictions() {
    const category = document.getElementById('filter-category').value;
    const status = document.getElementById('filter-status').value;
    
    let url = '/api/predictions';
    const params = new URLSearchParams();
    
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    
    if (params.toString()) {
        url += '?' + params.toString();
    }
    
    try {
        const response = await axios.get(url);
        currentPredictions = response.data.predictions;
        displayPredictions(currentPredictions);
    } catch (error) {
        console.error('Error loading predictions:', error);
        document.getElementById('predictions-container').innerHTML = 
            '<p>Error loading predictions: ' + (error.response?.data?.error || error.message) + '</p>';
    }
}

// Display predictions in the UI
function displayPredictions(predictions) {
    const container = document.getElementById('predictions-container');
    
    if (predictions.length === 0) {
        container.innerHTML = '<p>No predictions found matching your criteria.</p>';
        return;
    }
    
    const html = predictions.map(prediction => {
        const targetDate = prediction.target_date ? new Date(prediction.target_date).toLocaleDateString() : 'Open-ended';
        const predictedDate = new Date(prediction.predicted_date).toLocaleDateString();
        const verificationDate = prediction.verification_date ? 
            new Date(prediction.verification_date).toLocaleDateString() : null;
        
        const statusClass = `status-${prediction.verification_status}`;
        const outcomeClass = prediction.outcome ? `outcome-${prediction.outcome}` : '';
        
        return `
            <div class="prediction-card">
                <div class="prediction-header">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; color: #1f2937;">${escapeHtml(prediction.predictor_name)}</h3>
                        <span class="status-badge ${statusClass}">${prediction.verification_status}</span>
                        ${prediction.outcome ? `<span class="outcome-badge ${outcomeClass}">${prediction.outcome.replace('_', ' ')}</span>` : ''}
                    </div>
                    <div>
                        <span class="category-badge">${prediction.category}</span>
                    </div>
                </div>
                
                <div class="prediction-meta">
                    <span><i class="fas fa-calendar"></i> Predicted: ${predictedDate}</span>
                    <span><i class="fas fa-target"></i> Target: ${targetDate}</span>
                    <span class="confidence-indicator">
                        <i class="fas fa-chart-bar"></i> Confidence: ${prediction.confidence_level}/10
                        <div class="confidence-bar">
                            <div class="confidence-fill" style="width: ${prediction.confidence_level * 10}%"></div>
                        </div>
                    </span>
                    ${verificationDate ? `<span><i class="fas fa-check"></i> Verified: ${verificationDate}</span>` : ''}
                </div>
                
                <div class="prediction-text">
                    "${escapeHtml(prediction.prediction_text)}"
                </div>
                
                ${prediction.target_description ? `
                    <div style="margin-bottom: 15px; color: #6b7280; font-style: italic;">
                        <strong>What to look for:</strong> ${escapeHtml(prediction.target_description)}
                    </div>
                ` : ''}
                
                ${prediction.outcome_description ? `
                    <div style="margin-bottom: 15px; padding: 10px; background: #f9fafb; border-radius: 5px;">
                        <strong>Outcome:</strong> ${escapeHtml(prediction.outcome_description)}
                        ${prediction.verified_by ? `<br><small>Verified by: ${escapeHtml(prediction.verified_by)}</small>` : ''}
                    </div>
                ` : ''}
                
                <div class="prediction-actions">
                    ${!prediction.outcome ? `
                        <button onclick="openVerificationModal(${prediction.id})" class="btn btn-success">
                            <i class="fas fa-check"></i> Verify
                        </button>
                    ` : ''}
                    ${prediction.source_url ? `
                        <a href="${prediction.source_url}" target="_blank" class="btn btn-info">
                            <i class="fas fa-external-link-alt"></i> Source
                        </a>
                    ` : ''}
                    <button onclick="viewPredictionDetails(${prediction.id})" class="btn btn-secondary">
                        <i class="fas fa-eye"></i> Details
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Verification modal functions
async function openVerificationModal(predictionId) {
    try {
        const response = await axios.get(`/api/predictions/${predictionId}`);
        const prediction = response.data.prediction;
        
        // Populate modal with prediction details
        document.getElementById('prediction-details').innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 5px;">
                <h3>${escapeHtml(prediction.predictor_name)}</h3>
                <p><strong>Prediction:</strong> "${escapeHtml(prediction.prediction_text)}"</p>
                <p><strong>Made on:</strong> ${new Date(prediction.predicted_date).toLocaleDateString()}</p>
                ${prediction.target_date ? `<p><strong>Target date:</strong> ${new Date(prediction.target_date).toLocaleDateString()}</p>` : ''}
                ${prediction.target_description ? `<p><strong>What to look for:</strong> ${escapeHtml(prediction.target_description)}</p>` : ''}
            </div>
        `;
        
        document.getElementById('verify-prediction-id').value = predictionId;
        // Track form start time for bot detection
        window.verificationFormStartTime = Date.now();
        document.getElementById('verification-modal').style.display = 'flex';
    } catch (error) {
        console.error('Error loading prediction details:', error);
        alert('Error loading prediction details');
    }
}

function closeModal() {
    document.getElementById('verification-modal').style.display = 'none';
    document.getElementById('verification-form').reset();
    document.getElementById('verification-confidence-label').textContent = '5';
}

// Submit verification
async function submitVerification(event) {
    event.preventDefault();
    
    const form = document.getElementById('verification-form');
    const formData = new FormData(form);
    const predictionId = formData.get('verify-prediction-id');
    
    // Honeypot validation (should be empty)
    if (formData.get('website') || formData.get('email_address') || formData.get('company')) {
        // Don't alert - just silently fail for bots
        console.log('Bot detected via honeypot fields in verification');
        return;
    }
    
    // Basic form completion time check
    const formStartTime = window.verificationFormStartTime || Date.now();
    const completionTime = Date.now() - formStartTime;
    if (completionTime < 2000) { // Less than 2 seconds
        alert('Please take your time to fill out the verification properly.');
        return;
    }
    
    // Check for bot behavior
    const submissionTime = Date.now();
    const lastSubmission = localStorage.getItem('lastVerificationSubmission');
    if (lastSubmission && (submissionTime - parseInt(lastSubmission)) < 3000) {
        alert('Please wait a moment before submitting another verification.');
        return;
    }
    localStorage.setItem('lastVerificationSubmission', submissionTime.toString());
    
    const verificationData = {
        outcome: formData.get('outcome'),
        outcome_description: formData.get('outcome_description'),
        evidence_url: formData.get('evidence_url') || null,
        verified_by: formData.get('verified_by'),
        confidence_score: parseInt(formData.get('confidence_score')),
        notes: formData.get('verification_notes') || null
    };
    
    try {
        const response = await axios.post(`/api/predictions/${predictionId}/verify`, verificationData);
        
        if (response.data.id) {
            alert('Verification submitted successfully!');
            closeModal();
            loadPredictions(); // Refresh the predictions list
        } else {
            alert('Error submitting verification: ' + (response.data.error || 'Unknown error'));
        }
    } catch (error) {
        const errorMessage = handleApiError(error);
        alert('Error submitting verification: ' + errorMessage);
    }
}

// View prediction details (for future enhancement)
async function viewPredictionDetails(predictionId) {
    try {
        const response = await axios.get(`/api/predictions/${predictionId}`);
        const prediction = response.data.prediction;
        
        let details = `
Predictor: ${prediction.predictor_name}
Prediction: "${prediction.prediction_text}"
Made on: ${new Date(prediction.predicted_date).toLocaleDateString()}
Category: ${prediction.category}
Confidence: ${prediction.confidence_level}/10
        `;
        
        if (prediction.target_date) {
            details += `\nTarget date: ${new Date(prediction.target_date).toLocaleDateString()}`;
        }
        
        if (prediction.target_description) {
            details += `\nWhat to look for: ${prediction.target_description}`;
        }
        
        if (prediction.outcome) {
            details += `\n\nOutcome: ${prediction.outcome}`;
            details += `\nWhat happened: ${prediction.outcome_description}`;
            details += `\nVerified by: ${prediction.verified_by}`;
            details += `\nVerification date: ${new Date(prediction.verification_date).toLocaleDateString()}`;
        }
        
        if (prediction.notes) {
            details += `\n\nNotes: ${prediction.notes}`;
        }
        
        alert(details);
    } catch (error) {
        console.error('Error loading prediction details:', error);
        alert('Error loading prediction details');
    }
}

// Load and display statistics
async function loadStatistics() {
    try {
        const response = await axios.get('/api/stats');
        currentStats = response.data;
        displayStatistics(currentStats);
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('stats-container').innerHTML = 
            '<p>Error loading statistics: ' + (error.response?.data?.error || error.message) + '</p>';
    }
}

// Display statistics
function displayStatistics(stats) {
    const container = document.getElementById('stats-container');
    
    const verificationRate = stats.totalPredictions > 0 ? 
        ((stats.verifiedPredictions / stats.totalPredictions) * 100).toFixed(1) : 0;
    
    let html = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.totalPredictions}</div>
                <div class="stat-label">Total Predictions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.verifiedPredictions}</div>
                <div class="stat-label">Verified Predictions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.pendingPredictions}</div>
                <div class="stat-label">Pending Verification</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${verificationRate}%</div>
                <div class="stat-label">Verification Rate</div>
            </div>
        </div>
    `;
    
    // Outcome distribution
    if (stats.outcomeStats && stats.outcomeStats.length > 0) {
        html += `
            <div class="chart-container">
                <h3>Prediction Outcomes</h3>
                <div class="stats-grid">
        `;
        
        stats.outcomeStats.forEach(outcome => {
            html += `
                <div class="stat-card">
                    <div class="stat-number">${outcome.count}</div>
                    <div class="stat-label">${outcome.outcome.replace('_', ' ')}</div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Category distribution
    if (stats.categoryStats && stats.categoryStats.length > 0) {
        html += `
            <div class="chart-container">
                <h3>Predictions by Category</h3>
                <div class="stats-grid">
        `;
        
        stats.categoryStats.forEach(category => {
            html += `
                <div class="stat-card">
                    <div class="stat-number">${category.count}</div>
                    <div class="stat-label">${category.category}</div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Top predictors
    if (stats.predictorStats && stats.predictorStats.length > 0) {
        html += `
            <div class="chart-container">
                <h3>Top Predictors</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Predictor</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Total</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Verified</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Correct</th>
                                <th style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">Accuracy</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        stats.predictorStats.forEach(predictor => {
            const accuracy = predictor.verified_predictions > 0 ? 
                ((predictor.correct_predictions / predictor.verified_predictions) * 100).toFixed(1) + '%' : 'N/A';
            
            html += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(predictor.predictor_name)}</td>
                    <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">${predictor.total_predictions}</td>
                    <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">${predictor.verified_predictions}</td>
                    <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">${predictor.correct_predictions}</td>
                    <td style="padding: 10px; text-align: center; border: 1px solid #e5e7eb;">${accuracy}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('verification-modal');
    if (event.target == modal) {
        closeModal();
    }
}