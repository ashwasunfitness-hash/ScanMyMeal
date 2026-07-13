import { redirectAfterAuthentication } from "@/lib/access-control";

export const dynamic = "force-dynamic";
export default async function VerifyRedirectPage() { await redirectAfterAuthentication(); return null; }
