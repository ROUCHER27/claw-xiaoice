/**
 * Tests for auth module
 */

const { verifySignature, validateTimestamp, validateAccessKey } = require('../src/auth');
const crypto = require('crypto');

describe('auth module', () => {
  const config = {
    accessKey: 'test-key',
    secretKey: 'test-secret',
    timestampWindow: 300000 // 5 minutes
  };

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = Date.now().toString();
      const message = body + config.secretKey + timestamp;
      const signature = crypto.createHash('sha512').update(message).digest('hex');

      const result = verifySignature(body, timestamp, signature, config.accessKey, config);

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = Date.now().toString();
      const signature = 'invalid_signature';

      const result = verifySignature(body, timestamp, signature, config.accessKey, config);

      expect(result).toBe(false);
    });

    it('should return false for wrong access key', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = Date.now().toString();
      const message = body + config.secretKey + timestamp;
      const signature = crypto.createHash('sha512').update(message).digest('hex');

      const result = verifySignature(body, timestamp, signature, 'wrong-key', config);

      expect(result).toBe(false);
    });

    it('should return false for expired timestamp', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = (Date.now() - 400000).toString(); // 400 seconds ago
      const message = body + config.secretKey + timestamp;
      const signature = crypto.createHash('sha512').update(message).digest('hex');

      const result = verifySignature(body, timestamp, signature, config.accessKey, config);

      expect(result).toBe(false);
    });

    it('should return false for invalid timestamp format', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = 'invalid';
      const signature = 'some_signature';

      const result = verifySignature(body, timestamp, signature, config.accessKey, config);

      expect(result).toBe(false);
    });

    it('should be case-insensitive for signature comparison', () => {
      const body = '{"askText":"test","sessionId":"test-123"}';
      const timestamp = Date.now().toString();
      const message = body + config.secretKey + timestamp;
      const signature = crypto.createHash('sha512').update(message).digest('hex').toUpperCase();

      const result = verifySignature(body, timestamp, signature, config.accessKey, config);

      expect(result).toBe(true);
    });
  });

  describe('validateTimestamp', () => {
    it('should return true for current timestamp', () => {
      const timestamp = Date.now().toString();
      const result = validateTimestamp(timestamp, 300000);

      expect(result).toBe(true);
    });

    it('should return false for expired timestamp', () => {
      const timestamp = (Date.now() - 400000).toString();
      const result = validateTimestamp(timestamp, 300000);

      expect(result).toBe(false);
    });

    it('should return false for future timestamp beyond window', () => {
      const timestamp = (Date.now() + 400000).toString();
      const result = validateTimestamp(timestamp, 300000);

      expect(result).toBe(false);
    });

    it('should return false for invalid timestamp format', () => {
      const result = validateTimestamp('invalid', 300000);

      expect(result).toBe(false);
    });
  });

  describe('validateAccessKey', () => {
    it('should return true for matching key', () => {
      const result = validateAccessKey('test-key', 'test-key');

      expect(result).toBe(true);
    });

    it('should return false for non-matching key', () => {
      const result = validateAccessKey('wrong-key', 'test-key');

      expect(result).toBe(false);
    });

    it('should return false for empty key', () => {
      const result = validateAccessKey('', 'test-key');

      expect(result).toBe(false);
    });
  });
});
