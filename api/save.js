/**
 * /api/save.js
 * Vercel Serverless Function (Node.js, Zero External Dependencies)
 * 
 * Verifies the admin password server-side, then upserts site content into Supabase
 * using the secure service-role key. Never exposes the service-role key to the client.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async function handler(req, res) {
  // CORS Configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Password'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only POST is accepted.',
    });
    return;
  }

  try {
    // 1. Password Verification
    const expectedPassword = process.env.ADMIN_PASSWORD;
    const providedPassword =
      req.headers['x-admin-password'] ||
      (req.body && req.body.adminPassword) ||
      '';

    if (!expectedPassword) {
      console.error('[API/SAVE] Missing ADMIN_PASSWORD in environment variables.');
      res.status(500).json({
        success: false,
        error: 'Server configuration error: ADMIN_PASSWORD is not set in environment.',
      });
      return;
    }

    if (!providedPassword || providedPassword !== expectedPassword) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid admin credentials.',
      });
      return;
    }

    // 2. Validate Supabase Environment Variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[API/SAVE] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
      res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase credentials are not set in environment.',
      });
      return;
    }

    // 3. Extract Payload
    const payload = req.body && req.body.data ? req.body.data : req.body;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Bad Request: Invalid or missing data payload.',
      });
      return;
    }

    // Remove client-supplied password before writing to DB
    delete payload.adminPassword;

    // 4. Upsert into Supabase table 'site_data' (record id: 1)
    const targetUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/site_data?on_conflict=id`);
    const requestData = JSON.stringify({
      id: 1,
      content: payload,
      updated_at: new Date().toISOString(),
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
    };

    const client = targetUrl.protocol === 'https:' ? https : http;

    const dbResponse = await new Promise((resolve, reject) => {
      const dbReq = client.request(targetUrl, options, (dbRes) => {
        let body = '';
        dbRes.on('data', (chunk) => {
          body += chunk;
        });
        dbRes.on('end', () => {
          resolve({ statusCode: dbRes.statusCode, body });
        });
      });

      dbReq.on('error', (err) => {
        reject(err);
      });

      dbReq.write(requestData);
      dbReq.end();
    });

    if (dbResponse.statusCode >= 200 && dbResponse.statusCode < 300) {
      res.status(200).json({
        success: true,
        message: 'Site data successfully synced and saved to Supabase.',
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('[API/SAVE] Supabase API Error:', dbResponse.statusCode, dbResponse.body);
      res.status(500).json({
        success: false,
        error: `Supabase write failed with status ${dbResponse.statusCode}`,
        details: dbResponse.body,
      });
    }
  } catch (error) {
    console.error('[API/SAVE] Internal Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error while saving site data.',
      message: error.message,
    });
  }
};
