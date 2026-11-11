import "server-only";
/**
 * Pluggable delivery channels for notifications (email / WhatsApp). In-app notifications are written by
 * database triggers; this module forwards them externally when a provider is configured.
 * To enable: implement `send` for a provider (e.g. Resend for email, WhatsApp Cloud API) and set its env vars.
 */
export interface Channel { name: string; enabled(): boolean; send(to: { email?: string; phone?: string }, title: string, body: string, link?: string): Promise<void> }

export const channels: Channel[] = [
  { name: "email", enabled: () => !!process.env.EMAIL_PROVIDER_API_KEY, async send() { /* integrate provider here */ } },
  { name: "whatsapp", enabled: () => !!process.env.WHATSAPP_ACCESS_TOKEN, async send() { /* integrate WhatsApp Cloud API here */ } },
];

export async function dispatchPending(): Promise<number> {
  return channels.filter((c) => c.enabled()).length === 0 ? 0 : 0; // no provider configured yet
}
