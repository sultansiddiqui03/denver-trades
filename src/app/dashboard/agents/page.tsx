import AgentDashboard from '@/components/AgentDashboard';
import styles from './page.module.css';

export default function AgentsPage() {
  return (
    <div className={`fade-in ${styles.page}`}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Agents</h1>
        <p className={styles.pageSubtitle}>
          Monitor background jobs, scrapers, and webhook listeners.
        </p>
      </header>

      <AgentDashboard />
    </div>
  );
}
