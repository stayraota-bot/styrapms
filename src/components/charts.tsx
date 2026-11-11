"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

export const PALETTE = { brand: "#1b4b37", brandLight: "#7cb396", sand: "#c8a97e", clay: "#b5654a", sky: "#4a8bb5", grid: "#eef0ef", muted: "#66736d" };
const SERIES = ["#1b4b37", "#7cb396", "#c8a97e", "#4a8bb5", "#b5654a", "#8a7bb5", "#2f7556", "#d9b98c", "#5e9fc4", "#a3a3a3", "#3f6b5a"];

const shortInr = (v: number) => {
  const a = Math.abs(v);
  return a >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : a >= 1e3 ? `₹${(v / 1e3).toFixed(0)}K` : `₹${v}`;
};
const fullInr = (v: unknown) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const axis = { fontSize: 11, fill: PALETTE.muted };
const tip = { contentStyle: { borderRadius: 10, border: "1px solid #e5e8e6", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(0,0,0,.2)" } };

type Row = Record<string, string | number>;

export function RevenueExpenseChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={4} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={shortInr} tick={axis} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={fullInr} {...tip} cursor={{ fill: "#f3f6f4" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill={PALETTE.brand} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" fill={PALETTE.brandLight} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetLineChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PALETTE.brand} stopOpacity={0.25} /><stop offset="100%" stopColor={PALETTE.brand} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={shortInr} tick={axis} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={fullInr} {...tip} />
        <Area isAnimationActive={false} type="monotone" dataKey="net" name="Net distributable" stroke={PALETTE.brand} strokeWidth={2} fill="url(#g)" />
        <Area isAnimationActive={false} type="monotone" dataKey="stayra" name="STAYRA share" stroke={PALETTE.sand} strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OccupancyChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => `${v}%`} {...tip} />
        <Line isAnimationActive={false} type="monotone" dataKey="occupancy" name="Occupancy" stroke={PALETTE.brand} strokeWidth={2.5} dot={{ r: 3, fill: PALETTE.brand }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PropertyBarChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 56)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
        <CartesianGrid stroke={PALETTE.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={shortInr} tick={axis} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ ...axis, fill: "#17221d" }} width={150} axisLine={false} tickLine={false} />
        <Tooltip formatter={fullInr} {...tip} cursor={{ fill: "#f3f6f4" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill={PALETTE.brand} radius={[0, 4, 4, 0]} maxBarSize={16} />
        <Bar isAnimationActive={false} dataKey="net" name="Net distributable" fill={PALETTE.sand} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, center, centerLabel, colors }: { data: { name: string; value: number }[]; center?: string; centerLabel?: string; colors?: string[] }) {
  const c = colors ?? SERIES;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-[180px] h-[180px] shrink-0">
          <PieChart width={180} height={180}>
            <Pie isAnimationActive={false} data={data} cx={90} cy={90} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={data.length > 1 ? 2 : 0} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={c[i % c.length]} />)}
            </Pie>
            <Tooltip formatter={fullInr} {...tip} />
          </PieChart>
        {center && <div className="absolute inset-0 grid place-items-center pointer-events-none text-center"><div><p className="text-[15px] font-semibold tabular">{center}</p>{centerLabel && <p className="text-[10px] text-[#66736d]">{centerLabel}</p>}</div></div>}
      </div>
      <ul className="space-y-2 text-sm w-full">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0"><span className="size-2.5 rounded-full shrink-0" style={{ background: c[i % c.length] }} /><span className="truncate">{d.name}</span></span>
            <span className="tabular text-right"><span className="font-medium">{fullInr(d.value)}</span><span className="text-xs text-[#66736d] ml-1.5">{total ? Math.round((100 * d.value) / total) : 0}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SimpleBars({ data, color = PALETTE.brand, money = true, height = 220 }: { data: { name: string; value: number }[]; color?: string; money?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} interval={0} />
        <YAxis tickFormatter={money ? shortInr : undefined} tick={axis} axisLine={false} tickLine={false} width={60} allowDecimals={false} />
        <Tooltip formatter={money ? fullInr : undefined} {...tip} cursor={{ fill: "#f3f6f4" }} />
        <Bar isAnimationActive={false} dataKey="value" name={money ? "Amount" : "Count"} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
