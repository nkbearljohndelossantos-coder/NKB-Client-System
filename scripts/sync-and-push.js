/**
 * NKB Manufacturing & Trading
 * Automated Live Deployment & GitHub Push Utility
 * 
 * Usage:
 *   node scripts/sync-and-push.js "Your commit message"
 */

const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const VPS_HOST = '187.77.143.211';
const VPS_USER = 'root';
const VPS_PASS = 'NkbManufacturing@2025';
const LOCAL_DIR = path.resolve(__dirname, '..');
const REMOTE_DIR = '/var/www/NKB-Client-System';

const commitMessage = process.argv.slice(2).join(' ') || `chore: automated sync and deployment ${new Date().toISOString().split('T')[0]}`;

// Directories and files to sync (excluding node_modules, .git, SQLite files, logs)
const IGNORED = [
    'node_modules', '.git', 'nkb.sqlite', 'nkb_test.sqlite', 
    'test_tx.sqlite', 'test_native_tx.sqlite', 'test_rollback.sqlite',
    'test_rollback2.sqlite', '.env', '.system_generated', 'backups'
];

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        if (IGNORED.includes(file) || file.endsWith('.sqlite') || file.endsWith('.log')) return;
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            const relPath = path.relative(LOCAL_DIR, fullPath).replace(/\\/g, '/');
            arrayOfFiles.push(relPath);
        }
    });
    return arrayOfFiles;
}

const files = getAllFiles(LOCAL_DIR);

console.log(`🚀 Starting Automated Deployment & GitHub Sync...`);
console.log(`📝 Commit Message: "${commitMessage}"`);
console.log(`📦 Found ${files.length} project files to sync.`);

let attempts = 0;
const MAX_ATTEMPTS = 3;

function connectSSH() {
    attempts++;
    console.log(`🔌 Connecting to VPS (attempt ${attempts}/${MAX_ATTEMPTS})...`);
    const conn = new Client();

    conn.on('ready', () => {
        console.log('✅ Connected to VPS via SSH');
        conn.sftp(async (err, sftp) => {
            if (err) {
                console.error('❌ SFTP initialization failed:', err);
                conn.end();
                return;
            }

            let errors = 0;
            console.log(`📤 Uploading ${files.length} project files...`);

            // Upload in controlled batches of 5 to preserve socket stability
            const BATCH_SIZE = 5;
            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const chunk = files.slice(i, i + BATCH_SIZE);
                await Promise.all(chunk.map(file => {
                    return new Promise((resolve) => {
                        const localFile = path.join(LOCAL_DIR, file);
                        const remoteFile = `${REMOTE_DIR}/${file}`;
                        sftp.fastPut(localFile, remoteFile, (err) => {
                            if (err) {
                                errors++;
                                console.error(`⚠️ Upload error for ${file}:`, err.message);
                            }
                            resolve();
                        });
                    });
                }));
            }

            console.log(`📤 Upload finished (${errors} errors).`);
            console.log('🔄 Committing and Pushing to GitHub from VPS...');

            const safeMsg = commitMessage.replace(/"/g, '\\"');
            const gitCommands = [
                'git config --global user.name "Earl John Delos Santos"',
                'git config --global user.email "nkb.earljohndelossantos@gmail.com"',
                `cd ${REMOTE_DIR}`,
                'git add -A',
                `git commit -m "${safeMsg}" || echo "No new git changes to commit"`,
                'git push origin main',
                'pm2 restart nkb-client-app'
            ].join(' && ');

            conn.exec(gitCommands, (err, stream) => {
                if (err) {
                    console.error('❌ Git execution failed:', err);
                    conn.end();
                    return;
                }
                stream.on('close', (code) => {
                    console.log(`\n🎉 Process completed with exit code: ${code}`);
                    console.log('🌐 Live URL: http://my.nkbmanufacturing.com');
                    console.log('🐙 GitHub Repo: https://github.com/nkbearljohndelossantos-coder/NKB-Client-System');
                    conn.end();
                }).on('data', (data) => process.stdout.write(data))
                  .stderr.on('data', (data) => process.stderr.write(data));
            });
        });
    }).on('error', (err) => {
        console.error(`❌ SSH connection error (attempt ${attempts}):`, err.message);
        conn.end();
        if (attempts < MAX_ATTEMPTS) {
            console.log('⏳ Retrying in 4 seconds...');
            setTimeout(connectSSH, 4000);
        }
    }).connect({
        host: VPS_HOST,
        port: 22,
        username: VPS_USER,
        password: VPS_PASS,
        readyTimeout: 60000,
        keepaliveInterval: 10000
    });
}

connectSSH();
