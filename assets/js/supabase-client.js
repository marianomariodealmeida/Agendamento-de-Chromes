/* ============================================================
   CONFIGURE AQUI: URL e ANON KEY do seu projeto Supabase
   ============================================================ */
const SUPABASE_URL = "https://bwfumyculbfrmcahsbaz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnVteWN1bGJmcm1jYWhzYmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDI5MDAsImV4cCI6MjEwMzE3ODkwMH0.Tl4bloBoLMiKgchmEqhtGP8dEFZPYB-jSX7q0m2HzGk";

/* O SDK UMD expõe o global `supabase` */
const { createClient } = window.supabase;
window.db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
