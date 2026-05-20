'use client';

import React, { useState } from 'react';
import styles from './DocAuditor.module.css';

interface Discrepancy {
  severity: 'HIGH' | 'WARNING' | 'INFO';
  category: string;
  description: string;
}

interface AuditData {
  id?: string;
  status: string;
  summary: string;
  discrepancies: Discrepancy[];
}

const SAMPLE_LC_MATCH = `LETTER OF CREDIT (L/C) - ADVICE NO: LC82739102
ISSUING BANK: EMIRATES NBD, DUBAI, UAE
APPLICANT: AL-RASHID FOODSTUFF TRADING LLC, DUBAI, UAE
BENEFICIARY: DENVER TRADES, VIETNAM BRANCH
COMMODITY: BLACK PEPPER 550G/L ASTA
QUANTITY: 32,000 KG (32 METRIC TONNES)
PORT OF LOADING: CAT LAI PORT, VIETNAM
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE
LATEST SHIPMENT DATE: 2026-06-15
PAYMENT TERMS: IRREVOCABLE L/C AT SIGHT`;

const SAMPLE_BL_MATCH = `BILL OF LADING (B/L) - NO: MSK93820182
CARRIER: MAERSK LINE
SHIPPER: DENVER TRADES, VIETNAM BRANCH
CONSIGNEE: TO ORDER OF EMIRATES NBD BANK
NOTIFY PARTY: AL-RASHID FOODSTUFF TRADING LLC, DUBAI, UAE
PORT OF LOADING: CAT LAI PORT, VIETNAM
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE
DESCRIPTION OF GOODS: 2 X 20FT CONTAINERS STC:
32,000 KG BLACK PEPPER 550G/L ASTA
ACTUAL SHIPPED ON BOARD DATE: 2026-06-10`;

const SAMPLE_LC_MISMATCH = `LETTER OF CREDIT (L/C) - ADVICE NO: LC91827301
ISSUING BANK: EMIRATES NBD, DUBAI, UAE
APPLICANT: GULF SPICES & SEEDS INDUSTRY, SHARJAH, UAE
BENEFICIARY: DENVER TRADES, INDIA BRANCH
COMMODITY: CORIANDER SEEDS WHOLE SPLIT
QUANTITY: 24,000 KG
PORT OF LOADING: MUNDRA PORT, INDIA
PORT OF DISCHARGE: SHARJAH PORT, UAE
LATEST SHIPMENT DATE: 2026-05-15
PAYMENT TERMS: IRREVOCABLE L/C AT SIGHT`;

const SAMPLE_BL_MISMATCH = `BILL OF LADING (B/L) - NO: CMA82739103
CARRIER: CMA CGM
SHIPPER: DENVER TRADES, INDIA BRANCH
CONSIGNEE: GULF SPICES & SEEDS INDUSTRY, SHARJAH, UAE
PORT OF LOADING: MUNDRA PORT, INDIA
PORT OF DISCHARGE: JEBEL ALI PORT, DUBAI, UAE  <-- MISMATCH (L/C says Sharjah)
DESCRIPTION OF GOODS: 1 X 40FT CONTAINER STC:
23,850 KG CORIANDER SEEDS WHOLE SPLIT  <-- MISMATCH (L/C says 24,000 KG)
ACTUAL SHIPPED ON BOARD DATE: 2026-05-18  <-- MISMATCH (L/C Latest Shipment: May 15)`;

export default function DocAuditor() {
  const [textA, setTextA] = useState(SAMPLE_LC_MISMATCH);
  const [textB, setTextB] = useState(SAMPLE_BL_MISMATCH);
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditData | null>(null);

  const handlePreFill = (type: 'match' | 'mismatch') => {
    if (type === 'match') {
      setTextA(SAMPLE_LC_MATCH);
      setTextB(SAMPLE_BL_MATCH);
    } else {
      setTextA(SAMPLE_LC_MISMATCH);
      setTextB(SAMPLE_BL_MISMATCH);
    }
    setAuditResult(null);
  };

  const handleAudit = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/documents/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type_a: 'Letter of Credit',
          text_a: textA,
          doc_type_b: 'Bill of Lading',
          text_b: textB
        })
      });

      const data = await response.json();
      if (data.success) {
        setAuditResult(data.audit);
      } else {
        console.error('Audit failed:', data.error);
      }
    } catch (error) {
      console.error('Error during document audit:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Top action bar */}
      <div className={styles.actionBar}>
        <div className={styles.preFillGroup}>
          <button 
            type="button" 
            className={styles.secondaryBtn}
            onClick={() => handlePreFill('mismatch')}
          >
            Pre-Fill Mismatched Docs (Fails Audit)
          </button>
          <button 
            type="button" 
            className={styles.secondaryBtn}
            onClick={() => handlePreFill('match')}
          >
            Pre-Fill Clean Docs (Passes Audit)
          </button>
        </div>

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleAudit}
          disabled={loading || !textA.trim() || !textB.trim()}
        >
          {loading ? 'Analyzing Compliance...' : 'Run Compliance Audit'}
        </button>
      </div>

      {/* Side-by-side editing panel */}
      <div className={styles.splitGrid}>
        <div className={styles.docColumn}>
          <div className={styles.columnHeader}>
            <span>Document A: Letter of Credit (L/C)</span>
            <span className={styles.typeBadge}>UCP 600 Rules</span>
          </div>
          <textarea
            className={styles.textarea}
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
            placeholder="Paste Letter of Credit instructions here..."
          />
        </div>

        <div className={styles.docColumn}>
          <div className={styles.columnHeader}>
            <span>Document B: Bill of Lading (B/L)</span>
            <span className={styles.typeBadge}>Carrier Issue</span>
          </div>
          <textarea
            className={styles.textarea}
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
            placeholder="Paste Bill of Lading cargo details here..."
          />
        </div>
      </div>

      {/* Results overlay */}
      {auditResult && (
        <div className={styles.resultPanel}>
          <div className={styles.resultHeader}>
            <h3>Compliance Scan Results</h3>
            <span className={`${styles.statusBadge} ${
              auditResult.discrepancies.length === 0 ? styles.statusPass : styles.statusFail
            }`}>
              {auditResult.discrepancies.length === 0 ? 'Compliant' : `${auditResult.discrepancies.length} Discrepancies Found`}
            </span>
          </div>
          <p className={styles.summaryText}>{auditResult.summary}</p>

          {auditResult.discrepancies.length > 0 && (
            <div className={styles.discrepancyList}>
              {auditResult.discrepancies.map((d, index) => (
                <div key={index} className={styles.discrepancyCard}>
                  <div className={styles.discrepancyMeta}>
                    <span className={`${styles.severity} ${styles[d.severity.toLowerCase()]}`}>
                      {d.severity}
                    </span>
                    <span className={styles.category}>{d.category}</span>
                  </div>
                  <p className={styles.desc}>{d.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
