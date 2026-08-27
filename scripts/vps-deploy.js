const { Client } = require('ssh2');
const conn = new Client();

const VPS_HOST = '187.77.143.211';
const VPS_USER = 'root';
const VPS_PASS = 'NkbManufacturing@2025';

function runRemoteCommand(command) {
    return new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            stream.on('close', (code, signal) => {
                resolve({ code, stdout, stderr });
            }).on('data', (data) => {
                stdout += data;
            }).stderr.on('data', (data) => {
                stderr += data;
            });
        });
    });
}

conn.on('ready', async () => {
    console.log('✅ Connected to VPS via SSH');
    try {
        // 1. Configure firewall and SELinux
        console.log('🛡️ Configuring firewall and SELinux...');
        await runRemoteCommand('firewall-cmd --permanent --add-service=http 2>/dev/null || true; firewall-cmd --permanent --add-service=https 2>/dev/null || true; firewall-cmd --reload 2>/dev/null || true; setsebool -P httpd_can_network_connect 1 2>/dev/null || true');

        // 2. Configure Nginx
        console.log('🌐 Configuring Nginx reverse proxy on port 80 -> 3000...');
        const nginxConf = `server {
    listen 80;
    listen [::]:80;
    server_name _;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;
        await runRemoteCommand(`cat << 'EOF' > /etc/nginx/conf.d/nkb.conf\n${nginxConf}\nEOF`);
        const nginxTest = await runRemoteCommand('nginx -t && systemctl reload nginx');
        console.log('Nginx reload:', nginxTest.stdout || nginxTest.stderr);

        // 3. Setup /var/www/NKB-Client-System
        console.log('📦 Updating repository and dependencies in /var/www/NKB-Client-System...');
        const gitPull = await runRemoteCommand('cd /var/www/NKB-Client-System && git pull origin main && npm install --production');
        console.log('Git & NPM result:', gitPull.stdout);

        // 4. Create .env file for production
        console.log('⚙️ Writing production .env...');
        const envContent = `NODE_ENV=production
PORT=3000
JWT_SECRET=NKB_MANUFACTURING_ENTERPRISE_SUPER_SECURE_JWT_SECRET_KEY_2025
INITIAL_ADMIN_EMAIL=admin@nkbmanufacturing.com
INITIAL_ADMIN_PASSWORD=Admin123!
DATABASE_PATH=database/nkb.sqlite
DB_DRIVER=sqlite
`;
        await runRemoteCommand(`cat << 'EOF' > /var/www/NKB-Client-System/.env\n${envContent}\nEOF`);

        // 5. Start/Restart with PM2
        console.log('🚀 Starting application with PM2...');
        const pm2Result = await runRemoteCommand('cd /var/www/NKB-Client-System && pm2 delete nkb-client-app 2>/dev/null || true; pm2 start server.js --name "nkb-client-app" && pm2 save && pm2 startup systemd -u root --hp /root 2>/dev/null || true');
        console.log('PM2 result:', pm2Result.stdout);

        // 6. Test local curl
        console.log('🔍 Testing localhost:3000 response...');
        const curlTest = await runRemoteCommand('curl -I http://127.0.0.1:3000');
        console.log('Localhost curl:', curlTest.stdout);

        // 7. Test public port 80 response
        const port80Test = await runRemoteCommand('curl -I http://127.0.0.1');
        console.log('Port 80 curl:', port80Test.stdout);

        console.log('\n🎉 NKB CLIENT SYSTEM IS SUCCESSFULLY DEPLOYED & RUNNING ON VPS: http://187.77.143.211 !');
    } catch (err) {
        console.error('Deployment error:', err);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('SSH Connection Failed:', err.message);
}).connect({
    host: VPS_HOST,
    port: 22,
    username: VPS_USER,
    password: VPS_PASS
});
