'use client';

import { useToken } from '@/lib/api';
import { Home } from './_components/Home';
import { Login } from './_components/Login';

export default function Page() {
  const token = useToken();
  if (token === undefined) return null;
  return token ? <Home token={token} /> : <Login />;
}
