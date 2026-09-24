/**
 * NKB Manufacturing Corporation
 * Attachment & Document Storage Service
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');

// Ensure base upload directory exists
if (!fs.existsSync(UPLOADS_ROOT)) {
    try {
        fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
    } catch (_) {}
}

/**
 * Save an uploaded attachment (Base64 data URI or raw buffer)
 * Returns the web-accessible URL (e.g. /uploads/checks/check_123.jpg)
 * If already an HTTP/HTTPS URL or /uploads/ path, returns as-is.
 */
function saveAttachment(inputData, subfolder = 'attachments') {
    if (!inputData || typeof inputData !== 'string') return null;
    const trimmed = inputData.trim();
    if (!trimmed) return null;

    // Already a stored path or external URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/')) {
        return trimmed;
    }

    // Check if it's a data URI
    const dataUriRegex = /^data:([a-zA-Z0-9\/\+.-]+);base64,(.+)$/;
    const match = trimmed.match(dataUriRegex);

    if (!match) {
        // Not a data URI, return trimmed string (could be a local relative path)
        return trimmed;
    }

    const mimeType = match[1].toLowerCase();
    const base64Content = match[2];

    let ext = 'bin';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('pdf')) ext = 'pdf';
    else if (mimeType.includes('svg')) ext = 'svg';

    const targetDir = path.join(UPLOADS_ROOT, subfolder);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const uniqueName = `${subfolder}_${Date.now()}_${uuidv4().substring(0, 8)}.${ext}`;
    const targetFilePath = path.join(targetDir, uniqueName);

    try {
        const buffer = Buffer.from(base64Content, 'base64');
        fs.writeFileSync(targetFilePath, buffer);
        return `/uploads/${subfolder}/${uniqueName}`;
    } catch (err) {
        console.error('Failed to write attachment to disk:', err.message);
        // Fallback: return data URI if disk write fails
        return trimmed;
    }
}

module.exports = {
    saveAttachment,
    UPLOADS_ROOT
};
