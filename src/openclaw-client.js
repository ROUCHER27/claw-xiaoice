/**
 * OpenClaw Client Module
 * Handles communication with OpenClaw CLI
 */

const { spawn } = require('child_process');

/**
 * OpenClaw Client Class
 * Manages OpenClaw CLI process lifecycle and communication
 */
class OpenClawClient {
  /**
   * Create OpenClaw client
   * @param {Object} config - Configuration object
   * @param {number} config.timeout - Timeout in milliseconds
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Send message to OpenClaw
   * @param {Object} payload - Message payload
   * @param {string} payload.sessionId - Session ID
   * @param {string} payload.askText - Message text
   * @param {Object} options - Options
   * @param {boolean} options.streaming - Enable streaming mode
   * @param {Function} options.streamCallback - Callback for streaming chunks
   * @returns {Promise<Object>} Response object with ok and response properties
   */
  async sendMessage(payload, options = {}) {
    const { streaming = false, streamCallback = null } = options;

    return new Promise((resolve, reject) => {
      const { sessionId, askText } = payload;
      let settled = false;
      let timeoutHandle = null;
      let forceKillHandle = null;

      // Build OpenClaw agent command
      const args = [
        'agent',
        '--channel', 'xiaoice',
        '--to', sessionId || 'default',
        '--message', askText || '',
        '--thinking', 'low',
        '--json'
      ];

      const openclaw = spawn('openclaw', args, {
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      // Cleanup function
      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        if (forceKillHandle) {
          clearTimeout(forceKillHandle);
          forceKillHandle = null;
        }
        openclaw.stdout.removeAllListeners();
        openclaw.stderr.removeAllListeners();
        openclaw.removeAllListeners();
      };

      // Set timeout
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;

        try {
          openclaw.kill('SIGTERM');
        } catch (error) {
          // Ignore kill race errors.
        }

        // If process ignores SIGTERM, force-kill shortly after.
        forceKillHandle = setTimeout(() => {
          try {
            openclaw.kill('SIGKILL');
          } catch (error) {
            // Ignore kill race errors.
          }
        }, 1500);

        reject(new Error('TIMEOUT'));
      }, this.config.timeout);

      openclaw.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Stream chunks if in streaming mode
        if (streaming && streamCallback) {
          streamCallback(chunk);
        }
      });

      openclaw.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      openclaw.on('close', (code) => {
        cleanup();
        if (settled) return;
        settled = true;

        if (code === 0) {
          resolve({ ok: true, response: stdout });
        } else {
          reject(new Error(`OpenClaw exited with code ${code}: ${stderr}`));
        }
      });

      openclaw.on('error', (error) => {
        cleanup();
        if (settled) return;
        settled = true;
        reject(error);
      });
    });
  }

  /**
   * Send streaming message to OpenClaw
   * @param {Object} payload - Message payload
   * @param {Function} streamCallback - Callback for streaming chunks
   * @returns {Promise<Object>} Response object
   */
  async sendStreamingMessage(payload, streamCallback) {
    return this.sendMessage(payload, {
      streaming: true,
      streamCallback
    });
  }
}

module.exports = OpenClawClient;
