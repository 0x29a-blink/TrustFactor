/**
 * Discord Snowflake ID helpers
 */

/**
 * Convert any ID-like value to a safe string to avoid JS precision loss
 * @param {string|number|bigint|null|undefined} value
 * @returns {string|null} string value or null
 */
function toIdString(value) {
  if (value === null || value === undefined) return null;
  // Prevent scientific notation or precision loss
  return String(value);
}

/**
 * Convenience to cast a column as text in SQL select
 * Usage: select(`${asText('server_id')}, ${asText('user_id')}`)
 * @param {string} column
 * @returns {string}
 */
function asText(column) {
  return `${column}::text`;
}

module.exports = {
  toIdString,
  asText,
};


