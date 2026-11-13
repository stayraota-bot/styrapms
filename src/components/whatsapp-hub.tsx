"use client";

import { useState } from "react";
import {
  MessageCircle, Users, Copy, Check, Send, Flame, Utensils,
  CreditCard, Sparkles, Clock, CheckCircle2, Share2, ExternalLink
} from "lucide-react";
import { Button, Card, CardHeader, CardBody, Badge } from "@/components/ui/core";
import { Modal, ModalClose } from "@/components/ui/forms";
import { toast } from "sonner";
import { fdate, daysBetween } from "@/lib/format";
import type { ActionState } from "@/lib/action";

export type WhatsAppLeadData = {
  id: string;
  lead_code: string;
  guest_name: string;
  guest_phone: string;
  guest_whatsapp?: string | null;
  guest_email?: string | null;
  guest_city?: string | null;
  source: string;
  source_detail?: string | null;
  status: string;
  temperature: string;
  prop_name?: string | null;
  unit_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  adults?: number;
  children?: number;
  rooms_needed?: number;
  budget?: string | number | null;
  quoted_amount?: string | number | null;
  special_requests?: string | null;
  notes?: string | null;
  booking_code?: string | null;
};

const cleanDigits = (p?: string | null) => {
  if (!p) return "";
  const d = p.replace(/[^\d]/g, "").replace(/^0+/, "");
  return d.length === 10 ? `91${d}` : d;
};

export function buildGroupDispatchMessage(lead: WhatsAppLeadData, appUrl = ""): string {
  const nights = lead.check_in && lead.check_out ? daysBetween(lead.check_in, lead.check_out) : 0;
  const pax = `${lead.adults || 2} Adults${lead.children ? `, ${lead.children} Kids` : ""}`;
  const stay = lead.check_in ? `${fdate(lead.check_in, false)} → ${fdate(lead.check_out, false)} (${nights}N, ${pax})` : "Dates Flexible";
  const quote = lead.quoted_amount ? `₹${Number(lead.quoted_amount).toLocaleString("en-IN")}` : lead.budget ? `Budget ₹${Number(lead.budget).toLocaleString("en-IN")}` : "To be Quoted";
  const pmsLink = appUrl ? `${appUrl}/leads/${lead.id}` : `https://styrapms-aljp.vercel.app/leads/${lead.id}`;

  return `🚨 *NEW INQUIRY ALERT — STAYRA PMS* 🚨
━━━━━━━━━━━━━━━━━━━━
👤 *Guest Name:* ${lead.guest_name}
📞 *Phone / WA:* ${lead.guest_phone}${lead.guest_city ? ` (${lead.guest_city})` : ""}
🏨 *Property:* ${lead.prop_name || "Any / Undecided"}${lead.unit_name ? ` · ${lead.unit_name}` : ""}
🗓 *Stay:* ${stay}
💰 *Quote / Budget:* ${quote}
🎯 *Source:* ${lead.source.toUpperCase()}${lead.source_detail ? ` (${lead.source_detail})` : ""}
🔥 *Priority:* ${lead.temperature.toUpperCase()}
${lead.special_requests ? `📝 *Requests:* ${lead.special_requests}\n` : ""}${lead.notes ? `💬 *Notes:* ${lead.notes}\n` : ""}━━━━━━━━━━━━━━━━━━━━
👉 *Open in STAYRA PMS:*
${pmsLink}`;
}

export function buildInquiryQuoteMessage(lead: WhatsAppLeadData): string {
  const nights = lead.check_in && lead.check_out ? daysBetween(lead.check_in, lead.check_out) : 0;
  const stay = lead.check_in ? `${fdate(lead.check_in, false)} to ${fdate(lead.check_out, false)} (${nights} Night${nights > 1 ? "s" : ""})` : "Flexible dates";
  const pax = `${lead.adults || 2} Adults${lead.children ? `, ${lead.children} Children` : ""}`;
  const quote = lead.quoted_amount ? `₹${Number(lead.quoted_amount).toLocaleString("en-IN")} + GST` : "as discussed";

  return `Namaste *${lead.guest_name} ji*, warm greetings from *STAYRA Hospitality*! 🌿

Thank you for contacting us regarding your stay inquiry. Here are your tentative stay details:

🏡 *Property:* ${lead.prop_name || "STAYRA Luxury Stays"}
🗓 *Dates:* ${stay}
👥 *Guests:* ${pax}
🛏 *Room / Unit:* ${lead.unit_name || "Selected Suite / Villa"}
💵 *Special Quoted Tariff:* ${quote}

✨ *Included with your stay:*
• High-speed Wi-Fi & 100% power backup
• 24x7 on-site caretaker assistance
• Complimentary tea/coffee & toiletries
• Access to all property amenities (lawn, pool, outdoor sit-out)

Would you like us to block these dates for you? Let us know if you have any questions or customization requests.

Warm regards,
*STAYRA Reservations Desk*
📞 +91 98200 10000 | 🌐 stayra.in`;
}

export function buildFollowUpGentleMessage(lead: WhatsAppLeadData): string {
  const stay = lead.check_in ? `for *${fdate(lead.check_in, false)} to ${fdate(lead.check_out, false)}*` : "for your upcoming holiday";
  return `Hi *${lead.guest_name} ji*, greetings from STAYRA! 😊

Just following up to check if you had a chance to review the quotation we shared ${stay} at *${lead.prop_name || "STAYRA"}*.

We have received a couple of other inquiries for these same dates. Please let us know if your travel plans are finalized so we can hold the room for you!

Looking forward to hosting you,
*STAYRA Team*`;
}

export function buildFollowUpUrgencyMessage(lead: WhatsAppLeadData): string {
  const quote = lead.quoted_amount ? `₹${Number(lead.quoted_amount).toLocaleString("en-IN")}` : "your special tariff";
  return `Hi *${lead.guest_name} ji*, hope you are having a wonderful day!

The dates *${fdate(lead.check_in, false)}* at *${lead.prop_name || "STAYRA"}* are seeing heavy weekend demand.

🎁 *Exclusive Confirmation Privilege:*
If you confirm your stay today at ${quote}, we would be happy to include a *complimentary evening bonfire setup* + *early check-in privilege* (subject to availability).

Shall I share our official UPI payment details to block the reservation?

Best regards,
*STAYRA Reservations*`;
}

export function buildAdvancePaymentMessage(lead: WhatsAppLeadData): string {
  const total = Number(lead.quoted_amount || lead.budget || 0);
  const advance = Math.round(total * 0.5);
  const advText = advance > 0 ? `50% advance payment of *₹${advance.toLocaleString("en-IN")}*` : "the token advance payment";

  return `Dear *${lead.guest_name} ji*, thank you for choosing *STAYRA*! 🏡

To confirm and guarantee your reservation at *${lead.prop_name || "STAYRA"}*, kindly transfer ${advText} using the details below:

📲 *UPI ID:* stayra@hdfcbank
🏦 *Beneficiary Name:* STAYRA Hospitality Pvt Ltd
🏦 *Account No:* 50100234567890
🏦 *IFSC Code:* HDFC0000123 (HDFC Bank)

Once the transfer is completed, please reply with a screenshot here. We will immediately issue your official booking confirmation voucher!

Thank you,
*STAYRA Accounts & Reservations*`;
}

export function buildUpsellBbqMessage(lead: WhatsAppLeadData): string {
  return `Hi *${lead.guest_name} ji*, we are preparing for your upcoming stay at *${lead.prop_name || "STAYRA"}*! 🔥🍢

Would you like us to arrange our signature *Live Charcoal Barbecue & Bonfire Experience* during your stay?

✨ *Includes:*
• Freshly marinated veg skewers (Paneer Tikka, Veg Kebabs, Corn) & non-veg skewers
• Live charcoal grill setup on the lawn
• Ambient bonfire seating under the stars
• Personal chef assistance

Special guest price: *₹1,200 per person*. Please let us know in advance so our chef can source the freshest local ingredients!

Warm regards,
*STAYRA Experiences Team*`;
}

export function buildUpsellMealsMessage(lead: WhatsAppLeadData): string {
  return `Hi *${lead.guest_name} ji*, hope you are excited about your getaway at *${lead.prop_name || "STAYRA"}*! 👨‍🍳🥗

To make your vacation 100% stress-free, we offer customized *Home-Style Chef & Butler Packages*:
• Fresh, hot, made-to-order Maharashtrian & North Indian homestyle cooking
• Tailored spice levels, kids meals & strict Jain food preparation options
• Authentic local delicacies, evening snacks & fresh morning breakfasts

Would you like us to share our customized meal plan menu and packages?

Warm regards,
*STAYRA Concierge Desk*`;
}

export function buildBookingConfirmedMessage(lead: WhatsAppLeadData): string {
  const code = lead.booking_code || "Confirmed";
  return `🎉 *BOOKING CONFIRMED — STAYRA HOSPITALITY* 🎉
━━━━━━━━━━━━━━━━━━━━
Dear *${lead.guest_name} ji*, we are delighted to confirm your reservation!

🔖 *Booking Reference:* ${code}
🏡 *Property:* ${lead.prop_name || "STAYRA Luxury Retreat"}
🛏 *Unit / Villa:* ${lead.unit_name || "Confirmed Unit"}
🗓 *Check-in Date:* ${fdate(lead.check_in)} (From 2:00 PM)
🗓 *Check-out Date:* ${fdate(lead.check_out)} (By 11:00 AM)
📍 *Google Maps Directions:* https://maps.google.com/?q=${encodeURIComponent(lead.prop_name || "STAYRA")}

📞 *On-site Property Manager:* +91 98200 10000

Please feel free to message us here for any pre-arrival assistance or special dietary requests. We look forward to welcoming you!

Warm regards,
*STAYRA Guest Relations*`;
}

export function WhatsAppHubModal({
  lead,
  logActivityAction,
  trigger,
}: {
  lead: WhatsAppLeadData;
  logActivityAction?: (s: ActionState, fd: FormData) => Promise<ActionState>;
  trigger?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<
    "group" | "quote" | "followup_gentle" | "followup_urgent" | "payment" | "upsell_bbq" | "upsell_meals" | "confirmed"
  >("group");
  const [copied, setCopied] = useState(false);

  const phoneDigits = cleanDigits(lead.guest_whatsapp || lead.guest_phone);

  const templates: Record<string, { title: string; category: string; icon: React.ReactNode; text: string; isGroup?: boolean }> = {
    group: {
      title: "🚨 Team Group Alert",
      category: "Internal Group",
      icon: <Users className="size-4 text-emerald-600" />,
      text: buildGroupDispatchMessage(lead),
      isGroup: true,
    },
    quote: {
      title: "💬 Inquiry Quote & Greeting",
      category: "Customer Outreach",
      icon: <MessageCircle className="size-4 text-brand-700" />,
      text: buildInquiryQuoteMessage(lead),
    },
    followup_gentle: {
      title: "⏰ Follow-up Nudge (Gentle)",
      category: "Follow-up",
      icon: <Clock className="size-4 text-amber-600" />,
      text: buildFollowUpGentleMessage(lead),
    },
    followup_urgent: {
      title: "🔥 High Demand / Special Offer",
      category: "Follow-up",
      icon: <Flame className="size-4 text-red-600" />,
      text: buildFollowUpUrgencyMessage(lead),
    },
    payment: {
      title: "💳 50% Advance UPI Payment Request",
      category: "Payment",
      icon: <CreditCard className="size-4 text-blue-600" />,
      text: buildAdvancePaymentMessage(lead),
    },
    upsell_bbq: {
      title: "🍢 BBQ & Bonfire Experience",
      category: "Upselling",
      icon: <Flame className="size-4 text-orange-600" />,
      text: buildUpsellBbqMessage(lead),
    },
    upsell_meals: {
      title: "👨‍🍳 Chef & Meal Plan Package",
      category: "Upselling",
      icon: <Utensils className="size-4 text-emerald-600" />,
      text: buildUpsellMealsMessage(lead),
    },
    confirmed: {
      title: "🎉 Booking Confirmation Voucher",
      category: "Confirmation",
      icon: <CheckCircle2 className="size-4 text-green-700" />,
      text: buildBookingConfirmedMessage(lead),
    },
  };

  const current = templates[activeTab];

  const handleCopy = () => {
    navigator.clipboard.writeText(current.text);
    setCopied(true);
    toast.success("WhatsApp message copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getSendHref = () => {
    const encoded = encodeURIComponent(current.text);
    if (current.isGroup) {
      // Allows user to pick their Team WhatsApp Group or any group chat directly!
      return `https://api.whatsapp.com/send?text=${encoded}`;
    }
    // Direct chat to guest
    return `https://wa.me/${phoneDigits}?text=${encoded}`;
  };

  return (
    <Modal
      wide
      title="WhatsApp Sales & Team Communication Hub"
      description={`Instant WhatsApp dispatch for ${lead.guest_name} (${lead.lead_code}). Send to your common team group or send follow-ups and upselling messages directly to the guest.`}
      trigger={
        trigger ?? (
          <Button type="button" variant="soft" className="text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
            <MessageCircle className="size-4 text-emerald-700" />WhatsApp Hub
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {/* Navigation Categories */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100/80 rounded-xl">
          {Object.entries(templates).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === key
                  ? "bg-white text-ink shadow-sm ring-1 ring-black/5"
                  : "text-muted hover:text-ink hover:bg-white/50"
              }`}
            >
              {item.icon}
              <span>{item.title.split(" ")[1] || item.title}</span>
            </button>
          ))}
        </div>

        {/* Message Preview Box */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-ink">{current.title}</span>
              <Badge tone={current.isGroup ? "green" : "blue"}>{current.category}</Badge>
            </div>
            <div className="text-xs text-muted">
              {current.isGroup ? (
                <span>Destination: <strong>Choose Team WhatsApp Group</strong></span>
              ) : (
                <span>Sending to: <strong>{lead.guest_phone}</strong></span>
              )}
            </div>
          </div>

          <pre className="p-3.5 rounded-lg bg-white border border-line text-xs font-sans text-ink whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto scrollbar-thin">
            {current.text}
          </pre>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? "Copied!" : "Copy Text"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={getSendHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  toast.success(current.isGroup ? "Opening WhatsApp to select your Team Group..." : "Opening WhatsApp Chat with guest...");
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 h-9 text-xs font-semibold text-white shadow-sm transition ${
                  current.isGroup
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {current.isGroup ? <Share2 className="size-4" /> : <Send className="size-4" />}
                {current.isGroup ? "Post to WhatsApp Team Group" : "Send to Customer on WhatsApp"}
                <ExternalLink className="size-3 ml-0.5 opacity-80" />
              </a>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-muted bg-gray-50 p-2.5 rounded-lg border border-line flex items-center justify-between">
          <span>💡 <strong>Tip:</strong> Clicking <em>Post to WhatsApp Team Group</em> opens WhatsApp and lets you forward the lead card directly into your existing staff group.</span>
          <ModalClose><Button size="sm" variant="ghost">Close</Button></ModalClose>
        </div>
      </div>
    </Modal>
  );
}

export function QuickWhatsAppGroupButton({
  lead,
}: {
  lead: WhatsAppLeadData;
}) {
  const text = encodeURIComponent(buildGroupDispatchMessage(lead));
  const href = `https://api.whatsapp.com/send?text=${text}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
      title="Post lead card to your common WhatsApp Team Group"
    >
      <Users className="size-3.5 text-emerald-700" />
      <span>Share to Group</span>
    </a>
  );
}
