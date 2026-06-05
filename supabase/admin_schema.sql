-- Admin profiles table
CREATE TABLE public.admin_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('admin', 'moderator', 'viewer', 'pending')),
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can read admin_profiles
CREATE POLICY "Admins can view all admin profiles"
  ON public.admin_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles ap
      WHERE ap.id = auth.uid() AND ap.role = 'admin'
    )
  );

-- RLS: Only admins can modify admin_profiles
CREATE POLICY "Admins can manage admin profiles"
  ON public.admin_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles ap
      WHERE ap.id = auth.uid() AND ap.role = 'admin'
    )
  );

-- App settings table (for env creds & config)
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Trigger: first user becomes admin automatically
CREATE OR REPLACE FUNCTION public.handle_first_admin_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.admin_profiles) INTO admin_exists;
  
  INSERT INTO public.admin_profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN admin_exists THEN 'pending' ELSE 'admin' END
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_first_admin_bootstrap();
