export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-gray-200/70" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-200/60" />)}</div>
      <div className="h-72 rounded-2xl bg-gray-200/50" />
    </div>
  );
}
