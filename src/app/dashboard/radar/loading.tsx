import styles from './loading.module.css';

export default function RadarLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.headerSkeleton}>
        <div className={`skeleton ${styles.titleSkel}`} />
        <div className={`skeleton ${styles.subtitleSkel}`} />
      </div>

      <div className={styles.gridSkeleton}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`skeleton ${styles.cardSkel}`} />
        ))}
      </div>

      <div className={styles.listSkeleton}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`skeleton ${styles.rowSkel}`} />
        ))}
      </div>
    </div>
  );
}
