/**
 * Authentication Module
 * Handles signature verification, timestamp validation, and access key validation
 */

const crypto = require('crypto');

/**
 * Verify SHA512 signature for XiaoIce webhook
 * @param {string} body - Request body (raw JSON string)
 * @param {string} timestamp - Request timestamp (milliseconds)
 * @param {string} signature - SHA512 signature from request header
 * @param {string} key - Access key from request header
 * @param {Object} config - Configuration object
 * @param {string} config.accessKey - Expected access key
 * @param {string} config.secretKey - Secret key for signature
 * @param {number} config.timestampWindow - Valid timestamp window (ms)
 * @returns {boolean} True if authentication passes, false otherwise
 */
function verifySignature(body, timestamp, signature, key, config) {
  // Validate timestamp to prevent replay attacks
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    return false;
  }

  if (Math.abs(now - requestTime) > config.timestampWindow) {
    return false;
  }

  // Validate key matches config.accessKey
  if (key !== config.accessKey) {
    return false;
  }

  // Compute SHA512: SHA512Hash(RequestBody+SecretKey+TimeStamp)
  const message = body + config.secretKey + timestamp;
  const computed = crypto.createHash('sha512').update(message).digest('hex');

  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed.toLowerCase()),
      Buffer.from(signature.toLowerCase())
    );
  } catch (error) {
    return false;
  }
}

/**
 * Validate timestamp is within acceptable window
 * @param {string} timestamp - Timestamp to validate
 * @param {number} window - Valid window in milliseconds
 * @returns {boolean} True if valid, false otherwise
 */
function validateTimestamp(timestamp, window) {
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    return false;
  }

  return Math.abs(now - requestTime) <= window;
}

/**
 * Validate access key matches expected key
 * @param {string} key - Key to validate
 * @param {string} expectedKey - Expected key value
 * @returns {boolean} True if valid, false otherwise
 */
function validateAccessKey(key, expectedKey) {
  return key === expectedKey;
}

module.exports = {
  verifySignature,
  validateTimestamp,
  validateAccessKey
};
