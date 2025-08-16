# Prediction Tracker

A SaaS application for tracking predictions and verifying their accuracy over time. This tool helps make people accountable for their predictions by allowing users to record statements about the future and later verify if they came true.

## 🎯 Project Overview

- **Name**: Prediction Tracker
- **Goal**: Track what people said about the future and check reality against their predictions
- **Main Features**: 
  - Add and categorize predictions with confidence levels
  - Verify predictions with multiple outcome types (correct, incorrect, partially correct, too early, unprovable)
  - Statistics dashboard showing accuracy rates and trends
  - Filter predictions by category, status, and verification state
  - Track predictor performance over time

## 🌐 URLs

- **Production**: https://prediction-tracker.pages.dev
- **GitHub Repository**: https://github.com/goryszewskig/predictor
- **API Base**: https://prediction-tracker.pages.dev/api
- **Health Check**: https://prediction-tracker.pages.dev/api/stats
- **Development**: https://3000-izmmrfnyhsi9kh9oxit8m-6532622b.e2b.dev

## 📊 Data Architecture

### **Data Models**

#### Predictions Table
- **id**: Unique identifier
- **predictor_name**: Name of the person making the prediction
- **prediction_text**: The actual prediction statement
- **predicted_date**: When the prediction was made
- **target_date**: When the prediction should be evaluated (optional)
- **target_description**: Specific event/outcome to look for
- **category**: Category (technology, economics, politics, etc.)
- **confidence_level**: 1-10 scale of predictor's confidence
- **source_url**: Optional link to original prediction
- **notes**: Additional context

#### Verifications Table
- **id**: Unique identifier
- **prediction_id**: Links to predictions table
- **outcome**: Result (correct, incorrect, partially_correct, too_early, unprovable)
- **outcome_description**: What actually happened
- **evidence_url**: Link to proof/news
- **verified_by**: Who verified the outcome
- **verification_date**: When verification was done
- **confidence_score**: 1-10 confidence in verification
- **notes**: Additional verification details

#### Tags & Categories
- **tags**: Flexible tagging system for predictions
- **prediction_tags**: Many-to-many relationship between predictions and tags
- Built-in categories: Technology, Economics, Politics, Climate, Sports, Health, Society, Science

### **Storage Services**
- **Cloudflare D1**: SQLite-based database for all prediction and verification data
- **Local Development**: Uses local SQLite with `--local` flag for development

### **Data Flow**
1. **Add Prediction**: User submits prediction → API validates → Stored in D1 database
2. **View Predictions**: Frontend requests → API queries D1 → Returns filtered results
3. **Verify Prediction**: User submits verification → API validates → Creates verification record
4. **Statistics**: API aggregates data from both tables → Returns summary stats

## 🎮 User Guide

### **Adding Predictions**
1. Click "Add Prediction" button
2. Fill in the form:
   - **Predictor Name**: Who made the prediction
   - **Prediction**: The actual prediction statement
   - **Date Predicted**: When it was originally made
   - **Target Date**: When to evaluate (optional)
   - **What to look for**: Specific outcome to verify
   - **Category**: Choose appropriate category
   - **Confidence Level**: 1-10 scale
   - **Source URL**: Link to original prediction (optional)
   - **Notes**: Additional context (optional)
3. Click "Add Prediction" to save

### **Viewing Predictions**
1. Click "View Predictions" to see all predictions
2. Use filters to narrow down results:
   - **Category Filter**: Show only specific categories
   - **Status Filter**: Show verified, pending, or overdue predictions
3. Each prediction shows:
   - Predictor name and prediction text
   - Dates (predicted, target, verification)
   - Category and confidence level
   - Verification status and outcome (if verified)
   - Action buttons for verification and viewing details

### **Verifying Predictions**
1. Find a prediction that needs verification
2. Click the "Verify" button
3. Fill in the verification form:
   - **Outcome**: Select correct, incorrect, partially correct, too early, or unprovable
   - **What happened**: Describe what actually occurred
   - **Evidence URL**: Link to proof or news article
   - **Verified by**: Your name or identifier
   - **Confidence**: How sure you are about the verification (1-10)
   - **Notes**: Additional verification details
4. Click "Submit Verification"

### **Viewing Statistics**
1. Click "Statistics" to see dashboard
2. View key metrics:
   - Total predictions, verified predictions, pending count
   - Verification rate percentage
   - Breakdown by outcome (correct, incorrect, etc.)
   - Predictions by category
   - Top predictors with accuracy rates

## 🛠 Technical Stack

- **Backend**: Hono framework (TypeScript)
- **Frontend**: Vanilla JavaScript with Tailwind CSS
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages
- **Development**: PM2 for process management
- **Icons**: Font Awesome
- **HTTP Client**: Axios

## 🚀 Deployment

### **Platform**: Cloudflare Pages
### **Status**: ✅ Active (Production)
### **Production URL**: https://prediction-tracker.pages.dev
### **Database**: Cloudflare D1 (production database with sample data)
### **Last Updated**: 2025-08-16

### **Local Development**
```bash
# Install dependencies
npm install

# Apply database migrations
npm run db:migrate:local

# Seed with sample data
npm run db:seed

# Build the project
npm run build

# Start development server
npm run dev:sandbox
```

### **API Endpoints**
- `GET /api/predictions` - Get all predictions (with filters)
- `GET /api/predictions/:id` - Get specific prediction
- `POST /api/predictions` - Add new prediction
- `POST /api/predictions/:id/verify` - Add verification for prediction
- `GET /api/stats` - Get statistics summary

### **Database Commands**
```bash
# Reset local database
npm run db:reset

# Run migrations on production
npm run db:migrate:prod

# Access database console
npm run db:console:local  # Local
npm run db:console:prod   # Production
```

## 📈 Current Features

### ✅ **Completed Features**
- ✅ **Add Predictions**: Complete form with all necessary fields
- ✅ **View Predictions**: List with filtering by category and status
- ✅ **Verify Predictions**: Full verification system with multiple outcome types
- ✅ **Statistics Dashboard**: Comprehensive stats with accuracy tracking
- ✅ **Database Schema**: Complete D1 database with migrations
- ✅ **API Endpoints**: Full REST API for all operations
- ✅ **Responsive Design**: Mobile-friendly interface
- ✅ **Sample Data**: Pre-loaded with famous predictions for testing

### 🔄 **Current Functional Entry Points**
1. **Main Interface**: `/` - Landing page with navigation
2. **Add Prediction**: Form to submit new predictions
3. **View Predictions**: `/api/predictions` - List all with filters
4. **Statistics**: `/api/stats` - Summary dashboard
5. **Verification System**: Modal-based verification for each prediction

### 📋 **Features Not Yet Implemented**
- 🔲 **User Authentication**: Currently anonymous, could add user accounts
- 🔲 **Email Notifications**: Alerts when target dates approach
- 🔲 **Advanced Charts**: More detailed visualization of data
- 🔲 **Export Functionality**: CSV/JSON export of predictions
- 🔲 **API Rate Limiting**: Currently no rate limits on API
- 🔲 **Advanced Search**: Full-text search across predictions
- 🔲 **Prediction Templates**: Pre-made templates for common prediction types
- 🔲 **Social Features**: Comments, discussions, sharing predictions

## 🎯 Recommended Next Steps

1. **Deploy to Production Cloudflare Pages**: Set up production deployment with proper domain
2. **User Authentication**: Add user accounts and prediction ownership
3. **Enhanced Statistics**: More detailed charts and trend analysis
4. **Notification System**: Email alerts for target dates and new verifications
5. **Search Functionality**: Full-text search across all predictions
6. **Mobile App**: React Native or Progressive Web App version
7. **API Documentation**: Swagger/OpenAPI documentation
8. **Admin Panel**: Moderation tools for managing predictions and verifications

## 🧪 Sample Data

The application comes pre-loaded with famous predictions for testing:

- **Elon Musk**: Tesla production prediction (2030 target)
- **Ray Kurzweil**: AI Turing test prediction (2029 target)
- **Warren Buffett**: Dow Jones 100k prediction (overdue)
- **Bill Gates**: Synthetic meat adoption (2035 target)
- **Nate Silver**: Trump 2024 nomination (verified as incorrect)

## 📝 Usage Examples

### **Adding a Prediction**
```javascript
// POST /api/predictions
{
  "predictor_name": "John Doe",
  "prediction_text": "Bitcoin will reach $100,000 by end of 2024",
  "predicted_date": "2024-01-15",
  "target_date": "2024-12-31",
  "target_description": "Bitcoin price reaches $100,000 USD",
  "category": "economics",
  "confidence_level": 7,
  "source_url": "https://example.com/prediction",
  "notes": "Based on technical analysis"
}
```

### **Verifying a Prediction**
```javascript
// POST /api/predictions/1/verify
{
  "outcome": "correct",
  "outcome_description": "Bitcoin reached $102,000 on December 15, 2024",
  "evidence_url": "https://coinmarketcap.com/bitcoin-reaches-100k",
  "verified_by": "Jane Smith",
  "confidence_score": 10,
  "notes": "Clear evidence from multiple exchanges"
}
```

This prediction tracking system provides a comprehensive way to hold people accountable for their predictions and analyze prediction accuracy over time.