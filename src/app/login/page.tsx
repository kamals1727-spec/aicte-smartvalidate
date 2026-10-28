import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { LoginForm } from "./login-form";
import { Mark } from "@/components/brand";
import { DEMO_DISCLAIMER } from "@/lib/constants";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getActor()) redirect("/app");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="font-serif text-lg font-semibold">SmartValidate</span>
        </Link>
        <div className="max-w-md">
          <p className="font-serif text-3xl font-semibold leading-snug">Machines prepare the file. Officials decide.</p>
          <p className="mt-4 text-navy-100">Sign in as an institution to prepare an application, or as a scrutiny officer to review the queue.</p>
        </div>
        <p className="text-xs text-navy-100/80">{DEMO_DISCLAIMER}</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark />
              <span className="font-serif text-lg font-semibold text-navy-900">SmartValidate</span>
            </Link>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-navy-900">Sign in</h1>
          <p className="mt-1 text-sm text-muted">
            New applicant?{" "}
            <Link href="/register" className="font-medium text-action hover:underline">
              Register your institution
            </Link>
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
