'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './ProgressBar.module.css';

export default function ProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => {
      setVisible(true);
      setComplete(false);
    }, 0);

    const timer = setTimeout(() => {
      setComplete(true);
    }, 300);

    const hideTimer = setTimeout(() => {
      setVisible(false);
      setComplete(false);
    }, 600);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className={`${styles.bar} ${complete ? styles.complete : styles.loading}`} />
  );
}
