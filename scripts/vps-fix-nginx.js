const { Client } = require('ssh2');
const conn = new Client();

const conf = `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name my.nkbmanufacturing.com 187.77.143.211 _;

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
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name my.nkbmanufacturing.com 187.77.143.211;

    client_max_body_size 100M;

    ssl_certificate /etc/letsencrypt/live/my.nkbmanufacturing.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/my.nkbmanufacturing.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

conn.on('ready', () => {
    conn.exec(`cat << 'EOF' > /etc/nginx/conf.d/nkb.conf\n${conf}\nEOF\nnginx -t && systemctl reload nginx`, (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('close', (code) => {
            console.log('Nginx config updated & reloaded. Code:', code);
            console.log(out);
            conn.end();
        }).on('data', d => out += d).stderr.on('data', d => out += d);
    });
}).connect({
    host: '187.77.143.211',
    port: 22,
    username: 'root',
    password: 'NkbManufacturing@2025'
});
