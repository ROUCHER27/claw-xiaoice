/**
 * Tests for response-parser module
 */

const { extractReplyText, parseOpenClawResponse } = require('../src/response-parser');

describe('response-parser module', () => {
  describe('extractReplyText', () => {
    it('should extract text from new format (result.payloads)', () => {
      const stdout = JSON.stringify({
        result: {
          payloads: [
            { text: 'Hello, this is the response!' }
          ]
        }
      });

      const result = extractReplyText(stdout);

      expect(result).toBe('Hello, this is the response!');
    });

    it('should extract text from old format (response.text)', () => {
      const stdout = JSON.stringify({
        response: {
          text: 'Hello from old format!'
        }
      });

      const result = extractReplyText(stdout);

      expect(result).toBe('Hello from old format!');
    });

    it('should handle multi-line JSON output', () => {
      const stdout = `
{"status":"processing"}
{"result":{"payloads":[{"text":"Final response"}]}}
{"meta":"additional"}
      `.trim();

      const result = extractReplyText(stdout);

      expect(result).toBe('Final response');
    });

    it('should return empty string for invalid JSON', () => {
      const stdout = 'not valid json';

      const result = extractReplyText(stdout);

      expect(result).toBe('');
    });

    it('should return empty string when no text found', () => {
      const stdout = JSON.stringify({
        result: {
          payloads: []
        }
      });

      const result = extractReplyText(stdout);

      expect(result).toBe('');
    });

    it('should skip non-JSON lines', () => {
      const stdout = `
Some debug output
{"result":{"payloads":[{"text":"Response text"}]}}
More debug output
      `.trim();

      const result = extractReplyText(stdout);

      expect(result).toBe('Response text');
    });

    it('should handle empty stdout', () => {
      const result = extractReplyText('');

      expect(result).toBe('');
    });
  });

  describe('parseOpenClawResponse', () => {
    it('should parse new format response', () => {
      const stdout = JSON.stringify({
        status: 'ok',
        result: {
          payloads: [{ text: 'Response text' }],
          meta: { model: 'claude-sonnet-4-6' }
        }
      });

      const result = parseOpenClawResponse(stdout);

      expect(result).toEqual({
        text: 'Response text',
        status: 'ok',
        meta: { model: 'claude-sonnet-4-6' }
      });
    });

    it('should parse old format response', () => {
      const stdout = JSON.stringify({
        response: {
          text: 'Old format text'
        }
      });

      const result = parseOpenClawResponse(stdout);

      expect(result).toEqual({
        text: 'Old format text',
        status: 'ok',
        meta: {}
      });
    });

    it('should return error status for invalid JSON', () => {
      const stdout = 'invalid json';

      const result = parseOpenClawResponse(stdout);

      expect(result).toEqual({
        text: '',
        status: 'error',
        meta: {}
      });
    });

    it('should handle empty response', () => {
      const result = parseOpenClawResponse('');

      expect(result).toEqual({
        text: '',
        status: 'error',
        meta: {}
      });
    });
  });
});
