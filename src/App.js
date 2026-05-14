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

const FLUX_ONLY_SOLUTES = ['AA', 'Peptide', 'OA-', 'OC+'];

function osmolality(comp) {
  // Teaching model: approximate osmotic strength from solutes only.
  return Object.entries(comp)
    .filter(([ion]) => ion !== 'H2O' && !FLUX_ONLY_SOLUTES.includes(ion))
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
  Phosphate: -2,
  'OA-': 0,
  'OC+': 0,
  AA: 0,
  Peptide: 0,
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
  const apicalWaterPath = tList.some(t => t.id === 'AQP' && t.placement === 'apical');
  const basolateralWaterPath = tList.some(t => t.id === 'AQP' && t.placement === 'basolateral');
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
  { id: 'AQP',      name: 'AQP',        type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AE1',      name: 'AE1',        type: 'antiporter', stoich: { 'Cl-': 1, 'HCO3-': -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AAFacilitator', name: 'AA facilitator', type: 'carrier', stoich: { AA: -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'CFTR',     name: 'CFTR',       type: 'channel',    stoich: { 'Cl-': -1, 'HCO3-': -0.5 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ClCKb',    name: 'ClC-Kb',     type: 'channel',    stoich: { 'Cl-': -1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ENaC',     name: 'ENaC',       type: 'channel',    stoich: { 'Na+': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'GLUT2',    name: 'GLUT2',      type: 'channel',    stoich: { 'Glucose': -1 },      kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'TRPV56',   name: 'TRPV5/6',    type: 'channel',    stoich: { 'Ca2+': 1 },          kinetics: { maxRate: 0.6, Km: 0.8 }, placement: 'none', density: 1 },
  { id: 'HATPase',  name: 'H⁺-ATPase',  type: 'pump',       stoich: { 'H+': -1 },           kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HKATPase', name: 'H⁺/K⁺-ATPase', type: 'pump', stoich: { 'H+': -1, 'K+': 1 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaPi',     name: 'NaPi',       type: 'symporter',  stoich: { 'Na+': 3, 'Phosphate': 1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NBCe1',    name: 'NBCe1',      type: 'symporter',  stoich: { 'Na+': 1, 'HCO3-': 3 }, kinetics: { maxRate: 0.7, Km: 2.0 }, placement: 'none', density: 1 },
  { id: 'NCC',      name: 'NCC',        type: 'symporter',  stoich: { 'Na+': 1, 'Cl-': 1 },  kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NCX1',     name: 'NCX1',       type: 'exchanger',  stoich: { 'Na+': 3, 'Ca2+': -1 }, kinetics: { maxRate: 0.4, Km: 0.2 }, placement: 'none', density: 1 },
  { id: 'NHE3',     name: 'NHE3',       type: 'antiporter', stoich: { 'Na+': 1, 'H+': -1 },  kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NKCC',     name: 'NKCC',       type: 'symporter',  stoich: { 'Na+': 1, 'K+': 1, 'Cl-': 2 }, kinetics: { maxRate: 0.5, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'NaKATPase',name: 'Na⁺/K⁺-ATPase',type: 'pump',       stoich: { 'Na+': -3, 'K+': 2 }, kinetics: { maxRate: 1.2, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaAA',     name: 'Na⁺-AA',     type: 'symporter',  stoich: { 'Na+': 1, AA: 1 },    kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'OAT',      name: 'OAT',        type: 'carrier',    stoich: { 'OA-': 1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'OCT',      name: 'OCT',        type: 'carrier',    stoich: { 'OC+': 1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PMCA',     name: 'PMCA',       type: 'pump',       stoich: { 'Ca2+': -1 },         kinetics: { maxRate: 0.3, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'MATE',     name: 'MATE',       type: 'antiporter', stoich: { 'OC+': -1, 'H+': 1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PepT',     name: 'PepT',       type: 'symporter',  stoich: { Peptide: 1, 'H+': 1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'Pendrin',  name: 'Pendrin',    type: 'antiporter', stoich: { 'Cl-': 1, 'HCO3-': -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ROMK',     name: 'ROMK',       type: 'channel',    stoich: { 'K+': -1 },           kinetics: { maxRate: 0.5, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'SGLT',     name: 'SGLT',       type: 'symporter',  stoich: { 'Na+': 1, 'Glucose': 1 }, kinetics: { maxRate: 0.8, Km: 1.5 }, placement: 'none', density: 1 }
];

const TRANSPORTER_GROUPS = [
  { label: 'Channels', ids: ['AQP', 'CFTR', 'ClCKb', 'ENaC', 'GLUT2', 'ROMK', 'TRPV56'] },
  { label: 'Cotransporters', ids: ['NaAA', 'NaPi', 'NBCe1', 'NCC', 'NKCC', 'PepT', 'SGLT'] },
  { label: 'Organic solute carriers', ids: ['AAFacilitator', 'MATE', 'OAT', 'OCT'] },
  { label: 'Exchangers', ids: ['AE1', 'NCX1', 'NHE3', 'Pendrin'] },
  { label: 'Pumps', ids: ['NaKATPase', 'HATPase', 'HKATPase', 'PMCA'] }
];

const TISSUE_OPTIONS = [
  {
    value: 'all',
    label: 'All transporters',
    transporterIds: INITIAL_TRANSPORTERS.map(t => t.id)
  },
  {
    value: 'proximal-tubule',
    label: 'Renal proximal tubule',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'SGLT', 'NaPi', 'NHE3', 'NBCe1', 'GLUT2', 'NaKATPase', 'PMCA', 'NCX1', 'NaAA', 'AAFacilitator', 'PepT', 'OAT', 'OCT', 'MATE']
  },
  {
    value: 'thick-ascending-limb',
    label: 'Thick ascending limb',
    group: 'Kidney and urinary tract',
    transporterIds: ['NKCC', 'ROMK', 'ClCKb', 'NaKATPase']
  },
  {
    value: 'distal-convoluted-tubule',
    label: 'Distal convoluted tubule',
    group: 'Kidney and urinary tract',
    transporterIds: ['TRPV56', 'NCC', 'ClCKb', 'NaKATPase', 'PMCA', 'NCX1']
  },
  {
    value: 'connecting-tubule',
    label: 'Connecting tubule / CNT',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'TRPV56', 'ENaC', 'ROMK', 'NaKATPase', 'PMCA', 'NCX1']
  },
  {
    value: 'collecting-duct-principal',
    label: 'Collecting duct principal cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'ENaC', 'ROMK', 'NaKATPase']
  },
  {
    value: 'collecting-duct-alpha',
    label: 'Alpha-intercalated cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['HATPase', 'HKATPase', 'AE1', 'ClCKb']
  },
  {
    value: 'collecting-duct-beta',
    label: 'Beta-intercalated cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['Pendrin', 'HATPase', 'ClCKb']
  },
  {
    value: 'gastric-parietal',
    label: 'Gastric parietal cell',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['HKATPase', 'ClCKb', 'AE1', 'NaKATPase', 'ROMK']
  },
  {
    value: 'small-intestine',
    label: 'Small intestine',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'SGLT', 'GLUT2', 'TRPV56', 'NHE3', 'NaKATPase', 'ClCKb', 'NaAA', 'AAFacilitator', 'PepT', 'OCT', 'MATE', 'PMCA', 'NCX1']
  },
  {
    value: 'small-intestine-crypt',
    label: 'Small intestinal crypt / secretory epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'CFTR', 'NKCC', 'ROMK', 'NaKATPase', 'ClCKb', 'NHE3']
  },
  {
    value: 'colon-absorptive',
    label: 'Colon absorptive epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'ENaC', 'NHE3', 'NaKATPase', 'ClCKb', 'Pendrin', 'HATPase']
  },
  {
    value: 'gallbladder',
    label: 'Gallbladder epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'CFTR', 'NHE3', 'ClCKb', 'Pendrin', 'NaKATPase']
  },
  {
    value: 'pancreatic-duct',
    label: 'Pancreatic duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'CFTR', 'NBCe1', 'Pendrin', 'ClCKb', 'NHE3', 'NaKATPase', 'HATPase']
  },
  {
    value: 'salivary-duct',
    label: 'Salivary duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'ENaC', 'ClCKb', 'NHE3', 'Pendrin', 'NaKATPase']
  },
  {
    value: 'airway-surface',
    label: 'Airway surface epithelium',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'CFTR', 'ENaC', 'ClCKb', 'NaKATPase', 'Pendrin']
  },
  {
    value: 'sweat-duct',
    label: 'Sweat duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'CFTR', 'ENaC', 'ClCKb', 'NaKATPase']
  },
  {
    value: 'choroid-plexus',
    label: 'Choroid plexus epithelium',
    group: 'Central nervous system',
    transporterIds: ['AQP', 'CFTR', 'NKCC', 'NBCe1', 'ClCKb', 'NHE3', 'NaKATPase']
  }
];

const TISSUE_OPTION_GROUPS = [
  'Kidney and urinary tract',
  'Gastrointestinal and hepatobiliary',
  'Exocrine, airway, and skin',
  'Central nervous system'
];

const DENSITY_OPTIONS = [
  { label: 'Low', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'High', value: 2 }
];

const TRANSPORTER_DESCRIPTIONS = {
  AE1: 'Anion exchanger 1: exchanges Cl- and HCO3- in opposite directions.',
  AAFacilitator: 'AA facilitator: generic facilitated neutral amino acid transporter.',
  AQP: 'AQP water channel class, e.g., AQP2, AQP3, AQP4: enables rapid H2O movement.',
  CFTR: 'CFTR regulated anion channel: provides Cl- exit and a smaller HCO3- exit tendency in secretory layouts.',
  ClCKb: 'ClC-Kb chloride channel: passive Cl- flux follows the chloride gradient.',
  ENaC: 'Epithelial sodium channel: passive Na+ flux follows the Na+ gradient.',
  GLUT2: 'Glucose transporter 2: passive glucose flux follows the glucose gradient.',
  TRPV56: 'TRPV5/6 epithelial Ca2+ channel class: passive Ca2+ flux follows the Ca2+ gradient. SALT does not model dynamic inhibition by intracellular Ca2+.',
  HATPase: 'Proton-ATPase: pumps H+ out using ATP.',
  HKATPase: 'Proton-potassium ATPase: exchanges one H+ out for one K+ in using ATP.',
  NaPi: 'NaPi cotransporter class, e.g., NaPi-IIa and NaPi-IIc: moves Na+ and phosphate together.',
  NaAA: 'Na+-AA cotransporter: generic Na+-coupled neutral amino acid transporter.',
  NBCe1: 'Electrogenic sodium bicarbonate cotransporter: moves Na+ and HCO3- together.',
  NCC: 'Sodium-chloride cotransporter: moves Na+ and Cl- together.',
  NCX1: 'Sodium-calcium exchanger: exchanges Na+ and Ca2+ in opposite directions.',
  NHE3: 'Sodium-hydrogen exchanger: exchanges Na+ and H+ in opposite directions.',
  NKCC: 'NKCC cotransporter class, e.g., NKCC1 and NKCC2: moves Na+, K+, and Cl- together.',
  NaKATPase: 'Sodium-potassium pump: pumps Na+ out and K+ in using ATP.',
  OAT: 'OAT organic anion transporter class, e.g., OAT1 and OAT3: moves organic anions.',
  OCT: 'OCT organic cation transporter class, e.g., OCT1 and OCT2: moves organic cations.',
  PMCA: 'Plasma membrane calcium ATPase: pumps Ca2+ out using ATP.',
  MATE: 'MATE transporter class, e.g., MATE1 and MATE2-K: exchanges H+ and organic cations.',
  PepT: 'PepT peptide transporter class, e.g., PepT1 and PepT2: moves H+ and small peptides together.',
  Pendrin: 'Pendrin: exchanges Cl- and HCO3- in opposite directions.',
  ROMK: 'Potassium channel: passive K+ flux follows the K+ gradient.',
  SGLT: 'SGLT cotransporter class, e.g., SGLT1 and SGLT2: moves Na+ and glucose together.'
};

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001, Phosphate:1.0, 'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 }
};

const CONCENTRATION_EDIT_IONS = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Phosphate', 'Glucose'];
const ION_LABEL = {
  'Na+': 'Na⁺',
  'K+': 'K⁺',
  'Cl-': 'Cl⁻',
  'H+': 'H⁺',
  'HCO3-': 'HCO₃⁻',
  'Ca2+': 'Ca²⁺',
  Phosphate: 'Pi',
  'OA-': 'OA⁻',
  'OC+': 'OC⁺',
  AA: 'AA',
  Peptide: 'Peptide',
  Glucose: 'Glucose',
  H2O: 'H₂O'
};
const SURFACE_TRANSPORT_SENSITIVITY = 0.5;
const SURFACE_MIXING_FRACTION = 0.25;
const SURFACE_MAX_MULTIPLIER = 2;
const GENERAL_DISPLAY_EXCLUDED_IONS = ['H+'];
const PASSIVE_SOLUTE_CHANNELS = {
  ENaC: 'Na+',
  ClCKb: 'Cl-',
  GLUT2: 'Glucose',
  TRPV56: 'Ca2+',
  ROMK: 'K+'
};
const ACTIVE_CELL_CONCENTRATION_GAIN = {
  Glucose: 20
};
const FLUX_GROUPS = [
  { key: 'ions', label: 'Ion Fluxes', solutes: ['Na+', 'K+', 'Cl-', 'H+', 'HCO3-', 'Ca2+', 'Phosphate'] },
  { key: 'nutrients', label: 'Nutrient Fluxes', solutes: ['Glucose', 'AA', 'Peptide'] },
  { key: 'organic', label: 'Organic Ion Fluxes', solutes: ['OA-', 'OC+'] }
];
const PASSIVE_CONDUCTANCE_SCALE = {
  GLUT2: 4
};
const ELECTROCHEMICAL_MEMBRANE_PATHWAYS = {
  CFTR: ['Cl-', 'HCO3-'],
  ClCKb: ['Cl-'],
  ENaC: ['Na+'],
  ROMK: ['K+'],
  TRPV56: ['Ca2+']
};
const SUPPORT_PUMP_ID = 'NaKATPase';
const CELL_IMBALANCE_EPSILON = 0.05;
const COUPLED_MISMATCH_EPSILON = 0.05;
const COUPLED_COMPLETION_FRACTION = 0.85;
const COUPLED_MISMATCH_EXCLUSIONS = [SUPPORT_PUMP_ID, 'AE1', 'CFTR', 'Pendrin', 'MATE', 'PepT'];

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

function cellPHDirection(hFlux, hco3Flux = 0) {
  const acidLoad = hFlux - hco3Flux;
  if (Math.abs(acidLoad) < 0.001) return 'no strong cell pH tendency';
  return acidLoad > 0 ? 'cell tends acidified' : 'cell tends alkalinized';
}

function epithelialAcidBaseDirection(value) {
  if (Math.abs(value) < 0.001) return 'no strong net acid/base tendency';
  return value > 0 ? 'acid secretion / base absorption' : 'base secretion / acid absorption';
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
    .filter(ion => ion !== 'H2O' && !GENERAL_DISPLAY_EXCLUDED_IONS.includes(ion))
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
  const [tissuePreset, setTissuePreset] = useState('all');

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
          return (side1 === 'apical' ? 1 : -1) * Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        } else if (entryFlux < 0 && exitFlux > 0) {
          return (side2 === 'apical' ? 1 : -1) * Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        }
      }
    }
  }
  return 0;
}

function activeStoichForPlacement(transporter) {
  if (transporter.id === 'OAT') {
    return { 'OA-': transporter.placement === 'apical' ? -1 : 1 };
  }
  return transporter.stoich;
}

const calculateFluxesAndConcs = (tList = transporters) => {
  // Bulk baths are fixed teaching reservoirs; local surface layers are computed below.
  const baseline = baseConcentrations;
  const apicalECF = { ...baseline.apicalECF };
  const basolateralECF = { ...baseline.basolateralECF };
  const apicalFlux = {};
  const basolateralFlux = {};
  const fluxSolutes = Array.from(new Set([
    ...Object.keys(baseline.apicalECF),
    ...FLUX_ONLY_SOLUTES,
    ...tList.flatMap(t => Object.keys(t.stoich))
  ]));
  fluxSolutes.forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

  const hasNaKATPase = tList.some(t => t.id === 'NaKATPase' && t.placement !== 'none');
  const passiveChannels = [];
  const coupledEvents = [];
  const fluxEvents = [];

  // Calculate active/coupled transport first, then passive channels respond to gradients.
  tList.forEach(t => {
    if (t.placement === 'none') return;
    const effectiveStoich = activeStoichForPlacement(t);
    if (Object.keys(effectiveStoich).includes('H2O')) return;
    if (PASSIVE_SOLUTE_CHANNELS[t.id]) {
      passiveChannels.push(t);
      return;
    }
    if (t.id === SUPPORT_PUMP_ID) return;
    if (effectiveStoich['Na+'] && !hasNaKATPase) return;

    let rate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
    if (t.id === 'NHE3') {
      const h = (baseline.icf['H+']);
      const pH = -Math.log10(h);
      const pH50 = 7.2;
      const sigma = 0.05;
      rate *= 1 / (1 + Math.exp((pH - pH50) / sigma));
    }
    if (!COUPLED_MISMATCH_EXCLUSIONS.includes(t.id) && coupledSolutes(effectiveStoich).length > 1) {
      coupledEvents.push({
        id: t.id,
        name: t.name,
        placement: t.placement,
        rate,
        stoich: { ...effectiveStoich }
      });
    }
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: coupledSolutes(effectiveStoich).length > 1 ? 'coupled' : 'active',
      solutes: Object.entries(effectiveStoich)
        .filter(([ion]) => ion !== 'H2O')
        .map(([ion, coeff]) => ({
          ion,
          coeff,
          flux: rate * coeff
        }))
    });
    Object.entries(effectiveStoich).forEach(([ion, coeff]) => {
      const delta = rate * coeff;
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
    });
  });

  const supportClearance = { 'Na+': 0, Phosphate: 0 };
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
  const apicalNaPiPhosphateLoad = tList.some(t => t.id === 'NaPi' && t.placement === 'apical')
    ? Math.max(apicalFlux.Phosphate || 0, 0)
    : 0;
  if (hasNaKATPase && apicalNaPiPhosphateLoad > 0) {
    supportClearance.Phosphate = apicalNaPiPhosphateLoad;
    basolateralFlux.Phosphate -= supportClearance.Phosphate;
    fluxEvents.push({
      id: 'PhosphateExit',
      name: 'Basolateral phosphate exit support',
      placement: 'basolateral',
      type: 'teaching-support',
      solutes: [{ ion: 'Phosphate', coeff: -1, flux: -supportClearance.Phosphate }]
    });
  }

  const activeNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => { activeNetFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });
  const prePassiveICF = { ...baseline.icf };
  Object.entries(activeNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { prePassiveICF[ion] += activeCellConcentrationDelta(ion, flux); });
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

  const newICF = { ...prePassiveICF };
  Object.entries(passiveNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { newICF[ion] += flux; });
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
  const glucoseTransEpiFlux = transepithelialFlux('Glucose', ['SGLT'], ['GLUT2'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const aaTransEpiFlux = transepithelialFlux('AA', ['NaAA'], ['AAFacilitator'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const oaTransEpiFlux = transepithelialFlux('OA-', ['OAT'], ['OAT'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const ocTransEpiFlux = transepithelialFlux('OC+', ['OCT'], ['MATE'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  let peptideTransEpiFlux = 0;
  if (tList.some(t => t.id === 'PepT' && t.placement !== 'none') && tList.some(t => t.id === 'AAFacilitator' && t.placement !== 'none')) {
    peptideTransEpiFlux = transepithelialFlux('Peptide', ['PepT'], ['AAFacilitator'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
    if (peptideTransEpiFlux === 0) {
      const pepT = tList.find(t => t.id === 'PepT' && t.placement !== 'none');
      const aaExit = tList.find(t => t.id === 'AAFacilitator' && t.placement !== 'none' && t.placement !== pepT.placement);
      if (pepT && aaExit) {
        const pepRate = Math.abs(pepT.kinetics.maxRate / (pepT.kinetics.Km + 1) * pepT.density);
        const aaRate = Math.abs(aaExit.kinetics.maxRate / (aaExit.kinetics.Km + 1) * aaExit.density);
        const limiting = Math.min(pepRate, aaRate);
        peptideTransEpiFlux = pepT.placement === 'apical' ? limiting : -limiting;
      }
    }
  }
  const naTransEpiFlux = transepithelialFlux('Na+', ['SGLT','NaPi','ENaC','NCC','NKCC'], ['NaKATPase'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const clTransEpiFlux = transepithelialFlux('Cl-', ['NKCC','NCC','ClCKb','AE1','Pendrin'], ['NKCC','NCC','ClCKb','AE1','Pendrin','CFTR'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const caTransEpiFlux = transepithelialFlux('Ca2+', ['TRPV56'], ['PMCA','NCX1'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  let phosphateTransEpiFlux = 0;
  if ((apicalFlux.Phosphate || 0) > 0 && (basolateralFlux.Phosphate || 0) < 0) {
    phosphateTransEpiFlux = Math.min(Math.abs(apicalFlux.Phosphate), Math.abs(basolateralFlux.Phosphate));
  } else if ((apicalFlux.Phosphate || 0) < 0 && (basolateralFlux.Phosphate || 0) > 0) {
    phosphateTransEpiFlux = -Math.min(Math.abs(apicalFlux.Phosphate), Math.abs(basolateralFlux.Phosphate));
  }

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
    kTransEpiFlux = transepithelialFlux('K+', ['NKCC','ROMK'], ['ROMK','NaKATPase'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  }

  const hExtruders = tList.filter(t => ['NHE3','HATPase','HKATPase'].includes(t.id) && t.placement !== 'none');
  const hco3ExitTransporters = tList.filter(t => ['NBCe1','AE1','Pendrin'].includes(t.id) && t.placement !== 'none');
  const cftrHco3TransEpiFlux = transepithelialFlux('HCO3-', ['NBCe1','AE1','Pendrin'], ['CFTR'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  let hTransEpiFlux = 0;
  let hco3TransEpiFlux = cftrHco3TransEpiFlux;
  if (hExtruders.length > 0 && hco3ExitTransporters.length > 0) {
    const fluxPairs = [];
    for (let t of hExtruders) {
      for (let hco3Exit of hco3ExitTransporters) {
        if (t.placement !== hco3Exit.placement) {
          const pairHasSupport = hasNaKATPase || (t.id !== 'NHE3' && hco3Exit.id !== 'NBCe1');
          if (!pairHasSupport) continue;
          const extruderRate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
          const hco3Stoich = Math.abs(hco3Exit.stoich['HCO3-'] || 1);
          const hco3Rate = (hco3Exit.kinetics.maxRate / (hco3Exit.kinetics.Km + 1)) * hco3Exit.density * hco3Stoich;
          const limiting = Math.min(Math.abs(extruderRate), Math.abs(hco3Rate));
          if (t.placement === 'apical' && hco3Exit.placement === 'basolateral') {
            fluxPairs.push({ h: -limiting, hco3: limiting });
          } else if (t.placement === 'basolateral' && hco3Exit.placement === 'apical') {
            fluxPairs.push({ h: limiting, hco3: -limiting });
          }
        }
      }
    }
    hTransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.h, 0);
    hco3TransEpiFlux += fluxPairs.reduce((sum, p) => sum + p.hco3, 0);
  }

  // Compose transepiFluxDataNoH2O
  const transepiFluxDataNoH2O = Object.keys(netFlux).filter(ion => ion !== 'H2O').map(ion => {
    switch (ion) {
      case 'Glucose': return { ion, transepithelial: glucoseTransEpiFlux };
      case 'AA':      return { ion, transepithelial: aaTransEpiFlux };
      case 'Peptide': return { ion, transepithelial: peptideTransEpiFlux };
      case 'OA-':     return { ion, transepithelial: oaTransEpiFlux };
      case 'OC+':     return { ion, transepithelial: ocTransEpiFlux };
      case 'Na+':     return { ion, transepithelial: naTransEpiFlux };
      case 'K+':      return { ion, transepithelial: kTransEpiFlux };
      case 'Cl-':     return { ion, transepithelial: clTransEpiFlux };
      case 'Ca2+':    return { ion, transepithelial: caTransEpiFlux };
      case 'Phosphate': return { ion, transepithelial: phosphateTransEpiFlux };
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

  const acidBaseRows = Object.fromEntries(transepiFluxDataNoH2O.map(row => [row.ion, row.transepithelial || 0]));
  const acidBaseValue = -(acidBaseRows['H+'] || 0) + (acidBaseRows['HCO3-'] || 0);
  const acidBaseReport = {
    apicalSurface: surfacePHDirection(apicalFlux['H+'] || 0),
    cell: cellPHDirection(netFlux['H+'] || 0, netFlux['HCO3-'] || 0),
    basolateralSurface: surfacePHDirection(basolateralFlux['H+'] || 0),
    startingCellPH: -Math.log10(Math.max(baseline.icf['H+'], 1e-8)),
    transepithelial: {
      label: 'Net epithelial acid/base',
      direction: epithelialAcidBaseDirection(acidBaseValue),
      strength: tendencyStrength(acidBaseValue),
      value: acidBaseValue
    }
  };

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
    cellImbalanceReport,
    acidBaseReport
  });
};


  // --- Derived Data for Display ---
  const acidBaseReport = result?.acidBaseReport;

  const concentrationIons = result
    ? Object.keys(result.concentrations.icf).filter(ion => ion !== 'H2O' && !GENERAL_DISPLAY_EXCLUDED_IONS.includes(ion))
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
// Parallel/mirrored H⁺ and HCO₃⁻ TE flux logic uses pathway completion rules rather than buffered pH kinetics.
  const transepiFluxData = result?.transepiFluxData || [];
  const soluteTransepiFluxData = transepiFluxData.filter(row => row.ion !== 'H2O');
  const transepithelialByIon = Object.fromEntries(soluteTransepiFluxData.map(row => [row.ion, row.transepithelial || 0]));
  const directionalFluxRows = result
    ? FLUX_GROUPS.flatMap(group => group.solutes.map(ion => ({
      group: group.key,
      groupLabel: group.label,
      ion,
      label: ION_LABEL[ion] || ion,
      apicalStep: result.apicalFlux[ion] || 0,
      basolateralStep: -(result.basolateralFlux[ion] || 0),
      paracellularStep: result.paraFlux[ion] || 0,
      transepithelial: transepithelialByIon[ion] || 0
    })))
    : [];
  const directionalFluxGroups = FLUX_GROUPS.map(group => ({
    ...group,
    rows: directionalFluxRows.filter(row => row.group === group.key)
  }));

  const modalTransporter = INITIAL_TRANSPORTERS.find(t => t.id === modalTransporterId);
  const transporterTemplateById = id => INITIAL_TRANSPORTERS.find(t => t.id === id);
  const membraneTransporters = placement => transporters.filter(t => t.placement === placement);
  const transporterIsOnMembrane = (id, placement) => transporters.some(t => t.id === id && t.placement === placement);
  const tissueOption = TISSUE_OPTIONS.find(option => option.value === tissuePreset) || TISSUE_OPTIONS[0];
  const allTissueOption = TISSUE_OPTIONS[0];
  const groupedTissueOptions = TISSUE_OPTION_GROUPS.map(group => ({
    group,
    options: TISSUE_OPTIONS.filter(option => option.group === group)
  })).filter(group => group.options.length > 0);
  const visibleTransporterIds = new Set(tissueOption.transporterIds);

  const renderTransporterChooser = placement => (
    <div className="space-y-3">
      {TRANSPORTER_GROUPS.map(group => ({
        ...group,
        ids: group.ids.filter(id => visibleTransporterIds.has(id))
      })).filter(group => group.ids.length > 0).map(group => (
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

  const waterReport = result?.waterReport;
  const formatWaterValue = value => Number(value ?? 0).toFixed(1);
  const chargeReport = result?.chargeReport;
  const coupledMismatchReport = result?.coupledMismatchReport;
  const cellImbalanceReport = result?.cellImbalanceReport || [];
  const cellImbalanceRows = cellImbalanceReport.length
    ? cellImbalanceReport
    : [{ label: 'None', direction: 'No intracellular imbalance tendency detected', change: 0 }];
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
  const keyTransepithelialRows = soluteTransepiFluxData.filter(row => Math.abs(Number(row.transepithelial || 0)) >= 0.001);
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
  const tePotentialNeedleAngle = clamp(-tePotentialValue * 45, -60, 60);
  const acidBaseNeedleAngle = clamp((acidBaseReport?.transepithelial?.value ?? 0) * 25, -60, 60);
  const waterNeedleAngle = clamp((waterReport?.netTransepithelial?.value ?? 0) * 45, -60, 60);
  const membraneDirectionText = (placement, sign) => {
    if (sign === 0) return 'no strong tendency';
    if (placement === 'apical') return sign > 0 ? 'lumen to cell' : 'cell to lumen';
    return sign > 0 ? 'blood to cell' : 'cell to blood';
  };
  const epithelialDirectionText = sign => {
    if (sign === 0) return 'no strong tendency';
    return sign > 0 ? 'toward blood' : 'toward lumen';
  };
  const combinedElectrochemicalText = (chemicalSign, electricalSign) => {
    if (chemicalSign === 0 && electricalSign === 0) return 'little chemical or electrical tendency detected';
    if (electricalSign === 0) return 'chemical gradient shown; little electrical tendency detected';
    if (chemicalSign === 0) return 'little chemical gradient; electrical tendency dominates the display';
    return chemicalSign === electricalSign
      ? 'chemical and electrical tendencies align'
      : 'electrical tendency opposes chemical gradient';
  };
  const membraneChemicalSign = (placement, ion) => {
    if (!result) return 0;
    const outside = placement === 'apical'
      ? result.concentrations.apicalSurface?.[ion]
      : result.concentrations.basolateralSurface?.[ion];
    const inside = result.concentrations.icf?.[ion];
    const delta = Number(outside ?? 0) - Number(inside ?? 0);
    if (Math.abs(delta) < CELL_IMBALANCE_EPSILON) return 0;
    return delta > 0 ? 1 : -1;
  };
  const membraneElectricalSign = (placement, ion) => {
    const valence = ION_VALENCE[ion] || 0;
    const polarity = chargeReport?.[placement]?.value || 0;
    if (valence === 0 || Math.abs(polarity) < CHARGE_EPSILON) return 0;
    const cellTendsPositive = polarity > 0;
    if (valence > 0) return cellTendsPositive ? -1 : 1;
    return cellTendsPositive ? 1 : -1;
  };
  const paracellularChemicalSign = ion => {
    if (!result) return 0;
    const apical = Number(result.concentrations.apicalSurface?.[ion] ?? 0);
    const basolateral = Number(result.concentrations.basolateralSurface?.[ion] ?? 0);
    const delta = apical - basolateral;
    if (Math.abs(delta) < CELL_IMBALANCE_EPSILON) return 0;
    return delta > 0 ? 1 : -1;
  };
  const paracellularElectricalSign = ion => {
    const valence = ION_VALENCE[ion] || 0;
    const transepithelialPolarity = chargeReport?.transepithelial?.value || 0;
    if (valence === 0 || Math.abs(transepithelialPolarity) < CHARGE_EPSILON) return 0;
    const lumenTendsNegative = transepithelialPolarity > 0;
    if (valence > 0) return lumenTendsNegative ? -1 : 1;
    return lumenTendsNegative ? 1 : -1;
  };
  const electrochemicalContextRows = result && chargeReport
    ? [
        ...transporters.flatMap(t => {
          if (t.placement === 'none' || !ELECTROCHEMICAL_MEMBRANE_PATHWAYS[t.id]) return [];
          return ELECTROCHEMICAL_MEMBRANE_PATHWAYS[t.id].map(ion => {
            const chemicalSign = membraneChemicalSign(t.placement, ion);
            const electricalSign = membraneElectricalSign(t.placement, ion);
            return {
              pathway: t.name,
              membrane: t.placement === 'apical' ? 'Apical membrane' : 'Basolateral membrane',
              ion: ION_LABEL[ion] || ion,
              chemical: membraneDirectionText(t.placement, chemicalSign),
              electrical: membraneDirectionText(t.placement, electricalSign),
              interpretation: combinedElectrochemicalText(chemicalSign, electricalSign)
            };
          });
        }),
        ...(paracellularType === 'cation'
          ? ['Na+', 'K+'].map(ion => {
              const chemicalSign = paracellularChemicalSign(ion);
              const electricalSign = paracellularElectricalSign(ion);
              return {
                pathway: 'Paracellular cation pore',
                membrane: 'Paracellular pathway',
                ion: ION_LABEL[ion] || ion,
                chemical: epithelialDirectionText(chemicalSign),
                electrical: epithelialDirectionText(electricalSign),
                interpretation: combinedElectrochemicalText(chemicalSign, electricalSign)
              };
            })
          : []),
        ...(paracellularType === 'anion'
          ? ['Cl-', 'HCO3-'].map(ion => {
              const chemicalSign = paracellularChemicalSign(ion);
              const electricalSign = paracellularElectricalSign(ion);
              return {
                pathway: 'Paracellular anion pore',
                membrane: 'Paracellular pathway',
                ion: ION_LABEL[ion] || ion,
                chemical: epithelialDirectionText(chemicalSign),
                electrical: epithelialDirectionText(electricalSign),
                interpretation: combinedElectrochemicalText(chemicalSign, electricalSign)
              };
            })
          : [])
      ]
    : [];
  const electrochemicalTableRows = electrochemicalContextRows.length
    ? electrochemicalContextRows
    : [{
        pathway: 'None',
        membrane: 'No charged passive or paracellular pathway placed',
        ion: 'none',
        chemical: 'none',
        electrical: 'none',
        interpretation: 'Add ENaC, ROMK, ClC-Kb, CFTR, TRPV5/6, or a paracellular pore to show context'
      }];

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
          <tr key={[row.pathway, row.membrane, row.ion || row.label, index].filter(Boolean).join('-')} className="border-t">
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
        <li><b>Audience:</b> This About panel is written for instructors and reviewers. A later student-facing version can use less implementation detail.</li>
        <li><b>Purpose:</b> SALT is a qualitative teaching model for exploring epithelial pathway logic: which membrane steps are present, which are missing, and what consequences follow.</li>
        <li><b>Units:</b> Fluxes, concentration shifts, water tendencies, and charge tendencies use arbitrary teaching units. The model is not intended to produce research-grade flux magnitudes.</li>
        <li><b>Core distinction:</b> The app separates one-membrane flux tendencies from completed transepithelial flux. A transporter can move solute into or out of the cell even when a full apical-to-basolateral pathway is incomplete.</li>
        <li><b>Reservoirs and surfaces:</b> Bulk bath concentrations are fixed by default. Local surface concentrations are calculated from transporter flux plus partial mixing, so local gradients can differ from the bulk reservoirs.</li>
        <li><b>Direction convention:</b> Flux graphs use one shared convention: positive points toward the basolateral/blood side and negative points toward the apical/lumen side.</li>
        <li><b>Exploration:</b> Tissue choices filter which transporters are offered, but they do not remove transporters already placed. Unusual layouts are allowed so users can observe their consequences.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Teaching Abstractions &amp; Limits</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Electrochemical context:</b> Chemical gradients drive passive flux in the current model. Electrical effects are shown as display-only context inferred from modeled polarity; they do not alter flux, and no membrane voltage, Nernst potential, or Goldman-Hodgkin-Katz calculation is performed.</li>
        <li><b>Charge and polarity:</b> Charge outputs are teaching tendencies computed from modeled ion fluxes. They are intended to flag likely electrical consequences, not to solve a steady-state electrical circuit.</li>
        <li><b>Water:</b> H₂O is represented as osmolality and water movement tendency. The app does not calculate true cell volume.</li>
        <li><b>pH:</b> H⁺ is not plotted with bulk solutes. Acid/base behavior is shown as pH tendency and net acid/base flux rather than as a buffered quantitative pH calculation.</li>
        <li><b>Flux-only cargo:</b> Amino acids, peptides, organic anions, and organic cations are shown in flux outputs only. They are excluded from concentration graphs, Settings concentration controls, osmolality, and charge/polarity calculations.</li>
        <li><b>Class-level transporters:</b> AQP, SGLT, NaPi, NKCC, TRPV5/6, OAT, OCT, MATE, and PepT represent transporter classes. Isoform-specific regulation is simplified unless it is central to the teaching rule.</li>
        <li><b>Special teaching rules:</b> Na⁺/K⁺-ATPase provides Na⁺ gradient support and basolateral Na⁺ clearance. NaPi can use implicit basolateral phosphate exit when pump support is present. CFTR is represented as regulated Cl⁻ exit with a smaller HCO₃⁻ exit tendency. TRPV5/6 does not include dynamic inhibition by intracellular Ca²⁺.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">General Flux Rules</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Placement:</b> Transporters are active only when placed on the apical or basolateral membrane.</li>
        <li><b>Density:</b> Low, normal, and high density change transporter abundance and therefore scale the modeled flux tendency.</li>
        <li><b>Passive pathways:</b> ENaC, ROMK, ClC-Kb, GLUT2, and TRPV5/6 follow their local chemical gradients and can reverse if the gradient reverses.</li>
        <li><b>Regulated or supported pathways:</b> CFTR is treated as regulated anion exit. Na⁺-coupled cotransporters and exchangers require Na⁺/K⁺-ATPase support.</li>
        <li><b>Pathway completion:</b> Completed transepithelial flux requires compatible entry and exit steps on opposite membranes. One-sided movement can still create intracellular accumulation or depletion tendencies.</li>
        <li><b>Coupled transport:</b> The coupled transport status light compares linked transporter stoichiometry with completed transepithelial flux and flags layouts that may not represent a steady-state pathway.</li>
        <li><b>Paracellular flux:</b> Paracellular ion and water movement is shown separately from membrane steps and is included in net epithelial flux when a leaky pathway is enabled.</li>
        <li><b>NKCC and K⁺ recycling:</b> ROMK can support K⁺ recycling in NKCC-heavy layouts, especially thick ascending limb-like layouts, but the generalized NKCC class is not hard-gated by ROMK.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-6 mb-1">Transporter Actions &amp; Rules</h3>
      <ul className="list-disc ml-6 text-sm space-y-2">
        <li>
          <b>AE1:</b> anion exchanger 1<br/>
          <i>Action:</i> Cl⁻/HCO₃⁻ exchanger; moves Cl⁻ and HCO₃⁻ in opposite directions.<br/>
          <i>Rule:</i> Can pair with an opposite-membrane proton extruder to support acid secretion/base absorption or the reverse, depending on placement.
        </li>
        <li>
          <b>AA facilitator:</b> facilitated amino acid transporter class; representative examples include LAT/SLC7 family transporters<br/>
          <i>Action:</i> Facilitated neutral amino acid movement.<br/>
          <i>Rule:</i> Can provide amino acid exit or entry in a completed amino acid pathway with Na⁺-AA cotransport on the opposite membrane.
        </li>
        <li>
          <b>AQP:</b> aquaporin class; representative members include AQP2, AQP3, and AQP4<br/>
          <i>Action:</i> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> AQP on one membrane permits water exchange at that membrane. Net transcellular H₂O flux requires water pathways on both apical and basolateral membranes.
        </li>
        <li>
          <b>CFTR:</b> cystic fibrosis transmembrane conductance regulator<br/>
          <i>Action:</i> Regulated epithelial anion channel; provides Cl⁻ exit and a smaller HCO₃⁻ exit tendency in this teaching model.<br/>
          <i>Rule:</i> Can complete Cl⁻ secretion when paired with NKCC or another Cl⁻ entry pathway on the opposite membrane. Can contribute to HCO₃⁻ secretion when paired with a compatible HCO₃⁻ entry pathway. Dynamic gating and detailed bicarbonate selectivity are not modeled.
        </li>
        <li>
          <b>ClC-Kb:</b> basolateral chloride channel<br/>
          <i>Action:</i> Chloride channel; passive Cl⁻ flux follows the Cl⁻ gradient.<br/>
          <i>Rule:</i> Can provide a Cl⁻ exit or entry pathway, helping complete NaCl transport driven by NCC or NKCC.
        </li>
        <li>
          <b>ENaC:</b> epithelial sodium channel<br/>
          <i>Action:</i> Sodium channel; passive Na⁺ flux follows the Na⁺ gradient.<br/>
          <i>Rule:</i> Can provide Na⁺ membrane flux; completed transepithelial Na⁺ movement depends on Na⁺/K⁺-ATPase support.
        </li>
        <li>
          <b>GLUT2:</b> glucose transporter 2<br/>
          <i>Action:</i> Facilitated glucose transporter; passive glucose flux follows the glucose gradient.<br/>
          <i>Rule:</i> SGLT can raise modeled cell glucose enough to drive GLUT2. If the adjacent bath glucose is higher than the displayed cell glucose, GLUT2 favors glucose entry instead of exit.
        </li>
        <li>
          <b>H⁺-ATPase:</b> proton ATPase<br/>
          <i>Action:</i> Proton pump; pumps H⁺ out using ATP.<br/>
          <i>Rule:</i> Contributes to local H⁺ flux and pH tendency; completed acid/base flux is modeled when paired with NBCe1 on the opposite membrane.
        </li>
        <li>
          <b>H⁺/K⁺-ATPase:</b> proton-potassium ATPase<br/>
          <i>Action:</i> Proton-potassium pump; exchanges one H⁺ out and K⁺ in using ATP.<br/>
          <i>Rule:</i> Can create K⁺ transepithelial flux in this teaching model. For acid/base flux, it is treated as a proton extruder that pairs with NBCe1 on the opposite membrane.
        </li>
        <li>
          <b>MATE:</b> multidrug and toxin extrusion transporter class; representative members include MATE1 and MATE2-K<br/>
          <i>Action:</i> H⁺/organic cation exchange.<br/>
          <i>Rule:</i> Can pair with OCT on the opposite membrane for organic cation transport.
        </li>
        <li>
          <b>NaPi:</b> sodium-phosphate cotransporter class; representative members include NaPi-IIa and NaPi-IIc<br/>
          <i>Action:</i> Na⁺-phosphate symporter; co-transports Na⁺ and phosphate together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support. When apical, phosphate absorption uses an implicit basolateral phosphate exit support rule in this teaching layer.
        </li>
        <li>
          <b>Na⁺-AA:</b> sodium-amino acid cotransporter class; representative examples include neutral amino acid transport systems such as B⁰AT/SLC6 family transporters<br/>
          <i>Action:</i> Na⁺-coupled neutral amino acid movement.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with an AA facilitator on the opposite membrane for completed amino acid transport.
        </li>
        <li>
          <b>NBCe1:</b> electrogenic sodium bicarbonate cotransporter 1<br/>
          <i>Action:</i> Electrogenic Na⁺-bicarbonate cotransporter; moves Na⁺ and HCO₃⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; pairs with proton extruders on the opposite membrane for transepithelial acid/base flux.
        </li>
        <li>
          <b>NCC:</b> sodium-chloride cotransporter<br/>
          <i>Action:</i> Na⁺-Cl⁻ symporter; co-transports Na⁺ and Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support. Cl⁻ transepithelial completion requires compatible NCC, NKCC, CFTR, or chloride channel pathways on opposite membranes; otherwise Cl⁻ imbalance can appear.
        </li>
        <li>
          <b>NCX1:</b> sodium-calcium exchanger 1<br/>
          <i>Action:</i> Na⁺-Ca²⁺ exchanger; exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support. Can complete Ca²⁺ flux when paired with TRPV5/6 on the opposite membrane.
        </li>
        <li>
          <b>NHE3:</b> sodium-hydrogen exchanger 3<br/>
          <i>Action:</i> Na⁺/H⁺ exchanger; exchanges Na⁺ and H⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; activity decreases at higher pH; paired with NBCe1 for transepithelial HCO₃⁻ and H⁺ flux.
        </li>
        <li>
          <b>NKCC:</b> sodium-potassium-chloride cotransporter class; representative members include NKCC1 and NKCC2<br/>
          <i>Action:</i> Na⁺-K⁺-2Cl⁻ symporter; co-transports Na⁺, K⁺, and 2 Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support. Basolateral NKCC plus apical CFTR can produce Cl⁻ secretion; apical NKCC plus basolateral Cl⁻ exit can produce absorptive patterns. ROMK can support K⁺ recycling in TAL-like layouts but is not a hard gate for this generalized class.
        </li>
        <li>
          <b>Na⁺/K⁺ ATPase:</b> sodium-potassium ATPase<br/>
          <i>Biological action:</i> Active pump; extrudes 3 Na⁺ and imports 2 K⁺ per ATP.<br/>
          <i>Rule:</i> In this teaching layer, it is modeled as Na⁺ gradient support and basolateral Na⁺ clearance. Its K⁺ stoichiometry is acknowledged but not explicitly balanced.
        </li>
        <li>
          <b>OAT:</b> organic anion transporter class; representative members include OAT1 and OAT3<br/>
          <i>Action:</i> Organic anion movement.<br/>
          <i>Rule:</i> Can provide organic anion movement in a completed organic anion pathway.
        </li>
        <li>
          <b>OCT:</b> organic cation transporter class; representative members include OCT1 and OCT2<br/>
          <i>Action:</i> Organic cation movement.<br/>
          <i>Rule:</i> Can pair with MATE on the opposite membrane for organic cation transport.
        </li>
        <li>
          <b>PMCA:</b> plasma membrane calcium ATPase<br/>
          <i>Action:</i> Ca²⁺ pump; pumps Ca²⁺ out using ATP.<br/>
          <i>Rule:</i> Can complete Ca²⁺ flux when paired with TRPV5/6 on the opposite membrane.
        </li>
        <li>
          <b>PepT:</b> peptide transporter class; representative members include PepT1 and PepT2<br/>
          <i>Action:</i> H⁺-coupled small peptide movement.<br/>
          <i>Rule:</i> Peptide-derived nutrient absorption can be completed by an AA facilitator on the opposite membrane, representing intracellular peptide hydrolysis in this teaching layer.
        </li>
        <li>
          <b>Pendrin:</b> Cl⁻/HCO₃⁻ exchanger<br/>
          <i>Action:</i> Cl⁻/HCO₃⁻ exchanger; moves Cl⁻ and HCO₃⁻ in opposite directions.<br/>
          <i>Rule:</i> Can pair with an opposite-membrane proton extruder for acid/base flux, and can contribute to Cl⁻/HCO₃⁻ imbalance when placed without a matching pathway.
        </li>
        <li>
          <b>ROMK:</b> renal outer medullary potassium channel<br/>
          <i>Action:</i> Potassium channel; passive K⁺ flux follows the K⁺ gradient.<br/>
          <i>Rule:</i> Can provide K⁺ recycling support in NKCC-heavy layouts and can provide K⁺ membrane flux when a K⁺ gradient exists.
        </li>
        <li>
          <b>SGLT:</b> sodium-glucose cotransporter class; representative members include SGLT1 and SGLT2<br/>
          <i>Action:</i> Na⁺-glucose symporter; co-transports Na⁺ and glucose together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; for net glucose flux, SGLT and GLUT2 must be on opposite membranes.
        </li>
        <li>
          <b>TRPV5/6:</b> epithelial calcium channel class; representative members include renal TRPV5 and intestinal TRPV6<br/>
          <i>Action:</i> Passive Ca²⁺ channel; Ca²⁺ flux follows the local Ca²⁺ gradient.<br/>
          <i>Rule:</i> Completed epithelial Ca²⁺ movement requires TRPV5/6 on one membrane and PMCA or NCX1 on the opposite membrane; apical TRPV5/6 plus basolateral extrusion produces absorption. SALT does not model dynamic channel regulation by intracellular Ca²⁺, so unmatched entry is shown as an intracellular Ca²⁺ accumulation tendency.
        </li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Paracellular Pathway Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Paracellular pathway:</b> Movement of ions and water between cells, bypassing the cell membrane.<br/>
        <i>Rule:</i> Select <b>Tight Junction</b> for no passive leak. Select <b>Cation + Water Pore</b> to enable Na⁺ and K⁺ flux down their transepithelial concentration gradients and paracellular H₂O movement down the transepithelial osmotic gradient. Select <b>Anion Pore</b> for Cl⁻ and HCO₃⁻ flux (e.g., claudin-10a or claudin-17 type). The magnitude depends on the permeability setting and the size of the gradient. Paracellular ion flux is displayed separately from membrane steps and is included in the net epithelial flux.
        </li>
          </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Water &amp; Osmolality Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H₂O is not treated as a transported solute concentration. The app reports osmolality and water movement tendencies instead of calculating true cell volume.</li>
        <li>Apical and basolateral membrane water tendencies are based on the osmotic difference between the cell and the adjacent local surface layer, and require a water pathway on that membrane.</li>
        <li>Net transcellular epithelial water movement uses a teaching rule: when a complete apical-to-basolateral water pathway exists, water follows net transepithelial solute absorption or secretion. This represents local osmotic coupling that the app does not explicitly model as a standing bath-to-bath osmotic gradient.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Acid/Base &amp; pH Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H⁺ is excluded from the standard concentration graph because its physiological concentration is too small to share a useful visual scale with Na⁺, K⁺, Cl⁻, glucose, and other bulk solutes.</li>
        <li>The app does not recalculate buffered H⁺ concentration or true pH after transport. Instead, it reports qualitative pH tendencies for the apical surface, cell, and basolateral surface.</li>
        <li>Surface pH tendencies come from local H⁺ flux at that membrane: H⁺ added to a surface tends to lower local pH, while H⁺ removed from a surface tends to raise local pH.</li>
        <li>Cell pH tendency compares the modeled cellular H⁺ load with HCO₃⁻ movement. H⁺ loading tends to acidify the cell, while HCO₃⁻ loading tends to alkalinize it.</li>
        <li>The net acid/base dial is calculated from completed transepithelial H⁺ and HCO₃⁻ flux. H⁺ secretion and HCO₃⁻ absorption point toward acid secretion/base absorption; the opposite points toward base secretion/acid absorption.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Transepithelial Solute Flux Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Glucose:</b> SGLT on one membrane and GLUT2 on the opposite membrane (plus Na⁺/K⁺ ATPase anywhere).</li>
        <li><b>Na⁺:</b> SGLT, NaPi, ENaC, NCC, or NKCC can provide Na⁺ entry/exit tendencies; Na⁺/K⁺ ATPase support provides modeled basolateral Na⁺ clearance.</li>
        <li><b>K⁺:</b> H⁺/K⁺-ATPase can create modeled K⁺ transepithelial flux. ROMK can provide passive K⁺ membrane flux and K⁺ recycling support for NKCC-heavy layouts.</li>
        <li><b>Cl⁻:</b> NKCC, NCC, ClC-Kb, CFTR, AE1, or pendrin can provide Cl⁻ membrane movement. Completed Cl⁻ flux requires compatible movement on opposite membranes.</li>
        <li><b>Ca²⁺:</b> TRPV5/6 provides passive Ca²⁺ entry. Completed Ca²⁺ movement requires PMCA or NCX1 on the opposite membrane; otherwise intracellular Ca²⁺ imbalance is reported.</li>
        <li><b>Phosphate:</b> Apical NaPi plus Na⁺/K⁺-ATPase support produces phosphate absorption using an implicit basolateral phosphate exit teaching rule.</li>
        <li><b>Amino acids:</b> Na⁺-AA on one membrane and AA facilitator on the opposite membrane produce completed neutral amino acid transport.</li>
        <li><b>Peptides:</b> PepT on one membrane and AA facilitator on the opposite membrane produce completed peptide-derived nutrient transport in this teaching layer.</li>
        <li><b>Organic anions and cations:</b> OAT can complete organic anion pathways when present on opposite membranes. OCT and MATE on opposite membranes complete organic cation pathways.</li>
        <li><b>H⁺ and HCO₃⁻:</b> A proton extruder (NHE3, H⁺-ATPase, or H⁺/K⁺-ATPase) on one membrane and NBCe1, AE1, or pendrin on the opposite membrane. CFTR can provide an HCO₃⁻ exit tendency when paired with a compatible HCO₃⁻ entry pathway. NHE3 and NBCe1 require Na⁺/K⁺-ATPase support; AE1, pendrin, CFTR, H⁺-ATPase, and H⁺/K⁺-ATPase do not require that support in this teaching rule.</li>
        <li><b>H₂O:</b> Net transcellular water movement requires water pathways on both apical and basolateral membranes. When present, H₂O follows the direction of net transepithelial solute movement in arbitrary teaching units.</li>
      </ul>
      <Button size="sm" variant="outline" onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
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
  <h2 className="text-base font-semibold mb-2">Tissue</h2>
  <select
    value={tissueOption.value}
    onChange={e => setTissuePreset(e.target.value)}
    className="w-full border rounded p-1"
    aria-label="Tissue transporter set"
  >
    <option value={allTissueOption.value}>{allTissueOption.label}</option>
    {groupedTissueOptions.map(group => (
      <optgroup key={group.group} label={group.group}>
        {group.options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </optgroup>
    ))}
  </select>
  <div className="text-xs text-gray-500 mt-1">
    Filters the add-transporter list; already-added transporters remain active.
  </div>
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
          Electrochemical context is shown in results, but remains display-only and does not change flux.
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
        case 'AE1':
          return <><b>Anion exchanger 1</b>: exchanges Cl⁻ and HCO₃⁻ in opposite directions.<br/></>;
        case 'AAFacilitator':
          return <><b>AA facilitator</b>: generic facilitated neutral amino acid transporter; representative examples include LAT/SLC7 family transporters.<br/></>;
        case 'AQP':
          return <><b>AQP water channel class</b>: representative members include AQP2, AQP3, and AQP4; enables rapid H₂O movement.<br/></>;
        case 'CFTR':
          return <><b>CFTR regulated anion channel</b>: provides Cl⁻ exit and a smaller HCO₃⁻ exit tendency in secretory layouts. SALT does not model CFTR gating, cAMP regulation, or detailed bicarbonate selectivity.<br/></>;
        case 'ClCKb':
          return <><b>ClC-Kb chloride channel</b>: passive Cl⁻ flux follows the Cl⁻ gradient.<br/></>;
        case 'ENaC':
          return <><b>Epithelial sodium channel</b>: passive Na⁺ flux follows the Na⁺ gradient.<br/></>;
        case 'GLUT2':
          return <><b>Glucose transporter 2</b>: passive glucose flux follows the glucose gradient.<br/></>;
        case 'TRPV56':
          return <><b>TRPV5/6 epithelial calcium channel class</b>: passive Ca²⁺ flux follows the Ca²⁺ gradient. SALT does not model dynamic inhibition by intracellular Ca²⁺; unmatched entry is shown as intracellular Ca²⁺ accumulation tendency.<br/></>;
        case 'HATPase':
          return <><b>Proton-ATPase (V-type)</b>: pumps one H⁺ out per ATP.<br/></>;
        case 'HKATPase':
          return <><b>Proton-potassium ATPase</b>: exchanges one H⁺ out for one K⁺ in per ATP.<br/></>;
        case 'MATE':
          return <><b>MATE transporter class</b>: representative members include MATE1 and MATE2-K; exchanges H⁺ and organic cations.<br/></>;
        case 'NaPi':
          return <><b>NaPi cotransporter class</b>: representative members include NaPi-IIa and NaPi-IIc; moves Na⁺ and phosphate together.<br/></>;
        case 'NaAA':
          return <><b>Na⁺-AA cotransporter</b>: generic Na⁺-coupled neutral amino acid transporter.<br/></>;
        case 'NBCe1':
          return <><b>Electrogenic sodium bicarbonate cotransporter 1</b>: moves Na⁺ and HCO₃⁻ together.<br/></>;
        case 'NCC':
          return <><b>Sodium-chloride cotransporter</b>: moves Na⁺ and Cl⁻ together.<br/></>;
        case 'NCX1':
          return <><b>Sodium-calcium exchanger</b>: exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions.<br/></>;
        case 'NHE3':
          return <><b>Sodium-hydrogen exchanger 3</b>: exchanges Na⁺ and H⁺ in opposite directions.<br/></>;
        case 'NKCC':
          return <><b>NKCC cotransporter class</b>: representative members include NKCC1 and NKCC2; moves Na⁺, K⁺, and 2 Cl⁻ together.<br/></>;
        case 'NaKATPase':
          return <><b>Sodium-potassium pump</b>: pumps 3 Na⁺ out and 2 K⁺ in per ATP.<br/></>;
        case 'OAT':
          return <><b>OAT transporter class</b>: representative members include OAT1 and OAT3; moves organic anions.<br/></>;
        case 'OCT':
          return <><b>OCT transporter class</b>: representative members include OCT1 and OCT2; moves organic cations.<br/></>;
        case 'PMCA':
          return <><b>Plasma membrane calcium ATPase</b>: pumps one Ca²⁺ out per ATP.<br/></>;
        case 'PepT':
          return <><b>PepT transporter class</b>: representative members include PepT1 and PepT2; moves H⁺ and small peptides together.<br/></>;
        case 'Pendrin':
          return <><b>Pendrin</b>: exchanges Cl⁻ and HCO₃⁻ in opposite directions.<br/></>;
        case 'ROMK':
          return <><b>Renal outer medullary potassium channel</b>: passive K⁺ flux follows the K⁺ gradient.<br/></>;
        case 'SGLT':
          return <><b>SGLT cotransporter class</b>: representative members include SGLT1 and SGLT2; moves Na⁺ and glucose together.<br/></>;
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
                <div>
                  <h3 className="font-semibold">Directional Fluxes</h3>
                  <div className="text-xs text-gray-600 mb-2">Positive = toward blood; negative = toward lumen.</div>
                  <div className="space-y-4">
                    {directionalFluxGroups.filter(group => group.key === 'ions').map(group => (
                      <div key={group.key}>
                        <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                            <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                            <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                            <Legend />
                            <Bar dataKey="apicalStep" name="Apical step" fill="#2563eb" />
                            <Bar dataKey="basolateralStep" name="Basolateral step" fill="#059669" />
                            <Bar dataKey="paracellularStep" name="Paracellular" fill="#d97706" />
                            <Bar dataKey="transepithelial" name="Net epithelial" fill="#fb7185" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {directionalFluxGroups.filter(group => group.key !== 'ions').map(group => (
                        <div key={group.key}>
                          <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                          <ResponsiveContainer width="100%" height={150}>
                            <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                              <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                              <YAxis tick={{ fontSize: 12 }} />
                              <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                              <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                              <Legend />
                              <Bar dataKey="apicalStep" name="Apical step" fill="#2563eb" />
                              <Bar dataKey="basolateralStep" name="Basolateral step" fill="#059669" />
                              <Bar dataKey="paracellularStep" name="Paracellular" fill="#d97706" />
                              <Bar dataKey="transepithelial" name="Net epithelial" fill="#fb7185" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Concentrations</h3>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={concData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                      <YAxis domain={[0,150]} tick={{ fontSize: 12 }} /><Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} /><Legend />
                      <Bar dataKey="apicalBulk" name="Apical Bulk" fill="#2dd4bf" />
                      <Bar dataKey="apicalSurface" name="Apical Surface" fill="#0f766e" />
                      <Bar dataKey="icf" name="ICF" fill="#8b5cf6" fillOpacity={0.75} />
                      <Bar dataKey="basolateralSurface" name="Basolateral Surface" fill="#ea580c" />
                      <Bar dataKey="basolateralBulk" name="Basolateral Bulk" fill="#fb923c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="space-y-6 overflow-auto">
                <AccessibleTable
                  caption="Directional fluxes. Positive values point toward blood; negative values point toward lumen."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'groupLabel', label: 'Flux group' },
                    { key: 'apicalStep', label: 'Apical step', format: formatTableValue },
                    { key: 'basolateralStep', label: 'Basolateral step', format: formatTableValue },
                    { key: 'paracellularStep', label: 'Paracellular pathway', format: formatTableValue },
                    { key: 'transepithelial', label: 'Net epithelial flux', format: formatTableValue },
                    { key: 'direction', label: 'Direction', format: (_, row) => fluxDirection(row.transepithelial) }
                  ]}
                  rows={directionalFluxRows.map(row => ({ ...row, ion: row.label, direction: fluxDirection(row.transepithelial) }))}
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
              </div>
            )}

            {chargeReport && (
              <div>
                {resultsView === 'graphs' && (
                  <>
                    <h3 className="font-semibold mb-2">Epithelial Outcome Tendencies</h3>
                    <div className={'grid grid-cols-1 gap-3 mb-3 ' + (waterReport ? 'xl:grid-cols-3' : 'xl:grid-cols-2')}>
                      <div
                        className="border rounded p-3 bg-white"
                        role="img"
                        aria-label={'Transepithelial potential: ' + chargeReport.transepithelial.direction + ', ' + chargeReport.transepithelial.strength + ', ' + formatChargeValue(chargeReport.transepithelial.value) + ' charge units.'}
                      >
                        <div className="font-semibold text-sm mb-1">Transepithelial Potential</div>
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
                      {acidBaseReport && (
                        <div
                          className="border rounded p-3 bg-white"
                          role="img"
                          aria-label={'Net acid base flux: ' + acidBaseReport.transepithelial.direction + ', ' + acidBaseReport.transepithelial.strength + ', ' + formatChargeValue(acidBaseReport.transepithelial.value) + ' acid base units.'}
                        >
                          <div className="font-semibold text-sm mb-1">Net Acid/Base Flux</div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-600 text-right w-20">Base secretion</div>
                            <svg viewBox="0 0 160 90" className="w-48 h-24" aria-hidden="true">
                              <path d="M25 70 A55 55 0 0 1 135 70" fill="none" stroke="#d1d5db" strokeWidth="8" strokeLinecap="round" />
                              <line x1="80" y1="70" x2="80" y2="25" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" style={{ transform: 'rotate(' + acidBaseNeedleAngle + 'deg)', transformOrigin: '80px 70px' }} />
                              <circle cx="80" cy="70" r="6" fill="#111827" />
                              <text x="80" y="88" textAnchor="middle" fontSize="10" fill="#4b5563">0</text>
                            </svg>
                            <div className="text-xs text-gray-600 w-20">Acid secretion</div>
                          </div>
                          <div className="text-sm text-gray-700">
                            {acidBaseReport.transepithelial.direction} ({acidBaseReport.transepithelial.strength}); {formatChargeValue(acidBaseReport.transepithelial.value)} acid/base units
                          </div>
                        </div>
                      )}
                      {waterReport && (
                        <div
                          className="border rounded p-3 bg-white"
                          role="img"
                          aria-label={'Net water flux: ' + waterReport.netTransepithelial.direction + ', ' + waterReport.netTransepithelial.strength + ', ' + formatWaterValue(waterReport.netTransepithelial.value) + ' water tendency units.'}
                        >
                          <div className="font-semibold text-sm mb-1">Net Water Flux</div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-600 text-right w-20">Secretion</div>
                            <svg viewBox="0 0 160 90" className="w-48 h-24" aria-hidden="true">
                              <path d="M25 70 A55 55 0 0 1 135 70" fill="none" stroke="#d1d5db" strokeWidth="8" strokeLinecap="round" />
                              <line x1="80" y1="70" x2="80" y2="25" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" style={{ transform: 'rotate(' + waterNeedleAngle + 'deg)', transformOrigin: '80px 70px' }} />
                              <circle cx="80" cy="70" r="6" fill="#111827" />
                              <text x="80" y="88" textAnchor="middle" fontSize="10" fill="#4b5563">0</text>
                            </svg>
                            <div className="text-xs text-gray-600 w-20">Absorption</div>
                          </div>
                          <div className="text-sm text-gray-700">
                            {waterReport.netTransepithelial.direction} ({waterReport.netTransepithelial.strength}); {formatWaterValue(waterReport.netTransepithelial.value)} water tendency units
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="mb-3">
                  <h3 className="font-semibold mb-2">Intracellular Imbalance Tendencies</h3>
                  <AccessibleTable
                    caption="Intracellular accumulation or depletion tendencies compared with the starting cell composition."
                    columns={[
                      { key: 'label', label: 'Ion or solute' },
                      { key: 'direction', label: 'Tendency' },
                      { key: 'change', label: 'Modeled change', format: formatTableValue }
                    ]}
                    rows={cellImbalanceRows}
                  />
                </div>
                <h3 className="font-semibold mb-2">Charge &amp; Polarity</h3>
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
                <h3 className="font-semibold mb-2 mt-4">Electrochemical Context</h3>
                <AccessibleTable
                  caption="Display-only electrochemical context. Electrical tendencies are inferred from modeled polarity; no Nernst potential, membrane voltage, or electrochemical feedback is calculated."
                  columns={[
                    { key: 'pathway', label: 'Pathway' },
                    { key: 'membrane', label: 'Membrane or path' },
                    { key: 'ion', label: 'Ion' },
                    { key: 'chemical', label: 'Chemical gradient favors' },
                    { key: 'electrical', label: 'Electrical tendency favors' },
                    { key: 'interpretation', label: 'Combined interpretation' }
                  ]}
                  rows={electrochemicalTableRows}
                />
              </div>
            )}

            {acidBaseReport && (
              <div>
                <h3 className="font-semibold mb-2">Acid/Base &amp; pH Tendencies</h3>
                {resultsView === 'graphs' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div className="border rounded p-3">
                      <div className="font-semibold">Apical surface</div>
                      <div>{acidBaseReport.apicalSurface}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">Cell</div>
                      <div>{acidBaseReport.cell}</div>
                      <div className="text-gray-500">starting pH {Number(acidBaseReport.startingCellPH).toFixed(2)}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">Basolateral surface</div>
                      <div>{acidBaseReport.basolateralSurface}</div>
                    </div>
                  </div>
                )}
                {resultsView === 'tables' && (
                  <AccessibleTable
                    caption="Acid/base tendencies. H+ concentration is not graphed with bulk solutes and buffered pH is not recalculated."
                    columns={[
                      { key: 'region', label: 'Region' },
                      { key: 'tendency', label: 'pH or acid/base tendency' },
                      { key: 'note', label: 'Note' }
                    ]}
                    rows={[
                      { region: 'Net epithelium', tendency: acidBaseReport.transepithelial.direction, note: acidBaseReport.transepithelial.strength + '; ' + formatChargeValue(acidBaseReport.transepithelial.value) + ' acid/base units' },
                      { region: 'Apical surface', tendency: acidBaseReport.apicalSurface, note: 'Based on local H+ flux tendency' },
                      { region: 'Cell', tendency: acidBaseReport.cell, note: 'Starting pH ' + Number(acidBaseReport.startingCellPH).toFixed(2) },
                      { region: 'Basolateral surface', tendency: acidBaseReport.basolateralSurface, note: 'Based on local H+ flux tendency' }
                    ]}
                  />
                )}
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
