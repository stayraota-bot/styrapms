import { AutoSubmit } from "@/components/ui/forms";
import { Input, Select } from "@/components/ui/core";
import { RANGE_LABEL } from "@/server/analytics";

export function PeriodFilter({ range, from, to, property, properties, extra, hideProperty }: {
  range: string; from: string; to: string; property?: string; properties: { id: string; name: string }[]; extra?: React.ReactNode; hideProperty?: boolean;
}) {
  return (
    <AutoSubmit className="flex flex-wrap items-center gap-2">
      <Select name="range" defaultValue={range} className="w-auto min-w-36" aria-label="Period">
        {Object.entries(RANGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {range === "custom" && <>
        <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
        <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
      </>}
      {!hideProperty && properties.length > 1 && (
        <Select name="property" defaultValue={property ?? ""} className="w-auto min-w-44" aria-label="Property">
          <option value="">All properties</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      {extra}
      <noscript><button type="submit">Apply</button></noscript>
    </AutoSubmit>
  );
}
