/* Dashboard shell loading — shown during navigation between dashboard routes. */
import styles from './loading.module.css';

export default function DashboardLoading() {
  return (
    <div className={styles.container}>
      {/* Header skeleton */}
      <div className={styles.headerGroup}>
        <div className={`skeleton ${styles.titleSkeleton}`} />
        <div className={`skeleton ${styles.subtitleSkeleton}`} />
      </div>

      {/* Stats skeleton */}
      <div className={styles.statsRow}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`skeleton ${styles.statCard}`} />
        ))}
      </div>

      {/* Body skeleton */}
      <div className={styles.bodyRow}>
        <div className={`skeleton ${styles.feedCard}`} />
        <div className={`skeleton ${styles.sideCard}`} />
      </div>
    </div>
  );
}
