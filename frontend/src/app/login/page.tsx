import { Suspense } from 'react';
import { LoginClient } from './LoginClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mobile-shell grid place-items-center px-5 py-10 text-sm text-dark-gray">正在加载...</main>}>
      <LoginClient />
    </Suspense>
  );
}
