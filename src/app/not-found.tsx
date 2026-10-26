import Link from "next/link";
import { btnClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-navy-900">Not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted">This record does not exist, or it is outside what your account is allowed to see.</p>
      <Link href="/app" className={`${btnClass()} mt-6`}>
        Back to dashboard
      </Link>
    </div>
  );
}
