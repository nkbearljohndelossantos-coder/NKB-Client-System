/**
 * NKB Enterprise Floating Agents:
 * 1. Action Notification Agent (Bell 🔔): Alerts roles of pending tasks & confirms, with 1-click redirection.
 * 2. Enterprise Chat System Agent (Chat 💬): Inter-role communication, client-to-accounting isolation, & direct support.
 */

(function () {
    // Only run if user is logged in
    function getAuthToken() {
        return localStorage.getItem('nkb_token') || null;
    }

    let activeUser = null;
    let pendingData = { totalPending: 0, items: [] };
    let chatContacts = [];
    let activeChatContact = null;
    let activeChatMessages = [];
    let chatPollTimer = null;
    let unreadChatCount = 0;

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

        // Close chat if open
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

        // Close flyout
        const flyout = document.getElementById('agent-bell-flyout');
        if (flyout) flyout.classList.add('hidden');

        const { tab, poId, reqId, drId, action } = item.target;

        // 1. Admin Portal Navigation
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

        // 2. Client Portal Navigation
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
    // CHAT SYSTEM AGENT (CHAT 💬)
    // ==========================================

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

            return `
                <div onclick="window.NKB_Agents.selectChatContact('${c.id}')" 
                     class="p-3 rounded-2xl border ${cardBg} cursor-pointer transition flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg ${isPinned ? 'bg-amber-200/70' : 'bg-white border border-slate-200 shadow-sm'} shrink-0">
                            ${c.avatar || '💬'}
                        </div>
                        <div class="min-w-0">
                            <div class="text-xs ${titleColor} truncate">${c.name}</div>
                            <div class="text-[10px] text-slate-500 truncate">${c.description || ''}</div>
                        </div>
                    </div>
                    <span class="text-slate-400 text-xs shrink-0">➔</span>
                </div>
            `;
        }).join('');
    }

    async function selectChatContact(contactId) {
        const contact = chatContacts.find(c => c.id === contactId);
        if (!contact) return;

        activeChatContact = contact;

        // Switch UI to Conversation View
        const directoryView = document.getElementById('agent-chat-directory');
        const threadView = document.getElementById('agent-chat-thread');
        const threadTitle = document.getElementById('agent-chat-thread-title');
        const threadSub = document.getElementById('agent-chat-thread-sub');
        const threadAvatar = document.getElementById('agent-chat-thread-avatar');

        if (directoryView) directoryView.classList.add('hidden');
        if (threadView) threadView.classList.remove('hidden');

        if (threadTitle) threadTitle.innerText = contact.name;
        if (threadSub) threadSub.innerText = contact.description || contact.channelType;
        if (threadAvatar) threadAvatar.innerText = contact.avatar || '💬';

        await fetchChatMessages();
        startChatPolling();
    }

    function backToChatDirectory() {
        stopChatPolling();
        activeChatContact = null;
        const directoryView = document.getElementById('agent-chat-directory');
        const threadView = document.getElementById('agent-chat-thread');
        if (directoryView) directoryView.classList.remove('hidden');
        if (threadView) threadView.classList.add('hidden');
        loadChatContacts();
    }

    async function fetchChatMessages() {
        if (!activeChatContact) return;
        let url = `/api/chat/messages?contactId=${encodeURIComponent(activeChatContact.id)}&channelType=${encodeURIComponent(activeChatContact.channelType)}`;
        if (activeChatContact.targetRole) url += `&targetRole=${encodeURIComponent(activeChatContact.targetRole)}`;
        if (activeChatContact.userId) url += `&userId=${encodeURIComponent(activeChatContact.userId)}`;

        const res = await fetchApi(url);
        if (res && res.success) {
            activeChatMessages = res.data || [];
            renderChatMessages();
            // Mark as read
            fetchApi('/api/chat/read', {
                method: 'POST',
                body: JSON.stringify({
                    contactId: activeChatContact.id,
                    channelType: activeChatContact.channelType,
                    targetRole: activeChatContact.targetRole,
                    userId: activeChatContact.userId
                })
            });
            refreshUnreadCount();
        }
    }

    function renderChatMessages() {
        const container = document.getElementById('agent-chat-messages-container');
        if (!container) return;

        if (activeChatMessages.length === 0) {
            container.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-1">
                    <div class="text-3xl">👋</div>
                    <div class="text-xs font-bold text-slate-600">No messages yet</div>
                    <div class="text-[11px]">Send a greeting to start this conversation!</div>
                </div>
            `;
            return;
        }

        const myId = activeUser ? activeUser.id : null;

        container.innerHTML = activeChatMessages.map(m => {
            const isMe = m.sender_id === myId;
            let cleanTime = typeof m.created_at === 'string' && !m.created_at.includes('T') ? m.created_at.replace(' ', 'T') : m.created_at;
            if (typeof cleanTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanTime) && !cleanTime.includes('+') && !cleanTime.endsWith('Z')) cleanTime += '+08:00';
            const timeStr = m.created_at ? new Date(cleanTime).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

            if (isMe) {
                return `
                    <div class="flex flex-col items-end space-y-1">
                        <div class="max-w-[80%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-3.5 py-2 text-xs shadow-sm leading-relaxed break-words">
                            ${escapeHtml(m.message)}
                        </div>
                        <span class="text-[9px] text-slate-400 font-mono pr-1">${timeStr}</span>
                    </div>
                `;
            } else {
                return `
                    <div class="flex flex-col items-start space-y-1">
                        <div class="flex items-center gap-1.5 pl-1">
                            <span class="text-[10px] font-bold text-slate-700">${m.sender_name || 'Staff'}</span>
                            <span class="text-[9px] font-extrabold px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded">${m.sender_role || ''}</span>
                        </div>
                        <div class="max-w-[80%] bg-slate-100 text-slate-800 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs shadow-sm border border-slate-200 leading-relaxed break-words">
                            ${escapeHtml(m.message)}
                        </div>
                        <span class="text-[9px] text-slate-400 font-mono pl-1">${timeStr}</span>
                    </div>
                `;
            }
        }).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    async function sendChatMessage(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('agent-chat-input');
        if (!input || !activeChatContact) return;

        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.focus();

        const payload = {
            message: text,
            contactId: activeChatContact.id,
            channelType: activeChatContact.channelType,
            targetRole: activeChatContact.targetRole,
            userId: activeChatContact.userId
        };

        const res = await fetchApi('/api/chat/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res && res.success && res.data) {
            activeChatMessages.push(res.data);
            renderChatMessages();
        } else if (res && res.error) {
            alert(res.message || 'Message could not be delivered.');
        }
    }

    function startChatPolling() {
        stopChatPolling();
        chatPollTimer = setInterval(fetchChatMessages, 3000);
    }

    function stopChatPolling() {
        if (chatPollTimer) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
        }
    }

    function toggleChatFlyout() {
        const flyout = document.getElementById('agent-chat-flyout');
        const bellFlyout = document.getElementById('agent-bell-flyout');
        if (!flyout) return;

        // Close bell if open
        if (bellFlyout && !bellFlyout.classList.contains('hidden')) {
            bellFlyout.classList.add('hidden');
        }

        const isHidden = flyout.classList.contains('hidden');
        if (isHidden) {
            loadChatContacts();
            flyout.classList.remove('hidden');
            if (activeChatContact) startChatPolling();
        } else {
            flyout.classList.add('hidden');
            stopChatPolling();
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
            <!-- FLOATING BUTTONS CONTAINER -->
            <div id="agent-floating-actions-bar" class="fixed bottom-6 right-6 z-[99999] flex items-center gap-3 select-none" style="position: fixed !important; bottom: 24px !important; right: 24px !important; z-index: 99999 !important; display: flex !important; align-items: center !important; gap: 12px !important;">
                
                <!-- CHAT AGENT BUTTON -->
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

                <!-- NOTIFICATION AGENT BUTTON (BELL) -->
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

            <!-- NOTIFICATIONS FLYOUT PANEL -->
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

            <!-- CHAT SYSTEM FLYOUT PANEL -->
            <div id="agent-chat-flyout" class="hidden fixed bottom-24 right-6 z-[99999] w-[420px] max-w-[94vw] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-fade-in" style="position: fixed !important; bottom: 92px !important; right: 24px !important; z-index: 99999 !important;">
                
                <!-- DIRECTORY VIEW -->
                <div id="agent-chat-directory" class="flex flex-col h-full">
                    <div class="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">💬</span>
                            <div>
                                <h4 class="font-extrabold text-sm leading-tight">NKB Messenger</h4>
                                <p class="text-[10px] text-slate-400">Secure enterprise communications</p>
                            </div>
                        </div>
                        <button onclick="window.NKB_Agents.toggleChatFlyout()" class="w-7 h-7 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition">✕</button>
                    </div>

                    <div class="p-4 overflow-y-auto space-y-2 flex-1" id="agent-chat-contacts-list">
                        <!-- Contacts injected dynamically -->
                    </div>
                </div>

                <!-- ACTIVE CONVERSATION THREAD VIEW -->
                <div id="agent-chat-thread" class="hidden flex flex-col h-full">
                    <div class="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <button onclick="window.NKB_Agents.backToChatDirectory()" class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition">
                                ◀
                            </button>
                            <div class="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-base shrink-0" id="agent-chat-thread-avatar">
                                💬
                            </div>
                            <div class="min-w-0">
                                <div class="font-extrabold text-xs text-white truncate" id="agent-chat-thread-title">Conversation</div>
                                <div class="text-[10px] text-emerald-400 truncate flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                                    <span id="agent-chat-thread-sub">Online</span>
                                </div>
                            </div>
                        </div>
                        <button onclick="window.NKB_Agents.toggleChatFlyout()" class="w-7 h-7 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition">✕</button>
                    </div>

                    <!-- MESSAGES CONTAINER -->
                    <div class="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50/50" id="agent-chat-messages-container">
                        <!-- Messages injected dynamically -->
                    </div>

                    <!-- INPUT BAR -->
                    <form onsubmit="window.NKB_Agents.sendChatMessage(event)" class="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
                        <input type="text" id="agent-chat-input" placeholder="Type a message... (Press Enter)" required autocomplete="off"
                               class="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition">
                        <button type="submit" class="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-sm shadow transition">
                            ➤
                        </button>
                    </form>
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
        selectChatContact,
        backToChatDirectory,
        sendChatMessage,
        refreshPendingNotifications,
        refreshUnreadCount
    };

    // Auto-init on page load
    async function init() {
        const token = getAuthToken();
        const cachedUser = localStorage.getItem('nkb_user');
        // Only run if user is logged into portal (token or nkb_user in localStorage)
        if (!token && !cachedUser) return;

        // Mount widgets immediately so the buttons appear without any network delay!
        mountWidgets();

        // Resolve active user (from window.NKB.user, localStorage, or /api/auth/me)
        await loadCurrentUser();
        refreshPendingNotifications();
        refreshUnreadCount();

        // Periodic background poll for badge updates (every 30 seconds)
        setInterval(() => {
            if (activeUser) {
                refreshPendingNotifications();
                refreshUnreadCount();
            } else {
                loadCurrentUser().then(u => {
                    if (u) {
                        refreshPendingNotifications();
                        refreshUnreadCount();
                    }
                });
            }
        }, 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
