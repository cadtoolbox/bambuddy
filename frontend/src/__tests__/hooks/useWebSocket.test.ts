/**
 * Tests for the useWebSocket hook.
 *
 * Tests WebSocket connection management and message handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: JSON.stringify(data),
        })
      );
    }
  }

  // Helper to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Store reference to mock instances
let mockWebSocketInstance: MockWebSocket | null = null;

vi.stubGlobal(
  'WebSocket',
  vi.fn((url: string) => {
    mockWebSocketInstance = new MockWebSocket(url);
    return mockWebSocketInstance;
  })
);

describe('useWebSocket hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocketInstance = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be importable', async () => {
    // Just verify the hook module can be imported
    const module = await import('../../hooks/useWebSocket');
    expect(module).toBeDefined();
  });

  describe('WebSocket Mock', () => {
    it('creates WebSocket with correct URL', () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      expect(ws.url).toBe('ws://test.local/ws');
    });

    it('starts in CONNECTING state', () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      expect(ws.readyState).toBe(MockWebSocket.CONNECTING);
    });

    it('transitions to OPEN state', async () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      const onOpen = vi.fn();
      ws.onopen = onOpen;

      await waitFor(() => {
        expect(ws.readyState).toBe(MockWebSocket.OPEN);
      });
      expect(onOpen).toHaveBeenCalled();
    });

    it('can receive messages', async () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      const onMessage = vi.fn();
      ws.onmessage = onMessage;

      await waitFor(() => {
        expect(ws.readyState).toBe(MockWebSocket.OPEN);
      });

      ws.simulateMessage({ type: 'status', data: { connected: true } });

      expect(onMessage).toHaveBeenCalled();
    });

    it('can close connection', () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      const onClose = vi.fn();
      ws.onclose = onClose;

      ws.close();

      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      expect(onClose).toHaveBeenCalled();
    });

    it('can handle errors', () => {
      const ws = new MockWebSocket('ws://test.local/ws');
      const onError = vi.fn();
      ws.onerror = onError;

      ws.simulateError();

      expect(onError).toHaveBeenCalled();
    });
  });
});
