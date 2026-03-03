-- Create the subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Note: Since the backend uses the Service Role Key, 
-- it will bypass RLS. No specific policies are required for server-side insertion.
-- However, if you ever want to allow public insertion (not recommended with service key),
-- you would add a policy here.
