import "server-only";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { fdate, fdatetime, inr, titleCase } from "@/lib/format";
import { ITEM_LABEL, ITEM_ORDER, type LoadedSettlement } from "./settlements";

const dir = path.join(process.cwd(), "src/assets/fonts");
Font.register({ family: "Inter", fonts: [{ src: path.join(dir, "Inter-400.ttf") }, { src: path.join(dir, "Inter-600.ttf"), fontWeight: 600 }, { src: path.join(dir, "Inter-700.ttf"), fontWeight: 700 }] });
Font.registerHyphenationCallback((w) => [w]);

const G = "#163c2d", M = "#66736d", L = "#e5e8e6";
const st = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9, color: "#17221d", padding: 36, paddingBottom: 54 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: G, paddingBottom: 12, marginBottom: 14 },
  brand: { fontSize: 18, fontWeight: 700, color: G, letterSpacing: 3 },
  h2: { fontSize: 12, fontWeight: 600, marginBottom: 2 },
  muted: { color: M }, small: { fontSize: 8 },
  grid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  box: { flex: 1, borderWidth: 1, borderColor: L, borderRadius: 6, padding: 10 },
  label: { fontSize: 7.5, color: M, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4.5, borderBottomWidth: 0.5, borderBottomColor: L },
  strong: { fontWeight: 600 },
  total: { flexDirection: "row", justifyContent: "space-between", padding: 8, backgroundColor: G, color: "white", borderRadius: 4, marginTop: 6, fontWeight: 700, fontSize: 11 },
  band: { flexDirection: "row", justifyContent: "space-between", padding: 6, backgroundColor: "#eef5f1", fontWeight: 600 },
  tHead: { flexDirection: "row", backgroundColor: "#f3f5f4", paddingVertical: 4, paddingHorizontal: 4, fontSize: 7.5, color: M, fontWeight: 600 },
  tRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: L, fontSize: 7.5 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: M },
});

export function StatementPDF({ d }: { d: LoadedSettlement }) {
  const { s, items, payments, company } = d;
  const line = (n: string, k: string, v: unknown, o: { bold?: boolean; neg?: boolean } = {}) => (
    <View style={st.row}><Text style={o.bold ? st.strong : undefined}>{n}  {k}</Text><Text style={o.bold ? st.strong : undefined}>{o.neg ? "− " : ""}{inr(v)}</Text></View>);
  const groups = ITEM_ORDER.map((t) => ({ t, rows: items.filter((i) => i.item_type === t && i.is_active) })).filter((g) => g.rows.length);
  return (
    <Document title={`${s.settlement_code} — Owner Settlement Statement`} author={company.name} subject={`${s.prop} ${s.period_start} to ${s.period_end}`}>
      <Page size="A4" style={st.page}>
        <View style={st.head}>
          <View><Text style={st.brand}>STAYRA</Text><Text style={[st.muted, st.small]}>{company.legal_name ?? company.name}</Text>
            {company.gstin ? <Text style={[st.muted, st.small]}>GSTIN {company.gstin}</Text> : null}<Text style={[st.muted, st.small]}>{company.email ?? ""}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text style={st.h2}>Owner Settlement Statement</Text><Text>{s.settlement_code}</Text>
            <Text style={[st.muted, st.small]}>Status: {titleCase(s.status)}{s.approved_at ? ` · approved ${fdate(s.approved_at)}` : ""}</Text></View>
        </View>
        {!["approved", "partially_paid", "paid"].includes(s.status) && <Text style={{ color: "#b45309", marginBottom: 8, fontWeight: 600 }}>DRAFT — not approved. Figures may change.</Text>}
        <View style={st.grid}>
          <View style={st.box}><Text style={st.label}>1. Owner</Text><Text style={st.strong}>{s.owner}</Text><Text style={st.muted}>{s.owner_code}{s.pan ? ` · PAN ${s.pan}` : ""}</Text>
            <Text style={st.muted}>{[s.owner_phone, s.owner_email].filter(Boolean).join(" · ")}</Text>
            {s.bank_account_name ? <Text style={st.muted}>Bank: {s.bank_account_name} · {s.bank_account_number} · {s.bank_ifsc}</Text> : null}</View>
          <View style={st.box}><Text style={st.label}>2. Property</Text><Text style={st.strong}>{s.prop}</Text><Text style={st.muted}>{s.property_code} · {[s.city, s.state].filter(Boolean).join(", ")}</Text>
            <Text style={[st.label, { marginTop: 6 }]}>3. Settlement period</Text><Text>{fdate(s.period_start)} – {fdate(s.period_end)}{s.booking_code ? ` · Booking ${s.booking_code}` : ""}</Text></View>
        </View>
        <View style={{ marginBottom: 14 }}>
          {line("4.", "Booking revenue (completed stays, net of discount, excl. GST)", s.booking_revenue)}
          {line("5.", "Additional income (incl. adjustments)", Number(s.additional_income) + Number(s.revenue_adjustments))}
          <View style={st.band}><Text>Total eligible revenue</Text><Text>{inr(s.gross_revenue)}</Text></View>
          {line("6.", "Deductible expenses (incl. OTA commission & adjustments)", Number(s.deductible_expenses) + Number(s.expense_adjustments), { neg: true })}
          <View style={st.band}><Text>7.  Net distributable revenue</Text><Text>{inr(s.net_distributable)}</Text></View>
          <View style={st.row}><Text>8.  Sharing percentages (agreement v{s.agreement_version})</Text><Text>STAYRA {Number(s.stayra_pct)}% / Owner {Number(s.owner_pct)}%</Text></View>
          {line("9.", `STAYRA share (${Number(s.stayra_pct)}%)`, s.stayra_share)}
          {line("10.", `Owner share (${Number(s.owner_pct)}%)`, s.owner_share, { bold: true })}
          {Number(s.owner_borne_recoveries) > 0 && line("", "Less: owner-borne costs paid by STAYRA", s.owner_borne_recoveries, { neg: true })}
          {line("11.", "Previous outstanding", s.previous_outstanding)}
          {line("12.", "Payments made against this statement", s.payments_made, { neg: true })}
          <View style={st.total}><Text>13.  Final payable to owner</Text><Text>{inr(s.final_payable)}</Text></View>
          <Text style={[st.muted, st.small, { marginTop: 6 }]}>Cash collected in period {inr(s.cash_collected)} · GST collected (pass-through) {inr(s.gst_collected)} · Unpaid bills excluded {inr(s.unpaid_expenses_excluded)}. Profit entitlement may differ from cash available.</Text>
        </View>
        {payments.length > 0 && <View style={{ marginBottom: 14 }} wrap={false}>
          <Text style={[st.h2, { fontSize: 10 }]}>Payments</Text>
          <View style={st.tHead}><Text style={{ width: 70 }}>Date</Text><Text style={{ width: 90 }}>Method</Text><Text style={{ flex: 1 }}>Reference</Text><Text style={{ width: 80, textAlign: "right" }}>Amount</Text></View>
          {payments.map((p) => <View key={p.id} style={st.tRow}><Text style={{ width: 70 }}>{fdate(p.paid_on)}</Text><Text style={{ width: 90 }}>{titleCase(p.method)}</Text><Text style={{ flex: 1 }}>{p.reference ?? "—"}</Text><Text style={{ width: 80, textAlign: "right" }}>{inr(p.amount)}</Text></View>)}
        </View>}
        <Text style={[st.h2, { fontSize: 10 }]} break={items.length > 25}>Line items</Text>
        {groups.map((g) => (
          <View key={g.t} style={{ marginBottom: 8 }}>
            <View style={st.tHead}><Text style={{ flex: 1 }}>{ITEM_LABEL[g.t]} ({g.rows.length})</Text><Text style={{ width: 80, textAlign: "right" }}>{inr(g.rows.reduce((a, r) => a + Number(r.amount), 0))}</Text></View>
            {g.rows.map((r) => <View key={r.id} style={st.tRow} wrap={false}><Text style={{ width: 62 }}>{fdate(r.item_date)}</Text><Text style={{ flex: 1 }}>{r.description}</Text><Text style={{ width: 80, textAlign: "right" }}>{inr(r.amount)}</Text></View>)}
          </View>))}
        <View style={st.footer} fixed><Text>{s.settlement_code} · Generated {fdatetime(new Date())} IST · Amounts in INR</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}
