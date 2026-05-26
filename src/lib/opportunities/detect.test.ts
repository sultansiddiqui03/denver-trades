import { describe, it, expect } from 'vitest';
import {
  detectDemandOpportunity,
  detectSwitchOpportunity,
  detectFitBuyerOpportunity,
  type CompanyLike,
  type OppOrg,
} from './detect';

const spiceOrg: OppOrg = { commodities: ['spices'], target_markets: ['UAE'] };

describe('detectDemandOpportunity', () => {
  it('returns null when there is no usable product', () => {
    expect(detectDemandOpportunity({ product: null }, 't1', spiceOrg)).toBeNull();
    expect(detectDemandOpportunity({ product: '   ' }, 't1', spiceOrg)).toBeNull();
  });

  it('flags a matching demand at priority 88 with a stable dedupe key', () => {
    const opp = detectDemandOpportunity(
      { product: 'Black Pepper', quantity: '20 MT', incoterm: 'CIF', port: 'Jebel Ali' },
      'thread-42',
      spiceOrg,
    );
    expect(opp).not.toBeNull();
    expect(opp!.type).toBe('demand_match');
    expect(opp!.priority).toBe(88);
    expect(opp!.dedupeKey).toBe('demand:thread-42');
    expect(opp!.evidence?.matchesCommodities).toBe(true);
    expect(opp!.summary).toContain('matching your commodities');
    expect(opp!.title).toBe('Buyer wants Black Pepper');
  });

  it('still surfaces an off-commodity demand, but at lower priority', () => {
    const opp = detectDemandOpportunity({ product: 'Steel Pipes' }, 't9', spiceOrg);
    expect(opp!.priority).toBe(60);
    expect(opp!.evidence?.matchesCommodities).toBe(false);
    expect(opp!.summary).not.toContain('matching your commodities');
  });

  it('treats every demand as a match when the org has no commodities', () => {
    const opp = detectDemandOpportunity({ product: 'Anything' }, 't', {});
    expect(opp!.priority).toBe(88);
  });

  it('trims whitespace around the product', () => {
    const opp = detectDemandOpportunity({ product: '  Cardamom  ' }, 't', spiceOrg);
    expect(opp!.title).toBe('Buyer wants Cardamom');
    expect(opp!.product).toBe('Cardamom');
  });
});

describe('detectSwitchOpportunity', () => {
  const switchingBuyer: CompanyLike = {
    id: 'c1',
    name: 'Al-Rashid Foods',
    type: 'Importer',
    products_dealt: ['Black Pepper', 'Cardamom'],
    buyer_fit_score: 80,
    sourcing_signal: { status: 'switching', headline: 'Switching suppliers — Vietnam → India' },
  };

  it('scores a switching, matching buyer at 96 (92 base + fit boost)', () => {
    const opp = detectSwitchOpportunity(switchingBuyer, spiceOrg);
    expect(opp!.type).toBe('supplier_switch');
    expect(opp!.priority).toBe(96); // 92 + 80 * 0.05
    expect(opp!.dedupeKey).toBe('switch:c1:switching');
    expect(opp!.title).toContain('switching suppliers');
  });

  it('scores a declining buyer below a switching one', () => {
    const declining = detectSwitchOpportunity(
      { ...switchingBuyer, sourcing_signal: { status: 'declining' } },
      spiceOrg,
    );
    expect(declining!.priority).toBe(80); // 76 + 4
    expect(declining!.title).toContain('reducing imports');
  });

  it('ignores non-displacement and missing signals', () => {
    for (const status of ['growing', 'stable', 'new']) {
      expect(
        detectSwitchOpportunity({ ...switchingBuyer, sourcing_signal: { status } }, spiceOrg),
      ).toBeNull();
    }
    expect(
      detectSwitchOpportunity({ ...switchingBuyer, sourcing_signal: null }, spiceOrg),
    ).toBeNull();
  });

  it('ignores a buyer whose products do not match the org commodities', () => {
    const coffee: CompanyLike = {
      ...switchingBuyer,
      products_dealt: ['Green Coffee Arabica'],
      hs_codes: null,
    };
    expect(detectSwitchOpportunity(coffee, spiceOrg)).toBeNull();
  });
});

describe('detectFitBuyerOpportunity', () => {
  const fitBuyer: CompanyLike = {
    id: 'c2',
    name: 'Gulf Spice Traders',
    type: 'Importer',
    products_dealt: ['Cumin', 'Coriander'],
    buyer_fit_score: 90,
  };

  it('flags a high-fit importer with priority equal to the score', () => {
    const opp = detectFitBuyerOpportunity(fitBuyer, spiceOrg);
    expect(opp!.type).toBe('new_fit_buyer');
    expect(opp!.priority).toBe(90);
    expect(opp!.dedupeKey).toBe('fitbuyer:c2');
    expect(opp!.title).toBe('High-fit buyer: Gulf Spice Traders');
  });

  it('ignores companies below the 70 fit threshold', () => {
    expect(detectFitBuyerOpportunity({ ...fitBuyer, buyer_fit_score: 69 }, spiceOrg)).toBeNull();
  });

  it('ignores exporters even with a high fit score', () => {
    expect(detectFitBuyerOpportunity({ ...fitBuyer, type: 'Exporter' }, spiceOrg)).toBeNull();
  });

  it('ignores a high-fit buyer whose products are off-commodity (coffee vs spice org)', () => {
    const coffee: CompanyLike = { ...fitBuyer, products_dealt: ['Green Coffee Arabica'] };
    expect(detectFitBuyerOpportunity(coffee, spiceOrg)).toBeNull();
  });
});
