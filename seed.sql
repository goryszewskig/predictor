-- Sample predictions for testing the application
INSERT OR IGNORE INTO predictions (id, predictor_name, prediction_text, predicted_date, target_date, target_description, category, confidence_level, source_url, notes) VALUES 
  (1, 'Elon Musk', 'Tesla will be producing 20 million vehicles per year by 2030', '2020-09-22', '2030-12-31', 'Tesla annual vehicle production reaches 20 million units', 'Technology', 8, 'https://twitter.com/elonmusk/status/1308420369042845696', 'Bold prediction made during Battery Day event'),
  
  (2, 'Ray Kurzweil', 'AI will pass the Turing test by 2029', '2005-01-01', '2029-12-31', 'An AI system convincingly passes the Turing test in a formal setting', 'Technology', 9, 'https://example.com/kurzweil-prediction', 'Part of his predictions in "The Singularity is Near"'),
  
  (3, 'Warren Buffett', 'The Dow Jones will hit 100,000 in my lifetime', '2017-05-06', '2024-12-31', 'Dow Jones Industrial Average reaches 100,000 points', 'Economics', 7, 'https://example.com/buffett-prediction', 'Made during Berkshire Hathaway annual meeting'),
  
  (4, 'Bill Gates', 'Most countries will have switched to synthetic meat by 2035', '2021-02-14', '2035-12-31', 'Majority of developed countries primary meat consumption is synthetic/lab-grown', 'Technology', 6, 'https://example.com/gates-meat-prediction', 'Discussed in his book and interviews about climate change'),
  
  (5, 'Nate Silver', 'Donald Trump will not be the 2024 Republican nominee', '2022-11-15', '2024-07-15', 'Someone other than Trump gets the Republican nomination for 2024 presidential election', 'Politics', 5, 'https://example.com/silver-trump-prediction', 'Analysis based on polling trends and historical data');

-- Add some sample verifications for older predictions
INSERT OR IGNORE INTO verifications (prediction_id, outcome, outcome_description, evidence_url, verified_by, verification_date, confidence_score, notes) VALUES 
  (5, 'incorrect', 'Donald Trump secured the Republican nomination for 2024', 'https://example.com/trump-nomination-news', 'Prediction Tracker System', '2024-07-16 10:00:00', 10, 'Trump officially became the Republican nominee at the 2024 RNC');

-- Link predictions to relevant tags
INSERT OR IGNORE INTO prediction_tags (prediction_id, tag_id) VALUES 
  (1, 1), -- Tesla/Technology
  (2, 1), -- AI/Technology  
  (3, 2), -- Dow/Economics
  (4, 1), -- Synthetic meat/Technology
  (4, 6), -- Synthetic meat/Health
  (5, 3); -- Trump/Politics