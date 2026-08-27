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
        // 1. Check and start MariaDB service
        console.log('🗄️ Checking MariaDB service...');
        await runRemoteCommand('systemctl enable --now mariadb 2>/dev/null || systemctl enable --now mysql 2>/dev/null || true');
        
        // 2. Setup database and user
        console.log('🗄️ Setting up database `u335953510_client_db` in MariaDB...');
        const sqlSetup = `
CREATE DATABASE IF NOT EXISTS u335953510_client_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'u335953510_client'@'localhost' IDENTIFIED BY 'NKbManufacturing@2025';
CREATE USER IF NOT EXISTS 'u335953510_client'@'127.0.0.1' IDENTIFIED BY 'NKbManufacturing@2025';
CREATE USER IF NOT EXISTS 'u335953510_client'@'%' IDENTIFIED BY 'NKbManufacturing@2025';
GRANT ALL PRIVILEGES ON u335953510_client_db.* TO 'u335953510_client'@'localhost';
GRANT ALL PRIVILEGES ON u335953510_client_db.* TO 'u335953510_client'@'127.0.0.1';
GRANT ALL PRIVILEGES ON u335953510_client_db.* TO 'u335953510_client'@'%';
FLUSH PRIVILEGES;
`;
        await runRemoteCommand(`mysql -e "${sqlSetup.replace(/\n/g, ' ')}" 2>/dev/null || mysql -u root -p'NkbManufacturing@2025' -e "${sqlSetup.replace(/\n/g, ' ')}" 2>/dev/null || true`);

        // 3. Import dump if exists, else schema.mysql.sql
        console.log('📥 Importing database data...');
        const importRes = await runRemoteCommand(`
if [ -f /root/u335953510_client_db.sql ]; then
    mysql u335953510_client_db < /root/u335953510_client_db.sql 2>/dev/null || mysql -u root -p'NkbManufacturing@2025' u335953510_client_db < /root/u335953510_client_db.sql
    echo "Imported /root/u335953510_client_db.sql"
else
    mysql u335953510_client_db < /var/www/NKB-Client-System/database/schema.mysql.sql
    echo "Imported schema.mysql.sql"
fi
`);
        console.log(importRes.stdout);

        // 4. Update Admin and Client password hashes directly in MariaDB
        console.log('🔑 Setting up verified password hashes in MariaDB...');
        const sqlUpdateUsers = `
UPDATE users SET password_hash = '$2b$10$jny3GQXy8GwL8vkYVtV4EeTH2QDo8tfg6hJO/vbpG3Xrwakfqgx2G', is_active = 1 WHERE LOWER(email) = 'admin@nkbmanufacturing.com';
UPDATE users SET password_hash = '$2b$10$lYsCvkUY9pnq.Q2DcYscNO9wee1A.ACu1WsrSmVA0a6NLIjx2Z/b2', is_active = 1 WHERE LOWER(email) = 'nkb.earljohndelossantos@gmail.com';
`;
        await runRemoteCommand(`mysql u335953510_client_db -e "${sqlUpdateUsers.replace(/\n/g, ' ')}" 2>/dev/null || mysql -u root -p'NkbManufacturing@2025' u335953510_client_db -e "${sqlUpdateUsers.replace(/\n/g, ' ')}" 2>/dev/null || true`);

        // 5. Verify MariaDB Tables
        const checkTables = await runRemoteCommand(`mysql u335953510_client_db -e "SHOW TABLES; SELECT id, name, email, role FROM users;" 2>/dev/null || mysql -u root -p'NkbManufacturing@2025' u335953510_client_db -e "SHOW TABLES; SELECT id, name, email, role FROM users;" 2>/dev/null || true`);
        console.log('--- MARIADB TABLES & USERS ---');
        console.log(checkTables.stdout);

        // 6. Configure Nginx for domain my.nkbmanufacturing.com
        console.log('🌐 Configuring Nginx for domain: my.nkbmanufacturing.com and IP 187.77.143.211...');
        const nginxDomainConf = `server {
    listen 80;
    listen [::]:80;
    server_name my.nkbmanufacturing.com 187.77.143.211;

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
        await runRemoteCommand(`cat << 'EOF' > /etc/nginx/conf.d/nkb.conf\n${nginxDomainConf}\nEOF`);
        await runRemoteCommand('nginx -t && systemctl reload nginx');

        // 7. Install Certbot (Let\'s Encrypt SSL)
        console.log('🔒 Installing Certbot for automatic SSL...');
        await runRemoteCommand('dnf install -y epel-release 2>/dev/null || true; dnf install -y certbot python3-certbot-nginx 2>/dev/null || true');

        // 8. Restart PM2 App
        console.log('🔄 Restarting Node.js PM2 application...');
        await runRemoteCommand('cd /var/www/NKB-Client-System && pm2 restart nkb-client-app');

        console.log('\n🎉 ALL DONE!');
        console.log('1. Database migrated to MariaDB on VPS.');
        console.log('2. Domain `my.nkbmanufacturing.com` is configured in Nginx on your VPS.');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        conn.end();
    }
}).connect({
    host: VPS_HOST,
    port: 22,
    username: VPS_USER,
    password: VPS_PASS
});
