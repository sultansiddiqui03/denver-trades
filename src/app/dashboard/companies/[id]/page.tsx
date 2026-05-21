'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import styles from './page.module.css';

interface Shipment {
  date: string;
  product: string;
  quantity: string;
  origin: string;
  destination: string;
}

interface Contact {
  name: string;
  role: string;
  email: string;
  phone: string;
  whatsappVerified: boolean;
}

interface CompanyDetails {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  website: string;
  type: string;
  score: number;
  description: string;
  markets: string[];
  sourcing: string[];
  shipments: Shipment[];
  contacts: Contact[];
  insights: {
    buyerProfile: string;
    frequency: string;
    negotiationAdvice: string;
    riskAudit: string;
  };
}

const mockCompaniesDetails: Record<string, CompanyDetails> = {
  'comp-1': {
    id: 'comp-1',
    name: 'Al-Rashid Foodstuff Trading LLC',
    country: 'United Arab Emirates',
    city: 'Dubai',
    address: 'Al Ras Spice Market, Block D-12, Deira, Dubai',
    website: 'https://al-rashid-foods.ae',
    type: 'Importer',
    score: 98,
    description:
      'Al-Rashid Foodstuff Trading LLC is one of the premier commodity distributors in the UAE. Sourcing bulk spices, grains, and nuts from Southeast Asia and India, they serve over 200 food processors across the GCC.',
    markets: ['United Arab Emirates', 'Saudi Arabia', 'Oman', 'Qatar'],
    sourcing: ['Vietnam (pepper/coffee)', 'India (cumin/cardamom)', 'Indonesia (cloves)'],
    shipments: [
      {
        date: '2026-03-12',
        product: 'Black Pepper 550g/l ASTA',
        quantity: '32 MT',
        origin: 'Ho Chi Minh Port, VN',
        destination: 'Jebel Ali, UAE',
      },
      {
        date: '2026-02-05',
        product: 'Turmeric Finger Single Polished',
        quantity: '18 MT',
        origin: 'Chennai Port, IN',
        destination: 'Jebel Ali, UAE',
      },
      {
        date: '2025-11-20',
        product: 'Cumin Seeds 99% Clean',
        quantity: '22 MT',
        origin: 'Mundra Port, IN',
        destination: 'Jebel Ali, UAE',
      },
    ],
    contacts: [
      {
        name: 'Youssef Al-Rashid',
        role: 'Managing Director',
        email: 'youssef@al-rashid-foods.ae',
        phone: '+971 50 123 4567',
        whatsappVerified: true,
      },
      {
        name: 'Deepak Mehta',
        role: 'Head of Procurement',
        email: 'd.mehta@al-rashid-foods.ae',
        phone: '+971 52 987 6543',
        whatsappVerified: true,
      },
    ],
    insights: {
      buyerProfile:
        'High-volume distributor focusing on consistent bulk spice shipments. Highly quality-conscious with strict tolerance for moisture content (under 12.5%).',
      frequency: 'Orders 2-3 containers of black pepper monthly, typically during peak harvest seasons.',
      negotiationAdvice:
        'Quotes should specify CIF Jebel Ali terms. Offering pre-shipment SGS inspection reports speeds up contracts by 80%.',
      riskAudit:
        'Low risk. Trade history shows Letters of Credit (L/C) are opened via Emirates NBD within 48 hours of contract signing.',
    },
  },
  'comp-3': {
    id: 'comp-3',
    name: 'Gulf Spices & Seeds Industry',
    country: 'United Arab Emirates',
    city: 'Abu Dhabi',
    address: 'Industrial Area 4, ICAD I, Abu Dhabi',
    website: 'https://gulfspices.com',
    type: 'Importer',
    score: 92,
    description:
      'Gulf Spices & Seeds Industry operates a large-scale cleaning and packaging facility in ICAD Abu Dhabi, distributing raw and processed agricultural seeds and whole spices across the Middle East.',
    markets: ['United Arab Emirates', 'Oman', 'Kuwait', 'Bahrain'],
    sourcing: ['India (seeds)', 'Vietnam (cassia/cinnamon)', 'Madagascar (cloves)'],
    shipments: [
      {
        date: '2026-04-02',
        product: 'Coriander Seeds 98% Purity',
        quantity: '15 MT',
        origin: 'Chennai Port, IN',
        destination: 'Khalifa Port, UAE',
      },
      {
        date: '2026-02-18',
        product: 'Cassia Split A-Grade',
        quantity: '12 MT',
        origin: 'Hai Phong Port, VN',
        destination: 'Khalifa Port, UAE',
      },
    ],
    contacts: [
      {
        name: 'Faisal Bin-Said',
        role: 'Operations Director',
        email: 'faisal@gulfspices.com',
        phone: '+971 50 444 8888',
        whatsappVerified: true,
      },
    ],
    insights: {
      buyerProfile:
        'Industrial processor requiring raw spices for cleaning, polishing, and grinding. Prefers wholesale bulk packages of 25kg/50kg PP bags.',
      frequency: 'Buys quarterly contracts. Pre-allocates volume 3 months in advance.',
      negotiationAdvice:
        'Price-sensitive buyer. High preference for FOB port of origin quotes so they can handle their own freight logistics.',
      riskAudit:
        'Solid payment history. Settles bills via Telegraphic Transfer (T/T) 30% advance, 70% against scan of Bill of Lading (B/L).',
    },
  },
};

export default function CompanyDossier() {
  const params = useParams();
  const id = (params?.id as string) || 'comp-1';
  const company = mockCompaniesDetails[id] || mockCompaniesDetails['comp-1'];

  const [activeTab, setActiveTab] = useState<'overview' | 'shipments' | 'contacts' | 'insights'>('overview');

  return (
    <div className={`${styles.dossierContainer} fade-in`}>
      {/* Back Button */}
      <Link href="/dashboard/companies" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to directory
      </Link>

      {/* Header Profile Info */}
      <div className={styles.dossierHeaderCard}>
        <div className={styles.companyMetaInfo}>
          <div className={styles.titleArea}>
            <h1 className={styles.companyName}>{company.name}</h1>
            <span className={`badge badge-lime`}>{company.type}</span>
          </div>

          <div className={styles.detailsList}>
            <div className={styles.detailItem}>
              <svg className={styles.detailsIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{company.city}, {company.country}</span>
            </div>

            <div className={styles.detailItem}>
              <svg className={styles.detailsIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z" />
                <path d="M12 2v5h5" />
              </svg>
              <span>{company.address}</span>
            </div>

            <div className={styles.detailItem}>
              <svg className={styles.detailsIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <a href={company.website} target="_blank" rel="noopener noreferrer" className={styles.websiteLink}>
                {company.website.replace('https://', '')}
              </a>
            </div>
          </div>
        </div>

        <div className={styles.headerMetrics}>
          <div className={styles.metricBadge}>
            <span className={styles.metricValue}>{company.score}%</span>
            <span className={styles.metricLabel}>Match score</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className={styles.dossierBodyGrid}>
        {/* Tab Controls and Container */}
        <div className={styles.tabsContainer}>
          <div className={styles.tabsList}>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'overview' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'shipments' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('shipments')}
            >
              Shipments
            </button>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'contacts' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('contacts')}
            >
              Contacts
            </button>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'insights' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              AI insights
            </button>
          </div>

          {/* Tab Panel Renderings */}
          <div className={styles.tabPanel}>
            {activeTab === 'overview' && (
              <div className={`${styles.overviewGrid} fade-in`}>
                <div>
                  <h3 className={styles.panelTitle}>Profile summary</h3>
                  <p className={styles.descriptionBox}>{company.description}</p>
                </div>

                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Sourcing markets</span>
                    <div className={styles.infoCardValue}>
                      {company.sourcing.join(', ')}
                    </div>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Distribution markets</span>
                    <div className={styles.infoCardValue}>
                      {company.markets.join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shipments' && (
              <div className="fade-in">
                <h3 className={styles.panelTitle}>Historical shipments</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.shipmentsTable}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Origin port</th>
                        <th>Destination port</th>
                      </tr>
                    </thead>
                    <tbody>
                      {company.shipments.map((s, index) => (
                        <tr key={index}>
                          <td>{s.date}</td>
                          <td><strong>{s.product}</strong></td>
                          <td>{s.quantity}</td>
                          <td>{s.origin}</td>
                          <td>{s.destination}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className={`${styles.contactsList} fade-in`}>
                <h3 className={styles.panelTitle}>Verified procurement officers</h3>
                {company.contacts.map((c, index) => (
                  <div key={index} className={styles.contactRow}>
                    <div className={styles.contactProfile}>
                      <div className={styles.contactAvatar}>
                        {c.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div className={styles.contactMeta}>
                        <span className={styles.contactName}>{c.name}</span>
                        <span className={styles.contactRole}>{c.role}</span>
                      </div>
                    </div>

                    <div className={styles.contactMeta}>
                      <span className={styles.contactRole}>Email</span>
                      <span className={styles.contactName}>{c.email}</span>
                    </div>

                    <div className={styles.contactMeta}>
                      <span className={styles.contactRole}>Phone</span>
                      <span className={styles.contactName}>{c.phone}</span>
                    </div>

                    <div className={styles.contactActions}>
                      {c.whatsappVerified && (
                        <span className="badge badge-lime">
                          <svg style={{ marginRight: '4px' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                          WhatsApp verified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'insights' && (
              <div className={`${styles.overviewGrid} fade-in`}>
                <h3 className={styles.panelTitle}>AI strategic intelligence</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Strategic buyer profile</span>
                    <p className={styles.infoCardValue}>{company.insights.buyerProfile}</p>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Estimated sourcing frequency</span>
                    <p className={styles.infoCardValue}>{company.insights.frequency}</p>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Negotiation strategy</span>
                    <p className={styles.infoCardValue}>{company.insights.negotiationAdvice}</p>
                  </div>

                  <div className={styles.infoCard}>
                    <span className={styles.infoCardLabel}>Payment risk audit</span>
                    <p className={styles.infoCardValue}>{company.insights.riskAudit}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Details Sidebar Card */}
        <div className={styles.sideCard}>
          <h3 className={styles.sideTitle}>Dossier summary</h3>
          <div className={styles.sideDetailsList}>
            <div className={styles.sideDetailRow}>
              <span className={styles.sideDetailLabel}>Status</span>
              <span className="badge badge-green">Verified importer</span>
            </div>

            <div className={styles.sideDetailRow}>
              <span className={styles.sideDetailLabel}>Company type</span>
              <span className={styles.sideDetailValue}>{company.type}</span>
            </div>

            <div className={styles.sideDetailRow}>
              <span className={styles.sideDetailLabel}>Confidence</span>
              <span className={styles.sideDetailValue}>{company.score}% match</span>
            </div>

            <div className={styles.sideDetailRow}>
              <span className={styles.sideDetailLabel}>Last shipment</span>
              <span className={styles.sideDetailValue}>{company.shipments[0]?.date || 'N/A'}</span>
            </div>
          </div>
          <button type="button" className="btn-primary" style={{ width: '100%' }}>
            Add to pipeline
          </button>
        </div>
      </div>
    </div>
  );
}
