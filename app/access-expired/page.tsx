import { CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Logo } from "../components/Logo";

export default function AccessExpiredPage() { return <main className="expired-shell"><Logo /><div className="expired-icon"><CalendarClock /></div><p className="section-kicker">Programme access paused</p><h1>Your coaching access has ended for now.</h1><p>Your meal history remains protected. Contact the ABC of D® coaching team through your existing programme channel if you would like to renew or believe this is a mistake.</p><Link className="button button-primary" href="/contact-support"><MessageCircle /> View support options</Link><form action="/api/auth/sign-out" method="post"><button className="button button-quiet">Sign out</button></form><Link href="/">Return to Scan My Meal</Link></main>; }
