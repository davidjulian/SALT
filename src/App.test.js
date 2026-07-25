import {
  createTransporterInstance,
  hydrogenMmolToPH,
  simulateTransport
} from './App';
import {
  buildLayoutUrl,
  parseLayoutState
} from './layoutState';

function layout(entries) {
  return entries.map(([id, placement, activity = 'auto']) =>
    createTransporterInstance(id, placement, activity)
  );
}

function epithelialFlux(result, ion) {
  return result.transepiFluxData.find(row => row.ion === ion)?.transepithelial || 0;
}

describe('SALT simulation scenarios', () => {
  test('converts hydrogen concentration from mmol/L before calculating pH', () => {
    expect(hydrogenMmolToPH(0.00004)).toBeCloseTo(7.398, 3);
    expect(hydrogenMmolToPH(0.000063)).toBeCloseTo(7.201, 3);
  });

  test('pump alone establishes gradients without epithelial flux', () => {
    const result = simulateTransport({
      tList: layout([['NaKATPase', 'basolateral']])
    });

    expect(epithelialFlux(result, 'Na+')).toBeCloseTo(0, 6);
    expect(epithelialFlux(result, 'K+')).toBeCloseTo(0, 6);
    expect(result.concentrations.icf['Na+']).toBeCloseTo(12, 6);
    expect(result.concentrations.icf['K+']).toBeCloseTo(140, 6);
  });

  test('same-membrane ENaC and pump do not create epithelial sodium absorption', () => {
    const result = simulateTransport({
      tList: layout([
        ['ENaC', 'apical'],
        ['NaKATPase', 'apical']
      ])
    });

    expect(epithelialFlux(result, 'Na+')).toBeCloseTo(0, 6);
  });

  test('opposite-membrane ENaC and pump complete sodium absorption', () => {
    const result = simulateTransport({
      tList: layout([
        ['ENaC', 'apical'],
        ['NaKATPase', 'basolateral']
      ])
    });

    expect(epithelialFlux(result, 'Na+')).toBeGreaterThan(0);
  });

  test('NBC Efflux reports why it is unsupported without proton extrusion', () => {
    const nbc = createTransporterInstance('NBCEfflux', 'basolateral');
    const result = simulateTransport({
      tList: [nbc, createTransporterInstance('NaKATPase', 'basolateral')]
    });
    const activity = result.transporterActivityReport.find(item => item.uid === nbc.uid);

    expect(epithelialFlux(result, 'HCO3-')).toBeCloseTo(0, 6);
    expect(activity.status).toBe('unsupported');
    expect(activity.message).toMatch(/requires proton extrusion/i);
  });

  test('fixed low pump activity constrains the entire SGLT event and preserves sodium coupling', () => {
    const result = simulateTransport({
      tList: layout([
        ['SGLT', 'apical', 2],
        ['GLUT2', 'basolateral'],
        ['NaKATPase', 'basolateral', 0.5]
      ])
    });

    expect(epithelialFlux(result, 'Glucose')).toBeGreaterThan(0);
    expect(epithelialFlux(result, 'Glucose')).toBeCloseTo(epithelialFlux(result, 'Na+'), 6);
    expect(result.fluxEvents.find(event => event.id === 'SGLT').supportScale).toBeLessThan(1);
  });

  test('Auto pump activity supports parallel nutrient pathways without competition', () => {
    const transporters = layout([
      ['NaPi2', 'apical'],
      ['PiFacilitator', 'basolateral'],
      ['NaAA', 'apical'],
      ['AAFacilitator', 'basolateral'],
      ['NaKATPase', 'basolateral']
    ]);
    const result = simulateTransport({ tList: transporters });
    const constrainedIds = result.transporterActivityReport
      .filter(item => item.status === 'constrained')
      .map(item => item.id);

    expect(constrainedIds).toEqual([]);
    expect(epithelialFlux(result, 'Phosphate')).toBeGreaterThan(0);
    expect(epithelialFlux(result, 'AA')).toBeGreaterThan(0);
  });

  test('Auto activity preserves the complete NCX1 exchange event stoichiometry', () => {
    const ncx = createTransporterInstance('NCX1', 'basolateral');
    const result = simulateTransport({
      tList: [
        createTransporterInstance('TRPV56', 'apical'),
        ncx,
        createTransporterInstance('NaKATPase', 'basolateral'),
        createTransporterInstance('ROMK', 'basolateral')
      ]
    });
    const activity = result.transporterActivityReport.find(item => item.uid === ncx.uid);
    const event = result.fluxEvents.find(item => item.uid === ncx.uid);
    const sodiumFlux = Math.abs(event.solutes.find(solute => solute.ion === 'Na+').flux);
    const calciumFlux = Math.abs(event.solutes.find(solute => solute.ion === 'Ca2+').flux);

    expect(activity.status).toBe('active');
    expect(epithelialFlux(result, 'Ca2+')).toBeGreaterThan(0);
    expect(sodiumFlux).toBeCloseTo(calciumFlux * 3, 6);
  });

  test('Auto Kir balances pump-associated potassium loading only when Kir is placed', () => {
    const withoutKir = simulateTransport({
      tList: layout([
        ['ENaC', 'apical'],
        ['NaKATPase', 'basolateral']
      ])
    });
    const withKir = simulateTransport({
      tList: layout([
        ['ENaC', 'apical'],
        ['NaKATPase', 'basolateral'],
        ['ROMK', 'basolateral']
      ])
    });

    expect(withoutKir.cellImbalanceReport.find(row => row.ion === 'K+')).toBeDefined();
    expect(withKir.cellImbalanceReport.find(row => row.ion === 'K+')).toBeUndefined();
  });

  test('Auto activity matches placed SGLT and GLUT glucose fluxes', () => {
    const result = simulateTransport({
      tList: layout([
        ['SGLT', 'apical'],
        ['GLUT2', 'basolateral'],
        ['NaKATPase', 'basolateral']
      ])
    });
    const sgltGlucose = result.fluxEvents
      .find(event => event.id === 'SGLT')
      .solutes.find(solute => solute.ion === 'Glucose').flux;
    const glutGlucose = result.fluxEvents
      .find(event => event.id === 'GLUT2')
      .solutes.find(solute => solute.ion === 'Glucose').flux;

    expect(sgltGlucose).toBeCloseTo(-glutGlucose, 6);
    expect(result.cellImbalanceReport.find(row => row.ion === 'Glucose')).toBeUndefined();
  });

  test('acid-base pairing cannot reuse NBC capacity across multiple proton extruders', () => {
    const nbc = createTransporterInstance('NBCEfflux', 'basolateral');
    const result = simulateTransport({
      tList: [
        createTransporterInstance('NHE3', 'apical'),
        createTransporterInstance('HATPase', 'apical'),
        nbc,
        createTransporterInstance('NaKATPase', 'basolateral')
      ]
    });
    const nbcEvent = result.fluxEvents.find(event => event.uid === nbc.uid);
    const nbcCapacity = Math.abs(
      nbcEvent.solutes.find(solute => solute.ion === 'HCO3-').flux
    );

    expect(epithelialFlux(result, 'HCO3-')).toBeLessThanOrEqual(nbcCapacity + 1e-6);
    expect(Math.abs(epithelialFlux(result, 'H+'))).toBeLessThanOrEqual(nbcCapacity + 1e-6);
  });

  test.each([
    {
      lesson: 1,
      entries: [['ENaC', 'apical'], ['NaKATPase', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'Na+')).toBeGreaterThan(0)
    },
    {
      lesson: 2,
      entries: [['SGLT', 'apical'], ['GLUT2', 'basolateral'], ['NaKATPase', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'Glucose')).toBeGreaterThan(0)
    },
    {
      lesson: 3,
      entries: [['ENaC', 'apical'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral']],
      assertResult: result => expect(result.cellImbalanceReport.find(row => row.ion === 'K+')).toBeUndefined()
    },
    {
      lesson: 4,
      entries: [['ENaC', 'apical'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral'], ['AQP', 'apical'], ['AQP', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'H2O')).toBeGreaterThan(0)
    },
    {
      lesson: 5,
      entries: [['CFTR', 'apical'], ['NKCC', 'basolateral'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'Cl-')).toBeLessThan(0)
    },
    {
      lesson: 6,
      entries: [['ROMK', 'apical'], ['NaKATPase', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'K+')).toBeLessThan(0)
    },
    {
      lesson: 7,
      entries: [['ENaC', 'apical'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral']],
      options: { paracellularType: 'cation' },
      assertResult: result => expect(Math.abs(result.paraFlux['Na+'])).toBeGreaterThan(0)
    },
    {
      lesson: 8,
      entries: [['NCC', 'apical'], ['ClCKb', 'basolateral'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral']],
      assertResult: result => {
        expect(epithelialFlux(result, 'Na+')).toBeGreaterThan(0);
        expect(epithelialFlux(result, 'Cl-')).toBeGreaterThan(0);
      }
    },
    {
      lesson: 9,
      entries: [
        ['NaPi2', 'apical'], ['PiFacilitator', 'basolateral'],
        ['NaAA', 'apical'], ['AAFacilitator', 'basolateral'],
        ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral'],
        ['AQP', 'apical'], ['AQP', 'basolateral']
      ],
      assertResult: result => {
        expect(epithelialFlux(result, 'Phosphate')).toBeGreaterThan(0);
        expect(epithelialFlux(result, 'AA')).toBeGreaterThan(0);
        expect(epithelialFlux(result, 'H2O')).toBeGreaterThan(0);
      }
    },
    {
      lesson: 10,
      entries: [['NHE3', 'apical'], ['NBCEfflux', 'basolateral'], ['NaKATPase', 'basolateral'], ['ROMK', 'basolateral']],
      assertResult: result => {
        expect(epithelialFlux(result, 'H+')).toBeLessThan(0);
        expect(epithelialFlux(result, 'HCO3-')).toBeGreaterThan(0);
      }
    },
    {
      lesson: 11,
      entries: [['TRPV56', 'apical'], ['PMCA', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'Ca2+')).toBeGreaterThan(0)
    },
    {
      lesson: 12,
      entries: [['MATE', 'apical'], ['OCT', 'basolateral']],
      assertResult: result => expect(epithelialFlux(result, 'OC+')).toBeLessThan(0)
    }
  ])('preserves the qualitative target for Lesson $lesson', ({ entries, options = {}, assertResult }) => {
    const result = simulateTransport({
      tList: layout(entries),
      ...options
    });
    assertResult(result);
  });
});

describe('shareable layout state', () => {
  test('round-trips transporter placement, activity, and settings through the URL', () => {
    const state = {
      transporters: layout([
        ['NHE3', 'apical'],
        ['NBCEfflux', 'basolateral', 2],
        ['NaKATPase', 'basolateral', 0.5]
      ]),
      tissuePreset: 'proximal-tubule',
      paracellularType: 'anion',
      paraCationPerm: 1,
      paraAnionPerm: 0.5,
      backgroundOsmoticPullSetting: 'none',
      baseConcentrations: {
        apicalECF: { 'Na+': 140 },
        icf: { 'Na+': 12 },
        basolateralECF: { 'Na+': 145 }
      },
      resultsView: 'details'
    };

    const url = buildLayoutUrl(state, 'https://example.test/salt');
    const restored = parseLayoutState(new URL(url).search);

    expect(restored.tissuePreset).toBe('proximal-tubule');
    expect(restored.resultsView).toBe('details');
    expect(restored.transporters).toEqual([
      { id: 'NHE3', placement: 'apical', activity: 'auto' },
      { id: 'NBCEfflux', placement: 'basolateral', activity: 2 },
      { id: 'NaKATPase', placement: 'basolateral', activity: 0.5 }
    ]);
  });
});
