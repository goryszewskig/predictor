-- Predictions table - stores all predictions made by users
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  predictor_name TEXT NOT NULL,
  prediction_text TEXT NOT NULL,
  predicted_date DATE NOT NULL, -- When the prediction was made
  target_date DATE, -- When the prediction should be evaluated (can be null for open-ended)
  target_description TEXT, -- What specific event/outcome to look for
  category TEXT DEFAULT 'general', -- Category like 'tech', 'politics', 'sports', etc.
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10), -- 1-10 scale
  source_url TEXT, -- Optional link to where the prediction was made
  notes TEXT, -- Additional context or details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verifications table - stores outcomes and verification of predictions
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'partially_correct', 'too_early', 'unprovable')),
  outcome_description TEXT NOT NULL, -- What actually happened
  evidence_url TEXT, -- Link to news, data, or proof
  verified_by TEXT, -- Who verified this outcome
  verification_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  confidence_score INTEGER CHECK (confidence_score >= 1 AND confidence_score <= 10), -- How confident in the verification
  notes TEXT, -- Additional verification notes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
);

-- Tags table - for categorizing and organizing predictions
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between predictions and tags
CREATE TABLE IF NOT EXISTS prediction_tags (
  prediction_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prediction_id, tag_id),
  FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_predictions_predictor ON predictions(predictor_name);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(predicted_date);
CREATE INDEX IF NOT EXISTS idx_predictions_target_date ON predictions(target_date);
CREATE INDEX IF NOT EXISTS idx_predictions_category ON predictions(category);
CREATE INDEX IF NOT EXISTS idx_verifications_prediction_id ON verifications(prediction_id);
CREATE INDEX IF NOT EXISTS idx_verifications_outcome ON verifications(outcome);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Insert some default tags
INSERT OR IGNORE INTO tags (name, description) VALUES 
  ('Technology', 'Predictions about tech innovations, AI, software, hardware'),
  ('Economics', 'Financial markets, economic trends, business predictions'),
  ('Politics', 'Political events, elections, policy changes'),
  ('Climate', 'Weather, climate change, environmental predictions'),
  ('Sports', 'Sports outcomes, records, tournament predictions'),
  ('Health', 'Medical breakthroughs, health trends, pandemic predictions'),
  ('Society', 'Social trends, cultural changes, demographic shifts'),
  ('Science', 'Scientific discoveries, space exploration, research findings');