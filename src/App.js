import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
// Simple Button for canvas use (replaces shadcn/ui)
const Button = ({ children, onClick, className = "", variant, size, ...props }) => (
  <button
    className={
      "rounded px-3 py-1 border " +
      (variant === "outline" ? "border-gray-400 bg-white" : "bg-blue-500 text-white") +
      (size === "sm" ? " text-xs py-0.5 px-2" : "") +
      " " + className
    }
    onClick={onClick}
    {...props}
  >
    {children}
  </button>
);

function osmolality(comp) {
  // Teaching model: approximate osmotic strength from solutes only.
  return Object.entries(comp)
    .filter(([ion]) => ion !== 'H2O')
    .reduce((sum, [ion, conc]) => sum + Math.abs(conc), 0);
}

const WATER_EPSILON = 0.05;
const NORMAL_OSMOLALITY = 284.2;
const FIXED_INTRACELLULAR_OSMOLES = 111.2;
const CHARGE_EPSILON = 0.05;
const ION_VALENCE = {
  'Na+': 1,
  'K+': 1,
  'Cl-': -1,
  'H+': 1,
  'HCO3-': -1,
  'Ca2+': 2,
  Glucose: 0,
  H2O: 0
};

function osmCategory(value, reference = NORMAL_OSMOLALITY) {
  const diff = value - reference;
  const pct = reference ? diff / reference : 0;
  if (pct > 0.08) return 'high';
  if (pct < -0.08) return 'low';
  return 'near normal';
}

function tendencyStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < WATER_EPSILON) return 'none';
  if (magnitude < 5) return 'weak';
  if (magnitude < 15) return 'moderate';
  return 'strong';
}

function membraneWaterTendency(bathName, bathOsm, cellOsm, hasPathway) {
  const delta = cellOsm - bathOsm;
  if (!hasPathway) {
    return {
      label: `${bathName} membrane`,
      direction: 'no pathway',
      strength: 'none',
      value: 0
    };
  }
  if (Math.abs(delta) < WATER_EPSILON) {
    return {
      label: `${bathName} membrane`,
      direction: 'no strong net tendency',
      strength: 'none',
      value: delta
    };
  }
  return {
    label: `${bathName} membrane`,
    direction: delta > 0 ? 'into cell' : 'out of cell',
    strength: tendencyStrength(delta),
    value: delta
  };
}

function transepithelialWaterTendency(value, hasPathway, pathwayLabel) {
  if (!hasPathway) {
    return {
      label: pathwayLabel,
      direction: 'no complete pathway',
      strength: 'none',
      value: 0
    };
  }
  if (Math.abs(value) < WATER_EPSILON) {
    return {
      label: pathwayLabel,
      direction: 'no strong net tendency',
      strength: 'none',
      value
    };
  }
  return {
    label: pathwayLabel,
    direction: value > 0 ? 'absorption' : 'secretion',
    strength: tendencyStrength(value),
    value
  };
}

function chargeStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < CHARGE_EPSILON) return 'none';
  if (magnitude < 0.5) return 'weak';
  if (magnitude < 1.5) return 'moderate';
  return 'strong';
}

function chargeSum(fluxes) {
  return Object.entries(fluxes)
    .reduce((sum, [ion, flux]) => sum + (ION_VALENCE[ion] ?? 0) * flux, 0);
}

function transepithelialChargeSum(transepiFluxData) {
  return transepiFluxData
    .filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => sum + (ION_VALENCE[row.ion] ?? 0) * row.transepithelial, 0);
}

function cellPolarityDirection(value) {
  if (Math.abs(value) < CHARGE_EPSILON) return 'no strong net tendency';
  return value > 0 ? 'cell tends positive' : 'cell tends negative';
}

function epithelialPolarityDirection(value) {
  if (Math.abs(value) < CHARGE_EPSILON) return 'no strong net tendency';
  return value > 0 ? 'lumen tends negative relative to blood' : 'lumen tends positive relative to blood';
}

function buildChargeReport(apicalFlux, basolateralFlux, transepiFluxData) {
  const apicalCharge = chargeSum(apicalFlux);
  const basolateralCharge = chargeSum(basolateralFlux);
  const cellCharge = apicalCharge + basolateralCharge;
  const transepithelialCharge = transepithelialChargeSum(transepiFluxData);

  return {
    apical: {
      label: 'Apical membrane',
      direction: cellPolarityDirection(apicalCharge),
      strength: chargeStrength(apicalCharge),
      value: apicalCharge
    },
    basolateral: {
      label: 'Basolateral membrane',
      direction: cellPolarityDirection(basolateralCharge),
      strength: chargeStrength(basolateralCharge),
      value: basolateralCharge
    },
    cell: {
      label: 'Cell net polarity',
      direction: cellPolarityDirection(cellCharge),
      strength: chargeStrength(cellCharge),
      value: cellCharge
    },
    transepithelial: {
      label: 'Transepithelial polarity',
      direction: epithelialPolarityDirection(transepithelialCharge),
      strength: chargeStrength(transepithelialCharge),
      value: transepithelialCharge
    }
  };
}

function buildWaterReport(apicalECF, icf, basolateralECF, tList, paracellularType, paraCationPerm, transepiFluxDataNoH2O) {
  const apicalOsm = osmolality(apicalECF);
  const mobileIcfOsm = osmolality(icf);
  const icfOsm = mobileIcfOsm + FIXED_INTRACELLULAR_OSMOLES;
  const basolateralOsm = osmolality(basolateralECF);
  const apicalWaterPath = tList.some(t => ['AQP2', 'AQP3'].includes(t.id) && t.placement === 'apical');
  const basolateralWaterPath = tList.some(t => ['AQP2', 'AQP3'].includes(t.id) && t.placement === 'basolateral');
  const hasTranscellularPath = apicalWaterPath && basolateralWaterPath;
  const hasParacellularPath = paracellularType === 'cation';
  const osmoticSoluteFlux = transepiFluxDataNoH2O.reduce((sum, row) => sum + row.transepithelial, 0);
  const transcellularValue = hasTranscellularPath
    ? 0.5 * Math.sign(osmoticSoluteFlux) * Math.min(Math.abs(osmoticSoluteFlux), 5)
    : 0;
  const paracellularValue = hasParacellularPath
    ? paraCationPerm * (basolateralOsm - apicalOsm) / 25
    : 0;
  const apicalMembrane = membraneWaterTendency('Apical', apicalOsm, icfOsm, apicalWaterPath);
  const basolateralMembrane = membraneWaterTendency('Basolateral', basolateralOsm, icfOsm, basolateralWaterPath);
  const cellValue = apicalMembrane.value + basolateralMembrane.value;
  const netTransepithelialValue = transcellularValue + paracellularValue;

  return {
    osmolality: {
      apical: apicalOsm,
      icf: icfOsm,
      mobileIcf: mobileIcfOsm,
      fixedIcf: FIXED_INTRACELLULAR_OSMOLES,
      basolateral: basolateralOsm,
      apicalCategory: osmCategory(apicalOsm),
      icfCategory: osmCategory(icfOsm),
      basolateralCategory: osmCategory(basolateralOsm)
    },
    apicalMembrane,
    basolateralMembrane,
    cell: {
      label: 'Cell water balance',
      direction: Math.abs(cellValue) < WATER_EPSILON
        ? 'no strong net tendency'
        : cellValue > 0
          ? 'swelling tendency'
          : 'shrinking tendency',
      strength: tendencyStrength(cellValue),
      value: cellValue
    },
    transcellular: transepithelialWaterTendency(transcellularValue, hasTranscellularPath, 'Transcellular water'),
    paracellular: transepithelialWaterTendency(paracellularValue, hasParacellularPath, 'Paracellular water'),
    netTransepithelial: transepithelialWaterTendency(netTransepithelialValue, hasTranscellularPath || hasParacellularPath, 'Net epithelial water')
  };
}

const INITIAL_TRANSPORTERS = [
  { id: 'AQP2',     name: 'AQP2',       type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AQP3',     name: 'AQP3',       type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ENaC',     name: 'ENaC',       type: 'channel',    stoich: { 'Na+': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'GLUT2',    name: 'GLUT2',      type: 'channel',    stoich: { 'Glucose': -1 },      kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HATPase',  name: 'H⁺-ATPase',  type: 'pump',       stoich: { 'H+': -1 },           kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HKATPase', name: 'H⁺/K⁺-ATPase', type: 'pump', stoich: { 'H+': -1, 'K+': 1 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NBCe1',    name: 'NBCe1',      type: 'symporter',  stoich: { 'Na+': 1, 'HCO3-': 3 }, kinetics: { maxRate: 0.7, Km: 2.0 }, placement: 'none', density: 1 },
  { id: 'NCC',      name: 'NCC',        type: 'symporter',  stoich: { 'Na+': 1, 'Cl-': 1 },  kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NCX1',     name: 'NCX1',       type: 'exchanger',  stoich: { 'Na+': 3, 'Ca2+': -1 }, kinetics: { maxRate: 0.4, Km: 0.2 }, placement: 'none', density: 1 },
  { id: 'NHE3',     name: 'NHE3',       type: 'antiporter', stoich: { 'Na+': 1, 'H+': -1 },  kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NKCC2',    name: 'NKCC2',      type: 'symporter',  stoich: { 'Na+': 1, 'K+': 1, 'Cl-': 2 }, kinetics: { maxRate: 0.5, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'NaKATPase',name: 'Na⁺/K⁺-ATPase',type: 'pump',       stoich: { 'Na+': -3, 'K+': 2 }, kinetics: { maxRate: 1.2, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PMCA',     name: 'PMCA',       type: 'pump',       stoich: { 'Ca2+': -1 },         kinetics: { maxRate: 0.3, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'ROMK',     name: 'ROMK',       type: 'channel',    stoich: { 'K+': -1 },           kinetics: { maxRate: 0.5, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'SGLT2',    name: 'SGLT2',      type: 'symporter',  stoich: { 'Na+': 1, 'Glucose': 1 }, kinetics: { maxRate: 0.8, Km: 1.5 }, placement: 'none', density: 1 }
];

const TRANSPORTER_GROUPS = [
  { label: 'Water pathways', ids: ['AQP2', 'AQP3'] },
  { label: 'Channels', ids: ['ENaC', 'GLUT2', 'ROMK'] },
  { label: 'Cotransporters', ids: ['SGLT2', 'NCC', 'NKCC2', 'NBCe1'] },
  { label: 'Exchangers', ids: ['NHE3', 'NCX1'] },
  { label: 'Pumps', ids: ['NaKATPase', 'HATPase', 'HKATPase', 'PMCA'] }
];

const DENSITY_OPTIONS = [
  { label: 'Low', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'High', value: 2 }
];

const TRANSPORTER_DESCRIPTIONS = {
  AQP2: 'Aquaporin 2: enables rapid H2O movement.',
  AQP3: 'Aquaporin 3: enables rapid H2O movement.',
  ENaC: 'Epithelial sodium channel: passive Na+ flux follows the Na+ gradient.',
  GLUT2: 'Glucose transporter 2: passive glucose flux follows the glucose gradient.',
  HATPase: 'Proton-ATPase: pumps H+ out using ATP.',
  HKATPase: 'Proton-potassium ATPase: exchanges one H+ out for one K+ in using ATP.',
  NBCe1: 'Electrogenic sodium bicarbonate cotransporter: moves Na+ and HCO3- out.',
  NCC: 'Sodium-chloride cotransporter: moves Na+ and Cl- together.',
  NCX1: 'Sodium-calcium exchanger: exchanges Na+ entry for Ca2+ exit.',
  NHE3: 'Sodium-hydrogen exchanger: exchanges Na+ entry for H+ exit.',
  NKCC2: 'Sodium-potassium-chloride cotransporter: moves Na+, K+, and Cl- together.',
  NaKATPase: 'Sodium-potassium pump: pumps Na+ out and K+ in using ATP.',
  PMCA: 'Plasma membrane calcium ATPase: pumps Ca2+ out using ATP.',
  ROMK: 'Potassium channel: passive K+ flux follows the K+ gradient.',
  SGLT2: 'Sodium-glucose cotransporter: moves Na+ and glucose together.'
};

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001,'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 }
};

const CONCENTRATION_EDIT_IONS = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Glucose'];
const ION_LABEL = {
  'Na+': 'Na⁺',
  'K+': 'K⁺',
  'Cl-': 'Cl⁻',
  'H+': 'H⁺',
  'HCO3-': 'HCO₃⁻',
  'Ca2+': 'Ca²⁺',
  Glucose: 'Glucose',
  H2O: 'H₂O'
};
const SURFACE_TRANSPORT_SENSITIVITY = 0.5;
const SURFACE_MIXING_FRACTION = 0.25;
const SURFACE_MAX_MULTIPLIER = 2;
const PASSIVE_SOLUTE_CHANNELS = {
  ENaC: 'Na+',
  GLUT2: 'Glucose',
  ROMK: 'K+'
};
const ACTIVE_CELL_CONCENTRATION_GAIN = {
  Glucose: 20
};
const PASSIVE_CONDUCTANCE_SCALE = {
  GLUT2: 4
};
const SUPPORT_PUMP_ID = 'NaKATPase';
const CELL_IMBALANCE_EPSILON = 0.05;
const COUPLED_MISMATCH_EPSILON = 0.05;
const COUPLED_COMPLETION_FRACTION = 0.85;
const COUPLED_MISMATCH_EXCLUSIONS = [SUPPORT_PUMP_ID];

function cloneConcentrations(source) {
  return {
    apicalECF: { ...source.apicalECF },
    icf: { ...source.icf },
    basolateralECF: { ...source.basolateralECF }
  };
}

function surfaceClamp(value, bulkValue) {
  const upper = Math.max((bulkValue || 1) * SURFACE_MAX_MULTIPLIER, 1);
  return Math.min(Math.max(value, 0), upper);
}

function surfacePHDirection(flux) {
  const surfaceHChange = -flux;
  if (Math.abs(surfaceHChange) < 0.001) return 'no strong local pH tendency';
  return surfaceHChange > 0 ? 'surface pH tends lower' : 'surface pH tends higher';
}

function buildSurfaceConcentrations(apicalBulk, basolateralBulk, apicalFlux, basolateralFlux) {
  const transportScale = SURFACE_TRANSPORT_SENSITIVITY * (1 - SURFACE_MIXING_FRACTION);
  const apicalSurface = { ...apicalBulk };
  const basolateralSurface = { ...basolateralBulk };

  Object.keys(apicalBulk).forEach(ion => {
    if (ion === 'H2O') return;
    if (ion === 'H+') {
      apicalSurface[ion] = apicalBulk[ion];
      basolateralSurface[ion] = basolateralBulk[ion];
      return;
    }
    apicalSurface[ion] = surfaceClamp(apicalBulk[ion] - (apicalFlux[ion] || 0) * transportScale, apicalBulk[ion]);
    basolateralSurface[ion] = surfaceClamp(basolateralBulk[ion] - (basolateralFlux[ion] || 0) * transportScale, basolateralBulk[ion]);
  });

  return {
    apicalSurface,
    basolateralSurface,
    pHTendency: {
      apical: surfacePHDirection(apicalFlux['H+'] || 0),
      basolateral: surfacePHDirection(basolateralFlux['H+'] || 0)
    }
  };
}

function activeCellConcentrationDelta(ion, flux) {
  const gain = flux > 0 ? (ACTIVE_CELL_CONCENTRATION_GAIN[ion] || 1) : 1;
  return flux * gain;
}

function concentrationGradientFlux(transporter, outsideConcentration, cellConcentration) {
  const conductanceScale = PASSIVE_CONDUCTANCE_SCALE[transporter.id] || 1;
  const maxFlux = (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * transporter.density * conductanceScale;
  const effectiveCellConcentration = Math.max(cellConcentration, 0);
  const denominator = Math.abs(outsideConcentration) + Math.abs(effectiveCellConcentration) + 1;
  const gradientSignal = (outsideConcentration - effectiveCellConcentration) / denominator;
  return maxFlux * gradientSignal;
}

function coupledSolutes(stoich) {
  return Object.entries(stoich)
    .filter(([ion, coeff]) => ion !== 'H2O' && coeff !== 0);
}

function transepithelialDirectionForMembraneFlux(placement, coeff) {
  return (placement === 'apical' ? 1 : -1) * Math.sign(coeff);
}

function buildCoupledMismatchReport(coupledEvents, transepiFluxDataNoH2O) {
  if (!coupledEvents.length) {
    return {
      state: 'none',
      label: 'Coupled transport: none',
      ariaLabel: 'No active coupled transporters in this layout.',
      details: []
    };
  }

  const transepithelialByIon = Object.fromEntries(
    transepiFluxDataNoH2O.map(row => [row.ion, row.transepithelial || 0])
  );
  const details = coupledEvents.map(event => {
    const solutes = coupledSolutes(event.stoich).map(([ion, coeff]) => {
      const required = Math.abs(event.rate * coeff);
      const expectedDirection = transepithelialDirectionForMembraneFlux(event.placement, coeff);
      const completed = Math.max(0, expectedDirection * (transepithelialByIon[ion] || 0));
      const completion = required < COUPLED_MISMATCH_EPSILON ? 1 : completed / required;
      return {
        ion,
        required,
        completed,
        completion,
        limited: required >= COUPLED_MISMATCH_EPSILON &&
          completed + COUPLED_MISMATCH_EPSILON < required * COUPLED_COMPLETION_FRACTION
      };
    });
    const limitedSolutes = solutes.filter(solute => solute.limited);
    return {
      transporter: event.name,
      placement: event.placement,
      solutes,
      limitedSolutes: limitedSolutes.map(solute => solute.ion)
    };
  }).filter(event => event.limitedSolutes.length > 0);

  return details.length
    ? {
        state: 'mismatch',
        label: 'Coupled transport: mismatch',
        ariaLabel: 'Coupled transport mismatch detected in ' + details.map(detail => detail.transporter).join(', ') + '.',
        details
      }
    : {
        state: 'matched',
        label: 'Coupled transport: matched',
        ariaLabel: 'Active coupled transporters have matching transepithelial completion in this teaching model.',
        details: []
      };
}

function imbalanceDirection(value) {
  if (Math.abs(value) < CELL_IMBALANCE_EPSILON) return 'near steady';
  return value > 0 ? 'accumulation tendency' : 'depletion tendency';
}

function buildCellImbalanceReport(baselineIcf, modeledIcf) {
  return Object.keys(baselineIcf)
    .filter(ion => ion !== 'H2O')
    .map(ion => {
      const change = (modeledIcf[ion] || 0) - (baselineIcf[ion] || 0);
      return {
        ion,
        label: ION_LABEL[ion] || ion,
        change,
        direction: imbalanceDirection(change)
      };
    })
    .filter(row => Math.abs(row.change) >= CELL_IMBALANCE_EPSILON);
}

export default function App() {
  // State
  const [showAbout, setShowAbout] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [modalTransporterId, setModalTransporterId] = useState(null);
  const [transporters, setTransporters] = useState([]);
  const [result, setResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [resultsView, setResultsView] = useState('graphs');
  const [baseConcentrations, setBaseConcentrations] = useState(() => cloneConcentrations(INITIAL_CONCENTRATIONS));

  // ECF model state
const [ecfModel, setEcfModel] = useState('infinite'); // 'infinite' or 'finite'
const [ecfPoolSize] = useState(10); // unitless
const [electrochemicalFeedback] = useState(false);

  // Paracellular pathway state
  const [paracellularType, setParacellularType] = useState('none'); // 'none' | 'cation' | 'anion'
  const [paraCationPerm, setParaCationPerm] = useState(1.0); // default value
  const [paraAnionPerm, setParaAnionPerm] = useState(1.0);   // default value
  const [showParaInfo, setShowParaInfo] = useState(false);

  // --- Automatically run simulation on page load ---
  useEffect(() => {
  calculateFluxesAndConcs(transporters);
  // eslint-disable-next-line
}, [
  transporters,
  paracellularType,
  paraCationPerm,
  paraAnionPerm,
  ecfModel,
  ecfPoolSize,
  electrochemicalFeedback,
  baseConcentrations
]);


  useEffect(() => {
    setTransporters(ts =>
      ts.some(t => !t.uid)
        ? ts.map(t => t.uid ? t : { ...t, uid: t.id + '-' + t.placement + '-' + Math.random().toString(36).slice(2) })
        : ts
    );
  }, []);

  const updateTransporter = (uid, field, value) => {
    setTransporters(ts =>
      ts.map(t =>
        t.uid === uid
          ? (field === 'kinetics'
              ? { ...t, kinetics: { ...value } }
              : { ...t, [field]: value })
          : t
      )
    );
  };

  const addTransporterToMembrane = (id, placement) => {
    const template = INITIAL_TRANSPORTERS.find(t => t.id === id);
    if (!template) return;
    setTransporters(ts => [
      ...ts,
      {
        ...template,
        kinetics: { ...template.kinetics },
        placement,
        density: 1,
        uid: id + '-' + placement + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      }
    ]);
  };

  const removeTransporter = uid => {
    setTransporters(ts => ts.filter(t => t.uid !== uid));
  };

  const updateBaseConcentration = (compartment, ion, value) => {
    const numeric = Math.max(Number(value) || 0, 0);
    setBaseConcentrations(current => ({
      ...current,
      [compartment]: {
        ...current[compartment],
        [ion]: numeric
      }
    }));
  };

  const resetBaseConcentrations = () => {
    setBaseConcentrations(cloneConcentrations(INITIAL_CONCENTRATIONS));
  };

  // --- Simulation Logic ---

// Helper to get placements for a transporter in this simulation step
function placementsForTick(id, tList) {
  return tList.filter(t => t.id === id && t.placement !== 'none').map(t => t.placement);
}

// Refactored transepithelialFlux
function transepithelialFlux(ion, entryIds, exitIds, requirePump, apicalFlux, basolateralFlux, tList, hasNaKATPase) {
  if (requirePump && !hasNaKATPase) return 0;
  const entrySides = [].concat(...entryIds.map(id => placementsForTick(id, tList)));
  const exitSides = [].concat(...exitIds.map(id => placementsForTick(id, tList)));
  for (let side1 of entrySides) {
    for (let side2 of exitSides) {
      if (side1 !== side2) {
        const entryFlux = side1 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
        const exitFlux  = side2 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
        if (entryFlux > 0 && exitFlux < 0) {
          return Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        } else if (entryFlux < 0 && exitFlux > 0) {
          return -Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        }
      }
    }
  }
  return 0;
}

const calculateFluxesAndConcs = (tList = transporters) => {
  // Bulk baths are fixed teaching reservoirs; local surface layers are computed below.
  const baseline = baseConcentrations;
  let apicalECF, basolateralECF;
  if (ecfModel === 'infinite' || !result) {
    apicalECF = { ...baseline.apicalECF };
    basolateralECF = { ...baseline.basolateralECF };
  } else {
    apicalECF = { ...result.concentrations.apicalECF };
    basolateralECF = { ...result.concentrations.basolateralECF };
  }
  const apicalFlux = {};
  const basolateralFlux = {};
  Object.keys(baseline.apicalECF).forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

  const hasNaKATPase = tList.some(t => t.id === 'NaKATPase' && t.placement !== 'none');
  const passiveChannels = [];
  const coupledEvents = [];
  const fluxEvents = [];

  // Calculate active/coupled transport first, then passive channels respond to gradients.
  tList.forEach(t => {
    if (t.id === 'NKCC2') {
      const romkSame = tList.some(u => u.id === 'ROMK' && u.placement === t.placement && t.placement !== 'none');
      if (!romkSame) return;
    }
    if (t.placement === 'none') return;
    if (Object.keys(t.stoich).includes('H2O')) return;
    if (PASSIVE_SOLUTE_CHANNELS[t.id]) {
      passiveChannels.push(t);
      return;
    }
    if (t.id === SUPPORT_PUMP_ID) return;
    if (t.stoich['Na+'] && !hasNaKATPase) return;

    let rate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
    if (t.id === 'NHE3') {
      const h = (baseline.icf['H+']);
      const pH = -Math.log10(h);
      const pH50 = 7.2;
      const sigma = 0.05;
      rate *= 1 / (1 + Math.exp((pH - pH50) / sigma));
    }
    if (!COUPLED_MISMATCH_EXCLUSIONS.includes(t.id) && coupledSolutes(t.stoich).length > 1) {
      coupledEvents.push({
        id: t.id,
        name: t.name,
        placement: t.placement,
        rate,
        stoich: { ...t.stoich }
      });
    }
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: coupledSolutes(t.stoich).length > 1 ? 'coupled' : 'active',
      solutes: Object.entries(t.stoich)
        .filter(([ion]) => ion !== 'H2O')
        .map(([ion, coeff]) => ({
          ion,
          coeff,
          flux: rate * coeff
        }))
    });
    Object.entries(t.stoich).forEach(([ion, coeff]) => {
      const delta = rate * coeff;
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
    });
  });

  const supportClearance = { 'Na+': 0 };
  const activeNaCellLoad = (apicalFlux['Na+'] || 0) + (basolateralFlux['Na+'] || 0);
  if (hasNaKATPase && activeNaCellLoad > 0) {
    supportClearance['Na+'] = activeNaCellLoad;
    basolateralFlux['Na+'] -= supportClearance['Na+'];
    fluxEvents.push({
      id: SUPPORT_PUMP_ID,
      name: 'Na⁺/K⁺-ATPase support',
      placement: 'basolateral',
      type: 'gradient-support',
      solutes: [{ ion: 'Na+', coeff: -1, flux: -supportClearance['Na+'] }]
    });
  }

  const activeNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => { activeNetFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });
  const prePassiveICF = { ...baseline.icf };
  Object.entries(activeNetFlux).forEach(([ion, flux]) => { prePassiveICF[ion] += activeCellConcentrationDelta(ion, flux); });
  prePassiveICF['H+'] = Math.max(prePassiveICF['H+'], 1e-8);

  const passiveNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => { passiveNetFlux[ion] = 0; });
  passiveChannels.forEach(t => {
    const ion = PASSIVE_SOLUTE_CHANNELS[t.id];
    const outsideConcentration = t.placement === 'apical' ? apicalECF[ion] : basolateralECF[ion];
    const delta = concentrationGradientFlux(t, outsideConcentration, prePassiveICF[ion]);
    if (t.placement === 'apical') apicalFlux[ion] += delta;
    else basolateralFlux[ion] += delta;
    passiveNetFlux[ion] += delta;
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: 'passive',
      solutes: [{ ion, coeff: Math.sign(delta), flux: delta }]
    });
  });

  const netFlux = {};
  Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });

  // --- Update ECF concentrations if "finite" model is selected ---
  if (ecfModel === 'finite') {
    Object.keys(apicalECF).forEach(ion => {
      apicalECF[ion] -= apicalFlux[ion] / ecfPoolSize;
      if (apicalECF[ion] < 0) apicalECF[ion] = 0;
    });
    Object.keys(basolateralECF).forEach(ion => {
      basolateralECF[ion] += basolateralFlux[ion] / ecfPoolSize;
      if (basolateralECF[ion] < 0) basolateralECF[ion] = 0;
    });
  }

  const newICF = { ...prePassiveICF };
  Object.entries(passiveNetFlux).forEach(([ion, flux]) => { newICF[ion] += flux; });
  newICF['H+'] = Math.max(newICF['H+'], 1e-8);
  const cellImbalanceReport = buildCellImbalanceReport(baseline.icf, newICF);

  const surfaceReport = buildSurfaceConcentrations(apicalECF, basolateralECF, apicalFlux, basolateralFlux);
  const apicalSurface = surfaceReport.apicalSurface;
  const basolateralSurface = surfaceReport.basolateralSurface;

  // --- Paracellular Pathway Fluxes ---
  const paraFlux = {};
  Object.keys(baseline.apicalECF).forEach(ion => { paraFlux[ion] = 0; });

  if (paracellularType === 'cation') {
    ['Na+','K+'].forEach(ion => {
      const cap = apicalSurface[ion];
      const blp = basolateralSurface[ion];
      paraFlux[ion] = paraCationPerm * (cap - blp);
    });
  }
  if (paracellularType === 'anion') {
    ['Cl-','HCO3-'].forEach(ion => {
      const cap = apicalSurface[ion];
      const blp = basolateralSurface[ion];
      paraFlux[ion] = paraAnionPerm * (cap - blp);
    });
  }
  Object.keys(netFlux).forEach(ion => { netFlux[ion] += paraFlux[ion] || 0; });

  // --- Transepithelial Fluxes using ONLY current tick values ---
  const glucoseTransEpiFlux = transepithelialFlux('Glucose', ['SGLT2'], ['GLUT2'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const naTransEpiFlux = transepithelialFlux('Na+', ['SGLT2','ENaC','NCC','NKCC2'], ['NaKATPase'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const clTransEpiFlux = transepithelialFlux('Cl-', ['NKCC2','NCC'], ['NKCC2','NCC'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const caTransEpiFlux = transepithelialFlux('Ca2+', ['NCX1','PMCA'], ['NCX1','PMCA'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);

  // K+ logic (HKATPase or other)
  const hkAtpaseSides = placementsForTick('HKATPase', tList);
  let kTransEpiFlux = 0;
  if (hkAtpaseSides.length > 0) {
    const apicalHK = tList.some(t => t.id === 'HKATPase' && t.placement === 'apical');
    const basolateralHK = tList.some(t => t.id === 'HKATPase' && t.placement === 'basolateral');
    if (apicalHK) kTransEpiFlux += apicalFlux['K+'] ?? 0;
    if (basolateralHK) kTransEpiFlux += basolateralFlux['K+'] ?? 0;
  }
  if (kTransEpiFlux === 0) {
    kTransEpiFlux = transepithelialFlux('K+', ['NKCC2','ROMK'], ['ROMK','NaKATPase'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  }

  const hExtruders = tList.filter(t => ['NHE3','HATPase','HKATPase'].includes(t.id) && t.placement !== 'none');
  const nbcTrans = tList.filter(t => t.id === 'NBCe1' && t.placement !== 'none');
  let hTransEpiFlux = 0;
  let hco3TransEpiFlux = 0;
  if (hasNaKATPase && hExtruders.length > 0 && nbcTrans.length > 0) {
    const fluxPairs = [];
    for (let t of hExtruders) {
      for (let nbc of nbcTrans) {
        if (t.placement !== nbc.placement) {
          const extruderRate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
          const nbcRate = (nbc.kinetics.maxRate / (nbc.kinetics.Km + 1)) * nbc.density * 3;
          const limiting = Math.min(Math.abs(extruderRate), Math.abs(nbcRate));
          if (t.placement === 'apical' && nbc.placement === 'basolateral') {
            fluxPairs.push({ h: -limiting, hco3: limiting });
          } else if (t.placement === 'basolateral' && nbc.placement === 'apical') {
            fluxPairs.push({ h: limiting, hco3: -limiting });
          }
        }
      }
    }
    hTransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.h, 0);
    hco3TransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.hco3, 0);
  }

  // Compose transepiFluxDataNoH2O
  const transepiFluxDataNoH2O = Object.keys(netFlux).filter(ion => ion !== 'H2O').map(ion => {
    switch (ion) {
      case 'Glucose': return { ion, transepithelial: glucoseTransEpiFlux };
      case 'Na+':     return { ion, transepithelial: naTransEpiFlux };
      case 'K+':      return { ion, transepithelial: kTransEpiFlux };
      case 'Cl-':     return { ion, transepithelial: clTransEpiFlux };
      case 'Ca2+':    return { ion, transepithelial: caTransEpiFlux };
      case 'HCO3-':   return { ion, transepithelial: hco3TransEpiFlux };
      case 'H+':      return { ion, transepithelial: hTransEpiFlux };
      default:        return { ion, transepithelial: 0 };
    }
  });

  // Add paracellular fluxes
  if (paracellularType !== 'none') {
    transepiFluxDataNoH2O.forEach(row => {
      if (
        (paracellularType === 'cation' && ['Na+','K+'].includes(row.ion)) ||
        (paracellularType === 'anion' && ['Cl-','HCO3-'].includes(row.ion))
      ) {
        row.transepithelial += paraFlux[row.ion] || 0;
      }
    });
  }

  const coupledMismatchReport = buildCoupledMismatchReport(coupledEvents, transepiFluxDataNoH2O);

  const waterReport = buildWaterReport(
    apicalSurface,
    newICF,
    basolateralSurface,
    tList,
    paracellularType,
    paraCationPerm,
    transepiFluxDataNoH2O
  );

  // Compose transepiFluxData for display
  const transepiFluxData = [
    ...transepiFluxDataNoH2O,
    { ion: 'H2O', transepithelial: waterReport.netTransepithelial.value }
  ];
  const chargeReport = buildChargeReport(apicalFlux, basolateralFlux, transepiFluxData);

  // Push results
  setResult({
    apicalFlux,
    basolateralFlux,
    netFlux,
    concentrations: {
      apicalECF,
      apicalSurface,
      icf: newICF,
      basolateralSurface,
      basolateralECF
    },
    surfaceReport,
    paraFlux,
    fluxEvents,
    transepiFluxData,
    waterReport,
    chargeReport,
    coupledMismatchReport,
    cellImbalanceReport
  });
};


  // --- Derived Data for Display ---
  const icfH = result?.concentrations?.icf['H+'] ?? INITIAL_CONCENTRATIONS.icf['H+'];
  const icf_pH = -Math.log10(icfH);

  const fluxData = result
    ? Object.keys(result.netFlux).filter(ion => ion !== 'H2O').map(ion => ({
        ion,
        apical: result.apicalFlux[ion],
        basolateral: result.basolateralFlux[ion],
        net: result.netFlux[ion]
      }))
    : [];
  const concentrationIons = result
    ? Object.keys(result.concentrations.icf).filter(ion => ion !== 'H2O')
    : [];
  const concData = concentrationIons.map(ion => ({
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));
  const concTableData = concentrationIons.map(ion => ({
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));

// For H⁺/K⁺-ATPase, K⁺ flux can occur with HKATPase on either membrane (no exit needed).
// Parallel/mirrored H⁺ and HCO₃⁻ TE flux logic: require a proton extruder (NHE3, HATPase, HKATPase) on one membrane and NBCe1 on the opposite membrane (plus Na⁺/K⁺ ATPase for NHE3/NBCe1)
  const transepiFluxData = result?.transepiFluxData || [];

  const modalTransporter = INITIAL_TRANSPORTERS.find(t => t.id === modalTransporterId);
  const transporterTemplateById = id => INITIAL_TRANSPORTERS.find(t => t.id === id);
  const membraneTransporters = placement => transporters.filter(t => t.placement === placement);
  const transporterIsOnMembrane = (id, placement) => transporters.some(t => t.id === id && t.placement === placement);

  const renderTransporterChooser = placement => (
    <div className="space-y-3">
      {TRANSPORTER_GROUPS.map(group => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-gray-600 mb-1">{group.label}</div>
          <div className="flex flex-wrap gap-1">
            {group.ids.map(id => {
              const template = transporterTemplateById(id);
              const alreadyAdded = transporterIsOnMembrane(id, placement);
              const description = TRANSPORTER_DESCRIPTIONS[id] || '';
              return (
                <span key={id} className="relative group inline-block">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={alreadyAdded}
                    title={description}
                    aria-label={description ? 'Add ' + (template?.name || id) + '. ' + description : 'Add ' + (template?.name || id)}
                    className={alreadyAdded ? 'text-gray-400 border-gray-200 bg-gray-50' : ''}
                    onClick={() => addTransporterToMembrane(id, placement)}
                  >
                    {template?.name || id}
                  </Button>
                  {description && (
                    <span className="hidden group-hover:block group-focus-within:block absolute left-0 top-full mt-1 w-64 z-20 rounded border bg-white p-2 text-xs text-gray-700 shadow-lg">
                      {description}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTransporterRows = placement => {
    const rows = membraneTransporters(placement);
    if (rows.length === 0) {
      return <div className="text-sm text-gray-500 border rounded p-2 bg-gray-50">No transporters added.</div>;
    }

    return (
      <div className="space-y-2">
        {rows.map(t => (
          <div key={t.uid} className="border rounded p-2 bg-white">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-sm" title={TRANSPORTER_DESCRIPTIONS[t.id] || ''}>{t.name}</div>
              <Button
                size="sm"
                variant="outline"
                aria-label={'Remove ' + t.name + ' from ' + placement + ' membrane'}
                onClick={() => removeTransporter(t.uid)}
              >
                Remove
              </Button>
            </div>
            <fieldset className="flex items-center gap-2 text-xs">
              <legend className="text-gray-600 mr-1">Density</legend>
              {DENSITY_OPTIONS.map(option => (
                <label key={option.label} className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name={'density-' + t.uid}
                    value={option.value}
                    checked={t.density === option.value}
                    onChange={() => updateTransporter(t.uid, 'density', option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          </div>
        ))}
      </div>
    );
  };

  const renderMembraneBuilder = (placement, title) => (
    <section className="border rounded p-3 bg-gray-50">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <div className="mb-3">
        {renderTransporterRows(placement)}
      </div>
      <details className="bg-white border rounded p-2">
        <summary className="cursor-pointer text-sm font-semibold">Add transporter</summary>
        <div className="mt-3">
          {renderTransporterChooser(placement)}
        </div>
      </details>
    </section>
  );

  const netTEFlux =
    transepiFluxData
      .filter(row => row.ion !== 'H2O')
      .reduce((sum, row) => sum + row.transepithelial, 0)
      .toFixed(3);
  const waterReport = result?.waterReport;
  const formatWaterValue = value => Number(value ?? 0).toFixed(1);
  const chargeReport = result?.chargeReport;
  const coupledMismatchReport = result?.coupledMismatchReport;
  const cellImbalanceReport = result?.cellImbalanceReport || [];
  const formatChargeValue = value => Number(value ?? 0).toFixed(2);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatTableValue = value => Number(value ?? 0).toFixed(3);
  const fluxDirection = value => {
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'none';
    return numeric > 0 ? 'absorption' : 'secretion';
  };
  const membraneListText = placement => {
    const rows = membraneTransporters(placement);
    if (rows.length === 0) return 'none';
    return rows.map(t => {
      const option = DENSITY_OPTIONS.find(o => o.value === t.density);
      return t.name + ' (' + (option?.label || 'custom') + ' density)';
    }).join(', ');
  };
  const keyTransepithelialRows = transepiFluxData.filter(row => Math.abs(Number(row.transepithelial || 0)) >= 0.001);
  const simulationSummary = result ? [
    'Apical membrane: ' + membraneListText('apical') + '.',
    'Basolateral membrane: ' + membraneListText('basolateral') + '.',
    keyTransepithelialRows.length
      ? 'Net transepithelial movement: ' + keyTransepithelialRows.map(row => row.ion + ' ' + fluxDirection(row.transepithelial)).join('; ') + '.'
      : 'No substantial net transepithelial solute or water movement is currently predicted.',
    cellImbalanceReport.length
      ? 'Intracellular imbalance: ' + cellImbalanceReport.map(row => row.label + ' ' + row.direction).join('; ') + '.'
      : '',
    waterReport ? 'Net epithelial water tendency: ' + waterReport.netTransepithelial.direction + ' (' + waterReport.netTransepithelial.strength + ').' : '',
    chargeReport ? 'Transepithelial charge tendency: ' + chargeReport.transepithelial.direction + ' (' + chargeReport.transepithelial.strength + ').' : ''
  ].filter(Boolean) : [];
  const coupledStatusClass = coupledMismatchReport?.state === 'mismatch'
    ? 'border-amber-400 bg-amber-50 text-amber-800'
    : coupledMismatchReport?.state === 'matched'
      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
      : 'border-gray-300 bg-gray-50 text-gray-600';
  const coupledDotClass = coupledMismatchReport?.state === 'mismatch'
    ? 'bg-amber-500'
    : coupledMismatchReport?.state === 'matched'
      ? 'bg-emerald-500'
      : 'bg-gray-400';

  const tePotentialValue = chargeReport?.transepithelial?.value ?? 0;
  const tePotentialNeedleAngle = clamp(-tePotentialValue * 25, -60, 60);

  const AccessibleTable = ({ caption, columns, rows }) => (
    <table className="min-w-full table-auto text-left text-sm border">
      <caption className="text-left font-semibold mb-2">{caption}</caption>
      <thead>
        <tr className="bg-gray-100">
          {columns.map(column => (
            <th key={column.key} scope="col" className="px-2 py-1 border">{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.ion || row.label || index} className="border-t">
            {columns.map((column, columnIndex) => (
              columnIndex === 0
                ? <th key={column.key} scope="row" className="px-2 py-1 border font-semibold">{row[column.key]}</th>
                : <td key={column.key} className="px-2 py-1 border">{column.format ? column.format(row[column.key], row) : row[column.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  
  // --- Render ---

  return (
<>
  {/* About Modal */}
  {showAbout && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowAbout(false)}>
    <div className="bg-white rounded-lg p-6 max-w-2xl shadow-lg overflow-y-auto max-h-[80vh] relative" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="absolute top-3 right-3" aria-label="Close About window" onClick={() => setShowAbout(false)}>Close</Button>
      <h2 className="text-2xl font-bold mb-4 pr-20">About the Secretion and Absorption Learning Tool</h2>
      <div className="mb-3 text-sm text-gray-700">
  Developed by David Julian &middot; <a href="mailto:djulian@ufl.edu" className="underline text-blue-600">djulian@ufl.edu</a>
      </div>
      <h3 className="text-lg font-semibold mt-4 mb-1">Model Scope</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li>This is a teaching model that uses arbitrary units. It is intended to preserve directionality, coupling, osmotic tendencies, charge tendencies, and pathway logic, not research-grade flux magnitudes.</li>
        <li>Apical and basolateral bath concentrations are treated as fixed reservoirs. Finite ECF pools are shown as a coming-soon teaching extension.</li>
        <li>The app distinguishes fixed bulk bath concentrations from local surface-layer concentrations. Surface values shift with transporter flux and partial mixing, so students can see how local gradients may differ from the surrounding reservoir.</li>
        <li>SGLT2-driven glucose entry can raise the modeled cell glucose concentration. GLUT2 then follows the gradient between the adjacent bath and that displayed cell glucose value, and is treated as a high-capacity facilitated pathway in this teaching model.</li>
        <li>Na⁺/K⁺-ATPase is treated as Na⁺ gradient support and basolateral Na⁺ clearance. Its K⁺ recycling stoichiometry is not explicitly balanced in this teaching layer.</li>
        <li>The coupled transport status light compares linked transporter stoichiometry with completed transepithelial flux and flags layouts that may not represent a steady-state pathway.</li>
        <li>When solutes enter or leave the cell without matching pathway completion, the app reports intracellular accumulation or depletion tendencies.</li>
        <li>Cell osmolality includes modeled mobile solutes plus fixed intracellular osmoles, representing non-transported proteins, metabolites, phosphates, and other intracellular osmolytes.</li>
        <li>The app can show charge and polarity tendencies. Electrochemical feedback is shown as a coming-soon teaching extension for a later model pass.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">General Transmembrane Flux Rules</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li>Transporters are only active if placed on the apical or basolateral membrane.</li>
        <li>Passive channels and facilitated carriers follow their transmembrane concentration gradients in this model. ENaC, ROMK, and GLUT2 can reverse direction if the gradient reverses.</li>
        <li>Na⁺-coupled cotransporters and exchangers (SGLT2, NCC, NKCC2, NHE3, NBCe1, etc.) require Na⁺/K⁺ ATPase (on any membrane) to be present.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-6 mb-1">Transporter Actions &amp; Rules</h3>
      <ul className="list-disc ml-6 text-sm space-y-2">
        <li>
          <b>AQP2:</b> aquaporin 2<br/>
          <i>Action:</i> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> AQP on one membrane permits water exchange at that membrane. Net transcellular H₂O flux requires water pathways on both apical and basolateral membranes.
        </li>
        <li>
          <b>AQP3:</b> aquaporin 3<br/>
          <i>Action:</i> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> AQP on one membrane permits water exchange at that membrane. Net transcellular H₂O flux requires water pathways on both apical and basolateral membranes.
        </li>
        <li>
          <b>ENaC:</b> epithelial sodium channel<br/>
          <i>Action:</i> Sodium channel; passive Na⁺ flux follows the Na⁺ gradient.<br/>
          <i>Rule:</i> For net transepithelial Na⁺ flux, Na⁺/K⁺ ATPase must be on the opposite membrane.
        </li>
        <li>
          <b>GLUT2:</b> glucose transporter 2<br/>
          <i>Action:</i> Facilitated glucose transporter; passive glucose flux follows the glucose gradient.<br/>
          <i>Rule:</i> SGLT2 can raise modeled cell glucose enough to drive GLUT2. If the adjacent bath glucose is higher than the displayed cell glucose, GLUT2 favors glucose entry instead of exit.
        </li>
        <li>
          <b>H⁺-ATPase:</b> proton ATPase<br/>
          <i>Action:</i> Proton pump; pumps H⁺ out using ATP.<br/>
          <i>Rule:</i> Contributes to H⁺ efflux, can participate in transepithelial H⁺ flux if paired with NBCe1 on the opposite membrane.
        </li>
        <li>
          <b>H⁺/K⁺-ATPase:</b> proton-potassium ATPase<br/>
          <i>Action:</i> Proton-potassium pump; exchanges one H⁺ out and K⁺ in using ATP.<br/>
          <i>Rule:</i> For K⁺, presence of H⁺/K⁺-ATPase on either membrane is sufficient for transepithelial flux. For H⁺, an exit pathway (NBCe1 or H⁺/K⁺-ATPase) must be present on the opposite membrane.
        </li>
        <li>
          <b>NBCe1:</b> electrogenic sodium bicarbonate cotransporter 1<br/>
          <i>Action:</i> Na⁺-bicarbonate symporter; co-transports Na⁺ and HCO₃⁻ out.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; required for HCO₃⁻ efflux when NHE3 is active.
        </li>
        <li>
          <b>NCC:</b> sodium-chloride cotransporter<br/>
          <i>Action:</i> Na⁺-Cl⁻ symporter; co-transports Na⁺ and Cl⁻ in.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; transepithelial flux requires NCC or NKCC2 on both membranes.
        </li>
        <li>
          <b>NCX1:</b> sodium-calcium exchanger 1<br/>
          <i>Action:</i> Na⁺-Ca²⁺ exchanger; exchanges 3 Na⁺ in for 1 Ca²⁺ out.<br/>
          <i>Rule:</i> Transepithelial Ca²⁺ flux requires NCX1 or PMCA on both membranes.
        </li>
        <li>
          <b>NHE3:</b> sodium-hydrogen exchanger 3<br/>
          <i>Action:</i> Na⁺/H⁺ exchanger; exchanges Na⁺ in for H⁺ out.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; activity decreases at higher pH; paired with NBCe1 for transepithelial HCO₃⁻ and H⁺ flux.
        </li>
        <li>
          <b>NKCC2:</b> sodium-potassium-chloride cotransporter 2<br/>
          <i>Action:</i> Na⁺-K⁺-2Cl⁻ symporter; co-transports Na⁺, K⁺, and 2 Cl⁻ in.<br/>
          <i>Rule:</i> Requires ROMK on the same membrane and Na⁺/K⁺ ATPase present for activity; for net flux, NKCC2 or NCC must be present on both membranes.
        </li>
        <li>
          <b>Na⁺/K⁺ ATPase:</b> sodium-potassium ATPase<br/>
          <i>Action:</i> Active pump; extrudes 3 Na⁺ and imports 2 K⁺ per ATP.<br/>
          <i>Rule:</i> Required for activity of all Na⁺-coupled transporters and for transepithelial Na⁺ or K⁺ absorption.
        </li>
        <li>
          <b>PMCA:</b> plasma membrane calcium ATPase<br/>
          <i>Action:</i> Ca²⁺ pump; pumps Ca²⁺ out using ATP.<br/>
          <i>Rule:</i> For transepithelial Ca²⁺ flux, PMCA or NCX1 must be on both membranes.
        </li>
        <li>
          <b>ROMK:</b> renal outer medullary potassium channel<br/>
          <i>Action:</i> Potassium channel; passive K⁺ flux follows the K⁺ gradient.<br/>
          <i>Rule:</i> Required on the same membrane as NKCC2 for NKCC2 activity; for transepithelial K⁺ flux, ROMK or Na⁺/K⁺ ATPase must be on the opposite membrane.
        </li>
        <li>
          <b>SGLT2:</b> sodium-glucose cotransporter 2<br/>
          <i>Action:</i> Na⁺-glucose symporter; co-transports Na⁺ and glucose in.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; for net glucose flux, SGLT2 and GLUT2 must be on opposite membranes.
        </li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Paracellular Pathway Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Paracellular pathway:</b> Movement of ions and water between cells, bypassing the cell membrane.<br/>
        <i>Rule:</i> Select <b>Tight Junction</b> for no passive leak. Select <b>Cation + Water Pore</b> to enable Na⁺ and K⁺ flux down their transepithelial concentration gradients and paracellular H₂O movement down the transepithelial osmotic gradient. Select <b>Anion Pore</b> for Cl⁻ and HCO₃⁻ flux (e.g., claudin-10a or claudin-17 type). The magnitude depends on the permeability setting and the size of the gradient.
        </li>
          </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Water &amp; Osmolality Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H₂O is not treated as a transported solute concentration. The app reports osmolality and water movement tendencies instead of calculating true cell volume.</li>
        <li>Apical and basolateral membrane water tendencies are based on the osmotic difference between the cell and the adjacent local surface layer, and require a water pathway on that membrane.</li>
        <li>Net transcellular epithelial water movement uses a teaching rule: when a complete apical-to-basolateral water pathway exists, water follows net transepithelial solute absorption or secretion. This represents local osmotic coupling that the app does not explicitly model as a standing bath-to-bath osmotic gradient.</li>
        <li>H⁺ surface changes are reported as pH tendencies rather than recalculated H⁺ concentrations.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Transepithelial Solute Flux Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Glucose:</b> SGLT2 on one membrane and GLUT2 on the opposite membrane (plus Na⁺/K⁺ ATPase anywhere).</li>
        <li><b>Na⁺:</b> SGLT2, ENaC, NCC, or NKCC2 on one membrane and Na⁺/K⁺ ATPase on the other (pump required).</li>
        <li><b>K⁺:</b> H⁺/K⁺-ATPase on either membrane is sufficient for net transepithelial K⁺ flux. NKCC2 or ROMK on one membrane and ROMK or Na⁺/K⁺ ATPase on the other also support K⁺ flux (pump required).</li>
        <li><b>Cl⁻:</b> NKCC2 or NCC on one membrane and NKCC2 or NCC on the other.</li>
        <li><b>H⁺ and HCO₃⁻:</b> A proton extruder (NHE3, H⁺-ATPase, or H⁺/K⁺-ATPase) on one membrane and NBCe1 on the opposite membrane (plus Na⁺/K⁺ ATPase anywhere). The direction and magnitude of net acid/base flux depends on transporter placement and rates.</li>
        <li><b>H₂O:</b> Net transcellular water movement requires water pathways on both apical and basolateral membranes. When present, H₂O follows the direction of net transepithelial solute movement in arbitrary teaching units.</li>
      </ul>
      <Button onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
    </div>
  </div>
)}

<div className="flex h-screen">
<div className="w-1/3 p-4 border-r overflow-auto">
  <div className="text-xl font-bold mb-4 tracking-tight text-blue-800">
    SALT: <span className="font-normal text-gray-700">Secretion &amp; Absorption Learning Tool</span>
  </div><div className="flex space-x-2 mb-4">
  <Button onClick={() => setShowAbout(true)}>About</Button>
<Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
<Button variant="outline" onClick={() => setTransporters([])}>Reset</Button>
</div>
           
        <div className="mt-4">
  <h2 className="text-base font-semibold mb-2">Paracellular Pathway</h2>
  <table className="min-w-full table-auto text-left mb-2">
    <tbody>
      <tr>
        <td className="px-2 py-1">
         <select value={paracellularType} onChange={e => setParacellularType(e.target.value)} className="w-full border rounded p-1">
  <option value="none">Tight Junction</option>
  <option value="cation">Cation + Water Pore</option>
  <option value="anion">Anion Pore</option>
</select>

        </td>
        <td className="px-2 py-1">
          <Button size="sm" variant="outline" onClick={() => setShowParaInfo(true)}>Info</Button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

        <div className="mt-4 space-y-4">
          {renderMembraneBuilder('apical', 'Apical Membrane')}
          {renderMembraneBuilder('basolateral', 'Basolateral Membrane')}
        </div>
{showParaInfo && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
      <h2 className="text-xl font-bold mb-2">Paracellular Pathway Settings</h2>
      {paracellularType === 'cation' && (
        <>
          <div className="mb-2">
            <b>Cation + Water Selective Paracellular Pore</b>: Permeable to Na⁺, K⁺, and H₂O (e.g., Claudin-2 type).<br/>
            <label className="block mt-2 text-sm">Permeability:</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={paraCationPerm}
              onChange={e => setParaCationPerm(Number(e.target.value))}
              className="border rounded p-1 w-full"
            />
          </div>
        </>
      )}
      {paracellularType === 'anion' && (
        <>
          <div className="mb-2">
            <b>Anion Selective Paracellular Pore</b>: Permeable to Cl⁻ and HCO₃⁻ (e.g., claudin-10a or claudin-17 type).<br/>
            <label className="block mt-2 text-sm">Permeability:</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={paraAnionPerm}
              onChange={e => setParaAnionPerm(Number(e.target.value))}
              className="border rounded p-1 w-full"
            />
          </div>
        </>
      )}
      {paracellularType === 'none' && (
        <div className="mb-2 text-gray-500">No paracellular pathway enabled (tight junction).</div>
      )}
      <Button className="mt-2" onClick={() => setShowParaInfo(false)}>Close</Button>
    </div>
  </div>
)}
{showSettings && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-3xl w-[92vw] shadow-lg overflow-y-auto max-h-[85vh]">
      <h2 className="text-xl font-bold mb-4">Model Settings</h2>
      <div className="mb-4 text-sm text-gray-700">
        <label className="block mb-2 font-semibold">Bath Concentrations</label>
        <label className="block mb-2">
          <input
            type="radio"
            checked={ecfModel === 'infinite'}
            onChange={() => setEcfModel('infinite')}
          />{' '}
          Fixed reservoirs <span className="text-gray-500">(no bath concentration change)</span>
        </label>
        <label className="block mb-2">
          <input
            type="radio"
            checked={ecfModel === 'finite'}
            disabled
            aria-describedby="finite-pools-coming-soon"
            onChange={() => {}}
          />{' '}
          Finite pools <span id="finite-pools-coming-soon" className="text-gray-500">(coming soon)</span>
        </label>
        <div className="ml-4 mb-2 text-gray-500">
          Pool size controls will be available when finite pools are implemented.
        </div>
      </div>
      <div className="mb-4 text-sm text-gray-700">
        <label className="block mb-2 font-semibold">Electrochemical Feedback</label>
        <label className="block mb-2">
          <input
            type="checkbox"
            checked={false}
            disabled
            aria-describedby="electrochemical-feedback-coming-soon"
            onChange={() => {}}
          />{' '}
          Polarity affects passive flux <span id="electrochemical-feedback-coming-soon" className="text-gray-500">(coming soon)</span>
        </label>
        <div className="text-gray-500">
          When off, the app reports charge and polarity tendencies without changing flux.
        </div>
      </div>
      <div className="mb-4 text-sm text-gray-700">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="font-semibold">Baseline Concentrations</label>
          <Button size="sm" variant="outline" onClick={resetBaseConcentrations}>
            Reset defaults
          </Button>
        </div>
        <p className="text-gray-500 mb-2">
          These values set fixed bulk reservoirs and the starting cell composition. Local surface concentrations are calculated from transporter fluxes plus fixed partial mixing.
        </p>
        <table className="min-w-full table-auto text-left border">
          <thead>
            <tr className="bg-gray-100">
              <th scope="col" className="px-2 py-1 border">Ion or solute</th>
              <th scope="col" className="px-2 py-1 border">Apical bath</th>
              <th scope="col" className="px-2 py-1 border">Cell</th>
              <th scope="col" className="px-2 py-1 border">Basolateral bath</th>
            </tr>
          </thead>
          <tbody>
            {CONCENTRATION_EDIT_IONS.map(ion => (
              <tr key={ion}>
                <th scope="row" className="px-2 py-1 border font-semibold">{ION_LABEL[ion] || ion}</th>
                {['apicalECF', 'icf', 'basolateralECF'].map(compartment => (
                  <td key={compartment} className="px-2 py-1 border">
                    <input
                      type="number"
                      min="0"
                      step={ion === 'Ca2+' ? '0.0001' : '0.1'}
                      value={baseConcentrations[compartment][ion]}
                      onChange={e => updateBaseConcentration(compartment, ion, e.target.value)}
                      className="border rounded p-1 w-full"
                      aria-label={(ION_LABEL[ion] || ion) + ' ' + compartment + ' baseline concentration'}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-4" onClick={() => setShowSettings(false)}>
        Close
      </Button>
    </div>
  </div>
)}

{showInfoModal && modalTransporter && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
      <h2 className="text-xl font-bold mb-2">{modalTransporter.name}</h2>
     <div className="mb-2 text-sm">
  <div>
    {(() => {
      switch (modalTransporter.id) {
        case 'AQP2':
          return <><b>Aquaporin 2</b>: enables rapid H₂O movement.<br/></>;
        case 'AQP3':
          return <><b>Aquaporin 3</b>: enables rapid H₂O movement.<br/></>;
        case 'ENaC':
          return <><b>Epithelial sodium channel</b>: passive Na⁺ flux follows the Na⁺ gradient.<br/></>;
        case 'GLUT2':
          return <><b>Glucose transporter 2</b>: passive glucose flux follows the glucose gradient.<br/></>;
        case 'HATPase':
          return <><b>Proton-ATPase (V-type)</b>: pumps one H⁺ out per ATP.<br/></>;
        case 'HKATPase':
          return <><b>Proton-potassium ATPase</b>: exchanges one H⁺ out for one K⁺ in per ATP.<br/></>;
        case 'NBCe1':
          return <><b>Electrogenic sodium bicarbonate cotransporter 1</b>: symports Na⁺ and HCO₃⁻ out.<br/></>;
        case 'NCC':
          return <><b>Sodium-chloride cotransporter</b>: symports Na⁺ and Cl⁻ in.<br/></>;
        case 'NCX1':
          return <><b>Sodium-calcium exchanger</b>: antiports 3 Na⁺ in for 1 Ca²⁺ out.<br/></>;
        case 'NHE3':
          return <><b>Sodium-hydrogen exchanger 3</b>: antiports Na⁺ in for H⁺ out.<br/></>;
        case 'NKCC2':
          return <><b>Sodium-potassium-chloride cotransporter</b>: symports Na⁺, K⁺, and 2 Cl⁻ in.<br/></>;
        case 'NaKATPase':
          return <><b>Sodium-potassium pump</b>: pumps 3 Na⁺ out and 2 K⁺ in per ATP.<br/></>;
        case 'PMCA':
          return <><b>Plasma membrane calcium ATPase</b>: pumps one Ca²⁺ out per ATP.<br/></>;
        case 'ROMK':
          return <><b>Renal outer medullary potassium channel</b>: passive K⁺ flux follows the K⁺ gradient.<br/></>;
        case 'SGLT2':
          return <><b>Sodium/glucose cotransporter 2</b>: symports Na⁺ and glucose in.<br/></>;
        default:
          return null;
      }
    })()}
  </div>
  
  <div>
    <b>Stoichiometry:</b>{" "}
    {Object.entries(modalTransporter.stoich)
      .map(([ion, coeff]) => `${ion} ${coeff >= 0 ? "+" : ""}${coeff}`)
      .join(", ")}
  </div>
</div>

      <Button className="mt-2" onClick={() => setShowInfoModal(false)}>Close</Button>
    </div>
  </div>
)
}

      </div>
      <div className="flex-1 p-4 flex flex-col">
       
 {result && (
          <div className="mt-3 space-y-4 overflow-auto">
            <section className="border rounded p-2 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="font-semibold">Simulation Summary</h2>
                {coupledMismatchReport && (
                  <div
                    className={'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ' + coupledStatusClass}
                    role="status"
                    aria-label={coupledMismatchReport.ariaLabel}
                    title={coupledMismatchReport.ariaLabel}
                  >
                    <span className={'inline-block h-2 w-2 rounded-full ' + coupledDotClass} aria-hidden="true" />
                    {coupledMismatchReport.label}
                  </div>
                )}
              </div>
              <ul className="list-disc ml-5 text-sm leading-snug">
                {simulationSummary.map(line => <li key={line}>{line}</li>)}
              </ul>
            </section>

            <fieldset className="flex items-center gap-3 text-sm">
              <legend className="font-semibold mr-1">Results view</legend>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="results-view"
                  value="graphs"
                  checked={resultsView === 'graphs'}
                  onChange={() => setResultsView('graphs')}
                />
                Graphs
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="results-view"
                  value="tables"
                  checked={resultsView === 'tables'}
                  onChange={() => setResultsView('tables')}
                />
                Tables
              </label>
            </fieldset>

            {resultsView === 'graphs' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Transmembrane Fluxes (positive = into ICF)</h3>
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={fluxData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                        <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                        <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                        <Legend />
                        <Bar dataKey="apical" name="Apical" fill="#2563eb" />
                        <Bar dataKey="basolateral" name="Basolateral" fill="#059669" />
                        <Bar dataKey="net" name="Net Flux" fill="#dc2626" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">
                      Transepithelial Fluxes, <span className="text-rose-400">Net = {netTEFlux}</span>
                    </h3>
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={result?.transepiFluxData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                        <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                        <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                        <Bar dataKey="transepithelial" name="Net Transepithelial" fill="#fb7185" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="text-xs text-gray-500 mt-1">Positive = absorption; negative = secretion.</div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Concentrations</h3>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={concData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                      <YAxis domain={[0,150]} tick={{ fontSize: 12 }} /><Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} /><Legend />
                      <Bar dataKey="apicalBulk" name="Apical Bulk" fill="#99f6e4" />
                      <Bar dataKey="apicalSurface" name="Apical Surface" fill="#0f766e" />
                      <Bar dataKey="icf" name="ICF" fill="#8b5cf6" fillOpacity={0.75} />
                      <Bar dataKey="basolateralSurface" name="Basolateral Surface" fill="#ea580c" />
                      <Bar dataKey="basolateralBulk" name="Basolateral Bulk" fill="#fed7aa" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-xs text-gray-500 mt-1">
                    Bulk bars show the fixed reservoirs; surface bars show local teaching estimates after transport and partial mixing.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 overflow-auto">
                <AccessibleTable
                  caption="Transmembrane fluxes. Positive values indicate movement into the cell."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'apical', label: 'Apical flux', format: formatTableValue },
                    { key: 'basolateral', label: 'Basolateral flux', format: formatTableValue },
                    { key: 'net', label: 'Net cellular flux', format: formatTableValue }
                  ]}
                  rows={fluxData}
                />
                <AccessibleTable
                  caption="Concentrations. Bulk reservoirs are fixed unless changed in Settings. Surface values are local teaching estimates based on transport and partial mixing."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'apicalBulk', label: 'Apical bulk', format: formatTableValue },
                    { key: 'apicalSurface', label: 'Apical surface', format: formatTableValue },
                    { key: 'icf', label: 'Cell', format: formatTableValue },
                    { key: 'basolateralSurface', label: 'Basolateral surface', format: formatTableValue },
                    { key: 'basolateralBulk', label: 'Basolateral bulk', format: formatTableValue }
                  ]}
                  rows={concTableData}
                />
                <AccessibleTable
                  caption="Transepithelial fluxes. Positive values indicate absorption and negative values indicate secretion."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'transepithelial', label: 'Net transepithelial flux', format: formatTableValue },
                    { key: 'direction', label: 'Direction', format: (_, row) => fluxDirection(row.transepithelial) }
                  ]}
                  rows={(result?.transepiFluxData || []).map(row => ({ ...row, direction: fluxDirection(row.transepithelial) }))}
                />
              </div>
            )}

            {cellImbalanceReport.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Intracellular Imbalance Tendencies</h3>
                <AccessibleTable
                  caption="Intracellular accumulation or depletion tendencies compared with the starting cell composition."
                  columns={[
                    { key: 'label', label: 'Ion or solute' },
                    { key: 'direction', label: 'Tendency' },
                    { key: 'change', label: 'Modeled change', format: formatTableValue }
                  ]}
                  rows={cellImbalanceReport}
                />
              </div>
            )}

            {chargeReport && (
              <div>
                <h3 className="font-semibold mb-2">Charge &amp; Polarity</h3>
                {resultsView === 'graphs' && (
                  <div
                    className="border rounded p-3 mb-3 bg-white"
                    role="img"
                    aria-label={'Transepithelial potential tendency: ' + chargeReport.transepithelial.direction + ', ' + chargeReport.transepithelial.strength + ', ' + formatChargeValue(chargeReport.transepithelial.value) + ' charge units.'}
                  >
                    <div className="font-semibold text-sm mb-1">Transepithelial Potential Tendency</div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-600 text-right w-20">Lumen negative</div>
                      <svg viewBox="0 0 160 90" className="w-48 h-24" aria-hidden="true">
                        <path d="M25 70 A55 55 0 0 1 135 70" fill="none" stroke="#d1d5db" strokeWidth="8" strokeLinecap="round" />
                        <line x1="80" y1="70" x2="80" y2="25" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" style={{ transform: 'rotate(' + tePotentialNeedleAngle + 'deg)', transformOrigin: '80px 70px' }} />
                        <circle cx="80" cy="70" r="6" fill="#111827" />
                        <text x="80" y="88" textAnchor="middle" fontSize="10" fill="#4b5563">0</text>
                      </svg>
                      <div className="text-xs text-gray-600 w-20">Lumen positive</div>
                    </div>
                    <div className="text-sm text-gray-700">
                      {chargeReport.transepithelial.direction} ({chargeReport.transepithelial.strength}); {formatChargeValue(chargeReport.transepithelial.value)} charge units
                    </div>
                  </div>
                )}
                <AccessibleTable
                  caption="Charge and polarity tendencies. These are display-only teaching units."
                  columns={[
                    { key: 'label', label: 'Region' },
                    { key: 'direction', label: 'Tendency' },
                    { key: 'strength', label: 'Strength' },
                    { key: 'value', label: 'Value', format: value => formatChargeValue(value) + ' charge units' }
                  ]}
                  rows={[
                    chargeReport.apical,
                    chargeReport.basolateral,
                    chargeReport.cell,
                    chargeReport.transepithelial
                  ]}
                />
              </div>
            )}

            {waterReport && (
              <div>
                <h3 className="font-semibold mb-2">Water &amp; Osmolality</h3>
                {resultsView === 'graphs' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div className="border rounded p-3">
                        <div className="font-semibold">Apical surface</div>
                        <div>{formatWaterValue(waterReport.osmolality.apical)} arbitrary osmoles</div>
                        <div className="text-gray-600">{waterReport.osmolality.apicalCategory}</div>
                      </div>
                      <div className="border rounded p-3">
                        <div className="font-semibold">Cell</div>
                        <div>{formatWaterValue(waterReport.osmolality.icf)} arbitrary osmoles</div>
                        <div className="text-gray-500">
                          includes {formatWaterValue(waterReport.osmolality.fixedIcf)} fixed osmoles
                        </div>
                        <div className="text-gray-600">{waterReport.osmolality.icfCategory}</div>
                      </div>
                      <div className="border rounded p-3">
                        <div className="font-semibold">Basolateral surface</div>
                        <div>{formatWaterValue(waterReport.osmolality.basolateral)} arbitrary osmoles</div>
                        <div className="text-gray-600">{waterReport.osmolality.basolateralCategory}</div>
                      </div>
                    </div>
                    <AccessibleTable
                      caption="Water movement tendencies."
                      columns={[
                        { key: 'label', label: 'Pathway or region' },
                        { key: 'direction', label: 'Direction' },
                        { key: 'strength', label: 'Strength' }
                      ]}
                      rows={[
                        waterReport.apicalMembrane,
                        waterReport.basolateralMembrane,
                        waterReport.cell,
                        waterReport.transcellular,
                        waterReport.paracellular,
                        waterReport.netTransepithelial
                      ]}
                    />
                    <AccessibleTable
                      caption="Local surface pH tendencies. H+ concentration is not changed by this teaching layer."
                      columns={[
                        { key: 'surface', label: 'Surface' },
                        { key: 'tendency', label: 'Tendency' }
                      ]}
                      rows={[
                        { surface: 'Apical surface', tendency: result.surfaceReport?.pHTendency?.apical || 'no strong local pH tendency' },
                        { surface: 'Basolateral surface', tendency: result.surfaceReport?.pHTendency?.basolateral || 'no strong local pH tendency' }
                      ]}
                    />
                  </>
                ) : (
                  <div className="space-y-6">
                    <AccessibleTable
                      caption="Osmolality. Values are arbitrary teaching units."
                      columns={[
                        { key: 'region', label: 'Region' },
                        { key: 'osmolality', label: 'Osmolality', format: value => formatWaterValue(value) + ' arbitrary osmoles' },
                        { key: 'category', label: 'Category' },
                        { key: 'note', label: 'Note' }
                      ]}
                      rows={[
                        { region: 'Apical surface', osmolality: waterReport.osmolality.apical, category: waterReport.osmolality.apicalCategory, note: 'Derived from fixed bath plus local transport/mixing' },
                        { region: 'Cell', osmolality: waterReport.osmolality.icf, category: waterReport.osmolality.icfCategory, note: 'Includes ' + formatWaterValue(waterReport.osmolality.fixedIcf) + ' fixed osmoles' },
                        { region: 'Basolateral surface', osmolality: waterReport.osmolality.basolateral, category: waterReport.osmolality.basolateralCategory, note: 'Derived from fixed bath plus local transport/mixing' }
                      ]}
                    />
                    <AccessibleTable
                      caption="Water movement tendencies."
                      columns={[
                        { key: 'label', label: 'Pathway or region' },
                        { key: 'direction', label: 'Direction' },
                        { key: 'strength', label: 'Strength' }
                      ]}
                      rows={[
                        waterReport.apicalMembrane,
                        waterReport.basolateralMembrane,
                        waterReport.cell,
                        waterReport.transcellular,
                        waterReport.paracellular,
                        waterReport.netTransepithelial
                      ]}
                    />
                    <AccessibleTable
                      caption="Local surface pH tendencies. H+ concentration is not changed by this teaching layer."
                      columns={[
                        { key: 'surface', label: 'Surface' },
                        { key: 'tendency', label: 'Tendency' }
                      ]}
                      rows={[
                        { surface: 'Apical surface', tendency: result.surfaceReport?.pHTendency?.apical || 'no strong local pH tendency' },
                        { surface: 'Basolateral surface', tendency: result.surfaceReport?.pHTendency?.basolateral || 'no strong local pH tendency' }
                      ]}
                    />
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  <div className="absolute bottom-1 left-0 w-full text-center text-xs text-gray-400 pb-1">
    &copy; {new Date().getFullYear()} David Julian. All rights reserved.
  </div>
</>
  );
}
