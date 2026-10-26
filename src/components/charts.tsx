"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#284b80";
const AXIS = { fontSize: 12, fill: "#5b6676" };

function Empty() {
  return <div className="flex h-48 items-center justify-center rounded-md bg-paper text-sm text-muted">No data for the selected filters yet.</div>;
}

export function HBar({ data, colors }: { data: { name: string; value: number }[]; colors?: Record<string, string> }) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <Empty />;
  const h = Math.max(160, data.length * 34 + 20);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#e8ecf2" />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={170} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5fb" }} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#dfe4eb" }} />
          <Bar isAnimationActive={false} dataKey="value" name="Count" radius={[0, 3, 3, 0]} barSize={18}>
            {data.map((d) => (
              <Cell key={d.name} fill={colors?.[d.name] ?? NAVY} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Trend({ data }: { data: { name: string; created: number; submitted: number; decided: number }[] }) {
  if (data.every((d) => d.created + d.submitted + d.decided === 0)) return <Empty />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e8ecf2" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#dfe4eb" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="created" name="Created" stroke="#7fa2d6" strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="submitted" name="Submitted" stroke={NAVY} strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="decided" name="Decided" stroke="#1f7a4d" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
