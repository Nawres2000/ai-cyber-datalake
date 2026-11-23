'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const cls = (p) => (path?.startsWith(p) ? 'active' : undefined);
  return (
    <header className="site-header">
      <Link className="logo" href="/"><i /> AI Cybersecurity Data Lake</Link>
      <nav>
        {user ? (
          <>
            <Link className={cls('/dashboard')} href="/dashboard">Dashboard</Link>
            <Link className={cls('/live')} href="/live">Live</Link>
            <Link className={cls('/alerts')} href="/alerts">Alerts</Link>
            <Link className={cls('/models')} href="/models">Models</Link>
            <button onClick={async () => { await logout(); router.push('/'); }}>Log out</button>
          </>
        ) : (
          <>
            <Link href="/">Home</Link>
            <Link href="/login">Log in</Link>
            <Link className="cta" href="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}
