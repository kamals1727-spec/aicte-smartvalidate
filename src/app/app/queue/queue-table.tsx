"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Td, Th, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { assignAction } from "@/app/actions";
import { STATUS_LABELS, STATUS_TONE, type AppStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  refNo: string;
  status: string;
  institution: string;
  category: string;
  submittedAt: string | null;
  updatedAt: string;
  reviewPriority: string;
  priorityScore: number;
  officerName: string | null;
  critical: number;
  missing: number;
  unresolved: number;
  openRect: number;
  docVerification: string;
  daysWaiting: number;
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function QueueTable({ rows, officers, canAssign }: { rows: Row[]; officers: { id: string; name: string }[]; canAssign: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const all = rows.length > 0 && sel.length === rows.length;
  return (
    <div className="rounded-lg border border-line bg-white">
      {canAssign && (
        <ActionForm action={assignAction} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {sel.map((id) => (
            <input key={id} type="hidden" name="applicationIds" value={id} />
          ))}
          <span className="text-sm text-muted">{sel.length} selected</span>
          <select name="officerId" aria-label="Assign to officer" className={cn(inputClass, "w-auto py-1.5")} defaultValue="">
            <option value="" disabled>
              Assign to…
            </option>
            <option value="unassigned">Unassign</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <SubmitButton size="sm" variant="secondary" pendingText="Assigning…">
            Apply to selected
          </SubmitButton>
        </ActionForm>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="border-b border-line bg-paper">
            <tr>
              {canAssign && (
                <Th>
                  <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} />
                </Th>
              )}
              <Th>Reference</Th>
              <Th>Institution</Th>
              <Th>Category</Th>
              <Th>Submitted</Th>
              <Th>Officer</Th>
              <Th>Status</Th>
              <Th>Documents</Th>
              <Th>Critical</Th>
              <Th>Unresolved</Th>
              <Th>Rectifications</Th>
              <Th>Priority</Th>
              <Th>Waiting</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={cn("hover:bg-navy-50/50", sel.includes(r.id) && "bg-navy-50")}>
                {canAssign && (
                  <Td>
                    <input type="checkbox" aria-label={`Select ${r.refNo}`} checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} />
                  </Td>
                )}
                <Td>
                  <Link href={`/app/review/${r.id}`} className="font-medium text-action hover:underline">
                    {r.refNo}
                  </Link>
                </Td>
                <Td className="max-w-[220px]">{r.institution}</Td>
                <Td>{r.category}</Td>
                <Td>{fmt(r.submittedAt)}</Td>
                <Td>{r.officerName ?? <span className="text-muted">Unassigned</span>}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status as AppStatus]}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                </Td>
                <Td>
                  <Badge tone={r.docVerification === "issues" ? "danger" : r.docVerification === "pending" ? "warning" : "success"}>
                    {r.docVerification === "issues" ? "Issues found" : r.docVerification === "pending" ? "Verification pending" : "All verified"}
                  </Badge>
                </Td>
                <Td className={r.critical ? "font-semibold text-bad" : "text-muted"}>{r.critical}</Td>
                <Td>{r.unresolved}</Td>
                <Td>{r.openRect}</Td>
                <Td>
                  <Badge tone={r.reviewPriority === "HIGH" ? "danger" : r.reviewPriority === "MEDIUM" ? "warning" : "info"} title={`Score ${r.priorityScore} — review ordering, not a fraud probability`}>
                    {r.reviewPriority.charAt(0) + r.reviewPriority.slice(1).toLowerCase()}
                  </Badge>
                </Td>
                <Td>{r.submittedAt ? `${r.daysWaiting} d` : "—"}</Td>
                <Td>{fmt(r.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
