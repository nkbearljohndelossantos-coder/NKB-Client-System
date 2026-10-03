/**
 * NKB Manufacturing System - Interactive Snipping & Cropping Tool
 * Supports:
 *  - Regional marquee drag crop
 *  - 1-Click Full Document Capture
 *  - Copy to Clipboard
 *  - Direct Browser Download
 *  - Automatic Server Save to /uploads/SO/ or /uploads/PO/
 *  - Standard Naming: SOPO{num}.png / PO{num}.png (e.g. SOPO1.png / PO1.png)
 */

(function (window) {
    'use strict';

    let currentConfig = {
        getTargetElement: () => document.getElementById('po-printable-sheet'),
        getDocType: () => 'SO',
        getPoNumber: () => '1'
    };

    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let currentRect = null;
    let overlayEl = null;
    let selectionBoxEl = null;
    let actionsBarEl = null;
    let dimensionBadgeEl = null;
    let toastEl = null;

    function formatPoNumberToFilename(docType, rawPoNumber) {
        const isSO = (docType && (
            String(docType).toUpperCase().includes('SO') || 
            String(docType).toUpperCase().includes('SALES') ||
            String(docType).toUpperCase().includes('JOB')
        ));
        const prefix = isSO ? 'SOPO' : 'PO';

        let clean = (rawPoNumber || '').trim();
        let numStr = '';

        const matchYearSeq = clean.match(/^PO-\d{4}-(\d+)$/i);
        if (matchYearSeq) {
            numStr = String(parseInt(matchYearSeq[1], 10));
        } else {
            const matchSeq = clean.match(/^(?:PO|SO)-?(\d+)$/i);
            if (matchSeq) {
                numStr = String(parseInt(matchSeq[1], 10));
            } else {
                const digitMatch = clean.match(/(\d+)/);
                if (digitMatch) {
                    numStr = String(parseInt(digitMatch[1], 10));
                } else {
                    numStr = clean.replace(/^(SO|PO)[-_]?/i, '') || '1';
                }
            }
        }

        if (!numStr) numStr = '1';
        return {
            filename: `${prefix}${numStr}.png`,
            folder: isSO ? 'SO' : 'PO',
            prefix,
            seqNumber: numStr
        };
    }

    function createOverlayUI() {
        if (overlayEl) return;

        // Overlay Container
        overlayEl = document.createElement('div');
        overlayEl.id = 'nkb-snip-overlay';
        overlayEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.45);z-index:999999;cursor:crosshair;display:none;user-select:none;-webkit-user-select:none;';

        // Top Control Header
        const headerEl = document.createElement('div');
        headerEl.id = 'nkb-snip-header';
        headerEl.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#0f172a;color:#ffffff;padding:10px 20px;border-radius:9999px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.1);display:flex;align-items:center;gap:16px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:500;z-index:1000000;pointer-events:auto;';

        headerEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:16px;">✂️</span>
                <span><strong>Snipping Mode:</strong> Drag any region to crop, or capture full document.</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <button type="button" id="nkb-snip-btn-full" style="background:#4f46e5;color:#ffffff;border:none;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.15s;">
                    📄 Capture Full Document
                </button>
                <button type="button" id="nkb-snip-btn-cancel" style="background:rgba(255,255,255,0.15);color:#ffffff;border:none;padding:6px 12px;border-radius:9999px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;">
                    ✕ Cancel (Esc)
                </button>
            </div>
        `;

        // Selection Box (Marquee)
        selectionBoxEl = document.createElement('div');
        selectionBoxEl.id = 'nkb-snip-box';
        selectionBoxEl.style.cssText = 'position:fixed;display:none;border:2px dashed #38bdf8;background:rgba(56,189,248,0.12);box-shadow:0 0 0 99999px rgba(15,23,42,0.45);z-index:999999;pointer-events:none;';

        // Dimension Badge
        dimensionBadgeEl = document.createElement('div');
        dimensionBadgeEl.style.cssText = 'position:absolute;bottom:-24px;right:0;background:#0f172a;color:#38bdf8;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap;';
        selectionBoxEl.appendChild(dimensionBadgeEl);

        // Floating Action Bar (appears after selection)
        actionsBarEl = document.createElement('div');
        actionsBarEl.id = 'nkb-snip-actions';
        actionsBarEl.style.cssText = 'position:fixed;display:none;background:#1e293b;color:#ffffff;padding:6px 10px;border-radius:10px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.1);align-items:center;gap:8px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;z-index:1000001;pointer-events:auto;';

        actionsBarEl.innerHTML = `
            <button type="button" id="nkb-snip-act-save" style="background:#059669;color:#ffffff;border:none;padding:6px 12px;border-radius:6px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
                💾 Save Image
            </button>
            <button type="button" id="nkb-snip-act-copy" style="background:#3b82f6;color:#ffffff;border:none;padding:6px 12px;border-radius:6px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
                📋 Copy
            </button>
            <button type="button" id="nkb-snip-act-retry" style="background:rgba(255,255,255,0.12);color:#cbd5e1;border:none;padding:6px 10px;border-radius:6px;font-weight:600;cursor:pointer;">
                🔄 Re-crop
            </button>
            <button type="button" id="nkb-snip-act-cancel" style="background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);padding:6px 10px;border-radius:6px;font-weight:600;cursor:pointer;">
                ✕ Cancel
            </button>
        `;

        overlayEl.appendChild(headerEl);
        document.body.appendChild(overlayEl);
        document.body.appendChild(selectionBoxEl);
        document.body.appendChild(actionsBarEl);

        // Attach Header Events
        document.getElementById('nkb-snip-btn-full').addEventListener('click', (e) => {
            e.stopPropagation();
            captureFullDocument();
        });

        document.getElementById('nkb-snip-btn-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            closeSnippingTool();
        });

        // Attach Action Bar Events
        document.getElementById('nkb-snip-act-save').addEventListener('click', (e) => {
            e.stopPropagation();
            executeSnip('save');
        });

        document.getElementById('nkb-snip-act-copy').addEventListener('click', (e) => {
            e.stopPropagation();
            executeSnip('copy');
        });

        document.getElementById('nkb-snip-act-retry').addEventListener('click', (e) => {
            e.stopPropagation();
            resetSelection();
        });

        document.getElementById('nkb-snip-act-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            closeSnippingTool();
        });

        // Overlay Mouse Drag Events
        overlayEl.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Escape Key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlayEl.style.display === 'block') {
                closeSnippingTool();
            }
        });
    }

    function onMouseDown(e) {
        if (e.target.closest('#nkb-snip-header') || e.target.closest('#nkb-snip-actions')) return;
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        currentRect = { left: startX, top: startY, width: 0, height: 0 };

        actionsBarEl.style.display = 'none';
        selectionBoxEl.style.display = 'block';
        updateSelectionBox(startX, startY, 0, 0);
    }

    function onMouseMove(e) {
        if (!isSelecting) return;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        currentRect = { left, top, width, height };
        updateSelectionBox(left, top, width, height);
    }

    function onMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;

        if (!currentRect || currentRect.width < 20 || currentRect.height < 20) {
            selectionBoxEl.style.display = 'none';
            actionsBarEl.style.display = 'none';
            return;
        }

        positionActionsBar(currentRect);
    }

    function updateSelectionBox(left, top, width, height) {
        selectionBoxEl.style.left = left + 'px';
        selectionBoxEl.style.top = top + 'px';
        selectionBoxEl.style.width = width + 'px';
        selectionBoxEl.style.height = height + 'px';
        dimensionBadgeEl.textContent = Math.round(width) + ' × ' + Math.round(height) + ' px';
    }

    function positionActionsBar(rect) {
        actionsBarEl.style.display = 'flex';
        const barHeight = 44;
        const margin = 10;

        let top = rect.top + rect.height + margin;
        if (top + barHeight > window.innerHeight) {
            top = Math.max(10, rect.top - barHeight - margin);
        }

        let left = Math.max(10, Math.min(rect.left, window.innerWidth - 340));
        actionsBarEl.style.top = top + 'px';
        actionsBarEl.style.left = left + 'px';
    }

    function resetSelection() {
        currentRect = null;
        selectionBoxEl.style.display = 'none';
        actionsBarEl.style.display = 'none';
    }

    function startSnipping(config) {
        if (config) currentConfig = Object.assign(currentConfig, config);
        createOverlayUI();
        resetSelection();

        if (typeof window.html2canvas === 'undefined') {
            showToast('⚠️ Loading capture engine...', 'info');
            loadHtml2Canvas(() => {
                overlayEl.style.display = 'block';
            });
            return;
        }

        overlayEl.style.display = 'block';
    }

    function closeSnippingTool() {
        if (overlayEl) overlayEl.style.display = 'none';
        if (selectionBoxEl) selectionBoxEl.style.display = 'none';
        if (actionsBarEl) actionsBarEl.style.display = 'none';
        isSelecting = false;
        currentRect = null;
    }

    function loadHtml2Canvas(callback) {
        if (typeof window.html2canvas !== 'undefined') {
            if (callback) callback();
            return;
        }
        const script = document.createElement('script');
        script.src = '/vendor/html2canvas.min.js';
        script.onload = () => { if (callback) callback(); };
        script.onerror = () => {
            const fallback = document.createElement('script');
            fallback.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            fallback.onload = () => { if (callback) callback(); };
            fallback.onerror = () => {
                alert('Failed to load screen capture engine. Please check your internet connection.');
            };
            document.head.appendChild(fallback);
        };
        document.head.appendChild(script);
    }

    async function executeSnip(action) {
        const targetEl = currentConfig.getTargetElement();
        if (!targetEl) {
            alert('Printable sheet element not found!');
            return;
        }

        const saveBtn = document.getElementById('nkb-snip-act-save');
        const copyBtn = document.getElementById('nkb-snip-act-copy');
        if (saveBtn) saveBtn.disabled = true;
        if (copyBtn) copyBtn.disabled = true;

        showToast('⏳ Rendering high-definition snip...', 'info');

        try {
            overlayEl.style.visibility = 'hidden';
            selectionBoxEl.style.visibility = 'hidden';
            actionsBarEl.style.visibility = 'hidden';

            const scale = 2;
            const canvas = await window.html2canvas(targetEl, {
                scale: scale,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0
            });

            overlayEl.style.visibility = 'visible';
            selectionBoxEl.style.visibility = 'visible';
            actionsBarEl.style.visibility = 'visible';

            let finalCanvas = canvas;
            if (currentRect && currentRect.width > 20 && currentRect.height > 20) {
                const targetBox = targetEl.getBoundingClientRect();

                const cropX = Math.max(0, currentRect.left - targetBox.left);
                const cropY = Math.max(0, currentRect.top - targetBox.top);
                const cropW = Math.min(currentRect.width, targetBox.width - cropX);
                const cropH = Math.min(currentRect.height, targetBox.height - cropY);

                if (cropW > 10 && cropH > 10) {
                    const cropped = document.createElement('canvas');
                    cropped.width = cropW * scale;
                    cropped.height = cropH * scale;
                    const ctx = cropped.getContext('2d');
                    ctx.drawImage(
                        canvas,
                        cropX * scale,
                        cropY * scale,
                        cropW * scale,
                        cropH * scale,
                        0,
                        0,
                        cropW * scale,
                        cropH * scale
                    );
                    finalCanvas = cropped;
                }
            }

            const docType = currentConfig.getDocType();
            const poNumber = currentConfig.getPoNumber();
            const fileInfo = formatPoNumberToFilename(docType, poNumber);

            if (action === 'copy') {
                finalCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        showToast('❌ Failed to create image blob', 'error');
                        return;
                    }
                    try {
                        if (navigator.clipboard && window.ClipboardItem) {
                            await navigator.clipboard.write([
                                new window.ClipboardItem({ 'image/png': blob })
                            ]);
                            showToast('📋 Copied image to clipboard! (' + fileInfo.filename + ')', 'success');
                            closeSnippingTool();
                        } else {
                            downloadCanvas(finalCanvas, fileInfo.filename);
                            showToast('📋 Clipboard unavailable. Downloaded as ' + fileInfo.filename, 'success');
                            closeSnippingTool();
                        }
                    } catch (clipErr) {
                        console.warn('Clipboard write error:', clipErr);
                        downloadCanvas(finalCanvas, fileInfo.filename);
                        showToast('💾 Downloaded ' + fileInfo.filename + ' (Clipboard blocked)', 'success');
                        closeSnippingTool();
                    }
                }, 'image/png');
            } else {
                const dataUrl = finalCanvas.toDataURL('image/png');
                downloadCanvas(finalCanvas, fileInfo.filename);
                saveToServer(dataUrl, fileInfo);
                closeSnippingTool();
            }
        } catch (err) {
            console.error('Error during snip:', err);
            showToast('❌ Snip error: ' + (err.message || 'Rendering failed'), 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
            if (copyBtn) copyBtn.disabled = false;
            if (overlayEl) overlayEl.style.visibility = 'visible';
            if (selectionBoxEl) selectionBoxEl.style.visibility = 'visible';
            if (actionsBarEl) actionsBarEl.style.visibility = 'visible';
        }
    }

    async function captureFullDocument() {
        currentRect = null;
        if (selectionBoxEl) selectionBoxEl.style.display = 'none';
        if (actionsBarEl) actionsBarEl.style.display = 'none';
        await executeSnip('save');
    }

    function downloadCanvas(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function saveToServer(dataUrl, fileInfo) {
        try {
            const token = localStorage.getItem('nkb_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;

            const res = await fetch('/api/orders/save-snip', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    docType: fileInfo.folder,
                    poNumber: currentConfig.getPoNumber(),
                    filename: fileInfo.filename,
                    imageData: dataUrl
                })
            });

            const json = await res.json();
            if (json.success) {
                showToast('✅ Saved to folder "' + fileInfo.folder + '" as ' + fileInfo.filename + '!', 'success');
            } else {
                showToast('⚠️ Local download complete. Server note: ' + (json.error || 'Failed'), 'info');
            }
        } catch (err) {
            console.warn('Failed to upload snip to server:', err);
            showToast('💾 Image downloaded locally as ' + fileInfo.filename + '!', 'success');
        }
    }

    function showToast(message, type = 'info') {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'nkb-snip-toast';
            toastEl.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);z-index:10000002;transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1);display:flex;align-items:center;gap:8px;';
            document.body.appendChild(toastEl);
        }

        if (type === 'success') {
            toastEl.style.background = '#065f46';
            toastEl.style.color = '#d1fae5';
            toastEl.style.border = '1px solid #10b981';
        } else if (type === 'error') {
            toastEl.style.background = '#991b1b';
            toastEl.style.color = '#fee2e2';
            toastEl.style.border = '1px solid #ef4444';
        } else {
            toastEl.style.background = '#0f172a';
            toastEl.style.color = '#e2e8f0';
            toastEl.style.border = '1px solid #334155';
        }

        toastEl.innerHTML = message;
        toastEl.style.opacity = '1';
        toastEl.style.transform = 'translateY(0)';

        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(() => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateY(12px)';
        }, 4500);
    }

    window.NKBSnippingTool = {
        start: startSnipping,
        captureFull: captureFullDocument,
        close: closeSnippingTool,
        formatPoNumberToFilename: formatPoNumberToFilename
    };

})(window);
