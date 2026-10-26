import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { LoginForm } from "./login-form";
import { Mark } from "@/components/brand";
import { DEMO_DISCLAIMER } from "@/lib/constants";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getActor()) redirect("/app");
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGINS === "1";
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
          <p className="mt-1 text-sm text-muted">Use one of the demo accounts below.</p>
          <LoginForm />
          {showDemo && (
            <div className="mt-8 rounded-lg border border-line bg-white p-4 text-sm">
              <p className="font-medium text-ink">Demo accounts (local demonstration only)</p>
              <table className="mt-2 w-full text-left text-[13px]">
                <tbody className="divide-y divide-line">
                  <tr><td className="py-1.5 pr-2 text-muted">Institution</td><td className="py-1.5">inst1@demo.smartvalidate.test</td><td className="py-1.5 pl-2">Institution@2026</td></tr>
                  <tr><td className="py-1.5 pr-2 text-muted">Officer</td><td className="py-1.5">officer1@demo.smartvalidate.test</td><td className="py-1.5 pl-2">Officer@2026</td></tr>
                  <tr><td className="py-1.5 pr-2 text-muted">Admin</td><td className="py-1.5">admin@demo.smartvalidate.test</td><td className="py-1.5 pl-2">Admin@2026</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">inst2–inst5 and officer2 use the same passwords. Hidden in production unless SHOW_DEMO_LOGINS=1.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
