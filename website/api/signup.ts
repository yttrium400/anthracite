import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials');
        return response.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { name, email, role } = request.body;

    if (!email || !email.includes('@')) {
        return response.status(400).json({ error: 'Invalid email address' });
    }

    try {
        // Check for existing email to avoid duplicates if not handled by DB constraint
        const { data: existing } = await supabase
            .from('waitlist')
            .select('email')
            .eq('email', email)
            .single();

        if (existing) {
            return response.status(200).json({ message: 'Already subscribed' });
        }

        const { error } = await supabase
            .from('waitlist')
            .insert([
                {
                    name,
                    email,
                    role,
                    created_at: new Date().toISOString()
                }
            ]);

        if (error) {
            throw error;
        }

        return response.status(201).json({ message: 'Success' });
    } catch (error) {
        console.error('Supabase error:', error);
        return response.status(500).json({ error: 'Failed to save signup' });
    }
}
