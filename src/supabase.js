import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://ztikjwmhdjbbcthodjak.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0aWtqd21oZGpiYmN0aG9kamFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzAwMDEyNCwiZXhwIjoyMDk4NTc2MTI0fQ.RiDRPCL_tAk_ZLlS0k8-Rodasq9dmDH9Fyv_Wp2LUzM';

// Configuração inteligente para não quebrar na Web
const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
};

// Só usa o AsyncStorage se estiver rodando no Android ou iOS
if (Platform.OS !== 'web') {
  supabaseOptions.auth.storage = AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);