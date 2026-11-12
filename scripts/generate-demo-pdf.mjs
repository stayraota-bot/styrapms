import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const imgBase = path.resolve("docs/screenshots");
function toBase64(filename) {
  try {
    const f = path.join(imgBase, filename);
    const b = readFileSync(f);
    return `data:image/png;base64,${b.toString("base64")}`;
  } catch (e) {
    return "";
  }
}

const shotDashboard = toBase64("01-dashboard.png");
const shotProperties = toBase64("02-properties.png");
const shotBookings = toBase64("04-bookings.png");
const shotCalendar = toBase64("05-booking-calendar.png");
const shotBookingDetails = toBase64("06-booking-details.png");
const shotIncome = toBase64("07-income.png");
const shotExpenses = toBase64("08-expenses.png");
const shotRevShare = toBase64("09-revenue-sharing.png");
const shotSettlement = toBase64("10-owner-settlement.png");
const shotReports = toBase64("11-reports.png");
const shotUsers = toBase64("12-user-management.png");
const shotOwnerPortal = toBase64("13-owner-portal.png");
const shotCrmTable = toBase64("16-crm-leads-table.png");
const shotCrmKanban = toBase64("17-crm-leads-kanban.png");
const shotCrmReminders = toBase64("18-crm-leads-reminders.png");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>STAYRA PMS & CRM — Comprehensive Product Demo & Client Walkthrough Guide</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
  
  @page {
    size: A4 portrait;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-right {
      content: "Page " counter(page);
      font-size: 8pt;
      color: #64748b;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
  }

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.5;
    font-size: 9.5pt;
    margin: 0;
    padding: 0;
  }

  .page-break { page-break-before: always; }
  .no-break { page-break-inside: avoid; }

  /* Cover Page */
  .cover {
    height: 98vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: linear-gradient(145deg, #0e2a22 0%, #154236 60%, #1d5c4b 100%);
    color: #ffffff;
    padding: 48px;
    border-radius: 18px;
    page-break-after: always;
  }
  .brand-badge {
    display: inline-block;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    padding: 6px 14px;
    border-radius: 30px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #a7f3d0;
  }
  .cover-title {
    font-size: 29pt;
    font-weight: 800;
    line-height: 1.15;
    margin: 16px 0 12px 0;
    letter-spacing: -0.02em;
    color: #ffffff;
  }
  .cover-subtitle {
    font-size: 13pt;
    font-weight: 400;
    color: #d1fae5;
    max-width: 620px;
    line-height: 1.5;
  }
  .cover-features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 36px;
  }
  .cover-card {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.14);
    padding: 16px;
    border-radius: 12px;
  }
  .cover-card h4 {
    margin: 0 0 6px 0;
    font-size: 10pt;
    font-weight: 700;
    color: #ffffff;
  }
  .cover-card p {
    margin: 0;
    font-size: 8.5pt;
    color: #93c5fd;
    line-height: 1.4;
  }
  .cover-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid rgba(255,255,255,0.2);
    padding-top: 20px;
    font-size: 8.5pt;
    color: #cbd5e1;
  }

  /* Section Styling */
  h1 {
    font-size: 17pt;
    font-weight: 800;
    color: #0f2c23;
    margin: 0 0 4px 0;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-tag {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    background: #e6f4ea;
    color: #137333;
    padding: 3px 8px;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 4px;
  }
  .section-desc {
    color: #475569;
    font-size: 9pt;
    margin: 0 0 16px 0;
  }

  h2 {
    font-size: 12pt;
    font-weight: 700;
    color: #1e293b;
    margin: 16px 0 8px 0;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 4px;
  }

  p { margin: 0 0 10px 0; }

  /* Feature Grid */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }

  .card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .card-highlight {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
  }
  .card-warn {
    background: #fffbeb;
    border: 1px solid #fde68a;
  }
  .card-title {
    font-size: 9pt;
    font-weight: 700;
    color: #0f2c23;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .card-body {
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.45;
  }

  /* Screenshot display */
  .shot-wrap {
    margin: 12px 0 16px 0;
    border-radius: 9px;
    overflow: hidden;
    border: 1px solid #cbd5e1;
    box-shadow: 0 3px 10px rgba(0,0,0,0.06);
    background: #ffffff;
  }
  .shot-caption {
    font-size: 8pt;
    font-weight: 600;
    color: #475569;
    background: #f1f5f9;
    padding: 5px 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
  }
  .shot-img {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px 0;
    font-size: 8.5pt;
  }
  th {
    background: #0f2c23;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 7px 10px;
    font-size: 8pt;
  }
  th:first-child { border-top-left-radius: 6px; }
  th:last-child { border-top-right-radius: 6px; }
  td {
    padding: 7px 10px;
    border-bottom: 1px solid #e2e8f0;
    color: #334155;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 12px;
    font-size: 7.5pt;
    font-weight: 600;
  }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-amber { background: #fef3c7; color: #b45309; }
  .badge-blue { background: #e0f2fe; color: #0369a1; }
  .badge-purple { background: #f3e8ff; color: #7e22ce; }
  .badge-red { background: #fee2e2; color: #b91c1c; }

  .code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    background: #f1f5f9;
    padding: 1px 5px;
    border-radius: 4px;
    color: #0f172a;
  }

  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0f2c23;
    color: #ffffff;
    font-size: 8pt;
    font-weight: 700;
    margin-right: 6px;
  }

  .callout {
    border-left: 3.5px solid #0f2c23;
    background: #f0fdf4;
    padding: 10px 14px;
    border-radius: 0 8px 8px 0;
    font-size: 8.5pt;
    margin: 12px 0;
  }
</style>
</head>
<body>

<!-- ================= COVER PAGE ================= -->
<div class="cover">
  <div>
    <div class="brand-badge">STAYRA HOSPITALITY ERP & CRM</div>
    <div class="cover-title">Property Management & Revenue-Sharing System</div>
    <div class="cover-subtitle">Complete Product Demonstration, Operational Guide & Client Onboarding Manual</div>
  </div>

  <div>
    <div class="cover-features">
      <div class="cover-card">
        <h4>Guest Leads & CRM</h4>
        <p>Inquiry capturing (WhatsApp, IG, Phone), 6-stage Kanban pipeline, follow-up alarms & 1-click booking conversion.</p>
      </div>
      <div class="cover-card">
        <h4>PMS & Front Desk</h4>
        <p>Multi-property rooms, live timeline calendar, double-booking prevention & instant guest check-in/out.</p>
      </div>
      <div class="cover-card">
        <h4>Revenue-Sharing Engine</h4>
        <p>Automated contract splits (35/65, 40/60, 50/50), approved deductible pool bills & tamper-proof owner PDF statements.</p>
      </div>
    </div>
  </div>

  <div class="cover-footer">
    <div>
      <strong>STAYRA Property Management System v1.2</strong><br>
      Production-Ready Deployment · Supabase PostgreSQL + Next.js 16 + RLS
    </div>
    <div style="text-align: right;">
      <strong>Client Evaluation Copy</strong><br>
      Prepared for STAYRA Founders & Operations Team
    </div>
  </div>
</div>

<!-- ================= EXECUTIVE SUMMARY & ARCHITECTURE ================= -->
<div>
  <div class="section-tag">Executive Briefing</div>
  <h1>1. System Overview & Core Capabilities</h1>
  <p class="section-desc">Designed specifically for multi-property resort, villa, and serviced apartment management with integrated revenue-sharing and lead generation.</p>

  <p><strong>STAYRA PMS</strong> is an end-to-end Enterprise Resource Planning (ERP) platform built to solve the fundamental challenges of modern boutique hospitality management: capturing direct guest inquiries, eliminating double-bookings, tracking every paisa of property-level expenses, and delivering fully transparent revenue-sharing settlements to property owners.</p>

  <div class="grid-3">
    <div class="card card-highlight">
      <div class="card-title">1. Direct Booking Maximizer</div>
      <div class="card-body">Capture leads directly from WhatsApp, phone calls, social ads, and walk-ins. Convert inquiries to confirmed bookings with automatic OTA commission savings.</div>
    </div>
    <div class="card card-highlight">
      <div class="card-title">2. Operational Excellence</div>
      <div class="card-body">Room availability calendar with collision rejection in the database. Auto-generated housekeeping tasks on check-out with room readiness indicators.</div>
    </div>
    <div class="card card-highlight">
      <div class="card-title">3. Absolute Owner Trust</div>
      <div class="card-body">Dedicated Owner Portal where villa/resort owners log in to see their real-time performance, verified bill receipts, and downloadable PDF statements.</div>
    </div>
  </div>

  <div class="shot-wrap">
    <img src="${shotDashboard}" class="shot-img" alt="Executive Dashboard">
    <div class="shot-caption">
      <span>Figure 1.1: STAYRA Central Command Dashboard — Live Revenue, Occupancy, Real-Time In-House Guests & Critical Operational Alerts</span>
      <span>Live Application</span>
    </div>
  </div>

  <h2>System Architecture & Security Safeguards</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Database-Enforced Row Level Security (RLS)</div>
      <div class="card-body">Security is enforced inside PostgreSQL, not just the UI. Staff members only see properties they are explicitly assigned to. Housekeeping staff cannot see financials; owners can only see their own property.</div>
    </div>
    <div class="card">
      <div class="card-title">Tamper-Proof Financial Ledgers</div>
      <div class="card-body">Payment ledgers are append-only. Booking payments, refunds, and owner settlements cannot be edited or deleted—only reversed with documented audit logs.</div>
    </div>
  </div>
</div>

<div class="page-break"></div>

<!-- ================= GUEST LEADS & CRM MODULE ================= -->
<div>
  <div class="section-tag">New Feature Showcase</div>
  <h1>2. Guest Inquiry Leads & Sales CRM</h1>
  <p class="section-desc">Turn social media inquiries, phone calls, and WhatsApp chats into high-paying confirmed bookings.</p>

  <div class="callout">
    <strong>Why This Matters:</strong> Resorts and villas lose up to 35% of direct inquiries due to delayed follow-ups and unorganized WhatsApp chats. The STAYRA CRM centralizes every traveler inquiry, sets automated follow-up alarms, and enables 1-click booking conversion.
  </div>

  <div class="shot-wrap">
    <img src="${shotCrmKanban}" class="shot-img" alt="CRM Kanban Board">
    <div class="shot-caption">
      <span>Figure 2.1: Visual 6-Stage CRM Kanban Board — Track Inquiries from New → Contacted → Quoted → Follow-up → Negotiation → Won</span>
      <span>Leads & CRM Module</span>
    </div>
  </div>

  <h2>Core CRM Capabilities</h2>
  <div class="grid-3">
    <div class="card">
      <div class="card-title"><span class="step-num">1</span> Multi-Channel Ingestion</div>
      <div class="card-body">Log inquiries from WhatsApp, Instagram DMs, Phone Calls, Google Maps, Corporate inquiries, or bulk import via CSV/Excel.</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="step-num">2</span> Scheduled Follow-up Alarms</div>
      <div class="card-body">Assign dates & times for calls. The system categorizes tasks into <strong>Overdue</strong>, <strong>Due Today</strong>, and <strong>Upcoming</strong> with +1d / +3d snooze options.</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="step-num">3</span> 1-Click Booking Conversion</div>
      <div class="card-body">When a guest says "Yes", click <strong>Convert to Booking</strong>. It automatically checks room availability, blocks the calendar, records the advance payment, and marks the lead Won.</div>
    </div>
  </div>

  <div class="shot-wrap">
    <img src="${shotCrmTable}" class="shot-img" alt="CRM Leads Table">
    <div class="shot-caption">
      <span>Figure 2.2: Leads Management Table with Direct 1-Click Call, WhatsApp Link, Quoted Amounts, and Follow-up Reminders</span>
      <span>CRM Table View</span>
    </div>
  </div>
</div>

<div class="page-break"></div>

<!-- ================= REMINDERS & OPERATIONS ================= -->
<div>
  <div class="section-tag">Sales Execution</div>
  <h1>3. CRM Follow-up Reminders & Operations</h1>
  <p class="section-desc">Ensure your sales and reservation team never leaves an inquiry hanging.</p>

  <div class="shot-wrap">
    <img src="${shotCrmReminders}" class="shot-img" alt="CRM Follow-up Queue">
    <div class="shot-caption">
      <span>Figure 3.1: Dedicated Follow-up Queue — Segregated by Overdue, Due Today, and Upcoming with 1-click Call & WhatsApp Actions</span>
      <span>Reminders Queue</span>
    </div>
  </div>

  <h2>Centralized Front Desk & Calendar Operations</h2>
  <p>The reservation engine gives front-desk staff real-time control over arrivals, departures, in-house guests, and pending folio balances across all managed properties.</p>

  <div class="shot-wrap">
    <img src="${shotCalendar}" class="shot-img" alt="Multi-property Calendar">
    <div class="shot-caption">
      <span>Figure 3.2: Multi-Property Visual Room Timeline — Color-coded by Status (Confirmed, Checked-In, Out-of-Order, Blocked Dates)</span>
      <span>Calendar Engine</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Double-Booking Prevention Guard</div>
      <div class="card-body">PostgreSQL exclusion constraints prevent two confirmed reservations from occupying the same room on overlapping dates, even if two agents submit at the exact same millisecond.</div>
    </div>
    <div class="card">
      <div class="card-title">Automated Housekeeping Triggers</div>
      <div class="card-body">When a guest checks out, the room is automatically flagged as <span class="badge badge-amber">Dirty</span> and a cleaning inspection task is created in the Housekeeping module.</div>
    </div>
  </div>
</div>

<div class="page-break"></div>

<!-- ================= REVENUE-SHARING ENGINE ================= -->
<div>
  <div class="section-tag">Core Financials</div>
  <h1>4. The Revenue-Sharing & Accounting Engine</h1>
  <p class="section-desc">Transparent, mathematically exact revenue splits that property owners can verify and trust.</p>

  <div class="callout">
    <strong>The STAYRA Revenue Formula:</strong><br>
    <span class="code">Eligible Revenue = Room Revenue of Completed Stays (excl. GST) + F&B / Extra Income ± Adjustments</span><br>
    <span class="code">Approved Deductions = Approved Deductible Pool Bills + OTA Commission</span><br>
    <span class="code">Net Distributable Revenue = Eligible Revenue − Approved Deductions</span><br>
    <span class="code">STAYRA Share = round(Net × STAYRA %, 2)  |  Owner Share = Net − STAYRA Share</span>
  </div>

  <div class="shot-wrap">
    <img src="${shotRevShare}" class="shot-img" alt="Revenue Sharing Agreements">
    <div class="shot-caption">
      <span>Figure 4.1: Revenue-Sharing Agreement Configurations — Historic Versioning, Custom Split % and Deductible Expense Policies</span>
      <span>Revenue Engine</span>
    </div>
  </div>

  <h2>Audited Income & Expense Management</h2>
  <p>Every operational expense (groceries, repairs, electricity, staff salaries) is recorded with vendor invoices, categorized, and verified by accountants before entering the deductible pool.</p>

  <div class="shot-wrap">
    <img src="${shotExpenses}" class="shot-img" alt="Expenses Management">
    <div class="shot-caption">
      <span>Figure 4.2: Expense Management & Bill Approvals — Distinguishes Shared Pool vs. Owner-Borne vs. STAYRA-Borne Costs</span>
      <span>Finance Module</span>
    </div>
  </div>
</div>

<div class="page-break"></div>

<!-- ================= SETTLEMENTS & OWNER PORTAL ================= -->
<div>
  <div class="section-tag">Owner Transparency</div>
  <h1>5. Automated Owner Settlements & Portal</h1>
  <p class="section-desc">One-click monthly settlement generation, multi-stage approval workflow, and client PDF statements.</p>

  <div class="shot-wrap">
    <img src="${shotSettlement}" class="shot-img" alt="Settlement Statement">
    <div class="shot-caption">
      <span>Figure 5.1: Owner Settlement Statement — Itemized Bookings, Deductions, Previous Balance, and Generated Official PDF</span>
      <span>Settlement Workflow</span>
    </div>
  </div>

  <h2>Dedicated Property Owner Portal</h2>
  <p>Owners receive private login credentials to inspect their own property's occupancy, approved statements, and payment disbursement history on mobile or desktop.</p>

  <div class="shot-wrap">
    <img src="${shotOwnerPortal}" class="shot-img" alt="Property Owner Portal">
    <div class="shot-caption">
      <span>Figure 5.2: Dedicated Owner Portal — Completely Read-Only View of Property Performance and Settlement Statements</span>
      <span>Owner Portal</span>
    </div>
  </div>
</div>

<div class="page-break"></div>

<!-- ================= DEMO LOGIN MATRIX ================= -->
<div>
  <div class="section-tag">Interactive Evaluation</div>
  <h1>6. Demo Accounts & Evaluation Matrix</h1>
  <p class="section-desc">Your client can test the live software from every organizational perspective using these pre-configured accounts.</p>

  <div class="callout">
    <strong>Master Password for All Accounts:</strong> <span class="code">Stayra@Demo2026</span><br>
    <strong>Live Cloud URL:</strong> <span class="code">https://styrapms-aljp.vercel.app/login</span><br>
    <strong>Local Offline URL:</strong> <span class="code">http://localhost:3000/login</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Role</th>
        <th>Demo Email</th>
        <th>What This Role Can Do & Test</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Super Admin</strong></td>
        <td><span class="code">superadmin@stayra.demo</span></td>
        <td>Full access to all modules, CRM pipeline, settlement approval, user management, and revenue % configuration.</td>
      </tr>
      <tr>
        <td><strong>Admin</strong></td>
        <td><span class="code">admin@stayra.demo</span></td>
        <td>Manages assigned properties, bookings, CRM leads, guest check-ins, and expense submissions.</td>
      </tr>
      <tr>
        <td><strong>Property Manager</strong></td>
        <td><span class="code">manager@stayra.demo</span></td>
        <td>Day-to-day operations: room allocations, guest folios, petty cash payments, and maintenance tickets.</td>
      </tr>
      <tr>
        <td><strong>Accountant</strong></td>
        <td><span class="code">accounts@stayra.demo</span></td>
        <td>Approves expense receipts, reconciles revenue, generates monthly settlement drafts, and records NEFT/UPI payouts.</td>
      </tr>
      <tr>
        <td><strong>Operations Staff</strong></td>
        <td><span class="code">ops@stayra.demo</span></td>
        <td>Check-in / check-out desk, guest ID uploads, and maintenance dispatch. Financial data is hidden.</td>
      </tr>
      <tr>
        <td><strong>Housekeeping</strong></td>
        <td><span class="code">housekeeping@stayra.demo</span></td>
        <td>Mobile cleaning queue: marks rooms dirty/cleaning/inspected/ready. Financials and bookings are hidden.</td>
      </tr>
      <tr>
        <td><strong>Auditor</strong></td>
        <td><span class="code">auditor@stayra.demo</span></td>
        <td>Read-only compliance access to verified financial ledgers, settlement reports, and system audit logs.</td>
      </tr>
      <tr>
        <td><strong>Property Owner (Mehta)</strong></td>
        <td><span class="code">owner.mehta@stayra.demo</span></td>
        <td>Owner Portal view for <em>STAYRA Mountain Retreat</em> (35/65 split) — view live earnings and approved statements.</td>
      </tr>
      <tr>
        <td><strong>Property Owner (Rao)</strong></td>
        <td><span class="code">owner.rao@stayra.demo</span></td>
        <td>Owner Portal view for <em>STAYRA City Stay</em> (40/60 split).</td>
      </tr>
      <tr>
        <td><strong>Property Owner (Malhotra)</strong></td>
        <td><span class="code">owner.malhotra@stayra.demo</span></td>
        <td>Owner Portal view for <em>STAYRA Premium Villa</em> (50/50 split).</td>
      </tr>
    </tbody>
  </table>

  <h2>Recommended 5-Minute Client Demo Script</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title"><span class="step-num">1</span> Log in as Super Admin</div>
      <div class="card-body">Open the Dashboard to review monthly revenue, live arrivals, and operational risk alerts.</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="step-num">2</span> Open Leads / CRM</div>
      <div class="card-body">Switch between the Table, Kanban board, and Follow-up Reminders. Click <strong>Update Stage</strong> or <strong>Convert to Booking</strong> on a lead.</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="step-num">3</span> Inspect the Calendar</div>
      <div class="card-body">View the room timeline across all 3 properties and click on an upcoming guest stay to see the folio.</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="step-num">4</span> View Owner Settlements</div>
      <div class="card-body">Check the automated split calculations, preview the breakdown, and download the branded PDF statement.</div>
    </div>
  </div>

  <div style="margin-top: 30px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; color: #64748b; font-size: 8pt;">
    STAYRA PMS & CRM Software · Developed with Next.js 16, TypeScript, Tailwind CSS, PostgreSQL & Supabase.
  </div>
</div>

</body>
</html>
`;

async function generatePdf() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  
  const outputPath = path.resolve("STAYRA_PMS_Product_Demo_Guide.pdf");
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      bottom: "14mm",
      left: "12mm",
      right: "12mm"
    }
  });

  console.log("✓ PDF generated successfully at:", outputPath);
  await browser.close();
}

generatePdf().catch(console.error);
