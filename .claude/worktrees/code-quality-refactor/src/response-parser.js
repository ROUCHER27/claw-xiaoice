/**
 * Response Parser Module
 * Handles parsing and extracting text from OpenClaw responses
 */

/**
 * Extract reply text from OpenClaw stdout
 * Supports both new format (result.payloads) and old format (response.text)
 * @param {string} stdout - Raw stdout from OpenClaw CLI
 * @returns {string} Extracted reply text, or empty string if not found
 */
function extractReplyText(stdout) {
  try {
    const lines = stdout.trim().split('\n');

    // Try to parse each line as JSON
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const lineJson = JSON.parse(line);

        // New format: result.payloads[0].text
        if (lineJson.result && lineJson.result.payloads && Array.isArray(lineJson.result.payloads)) {
          const firstPayload = lineJson.result.payloads[0];
          if (firstPayload && firstPayload.text) {
            return firstPayload.text;
          }
        }

        // Old format: response.text
        if (lineJson.response && lineJson.response.text) {
          return lineJson.response.text;
        }
      } catch (e) {
        // Skip non-JSON lines
        continue;
      }
    }

    // Could not extract text
    return '';
  } catch (error) {
    return '';
  }
}

/**
 * Parse OpenClaw response and extract metadata
 * @param {string} stdout - Raw stdout from OpenClaw CLI
 * @returns {Object} Parsed response with text and metadata
 */
function parseOpenClawResponse(stdout) {
  try {
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const lineJson = JSON.parse(line);

        // New format
        if (lineJson.result) {
          return {
            text: extractReplyText(stdout),
            status: lineJson.status || 'ok',
            meta: lineJson.result.meta || {}
          };
        }

        // Old format
        if (lineJson.response) {
          return {
            text: lineJson.response.text || '',
            status: 'ok',
            meta: {}
          };
        }
      } catch (e) {
        continue;
      }
    }

    return {
      text: '',
      status: 'error',
      meta: {}
    };
  } catch (error) {
    return {
      text: '',
      status: 'error',
      meta: {}
    };
  }
}

module.exports = {
  extractReplyText,
  parseOpenClawResponse
};
