const http = require('http');
const url = require('url');
const open = require('child_process').exec;
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log('\n❌ Please provide GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:8085/oauth2callback';
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const scopes = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent',
});

console.log('\n======================================================');
console.log('🔗 Open this URL in your browser to Authorize Google Drive:');
console.log('======================================================\n');
console.log(authUrl);
console.log('\nWaiting for authorization on localhost:8085...\n');

// Try to open automatically in default browser
if (process.platform === 'win32') {
  open(`start "" "${authUrl}"`);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code;
    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('✅ Received Tokens Successfully!');
        console.log('Refresh Token:', tokens.refresh_token ? 'Present' : 'Already generated');

        if (tokens.refresh_token) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          if (envContent.includes('GOOGLE_DRIVE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/GOOGLE_DRIVE_REFRESH_TOKEN=.*(\r?\n|$)/, `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
          } else {
            envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf-8');
          console.log('💾 Successfully saved GOOGLE_DRIVE_REFRESH_TOKEN to server/.env!');
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family:sans-serif; text-align:center; padding:50px;">
            <h1 style="color:#10b981;">🎉 Google Drive Authorization Successful!</h1>
            <p>You can close this tab and return to the terminal / app.</p>
          </div>
        `);

        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 2000);
      } catch (err) {
        console.error('Error retrieving tokens:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error retrieving tokens: ' + err.message);
      }
    }
  }
});

server.listen(8085, () => {});
