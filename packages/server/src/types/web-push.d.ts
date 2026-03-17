declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface RequestOptions {
    TTL?: number;
    headers?: Record<string, string>;
    timeout?: number;
  }

  interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  function generateVAPIDKeys(): VapidKeys;
  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  function sendNotification(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): Promise<SendResult>;

  export { generateVAPIDKeys, setVapidDetails, sendNotification, PushSubscription, RequestOptions, VapidKeys, SendResult };
  export default { generateVAPIDKeys, setVapidDetails, sendNotification };
}
