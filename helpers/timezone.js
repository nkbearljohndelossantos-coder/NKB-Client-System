/**
 * NKB Manufacturing & Trading
 * Centralized Timezone Utilities: Philippine Standard Time (Asia/Manila, UTC+8)
 */

const MANILA_TZ = 'Asia/Manila';

/**
 * Get current date or formatted date string in YYYY-MM-DD (Asia/Manila)
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} YYYY-MM-DD
 */
function getManilaDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
    return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(d);
}

/**
 * Get current date-time string in YYYY-MM-DD HH:MM:SS (Asia/Manila)
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} YYYY-MM-DD HH:MM:SS
 */
function getManilaDateTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return getManilaDateTime(new Date());

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MANILA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(d);

    const m = {};
    for (const p of parts) {
        m[p.type] = p.value;
    }
    return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
}

/**
 * Get ISO-like timestamp with explicit Philippine UTC+08:00 offset
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} YYYY-MM-DDTHH:MM:SS+08:00
 */
function getManilaISOString(date = new Date()) {
    const dt = getManilaDateTime(date);
    return `${dt.replace(' ', 'T')}+08:00`;
}

/**
 * Get current calendar year in Asia/Manila
 * @param {Date|string|number} [date=new Date()]
 * @returns {number}
 */
function getManilaYear(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const dateStr = getManilaDate(d);
    return parseInt(dateStr.split('-')[0], 10) || new Date().getFullYear();
}

module.exports = {
    MANILA_TZ,
    getManilaDate,
    getManilaDateTime,
    getManilaISOString,
    getManilaYear
};
