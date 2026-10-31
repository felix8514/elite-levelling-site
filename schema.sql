CREATE TABLE IF NOT EXISTS public.site_data (
  id BIGINT PRIMARY KEY DEFAULT 1,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
INSERT INTO public.site_data (id, content) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.site_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Access" ON public.site_data FOR SELECT TO anon, authenticated USING (true);
