import styles from './loading.module.css';

export default function OpportunitiesLoading() {
  return (
    <div className={styles.root}>
      <div className={styles.headerSkel}>
        <span className={`skeleton ${styles.titleSkel}`} />
        <span className={`skeleton ${styles.btnSkel}`} />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`skel-${i}`} className={styles.cardSkel}>
          <div className={styles.cardSkelTop}>
            <span className={`skeleton ${styles.badgeSkel}`} />
            <span className={`skeleton ${styles.pillSkel}`} />
          </div>
          <span className={`skeleton ${styles.titleLineSkel}`} />
          <span className={`skeleton ${styles.summaryLineSkel}`} />
          <span className={`skeleton ${styles.summaryLineSkelShort}`} />
          <div className={styles.actionsSkel}>
            <span className={`skeleton ${styles.actionSkel}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
