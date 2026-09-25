import { createHandler } from './handler.js';

const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const handler = createHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY'),
  secretKey: secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
});

Deno.serve(handler);
