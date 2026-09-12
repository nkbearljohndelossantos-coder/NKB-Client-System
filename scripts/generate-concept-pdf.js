const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlPath = path.resolve(__dirname, '../public/concept-map.html');
const outputPdfPath = path.resolve(__dirname, '../public/concept-map.pdf');
const userDownloadsPath = 'C:\\Users\\Glen Nobleza\\Downloads\\NKB_Manufacturing_Concept_Map.pdf';

console.log('Generating high-resolution Concept Map PDF...');
console.log('Input HTML:', htmlPath);
console.log('Output PDF (Public):', outputPdfPath);
console.log('Output PDF (Downloads):', userDownloadsPath);

if (!fs.existsSync(edgePath)) {
    console.error('Edge executable not found at:', edgePath);
    process.exit(1);
}

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

const args = [
    '--headless',
    '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    '--print-to-pdf-no-header',
    '--print-to-pdf=' + outputPdfPath,
    fileUrl
];

execFile(edgePath, args, (err) => {
    if (err) {
        console.error('PDF generation error:', err);
        process.exit(1);
    }
    
    if (fs.existsSync(outputPdfPath)) {
        const stats = fs.statSync(outputPdfPath);
        console.log(`✅ Successfully generated public PDF: ${outputPdfPath} (${stats.size} bytes)`);

        try {
            fs.copyFileSync(outputPdfPath, userDownloadsPath);
            console.log(`✅ Successfully saved copy to Downloads: ${userDownloadsPath}`);
        } catch (copyErr) {
            console.warn('Could not copy to Downloads:', copyErr.message);
        }
    } else {
        console.error('PDF file was not created.');
        process.exit(1);
    }
});
