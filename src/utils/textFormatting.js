/**
 * Escapes unsafe HTML characters
 * @param {string} unsafe - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Parses Discord custom emojis in text and replaces them with HTML image tags.
 * Also handles HTML escaping of the surrounding text.
 * @param {string} text - Raw text containing potential emoji codes like <:name:id>
 * @returns {string} HTML string with emojis rendered as images
 */
function formatTextWithEmojis(text) {
    if (!text) return '';
    
    // First, escape the HTML to ensure safety
    const safeText = escapeHtml(text);
    
    // Regex for custom emojis: <a:name:id> or <:name:id>
    // Matches encoded structure after HTML escaping: &lt;a:name:id&gt; or &lt;:name:id&gt;
    // Wait, escapeHtml turns '<' into '&lt;'.
    // So the regex needs to match the escaped version OR we process emojis first then escape?
    // No, if we process emojis first -> <img...> -> then escape -> &lt;img...&gt; (BROKEN)
    // If we escape first -> &lt;:name:id&gt; -> regex must match this.
    
    return safeText.replace(/&lt;(a)?:(\w+):(\d+)&gt;/g, (match, animated, name, id) => {
        const ext = animated ? 'gif' : 'png';
        const url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
        // On error, replace the image with the text representation :name:
        return `<img src="${url}" class="custom-emoji" draggable="false" alt=":${name}:" onerror="this.outerHTML=':${name}:'">`;
    });
}

module.exports = {
    escapeHtml,
    formatTextWithEmojis
};
