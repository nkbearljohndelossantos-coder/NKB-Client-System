/**
 * NKB Enterprise Floating Agents & Messenger
 * 
 * Features:
 * 1. Action Notification Agent (Bell 🔔): Pending action queue, urgency badges, 1-click routing.
 * 2. Meta Messenger System (Chat 💬):
 *    - Multiple simultaneous docked chat boxes (side-by-side at bottom)
 *    - Floating circular Chat Heads with avatar, online green dot & unread badge
 *    - Online presence / active status ("Active now", "Active 3m ago", "Offline")
 *    - Visible live typing indicators (••• [Name] is typing...)
 *    - Web Audio API harmonic chime on incoming messages + desktop preview toasts
 *    - Role isolation (Clients ➔ Accounting & Support only)
 */

(function () {
    function getAuthToken() {
        return localStorage.getItem('nkb_token') || null;
    }

    let activeUser = null;
    let pendingData = { totalPending: 0, items: [] };
    let chatContacts = [];
    let unreadChatCount = 0;

    // Multi-chat window state
    // Array of open docked conversations: { contactId, contact, isMinimized, messages, lastSeenMsgId, typingNames: [], pollTimer }
    const openDockedChats = [];
    let multiChatPollInterval = null;

    // Web Audio API notification chime synthesizer
    let audioCtx = null;
    function playMessengerChime() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            if (!audioCtx) audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const now = audioCtx.currentTime;
            // Tone 1: 587.33 Hz (D5)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.22, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.22);

            // Tone 2: 880 Hz (A5)
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.09);
            gain2.gain.setValueAtTime(0.26, now + 0.09);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.09);
            osc2.stop(now + 0.42);
        } catch (_) {}
    }

    // Floating incoming message toast
    function showIncomingMessageToast(senderName, text, contactId) {
        let container = document.getElementById('nkb-chat-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'nkb-chat-toast-container';
            container.style.cssText = 'position: fixed; top: 24px; right: 24px; z-index: 100002; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = 'pointer-events: auto; background: #0f172a; color: white; padding: 12px 16px; border-radius: 18px; box-shadow: 0 16px 32px -6px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.18); max-width: 340px; transition: transform 0.2s;';
        toast.innerHTML = `
            <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(99,102,241,0.4);">💬</div>
            <div style="min-width: 0; flex: 1;">
                <div style="font-weight: 800; font-size: 12px; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(senderName)}</div>
                <div style="font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(text)}</div>
            </div>
            <button style="background: none; border: none; color: #64748b; font-size: 16px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
        `;
        toast.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                openDockedChat(contactId);
            }
            toast.remove();
        };
        toast.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            toast.remove();
        };
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5500);
    }

    async function fetchApi(url, options = {}) {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(url, { ...options, headers });
            return await res.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function loadCurrentUser() {
        if (window.NKB && window.NKB.user) {
            activeUser = window.NKB.user;
            return activeUser;
        }
        const cachedUser = localStorage.getItem('nkb_user');
        if (cachedUser) {
            try {
                const parsed = JSON.parse(cachedUser);
                if (parsed && (parsed.id || parsed.role)) {
                    activeUser = parsed;
                }
            } catch (_) {}
        }
        try {
            const token = getAuthToken();
            if (!token) return activeUser;
            const res = await fetchApi('/api/auth/me');
            if (res && res.success) {
                const fetched = res.user || res.data;
                if (fetched) activeUser = fetched;
                return activeUser;
            }
        } catch (_) {}
        return activeUser;
    }

    // ==========================================
    // NOTIFICATION AGENT (BELL 🔔)
    // ==========================================

    async function refreshPendingNotifications() {
        if (!activeUser) return;
        const res = await fetchApi('/api/notifications/pending');
        if (res && res.success) {
            pendingData = res;
            updateBellUI();
        }
    }

    function updateBellUI() {
        const badge = document.getElementById('agent-bell-badge');
        const listContainer = document.getElementById('agent-bell-list');
        const emptyState = document.getElementById('agent-bell-empty');
        const countHeader = document.getElementById('agent-bell-count-pill');
        const bellBtn = document.getElementById('agent-bell-btn');

        if (!badge) return;

        const count = pendingData.totalPending || 0;
        if (count > 0) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
            if (bellBtn) bellBtn.classList.add('animate-bounce-short');
        } else {
            badge.classList.add('hidden');
            if (bellBtn) bellBtn.classList.remove('animate-bounce-short');
        }

        if (countHeader) {
            countHeader.innerText = `${count} Action${count === 1 ? '' : 's'}`;
        }

        if (count === 0) {
            if (listContainer) listContainer.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (listContainer) {
            listContainer.innerHTML = pendingData.items.map(item => {
                const urgencyColors = {
                    'CRITICAL': 'bg-rose-100 text-rose-800 border-rose-200',
                    'HIGH': 'bg-amber-100 text-amber-800 border-amber-200',
                    'MEDIUM': 'bg-blue-100 text-blue-800 border-blue-200'
                };
                const urgencyStyle = urgencyColors[item.urgency] || 'bg-slate-100 text-slate-800 border-slate-200';

                return `
                    <div class="p-3.5 bg-slate-50 hover:bg-indigo-50/40 rounded-2xl border border-slate-200 hover:border-indigo-200 transition space-y-2">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                                <span>${item.icon || '📌'}</span>
                                <span class="leading-tight">${item.title}</span>
                            </div>
                            <span class="px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${urgencyStyle}">
                                ${item.urgency}
                            </span>
                        </div>
                        <p class="text-[11px] text-slate-600 leading-relaxed">${item.description}</p>
                        <div class="pt-1 flex justify-end">
                            <button onclick="window.NKB_Agents.executePendingAction('${item.id}')" 
                                    class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold shadow-sm flex items-center gap-1 transition">
                                <span>Go to Task</span>
                                <span>➔</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function toggleBellFlyout() {
        const flyout = document.getElementById('agent-bell-flyout');
        const chatFlyout = document.getElementById('agent-chat-flyout');
        if (!flyout) return;

        if (chatFlyout && !chatFlyout.classList.contains('hidden')) {
            chatFlyout.classList.add('hidden');
        }

        const isHidden = flyout.classList.contains('hidden');
        if (isHidden) {
            refreshPendingNotifications();
            flyout.classList.remove('hidden');
        } else {
            flyout.classList.add('hidden');
        }
    }

    function executePendingAction(itemId) {
        const item = pendingData.items.find(i => i.id === itemId);
        if (!item || !item.target) return;

        const flyout = document.getElementById('agent-bell-flyout');
        if (flyout) flyout.classList.add('hidden');

        const { tab, poId, reqId, drId } = item.target;

        if (window.switchTab) {
            window.switchTab(tab);
            setTimeout(() => {
                if (poId && window.openViewPOModal) {
                    window.openViewPOModal(poId);
                } else if (reqId && window.openUpdateRequisitionModal) {
                    window.openUpdateRequisitionModal(reqId);
                } else if (tab === 'purchasing' && window.loadPurchasingRequisitions) {
                    window.loadPurchasingRequisitions();
                }
            }, 300);
        }

        if (window.switchClientTab) {
            window.switchClientTab(tab);
            setTimeout(() => {
                if (drId && window.openSignDeliveryModal) {
                    window.openSignDeliveryModal(drId);
                }
            }, 300);
        }
    }

    // ==========================================
    // META MESSENGER (MULTI-CHAT & CHAT HEADS)
    // ==========================================

    async function sendHeartbeat() {
        if (!activeUser) return;
        await fetchApi('/api/chat/heartbeat', { method: 'POST' });
    }

    async function refreshUnreadCount() {
        if (!activeUser) return;
        const res = await fetchApi('/api/chat/unread-count');
        if (res && res.success) {
            unreadChatCount = res.unreadCount || 0;
            const badge = document.getElementById('agent-chat-badge');
            if (badge) {
                if (unreadChatCount > 0) {
                    badge.innerText = unreadChatCount > 99 ? '99+' : unreadChatCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
    }

    async function loadChatContacts() {
        if (!activeUser) return;
        const res = await fetchApi('/api/chat/contacts');
        if (res && res.success) {
            chatContacts = res.contacts || [];
            renderChatContacts();
        }
    }

    function renderChatContacts() {
        const container = document.getElementById('agent-chat-contacts-list');
        if (!container) return;

        if (chatContacts.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No channels available.</div>';
            return;
        }

        container.innerHTML = chatContacts.map(c => {
            const isPinned = c.pinned;
            const cardBg = isPinned 
                ? 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200' 
                : 'bg-slate-50 hover:bg-indigo-50/50 border-slate-200';
            const titleColor = isPinned ? 'text-amber-900 font-extrabold' : 'text-slate-800 font-bold';
            const isOnline = Boolean(c.isOnline);
            const activeStatusText = c.activeStatus || (isOnline ? 'Active now' : 'Offline');

            return `
                <div onclick="window.NKB_Agents.openDockedChat('${c.id}')" 
                     class="p-3 rounded-2xl border ${cardBg} cursor-pointer transition flex items-center justify-between gap-3 group">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="relative w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isPinned ? 'bg-amber-200/70' : 'bg-white border border-slate-200 shadow-sm'} shrink-0">
                            ${c.avatar || '💬'}
                            <!-- Green Active Dot -->
                            ${isOnline ? `
                                <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-sm" title="Active now"></span>
                            ` : `
                                <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-slate-300 border-2 border-white rounded-full" title="Offline"></span>
                            `}
                        </div>
                        <div class="min-w-0">
                            <div class="text-xs ${titleColor} truncate flex items-center gap-1.5">
                                <span>${escapeHtml(c.name)}</span>
                            </div>
                            <div class="text-[10.5px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                                ${isOnline ? `<span class="text-emerald-600 font-semibold">${activeStatusText}</span> • ` : ''}
                                <span>${escapeHtml(c.description || '')}</span>
                            </div>
                        </div>
                    </div>
                    <span class="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition text-xs shrink-0">➔</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Open or restore a docked chat box (Meta Messenger desktop style)
     */
    async function openDockedChat(contactId) {
        if (!chatContacts || chatContacts.length === 0) {
            await loadChatContacts();
        }

        const contact = chatContacts.find(c => c.id === contactId);
        if (!contact) return;

        const chatFlyout = document.getElementById('agent-chat-flyout');
        if (chatFlyout) chatFlyout.classList.add('hidden');

        let chat = openDockedChats.find(c => c.contactId === contactId);
        if (chat) {
            chat.isMinimized = false;
            renderDockedChats();
            renderChatHeads();
            focusChatInput(contactId);
            return;
        }

        if (openDockedChats.length >= 3) {
            openDockedChats[0].isMinimized = true;
        }

        chat = {
            contactId,
            contact,
            isMinimized: false,
            messages: [],
            lastSeenMsgId: null,
            isTyping: false,
            typingNames: [],
            typingDebounce: null,
            activeStatus: contact.activeStatus || 'Checking...',
            isOnline: Boolean(contact.isOnline)
        };

        openDockedChats.push(chat);
        renderDockedChats();
        renderChatHeads();

        await refreshChatMessages(chat, true);
        startMultiChatPolling();
        focusChatInput(contactId);
    }

    function closeDockedChat(contactId) {
        const idx = openDockedChats.findIndex(c => c.contactId === contactId);
        if (idx !== -1) {
            openDockedChats.splice(idx, 1);
            renderDockedChats();
            renderChatHeads();
        }
        if (openDockedChats.length === 0) {
            stopMultiChatPolling();
        }
    }

    function toggleMinimizeDockedChat(contactId) {
        const chat = openDockedChats.find(c => c.contactId === contactId);
        if (chat) {
            chat.isMinimized = !chat.isMinimized;
            renderDockedChats();
            renderChatHeads();
            if (!chat.isMinimized) {
                focusChatInput(contactId);
            }
        }
    }

    function toggleChatHead(contactId) {
        toggleMinimizeDockedChat(contactId);
    }

    function focusChatInput(contactId) {
        setTimeout(() => {
            const input = document.getElementById(`docked-chat-input-${contactId}`);
            if (input) input.focus();
        }, 100);
    }

    /**
     * Render floating circular Chat Heads stacked vertically on bottom-right
     */
    function renderChatHeads() {
        const container = document.getElementById('nkb-chat-heads-container');
        if (!container) return;

        if (openDockedChats.length === 0) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        container.innerHTML = openDockedChats.map(c => {
            const isOnline = Boolean(c.isOnline);
            return `
                <div onclick="window.NKB_Agents.toggleChatHead('${c.contactId}')"
                     title="${escapeHtml(c.contact.name)} (${c.isMinimized ? 'Click to open' : 'Click to minimize'})"
                     class="w-12 h-12 rounded-full bg-white border-2 ${c.isMinimized ? 'border-slate-300 opacity-90' : 'border-indigo-600 scale-105 shadow-xl'} shadow-lg hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer relative group">
                    <span class="text-xl select-none">${c.contact.avatar || '💬'}</span>
                    
                    <!-- Online Presence Green Dot -->
                    ${isOnline ? `
                        <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow" title="Active now"></span>
                    ` : ''}

                    <!-- Tooltip -->
                    <div class="absolute right-14 bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-md">
                        ${escapeHtml(c.contact.name)}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render side-by-side docked chat boxes along the bottom
     */
    function renderDockedChats() {
        const container = document.getElementById('nkb-docked-chats-container');
        if (!container) return;

        if (openDockedChats.length === 0) {
            container.innerHTML = '';
            return;
        }

        const myId = activeUser ? activeUser.id : null;

        container.innerHTML = openDockedChats.map((c, index) => {
            const rightOffset = 96 + (index * 340);
            const isOnline = Boolean(c.isOnline);
            const statusText = c.activeStatus || (isOnline ? 'Active now' : 'Offline');

            if (c.isMinimized) {
                return `
                    <div id="docked-chat-${c.contactId}" 
                         style="position: fixed !important; bottom: 0 !important; right: ${rightOffset}px !important; width: 310px !important; z-index: 99995 !important;"
                         class="bg-slate-900 text-white rounded-t-2xl shadow-2xl border-t-2 border-indigo-500 overflow-hidden cursor-pointer select-none transition-all">
                        <div onclick="window.NKB_Agents.toggleMinimizeDockedChat('${c.contactId}')" 
                             class="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-800 transition">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="relative w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-sm shrink-0">
                                    ${c.contact.avatar || '💬'}
                                    ${isOnline ? '<span class="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-slate-900"></span>' : ''}
                                </div>
                                <span class="font-bold text-xs truncate">${escapeHtml(c.contact.name)}</span>
                            </div>
                            <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                                <button onclick="window.NKB_Agents.toggleMinimizeDockedChat('${c.contactId}')" class="w-6 h-6 rounded hover:bg-slate-700 text-slate-300 text-xs font-bold transition">▲</button>
                                <button onclick="window.NKB_Agents.closeDockedChat('${c.contactId}')" class="w-6 h-6 rounded hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold transition">✕</button>
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <div id="docked-chat-${c.contactId}"
                     style="position: fixed !important; bottom: 0 !important; right: ${rightOffset}px !important; width: 325px !important; height: 440px !important; z-index: 99995 !important;"
                     class="bg-white rounded-t-3xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden animate-fade-in select-none">
                    
                    <!-- WINDOW HEADER -->
                    <div class="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                        <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="window.NKB_Agents.toggleMinimizeDockedChat('${c.contactId}')">
                            <div class="relative w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-base shrink-0 border border-slate-700">
                                ${c.contact.avatar || '💬'}
                                ${isOnline ? '<span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow"></span>' : ''}
                            </div>
                            <div class="min-w-0">
                                <div class="font-black text-xs text-white truncate leading-tight">${escapeHtml(c.contact.name)}</div>
                                <div class="text-[10px] mt-0.5 flex items-center gap-1">
                                    ${isOnline ? `
                                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                                        <span class="text-emerald-400 font-bold">Active now</span>
                                    ` : `
                                        <span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
                                        <span class="text-slate-400">${escapeHtml(statusText)}</span>
                                    `}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick="window.NKB_Agents.toggleMinimizeDockedChat('${c.contactId}')" title="Minimize" class="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition">−</button>
                            <button onclick="window.NKB_Agents.closeDockedChat('${c.contactId}')" title="Close" class="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition">✕</button>
                        </div>
                    </div>

                    <!-- MESSAGES CONTAINER -->
                    <div class="p-3 overflow-y-auto space-y-2.5 flex-1 bg-slate-50/60" id="docked-messages-${c.contactId}">
                        ${(c.messages && c.messages.length > 0) ? c.messages.map(m => {
                            const isMe = m.sender_id === myId;
                            let cleanTime = typeof m.created_at === 'string' && !m.created_at.includes('T') ? m.created_at.replace(' ', 'T') : m.created_at;
                            if (typeof cleanTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanTime) && !cleanTime.includes('+') && !cleanTime.endsWith('Z')) cleanTime += '+08:00';
                            const timeStr = m.created_at ? new Date(cleanTime).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                            if (isMe) {
                                return `
                                    <div class="flex flex-col items-end space-y-0.5">
                                        <div class="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-3 py-1.5 text-xs shadow-sm leading-relaxed break-words font-medium">
                                            ${escapeHtml(m.message)}
                                        </div>
                                        <span class="text-[9px] text-slate-400 font-mono pr-1">${timeStr}</span>
                                    </div>
                                `;
                            } else {
                                return `
                                    <div class="flex flex-col items-start space-y-0.5">
                                        <div class="flex items-center gap-1 pl-1">
                                            <span class="text-[10px] font-bold text-slate-700">${escapeHtml(m.sender_name || 'Staff')}</span>
                                            <span class="text-[8.5px] font-bold px-1 bg-slate-200 text-slate-600 rounded">${m.sender_role || ''}</span>
                                        </div>
                                        <div class="max-w-[85%] bg-white text-slate-900 rounded-2xl rounded-tl-none px-3 py-1.5 text-xs shadow-sm border border-slate-200 leading-relaxed break-words font-medium">
                                            ${escapeHtml(m.message)}
                                        </div>
                                        <span class="text-[9px] text-slate-400 font-mono pl-1">${timeStr}</span>
                                    </div>
                                `;
                            }
                        }).join('') : `
                            <div class="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-1">
                                <div class="text-3xl">👋</div>
                                <div class="text-xs font-bold text-slate-700">Start a Conversation</div>
                                <div class="text-[10.5px] text-slate-500">Send a message to ${escapeHtml(c.contact.name)}</div>
                            </div>
                        `}
                    </div>

                    <!-- LIVE TYPING INDICATOR -->
                    <div id="docked-typing-${c.contactId}" class="${c.isTyping ? '' : 'hidden'} px-3 py-1 bg-slate-100/90 border-t border-slate-200/50 flex items-center gap-2 shrink-0">
                        <div class="inline-flex gap-1 items-center">
                            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0s"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.15s"></span>
                            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.3s"></span>
                        </div>
                        <span class="text-[10.5px] text-indigo-700 font-semibold truncate">
                            ${c.typingNames && c.typingNames.length > 0 ? escapeHtml(c.typingNames.join(', ')) : 'Someone'} is typing...
                        </span>
                    </div>

                    <!-- INPUT BAR -->
                    <form onsubmit="window.NKB_Agents.sendDockedChatMessage(event, '${c.contactId}')" class="p-2.5 bg-white border-t border-slate-200 flex items-center gap-1.5 shrink-0">
                        <input type="text" id="docked-chat-input-${c.contactId}" 
                               placeholder="Type a message..." required autocomplete="off"
                               oninput="window.NKB_Agents.handleTypingInput('${c.contactId}')"
                               onblur="window.NKB_Agents.handleTypingBlur('${c.contactId}')"
                               class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition">
                        <button type="submit" class="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white flex items-center justify-center text-xs shadow transition shrink-0">
                            ➤
                        </button>
                    </form>
                </div>
            `;
        }).join('');

        openDockedChats.forEach(c => {
            if (!c.isMinimized) {
                const el = document.getElementById(`docked-messages-${c.contactId}`);
                if (el) el.scrollTop = el.scrollHeight;
            }
        });
    }

    /**
     * Send message from a docked chat window
     */
    async function sendDockedChatMessage(event, contactId) {
        if (event) event.preventDefault();
        const chat = openDockedChats.find(c => c.contactId === contactId);
        const input = document.getElementById(`docked-chat-input-${contactId}`);
        if (!chat || !input) return;

        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.focus();

        sendTypingState(chat.contact, false);

        const payload = {
            message: text,
            contactId: chat.contact.id,
            channelType: chat.contact.channelType,
            targetRole: chat.contact.targetRole,
            userId: chat.contact.userId
        };

        const res = await fetchApi('/api/chat/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res && res.success && res.data) {
            chat.messages.push(res.data);
            chat.lastSeenMsgId = res.data.id;
            renderDockedChats();
        } else if (res && res.error) {
            alert(res.message || 'Message could not be delivered.');
        }
    }

    /**
     * Typing event handlers (debounced broadcast to server)
     */
    function handleTypingInput(contactId) {
        const chat = openDockedChats.find(c => c.contactId === contactId);
        if (!chat) return;

        if (chat.typingDebounce) clearTimeout(chat.typingDebounce);

        sendTypingState(chat.contact, true);

        chat.typingDebounce = setTimeout(() => {
            sendTypingState(chat.contact, false);
        }, 3000);
    }

    function handleTypingBlur(contactId) {
        const chat = openDockedChats.find(c => c.contactId === contactId);
        if (chat) {
            if (chat.typingDebounce) clearTimeout(chat.typingDebounce);
            sendTypingState(chat.contact, false);
        }
    }

    async function sendTypingState(contact, isTyping) {
        if (!contact) return;
        await fetchApi('/api/chat/typing', {
            method: 'POST',
            body: JSON.stringify({
                contactId: contact.id,
                channelType: contact.channelType,
                targetRole: contact.targetRole,
                userId: contact.userId,
                isTyping
            })
        });
    }

    /**
     * Poll messages & typing/presence status for all open chat windows
     */
    async function refreshChatMessages(chat, isInitial = false) {
        if (!chat || !chat.contact) return;
        const c = chat.contact;

        let url = `/api/chat/messages?contactId=${encodeURIComponent(c.id)}&channelType=${encodeURIComponent(c.channelType)}`;
        if (c.targetRole) url += `&targetRole=${encodeURIComponent(c.targetRole)}`;
        if (c.userId) url += `&userId=${encodeURIComponent(c.userId)}`;

        const [msgRes, statusRes] = await Promise.all([
            fetchApi(url),
            fetchApi(`/api/chat/status?contactId=${encodeURIComponent(c.id)}&channelType=${encodeURIComponent(c.channelType)}${c.targetRole ? `&targetRole=${encodeURIComponent(c.targetRole)}` : ''}${c.userId ? `&userId=${encodeURIComponent(c.userId)}` : ''}`)
        ]);

        let hasNewMessages = false;

        if (msgRes && msgRes.success) {
            const newMessages = msgRes.data || [];
            const prevCount = (chat.messages || []).length;

            if (newMessages.length > prevCount && !isInitial) {
                const newest = newMessages[newMessages.length - 1];
                const myId = activeUser ? activeUser.id : null;
                if (newest && newest.sender_id !== myId) {
                    playMessengerChime();
                    showIncomingMessageToast(newest.sender_name || c.name, newest.message, c.id);
                }
                hasNewMessages = true;
            }

            chat.messages = newMessages;

            fetchApi('/api/chat/read', {
                method: 'POST',
                body: JSON.stringify({
                    contactId: c.id,
                    channelType: c.channelType,
                    targetRole: c.targetRole,
                    userId: c.userId
                })
            });
            refreshUnreadCount();
        }

        if (statusRes && statusRes.success) {
            chat.isOnline = Boolean(statusRes.isOnline);
            chat.activeStatus = statusRes.activeText || (chat.isOnline ? 'Active now' : 'Offline');
            chat.isTyping = Boolean(statusRes.isTyping);
            chat.typingNames = (statusRes.typingUsers || []).map(u => u.name);
        }

        if (hasNewMessages || isInitial) {
            renderDockedChats();
        } else {
            updateDockedChatLiveState(chat);
        }
    }

    function updateDockedChatLiveState(chat) {
        const typingEl = document.getElementById(`docked-typing-${chat.contactId}`);
        if (typingEl) {
            if (chat.isTyping) {
                typingEl.classList.remove('hidden');
                const nameSpan = typingEl.querySelector('span:last-child');
                if (nameSpan) {
                    nameSpan.textContent = `${chat.typingNames && chat.typingNames.length > 0 ? chat.typingNames.join(', ') : 'Someone'} is typing...`;
                }
            } else {
                typingEl.classList.add('hidden');
            }
        }
    }

    function startMultiChatPolling() {
        stopMultiChatPolling();
        multiChatPollInterval = setInterval(() => {
            if (openDockedChats.length > 0) {
                openDockedChats.forEach(chat => {
                    refreshChatMessages(chat);
                });
            }
        }, 2500);
    }

    function stopMultiChatPolling() {
        if (multiChatPollInterval) {
            clearInterval(multiChatPollInterval);
            multiChatPollInterval = null;
        }
    }

    function toggleChatFlyout() {
        const flyout = document.getElementById('agent-chat-flyout');
        const bellFlyout = document.getElementById('agent-bell-flyout');
        if (!flyout) return;

        if (bellFlyout && !bellFlyout.classList.contains('hidden')) {
            bellFlyout.classList.add('hidden');
        }

        const isHidden = flyout.classList.contains('hidden');
        if (isHidden) {
            loadChatContacts();
            flyout.classList.remove('hidden');
        } else {
            flyout.classList.add('hidden');
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    // ==========================================
    // DOM MOUNTING & INITIALIZATION
    // ==========================================

    function mountWidgets() {
        if (document.getElementById('nkb-agent-widgets-container')) return;

        const container = document.createElement('div');
        container.id = 'nkb-agent-widgets-container';
        container.innerHTML = `
            <!-- DOCKED CHAT WINDOWS (META MESSENGER STYLE: SIDE-BY-SIDE AT BOTTOM) -->
            <div id="nkb-docked-chats-container"></div>

            <!-- FLOATING CHAT HEADS (STACKED VERTICALLY ABOVE LAUNCHER) -->
            <div id="nkb-chat-heads-container" 
                 class="hidden fixed bottom-28 right-6 z-[99998] flex flex-col items-center gap-3 select-none"
                 style="position: fixed !important; bottom: 100px !important; right: 28px !important; z-index: 99998 !important;">
            </div>

            <!-- FLOATING ACTION BUTTONS BAR -->
            <div id="agent-floating-actions-bar" class="fixed bottom-6 right-6 z-[99999] flex items-center gap-3 select-none" style="position: fixed !important; bottom: 24px !important; right: 24px !important; z-index: 99999 !important; display: flex !important; align-items: center !important; gap: 12px !important;">
                
                <!-- CHAT MESSENGER HUB BUTTON -->
                <button id="agent-chat-btn" onclick="window.NKB_Agents.toggleChatFlyout()" 
                        title="NKB Enterprise Messenger"
                        class="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer relative border-2 border-white/60"
                        style="width: 56px !important; height: 56px !important; border-radius: 9999px !important; display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important; cursor: pointer !important; z-index: 99999 !important;">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <!-- Unread Badge -->
                    <span id="agent-chat-badge" class="hidden absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[20px] text-center border-2 border-white shadow">
                        0
                    </span>
                </button>

                <!-- ACTION NOTIFICATION AGENT BUTTON (BELL) -->
                <button id="agent-bell-btn" onclick="window.NKB_Agents.toggleBellFlyout()" 
                        title="Pending Tasks & Confirmations"
                        class="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-red-500 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer relative border-2 border-white/60"
                        style="width: 56px !important; height: 56px !important; border-radius: 9999px !important; display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important; cursor: pointer !important; z-index: 99999 !important;">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                    <!-- Pending Counter Badge -->
                    <span id="agent-bell-badge" class="hidden absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[20px] text-center border-2 border-white shadow">
                        0
                    </span>
                </button>
            </div>

            <!-- ACTION NOTIFICATIONS FLYOUT -->
            <div id="agent-bell-flyout" class="hidden fixed bottom-24 right-6 z-[99999] w-96 max-w-[92vw] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-fade-in" style="position: fixed !important; bottom: 92px !important; right: 24px !important; z-index: 99999 !important; max-height: 520px;">
                <div class="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">🔔</span>
                        <div>
                            <h4 class="font-extrabold text-sm leading-tight">Action Required</h4>
                            <p class="text-[10px] text-slate-400">Pending tasks & confirmation workflow</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span id="agent-bell-count-pill" class="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-black">
                            0 Actions
                        </span>
                        <button onclick="window.NKB_Agents.toggleBellFlyout()" class="w-7 h-7 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition">✕</button>
                    </div>
                </div>

                <div class="p-4 overflow-y-auto space-y-2.5 flex-1" id="agent-bell-list">
                    <!-- Cards injected dynamically -->
                </div>

                <div id="agent-bell-empty" class="hidden p-8 text-center space-y-2">
                    <div class="text-4xl">🎉</div>
                    <div class="font-extrabold text-xs text-slate-900">All Caught Up!</div>
                    <p class="text-[11px] text-slate-500">You have no pending confirmations or urgent tasks waiting for your department.</p>
                </div>
            </div>

            <!-- MESSENGER CONTACTS DIRECTORY FLYOUT -->
            <div id="agent-chat-flyout" class="hidden fixed bottom-24 right-6 z-[99999] w-[380px] max-w-[94vw] h-[540px] max-h-[82vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-fade-in" style="position: fixed !important; bottom: 92px !important; right: 24px !important; z-index: 99999 !important;">
                <div class="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-base">💬</div>
                        <div>
                            <h4 class="font-black text-sm leading-tight">NKB Messenger</h4>
                            <p class="text-[10px] text-slate-400">Online enterprise team chat</p>
                        </div>
                    </div>
                    <button onclick="window.NKB_Agents.toggleChatFlyout()" class="w-7 h-7 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition">✕</button>
                </div>

                <div class="p-3 bg-slate-50 border-b border-slate-100">
                    <div class="text-[11px] text-slate-600 font-bold uppercase tracking-wider px-1">
                        Conversations & Departments
                    </div>
                </div>

                <div class="p-3 overflow-y-auto space-y-2 flex-1" id="agent-chat-contacts-list">
                    <!-- Contacts injected dynamically -->
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }

    // Public global API exposed on window
    window.NKB_Agents = {
        toggleBellFlyout,
        toggleChatFlyout,
        executePendingAction,
        openDockedChat,
        closeDockedChat,
        toggleMinimizeDockedChat,
        toggleChatHead,
        sendDockedChatMessage,
        handleTypingInput,
        handleTypingBlur,
        refreshPendingNotifications,
        refreshUnreadCount,
        playMessengerChime
    };

    // Auto-init on page load
    async function init() {
        const token = getAuthToken();
        const cachedUser = localStorage.getItem('nkb_user');
        if (!token && !cachedUser) return;

        mountWidgets();
        await loadCurrentUser();
        refreshPendingNotifications();
        refreshUnreadCount();
        sendHeartbeat();

        // Heartbeat & notifications poll
        setInterval(() => {
            if (activeUser) {
                sendHeartbeat();
                refreshPendingNotifications();
                refreshUnreadCount();
            } else {
                loadCurrentUser().then(u => {
                    if (u) {
                        sendHeartbeat();
                        refreshPendingNotifications();
                        refreshUnreadCount();
                    }
                });
            }
        }, 35000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
