import { Link } from 'react-router-dom';
import { Footer, SiteHeader } from '../App';
const PAGES: Record<string, [string, string[]]> = {
  privacy: ['Privacy', ['We collect only what coaching needs: the player’s name, age, position, goals, practice logs and messages, plus a parent’s name and email.', 'Practice clips (optional, 30 seconds max) are stored privately, seen only by the player, their parent(s) and the player’s assigned coaches, and deleted automatically after 90 days or sooner when you ask (Parent view → Clips → Delete clip). For players under 13, clips stay off until a parent gives consent.', 'We never sell data, show ads, or publish player information. Players are never shown publicly without written parent permission.', 'Parents can request a copy or deletion of their player’s data anytime via Support.', 'This demo stores fictional data in your browser (localStorage) or a demo database. Reset it with “Reset demo.”']],
  terms: ['Terms', ['Plans are month to month and billed in advance. Pause or cancel anytime before your next billing date.', 'Baller Connection is a virtual training program, not medical or athletic-training advice. Players train within their limits with a parent’s consent.', 'Reply windows (same business day, 1 or 2 business days) exclude weekends and posted holidays.', 'The roster is capped at 15 players. Inner Circle is capped at 4.']],
  support: ['Support', ['Message your coach from the Inbox tab. That’s the fastest way.', 'Billing or account questions: support@[your-domain] (placeholder for Keith to fill in).', 'Response time: within 2 business days.']],
  '404': ['Page not found', ['That page doesn’t exist. Every real page is linked from the header and footer.']],
};
export function Legal({ page }: { page: string }) {
  const [t, ps] = PAGES[page];
  return (<><SiteHeader /><main id="main" tabIndex={-1} className="paper"><div className="wrap narrow legal"><h1 className="display">{t}</h1>{ps.map((x) => <p key={x}>{x}</p>)}<Link className="btn ghost" to="/">Back home</Link></div></main><Footer /></>);
}
