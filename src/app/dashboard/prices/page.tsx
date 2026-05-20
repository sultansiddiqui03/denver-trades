'use client';

import React from 'react';
import PriceChart from '@/components/PriceChart';

interface PriceFeed {
  id: string;
  commodity: string;
  grade: string;
  origin: string;
  price: string;
  change: string;
  isUp: boolean;
  sparkline: string;
}

export default function PricesPage() {
  const feeds: PriceFeed[] = [
    {
      id: 'price-1',
      commodity: 'Black Pepper',
      grade: '550 g/l ASTA',
      origin: 'FOB Ho Chi Minh Port',
      price: '$4,850 / MT',
      change: '+1.2%',
      isUp: true,
      sparkline: 'M0,15 L10,12 L20,16 L30,10 L40,8 L50,11 L60,4 L70,5 L80,2 L90,1',
    },
    {
      id: 'price-2',
      commodity: 'White Pepper',
      grade: '630 g/l Double Washed',
      origin: 'FOB Bangka Port',
      price: '$6,900 / MT',
      change: '-0.5%',
      isUp: false,
      sparkline: 'M0,1 L10,3 L20,2 L30,6 L40,8 L50,6 L60,9 L70,12 L80,11 L90,14',
    },
    {
      id: 'price-3',
      commodity: 'Cashew Nuts',
      grade: 'WW320 Premium Whole',
      origin: 'CIF Rotterdam Port',
      price: '$7,250 / MT',
      change: '+2.1%',
      isUp: true,
      sparkline: 'M0,16 L10,14 L20,15 L30,12 L40,11 L50,12 L60,9 L70,7 L80,5 L90,2',
    },
    {
      id: 'price-4',
      commodity: 'Robusta Coffee',
      grade: 'Grade 1 Screen 18',
      origin: 'FOB Buon Ma Thuot',
      price: '$3,420 / MT',
      change: '+0.8%',
      isUp: true,
      sparkline: 'M0,12 L10,13 L20,11 L30,10 L40,8 L50,9 L60,7 L70,6 L80,5 L90,3',
    },
    {
      id: 'price-5',
      commodity: 'Cassia Split',
      grade: 'Cigarette A-Grade',
      origin: 'FOB Hai Phong Port',
      price: '$2,800 / MT',
      change: '-1.4%',
      isUp: false,
      sparkline: 'M0,2 L10,4 L20,3 L30,7 L40,9 L50,8 L60,11 L70,14 L80,13 L90,17',
    },
  ];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800 }}>Commodity Market Rates</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Live benchmark prices for spices, nuts, and agricultural exports compiled from port registries and global exchanges.
        </p>
      </div>

      {/* Interactive Price Chart Workspace */}
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', marginBottom: '15px' }}>
          Interactive Exchange Index Analytics
        </h3>
        <PriceChart />
      </div>

      {/* List Indices Grid */}
      <div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', marginBottom: '15px' }}>
          Exchange Rate Index List
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {feeds.map((f) => (
            <div
              key={f.id}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                padding: 'var(--space-4) var(--space-6)',
              }}
            >
              {/* Left: Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{f.commodity}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {f.grade} • <span style={{ color: 'var(--text-muted)' }}>{f.origin}</span>
                </span>
              </div>

              {/* Middle: Sparkline */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 120px' }}>
                <svg width="120" height="30" viewBox="0 0 90 20">
                  <path
                    d={f.sparkline}
                    fill="none"
                    stroke={f.isUp ? 'var(--success)' : 'var(--danger)'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Right: Value */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{f.price}</span>
                  <span className={`badge ${f.isUp ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    {f.change}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
