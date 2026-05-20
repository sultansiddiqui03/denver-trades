'use client';

import React from 'react';
import AgentDashboard from '@/components/AgentDashboard';

export default function AgentsPage() {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800 }}>Autonomous Agents</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Monitor background processes, auto-scrapers, and WhatsApp webhook triggers.
        </p>
      </div>

      {/* Real-time Agent Dashboard */}
      <AgentDashboard />
    </div>
  );
}
