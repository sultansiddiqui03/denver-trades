/* Root-level loading fallback — shown while the landing page suspends. */
export default function RootLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-lime)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          fontSize: '1.125rem',
          color: '#0A0A0A',
          animation: 'pulse-glow 1.6s ease-in-out infinite',
        }}
      >
        D
      </div>
    </div>
  );
}
