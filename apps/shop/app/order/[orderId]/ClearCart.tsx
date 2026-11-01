'use client';

import { useEffect } from 'react';
import { clearCart } from '../../actions';

export function ClearCart() {
  useEffect(() => {
    void clearCart();
  }, []);
  return null;
}
