import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
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

const WATER_EPSILON = 0.05;
const WATER_SOLUTE_FLUX_LIMIT = 5;
const WATER_DRIVE_SCALE = 0.5;
const CHARGE_EPSILON = 0.05;
const PARACELLULAR_TEP_DRIVE_MAX = 2;
const PARACELLULAR_TEP_SENSITIVITY = 1.5;
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

function tendencyStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < WATER_EPSILON) return 'none';
  if (magnitude < 5) return 'weak';
  if (magnitude < 15) return 'moderate';
  return 'strong';
}

function waterTendencyStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < WATER_EPSILON) return 'none';
  if (magnitude < 0.75) return 'weak';
  if (magnitude < 1.75) return 'moderate';
  return 'strong';
}

function epithelialWaterDirection(value) {
  if (Math.abs(value) < WATER_EPSILON) return 'neutral/weak';
  return value > 0 ? 'toward blood' : 'toward lumen';
}

function soluteLinkedWaterDrive(transepiFluxDataNoH2O) {
  const sourceFlux = transepiFluxDataNoH2O.reduce(
    (sum, row) => sum + Number(row.transepithelial || 0),
    0
  );
  const value = Math.abs(sourceFlux) < WATER_EPSILON
    ? 0
    : WATER_DRIVE_SCALE * Math.sign(sourceFlux) * Math.min(Math.abs(sourceFlux), WATER_SOLUTE_FLUX_LIMIT);
  return { sourceFlux, value };
}

function transepithelialWaterTendency(value, hasPathway, pathwayLabel, noPathwayDirection = 'no complete pathway') {
  if (!hasPathway) {
    return {
      label: pathwayLabel,
      direction: noPathwayDirection,
      strength: 'none',
      value: 0
    };
  }
  if (Math.abs(value) < WATER_EPSILON) {
    return {
      label: pathwayLabel,
      direction: 'neutral/weak',
      strength: 'none',
      value
    };
  }
  return {
    label: pathwayLabel,
    direction: epithelialWaterDirection(value),
    strength: waterTendencyStrength(value),
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

function paracellularElectrochemicalDrive(ion, apicalConcentration, basolateralConcentration, transepithelialElectricalTendency) {
  const chemicalDrive = Number(apicalConcentration ?? 0) - Number(basolateralConcentration ?? 0);
  const electricalTendency = Number(transepithelialElectricalTendency || 0);
  const valence = ION_VALENCE[ion] || 0;
  if (valence === 0 || Math.abs(electricalTendency) < CHARGE_EPSILON) return chemicalDrive;
  const boundedTep = Math.tanh(electricalTendency / PARACELLULAR_TEP_SENSITIVITY);
  const electricalDrive = -valence * boundedTep * PARACELLULAR_TEP_DRIVE_MAX;
  return chemicalDrive + electricalDrive;
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
      label: 'Transepithelial Potential',
      direction: epithelialPolarityDirection(transepithelialCharge),
      strength: chargeStrength(transepithelialCharge),
      value: transepithelialCharge
    }
  };
}

function aqpDensityForPlacement(tList, placement) {
  return tList
    .filter(t => t.id === 'AQP' && t.placement === placement)
    .reduce((sum, t) => sum + Math.max(Number(t.density) || 0, 0), 0);
}

function serialAqpDensityScale(apicalDensity, basolateralDensity) {
  if (apicalDensity <= 0 || basolateralDensity <= 0) return 0;
  return (2 * apicalDensity * basolateralDensity) / (apicalDensity + basolateralDensity);
}

function buildWaterReport(tList, paracellularType, transepiFluxDataNoH2O, backgroundOsmoticPull) {
  const apicalAqpDensity = aqpDensityForPlacement(tList, 'apical');
  const basolateralAqpDensity = aqpDensityForPlacement(tList, 'basolateral');
  const aqpDensityScale = serialAqpDensityScale(apicalAqpDensity, basolateralAqpDensity);
  const apicalWaterPath = apicalAqpDensity > 0;
  const basolateralWaterPath = basolateralAqpDensity > 0;
  const hasTranscellularPath = apicalWaterPath && basolateralWaterPath;
  const hasParacellularPath = paracellularType === 'cation';
  const transcellularPathStatus = hasTranscellularPath
    ? 'complete AQP path; AQP density scale ' + aqpDensityScale.toFixed(2)
    : apicalWaterPath || basolateralWaterPath
      ? 'incomplete AQP path'
      : 'none';
  const paracellularPathStatus = hasParacellularPath ? 'present' : 'none';
  const soluteDrive = soluteLinkedWaterDrive(transepiFluxDataNoH2O);
  const backgroundValue = Number(backgroundOsmoticPull?.value || 0);
  const osmoticPullValue = soluteDrive.value + backgroundValue;
  const expressedPathwayCount = (hasTranscellularPath ? 1 : 0) + (hasParacellularPath ? 1 : 0);
  const pathwayShare = expressedPathwayCount > 0 ? 1 / expressedPathwayCount : 0;
  const transcellularValue = hasTranscellularPath ? osmoticPullValue * pathwayShare * aqpDensityScale : 0;
  const paracellularValue = hasParacellularPath ? osmoticPullValue * pathwayShare : 0;
  const netTransepithelialValue = transcellularValue + paracellularValue;

  return {
    teachingNote: 'Osmotic pull plus water pathway availability produces water movement.',
    osmoticPull: {
      label: 'Osmotic pull',
      direction: epithelialWaterDirection(osmoticPullValue),
      strength: waterTendencyStrength(osmoticPullValue),
      value: osmoticPullValue,
      soluteValue: soluteDrive.value,
      backgroundValue,
      sourceFlux: soluteDrive.sourceFlux
    },
    backgroundPull: {
      label: 'Background osmotic pull',
      status: backgroundOsmoticPull?.status || 'None',
      direction: epithelialWaterDirection(backgroundValue),
      strength: waterTendencyStrength(backgroundValue),
      value: backgroundValue,
      setting: backgroundOsmoticPull?.setting || 'none',
      effectiveLevel: backgroundOsmoticPull?.effectiveLevel || 'none',
      effectiveLabel: backgroundOsmoticPull?.effectiveLabel || 'None'
    },
    transcellularPath: {
      label: 'Transcellular water pathway',
      status: transcellularPathStatus,
      apicalDensity: apicalAqpDensity,
      basolateralDensity: basolateralAqpDensity,
      densityScale: aqpDensityScale,
      note: hasTranscellularPath
        ? 'AQP is present on both apical and basolateral membranes; apical density ' + apicalAqpDensity.toFixed(1) + ', basolateral density ' + basolateralAqpDensity.toFixed(1)
        : apicalWaterPath || basolateralWaterPath
          ? 'AQP is present on only one membrane'
          : 'No AQP water pathway is placed'
    },
    paracellularPath: {
      label: 'Paracellular water pathway',
      status: paracellularPathStatus,
      note: hasParacellularPath
        ? 'Cation + Water Pore provides a paracellular water pathway'
        : 'Barrier and Anion Pore do not provide a water pathway'
    },
    transcellular: transepithelialWaterTendency(transcellularValue, hasTranscellularPath, 'Transcellular water contribution', transcellularPathStatus),
    paracellular: transepithelialWaterTendency(paracellularValue, hasParacellularPath, 'Paracellular water contribution', 'no paracellular water pathway'),
    netTransepithelial: transepithelialWaterTendency(netTransepithelialValue, hasTranscellularPath || hasParacellularPath, 'Net epithelial water flux', 'no water pathway')
  };
}

const INITIAL_TRANSPORTERS = [
  { id: 'AQP',      name: 'AQP',        type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AE1',      name: 'AE1',        type: 'antiporter', stoich: { 'Cl-': 1, 'HCO3-': -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AAFacilitator', name: 'AA facilitator', type: 'carrier', stoich: { AA: -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PiFacilitator', name: 'Pi Facilitator', type: 'carrier', stoich: { Phosphate: -1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'CFTR',     name: 'CFTR',       type: 'channel',    stoich: { 'Cl-': -1, 'HCO3-': -0.5 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ClCKb',    name: 'ClC',        type: 'channel',    stoich: { 'Cl-': -1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ENaC',     name: 'ENaC',       type: 'channel',    stoich: { 'Na+': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'GLUT2',    name: 'GLUT2',      type: 'channel',    stoich: { 'Glucose': -1 },      kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'TRPV56',   name: 'TRPV5/6',    type: 'channel',    stoich: { 'Ca2+': 1 },          kinetics: { maxRate: 0.6, Km: 0.8 }, placement: 'none', density: 1 },
  { id: 'HATPase',  name: 'H⁺-ATPase',  type: 'pump',       stoich: { 'H+': -1 },           kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HKATPase', name: 'H⁺/K⁺-ATPase', type: 'pump', stoich: { 'H+': -1, 'K+': 1 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaPi2',    name: 'NaPi 2:1',   type: 'symporter',  stoich: { 'Na+': 2, 'Phosphate': 1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaPi',     name: 'NaPi 3:1',   type: 'symporter',  stoich: { 'Na+': 3, 'Phosphate': 1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
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
  { id: 'ROMK',     name: 'Kir',        type: 'channel',    stoich: { 'K+': -1 },           kinetics: { maxRate: 0.5, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'SGLT',     name: 'SGLT',       type: 'symporter',  stoich: { 'Na+': 1, 'Glucose': 1 }, kinetics: { maxRate: 0.8, Km: 1.5 }, placement: 'none', density: 1 }
];

const TRANSPORTER_GROUPS = [
  { label: 'Channels', ids: ['AQP', 'CFTR', 'ClCKb', 'ENaC', 'ROMK', 'TRPV56'] },
  { label: 'Cotransporters', ids: ['NaAA', 'NaPi2', 'NaPi', 'NBCe1', 'NCC', 'NKCC', 'PepT', 'SGLT'] },
  { label: 'Exchangers', ids: ['AE1', 'MATE', 'NCX1', 'NHE3', 'Pendrin'] },
  { label: 'Facilitators', ids: ['AAFacilitator', 'GLUT2', 'PiFacilitator'] },
  { label: 'Organic Solute Transporters', ids: ['OAT', 'OCT'] },
  { label: 'Pumps', ids: ['HATPase', 'HKATPase', 'NaKATPase', 'PMCA'] }
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
    transporterIds: ['AQP', 'SGLT', 'NaPi2', 'NaPi', 'PiFacilitator', 'NHE3', 'NBCe1', 'GLUT2', 'NaKATPase', 'PMCA', 'NCX1', 'NaAA', 'AAFacilitator', 'PepT', 'OAT', 'OCT', 'MATE']
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
  },
  {
    value: 'placenta-syncytiotrophoblast',
    label: 'Placenta / syncytiotrophoblast exchange',
    group: 'Reproductive system',
    orientation: 'placenta',
    transporterIds: ['AQP', 'GLUT2', 'NaKATPase', 'NaAA', 'AAFacilitator', 'TRPV56', 'PMCA', 'NCX1', 'CFTR', 'OAT', 'OCT', 'MATE']
  }
];

const TISSUE_OPTION_GROUPS = [
  'Kidney and urinary tract',
  'Gastrointestinal and hepatobiliary',
  'Exocrine, airway, and skin',
  'Central nervous system',
  'Reproductive system'
];

const DISPLAY_ORIENTATIONS = {
  epithelial: {
    apicalLabel: 'Apical / lumen side',
    basolateralLabel: 'Basolateral / blood side',
    positiveFluxLabel: 'toward blood',
    negativeFluxLabel: 'toward lumen',
    positiveProcessLabel: 'absorption',
    negativeProcessLabel: 'secretion',
    apicalMembraneLabel: 'Apical membrane',
    basolateralMembraneLabel: 'Basolateral membrane',
    apicalShortLabel: 'Apical',
    basolateralShortLabel: 'Basolateral',
    apicalPolarityLabel: 'Lumen',
    basolateralPolarityLabel: 'Blood'
  },
  placenta: {
    apicalLabel: 'Maternal side',
    basolateralLabel: 'Fetal side',
    positiveFluxLabel: 'toward fetus',
    negativeFluxLabel: 'toward mother',
    positiveProcessLabel: 'maternal-to-fetal transfer',
    negativeProcessLabel: 'fetal-to-maternal transfer',
    apicalMembraneLabel: 'Maternal-side membrane',
    basolateralMembraneLabel: 'Fetal-side membrane',
    apicalShortLabel: 'Maternal',
    basolateralShortLabel: 'Fetal',
    apicalPolarityLabel: 'Maternal',
    basolateralPolarityLabel: 'Fetal'
  }
};

function displayOrientationForTissue(tissueOption) {
  return DISPLAY_ORIENTATIONS[tissueOption?.orientation] || DISPLAY_ORIENTATIONS.epithelial;
}

const BACKGROUND_OSMOTIC_PULL_VALUES = {
  none: 0,
  low: 0.35,
  normal: 0.9,
  high: 1.8
};

const BACKGROUND_OSMOTIC_PULL_OPTIONS = [
  { value: 'tissue', label: 'Use tissue default' },
  { value: 'none', label: 'Equal / no background pull' },
  { value: 'low', label: 'Weak toward blood' },
  { value: 'normal', label: 'Moderate toward blood' },
  { value: 'high', label: 'Strong toward blood' }
];

function backgroundOsmoticPullLevelLabel(level) {
  const option = BACKGROUND_OSMOTIC_PULL_OPTIONS.find(candidate => candidate.value === level);
  return option?.label || 'None';
}

function backgroundOsmoticPullPhrase(level) {
  return backgroundOsmoticPullLevelLabel(level);
}

function tissueDefaultBackgroundOsmoticPullLevel(tissuePreset) {
  const tissue = TISSUE_OPTIONS.find(option => option.value === tissuePreset) || TISSUE_OPTIONS[0];
  const tissueText = (tissue.value + ' ' + tissue.label).toLowerCase();
  if (tissue.value === 'all') return 'none';
  if (tissueText.includes('descending limb') || tissueText.includes('thin descending')) return 'high';
  if (tissueText.includes('collecting duct principal')) return 'normal';
  if (tissueText.includes('collecting duct') && !tissueText.includes('intercalated')) return 'normal';
  if (tissueText.includes('thick ascending limb')) return 'normal';
  return 'none';
}

function resolveBackgroundOsmoticPull(tissuePreset, setting) {
  const requestedLevel = setting || 'tissue';
  const tissueDefaultLevel = tissueDefaultBackgroundOsmoticPullLevel(tissuePreset);
  const effectiveLevel = requestedLevel === 'tissue' ? tissueDefaultLevel : requestedLevel;
  const value = BACKGROUND_OSMOTIC_PULL_VALUES[effectiveLevel] ?? 0;
  const status = requestedLevel === 'tissue'
    ? 'Tissue default, ' + backgroundOsmoticPullPhrase(effectiveLevel)
    : backgroundOsmoticPullPhrase(effectiveLevel);
  return {
    setting: requestedLevel,
    settingLabel: backgroundOsmoticPullLevelLabel(requestedLevel),
    tissueDefaultLevel,
    effectiveLevel,
    effectiveLabel: backgroundOsmoticPullPhrase(effectiveLevel),
    status,
    value
  };
}

const DENSITY_OPTIONS = [
  { label: 'Low', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'High', value: 2 }
];

const TRANSPORTER_DESCRIPTIONS = {
  AE1: 'Anion exchanger 1: exchanges Cl- and HCO3- in opposite directions.',
  AAFacilitator: 'AA facilitator: generic facilitated neutral amino acid transporter.',
  PiFacilitator: 'Pi Facilitator: generic facilitated inorganic phosphate transporter.',
  AQP: 'Aquaporin water channel class: supports H2O movement when apical and basolateral AQP form a complete pathway. Combined apical/basolateral AQP density scales transcellular water flux. Includes AQP2, AQP3, AQP4.',
  CFTR: 'Cystic fibrosis transmembrane conductance regulator: passive Cl- and HCO3- flux.',
  ClCKb: 'ClC chloride channel class: passive Cl- flux. Includes ClC-K.',
  ENaC: 'Epithelial Na+ channel: passive Na+ flux.',
  GLUT2: 'Glucose transporter 2: passive glucose flux follows the glucose gradient.',
  TRPV56: 'TRPV5/6 Ca2+ channel class: passive Ca2+ flux. SALT does not model dynamic inhibition by intracellular Ca2+.',
  HATPase: 'Proton-ATPase: pumps H+ out using ATP.',
  HKATPase: 'Proton-potassium ATPase: exchanges one H+ out for one K+ in using ATP.',
  NaPi2: 'NaPi 2:1: sodium-phosphate cotransporter; moves 2 Na+ with 1 Pi. Electroneutral; represents NaPi-IIc.',
  NaPi: 'NaPi 3:1: sodium-phosphate cotransporter; moves 3 Na+ with 1 Pi. Electrogenic; represents NaPi-IIa/IIb.',
  NaAA: 'Na+-AA cotransporter: generic Na+-coupled neutral amino acid transporter.',
  NBCe1: 'Electrogenic sodium bicarbonate cotransporter: moves Na+ and HCO3- together.',
  NCC: 'Sodium-chloride cotransporter: moves Na+ and Cl- together.',
  NCX1: 'Sodium-calcium exchanger: exchanges Na+ and Ca2+ in opposite directions.',
  NHE3: 'Sodium-hydrogen exchanger: exchanges Na+ and H+ in opposite directions.',
  NKCC: 'Na-K-Cl contransporter class: moves Na+, K+, and Cl- together. Includes NKCC1 and NKCC2.',
  NaKATPase: 'Sodium-potassium pump: establishes steady-state Na+ and K+ gradients.',
  OAT: 'Organic anion transporter class: simplified OA- flux for secretion pathways.',
  OCT: 'Organic cation transporter class: facilitated OC+ flux.',
  PMCA: 'Plasma membrane calcium ATPase: pumps Ca2+ out using ATP.',
  MATE: 'Multidrug and toxin extrusion transporter class: H+/OC+ exchange.',
  PepT: 'PepT peptide transporter class: moves H+ and small peptides together. Includes PepT1 and PepT2.',
  Pendrin: 'Pendrin: exchanges Cl- and HCO3- in opposite directions.',
  ROMK: 'Kir potassium channel class: passive K+ flux. Includes ROMK.',
  SGLT: 'Sodium-glucose-linked transporter class: moves Na+ and glucose together. Includes SGLT1 and SGLT2.'
};

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001, Phosphate:1.0, 'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 }
};

const CONCENTRATION_EDIT_IONS = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Phosphate', 'Glucose'];
const CONCENTRATION_EDIT_COMPARTMENTS = ['apicalECF', 'basolateralECF'];
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
  GLUT2: 'Glucose'
};
const NAPI_TRANSPORTER_IDS = ['NaPi2', 'NaPi'];
const SELECTED_ELECTROCHEMICAL_CHANNELS = {
  ENaC: ['Na+'],
  ROMK: ['K+'],
  CFTR: ['Cl-', 'HCO3-'],
  ClCKb: ['Cl-'],
  TRPV56: ['Ca2+']
};
const SELECTED_COUPLED_ELECTROCHEMICAL_RULES = {
  SGLT: { support: 0.08, oppose: 0.04 },
  NaPi: { support: 0.08, oppose: 0.04 },
  NCX1: { support: 0.08, oppose: 0.04 }
};
const ACTIVE_CELL_CONCENTRATION_GAIN = {
  Glucose: 20
};
const FLUX_GROUPS = [
  { key: 'ions', label: 'Inorganic Ion Fluxes', solutes: ['Na+', 'K+', 'Cl-', 'H+', 'HCO3-', 'Ca2+', 'Phosphate'] },
  { key: 'nutrients', label: 'Nutrient Fluxes', solutes: ['Glucose', 'AA', 'Peptide'] },
  { key: 'organic', label: 'Organic Ion Fluxes', solutes: ['OA-', 'OC+'] }
];
const FLUX_BAR_SERIES = [
  { key: 'apicalStep', name: 'Apical membrane', color: '#2563eb' },
  { key: 'basolateralStep', name: 'Basolateral membrane', color: '#059669' },
  { key: 'paracellularStep', name: 'Paracellular', color: '#d97706' },
  { key: 'transepithelial', name: 'Net epithelial', color: '#fb7185' }
];
const DIRECTIONAL_FLUX_GRAPH_EPSILON = 0.001;
const SNAPSHOT_TEP_INDICATOR_MAX = 0.75;
const SNAPSHOT_ACID_BASE_INDICATOR_MAX = 1;
const SNAPSHOT_WATER_INDICATOR_MAX = 1.5;
const CONCENTRATION_COMPARTMENTS = [
  { key: 'apicalBulk', label: 'Apical Bulk ECF', name: 'Apical Bulk ECF', color: '#2dd4bf' },
  { key: 'apicalSurface', label: 'Apical Surface ECF', name: 'Apical Surface ECF', color: '#0f766e' },
  { key: 'icf', label: 'Cell', name: 'ICF', color: '#8b5cf6', fillOpacity: 0.75 },
  { key: 'basolateralSurface', label: 'Basolateral Surface ECF', name: 'Basolateral Surface ECF', color: '#ea580c' },
  { key: 'basolateralBulk', label: 'Basolateral Bulk ECF', name: 'Basolateral Bulk ECF', color: '#fb923c' }
];
const SETTINGS_CONCENTRATION_COMPARTMENTS = [
  { key: 'apicalECF', label: 'Apical bath', editable: true },
  { key: 'icf', label: 'Cell, modeled', editable: false },
  { key: 'basolateralECF', label: 'Basolateral bath', editable: true }
];
const PASSIVE_CONDUCTANCE_SCALE = {
  GLUT2: 4
};
const IMPLICIT_VM_DRIVE = {
  'Na+': 0.35,
  'K+': 0.35,
  'Ca2+': 0.75,
  'Cl-': -0.4,
  'HCO3-': -0.35
};
const ANION_LOADING_DRIVE_SCALE = 0.75;
const ANION_LOADING_SENSITIVITY = 0.25;
const ECF_CONCENTRATION_LIMITS = {
  'Na+': { min: 120, max: 160, warnLowMax: 130, warnHighMin: 150 },
  'K+': { min: 2, max: 8, warnLowMax: 3, warnHighMin: 6 },
  'Cl-': { min: 80, max: 130, warnLowMax: 95, warnHighMin: 115 },
  'HCO3-': { min: 10, max: 40, warnLowMax: 18, warnHighMin: 32 },
  'Ca2+': { min: 0.5, max: 2.5, warnLowMax: 0.8, warnHighMin: 1.8 },
  Phosphate: { min: 0.3, max: 3.0, warnLowMax: 0.6, warnHighMin: 2.0 },
  Glucose: { min: 0, max: 20, warnLowMax: 2, warnHighMin: 12 }
};
const ECF_HARD_BLOCK_MESSAGE = 'This value is outside SALT’s allowed range for introductory epithelial transport modeling.';
const ECF_WARNING_MESSAGE = 'This concentration is outside the usual teaching range and may produce nonphysiological flux behavior.';
const ELECTROCHEMICAL_MEMBRANE_PATHWAYS = {
  CFTR: ['Cl-', 'HCO3-'],
  ClCKb: ['Cl-'],
  ENaC: ['Na+'],
  ROMK: ['K+'],
  TRPV56: ['Ca2+']
};
const SUPPORT_PUMP_ID = 'NaKATPase';
const PUMP_K_LOADING_PER_NA_SUPPORT = 2 / 3;
const PUMP_NA_EXTRUSION_PER_K_SUPPORT = 3 / 2;
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

function transporterFluxCapacity(transporter) {
  return (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * (Number(transporter.density) || 0);
}

function naKATPaseSupportProfile(tList) {
  const pumps = tList.filter(t => t.id === SUPPORT_PUMP_ID && t.placement !== 'none');
  const template = INITIAL_TRANSPORTERS.find(t => t.id === SUPPORT_PUMP_ID);
  const normalCapacity = template ? transporterFluxCapacity(template) : 1;
  const supportCapacity = pumps.reduce((sum, pump) => sum + transporterFluxCapacity(pump), 0);

  return {
    present: pumps.length > 0,
    gradientStrength: pumps.length > 0 ? 1 : 0,
    naExtrusionCapacity: supportCapacity,
    kLoadingCapacity: supportCapacity,
    normalCapacity
  };
}

function averageEditableReservoirConcentration(baseConcentrations, ion) {
  const apical = Number(baseConcentrations.apicalECF?.[ion]);
  const basolateral = Number(baseConcentrations.basolateralECF?.[ion]);
  if (Number.isFinite(apical) && Number.isFinite(basolateral)) return (apical + basolateral) / 2;
  if (Number.isFinite(apical)) return apical;
  if (Number.isFinite(basolateral)) return basolateral;
  return Number(INITIAL_CONCENTRATIONS.apicalECF[ion] ?? 0);
}

function deriveEffectiveStartingIcf(baseConcentrations, tList) {
  const effectiveIcf = { ...baseConcentrations.icf };
  const supportProfile = naKATPaseSupportProfile(tList);

  ['Na+', 'K+'].forEach(ion => {
    if (supportProfile.present) {
      effectiveIcf[ion] = Number(baseConcentrations.icf?.[ion] ?? INITIAL_CONCENTRATIONS.icf[ion] ?? effectiveIcf[ion]);
    } else {
      effectiveIcf[ion] = averageEditableReservoirConcentration(baseConcentrations, ion);
    }
  });

  return effectiveIcf;
}

function naKATPaseSupportLabel(profile) {
  if (!profile.present) return 'none';
  if (profile.naExtrusionCapacity < profile.normalCapacity - 0.001) return 'low capacity';
  if (profile.naExtrusionCapacity > profile.normalCapacity + 0.001) return 'high capacity';
  return 'normal capacity';
}

function apicalNaEntryCapacity(apicalFlux) {
  return Math.max(apicalFlux['Na+'] || 0, 0);
}

function apicalKExitCapacity(apicalFlux) {
  return Math.max(-(apicalFlux['K+'] || 0), 0);
}

function pumpSupportedNaCompletion(apicalFlux, supportProfile) {
  if (!supportProfile.present) return 0;
  return Math.min(apicalNaEntryCapacity(apicalFlux), supportProfile.naExtrusionCapacity);
}

function pumpSupportedKCompletion(apicalFlux, supportProfile) {
  if (!supportProfile.present) return 0;
  return Math.min(apicalKExitCapacity(apicalFlux), supportProfile.kLoadingCapacity);
}

function pumpKLoadingForNaSupport(supportedNaAbsorption) {
  return supportedNaAbsorption * PUMP_K_LOADING_PER_NA_SUPPORT;
}

function pumpNaExtrusionForKSupport(supportedKSecretion) {
  return supportedKSecretion * PUMP_NA_EXTRUSION_PER_K_SUPPORT;
}

function surfaceClamp(value, bulkValue) {
  const upper = Math.max((bulkValue || 1) * SURFACE_MAX_MULTIPLIER, 1);
  return Math.min(Math.max(value, 0), upper);
}

function clampToUnit(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function normalizedConcentrationTendency(outsideConcentration, cellConcentration) {
  const outside = Math.max(Number(outsideConcentration) || 0, 0);
  const cell = Math.max(Number(cellConcentration) || 0, 0);
  const denominator = outside + cell + 1;
  return clampToUnit((outside - cell) / denominator);
}

function implicitVmDriveForIon(ion, hasNormalImplicitVm, chemicalSignal, activeLoadingFlux = 0) {
  if (!hasNormalImplicitVm) return 0;
  const baseDrive = IMPLICIT_VM_DRIVE[ion] || 0;
  const valence = ION_VALENCE[ion] || 0;
  if (valence >= 0) return baseDrive;
  const loadingSignal = Math.tanh(Math.max(Number(activeLoadingFlux) || 0, 0) / ANION_LOADING_SENSITIVITY);
  const availabilityFactor = chemicalSignal < 0
    ? 1
    : Math.min(1, 0.3 + loadingSignal * 0.7);
  return baseDrive * availabilityFactor;
}

function anionLoadingDrive(ion, activeLoadingFlux = 0) {
  if ((ION_VALENCE[ion] || 0) >= 0) return 0;
  const loadingSignal = Math.tanh(Math.max(Number(activeLoadingFlux) || 0, 0) / ANION_LOADING_SENSITIVITY);
  return -ANION_LOADING_DRIVE_SCALE * loadingSignal;
}

function netStoichiometricCharge(stoich) {
  return Object.entries(stoich)
    .filter(([ion]) => ion !== 'H2O')
    .reduce((sum, [ion, coeff]) => sum + (ION_VALENCE[ion] || 0) * coeff, 0);
}

function qualitativeCoupledVmRateFactor(transporter, effectiveStoich, hasNormalImplicitVm) {
  const rule = SELECTED_COUPLED_ELECTROCHEMICAL_RULES[transporter.id];
  if (!rule || !hasNormalImplicitVm) return 1;
  const netCharge = netStoichiometricCharge(effectiveStoich);
  if (netCharge > 0) return 1 + rule.support;
  if (netCharge < 0) return Math.max(0.85, 1 - rule.oppose);
  return 1;
}

function hasOppositePlacedTransporter(tList, id, placement) {
  return tList.some(t => t.id === id && t.placement !== 'none' && t.placement !== placement);
}

function hasElevatedModeledCalcium(baseline) {
  const modeled = Number(baseline?.icf?.['Ca2+'] ?? 0);
  const initial = Number(INITIAL_CONCENTRATIONS.icf['Ca2+'] ?? 0);
  return modeled > initial + 0.001;
}

function coupledTransporterRateFactor(transporter, effectiveStoich, hasNormalImplicitVm, tList, baseline) {
  if (transporter.id === 'NCX1') {
    const hasCalciumLoadingContext =
      hasOppositePlacedTransporter(tList, 'TRPV56', transporter.placement) ||
      hasElevatedModeledCalcium(baseline);
    if (!hasCalciumLoadingContext) return 0;
  }
  return qualitativeCoupledVmRateFactor(transporter, effectiveStoich, hasNormalImplicitVm);
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

function electrochemicalChannelFlux(transporter, ion, outsideConcentration, cellConcentration, hasNormalImplicitVm, activeLoadingFlux = 0) {
  const conductanceScale = PASSIVE_CONDUCTANCE_SCALE[transporter.id] || 1;
  const stoichScale = Math.abs(transporter.stoich[ion] ?? 1);
  const maxFlux = (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * transporter.density * conductanceScale * stoichScale;
  const chemicalSignal = normalizedConcentrationTendency(outsideConcentration, cellConcentration);
  const electricalSignal = implicitVmDriveForIon(ion, hasNormalImplicitVm, chemicalSignal, activeLoadingFlux);
  const loadingSignal = anionLoadingDrive(ion, activeLoadingFlux);
  return maxFlux * clampToUnit(chemicalSignal + electricalSignal + loadingSignal);
}

function concentrationValidationMessage(ion, value) {
  const limits = ECF_CONCENTRATION_LIMITS[ion];
  if (!limits) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { level: 'error', message: ECF_HARD_BLOCK_MESSAGE };
  if (numeric < limits.min || numeric > limits.max) {
    return { level: 'error', message: ECF_HARD_BLOCK_MESSAGE };
  }
  if (
    (numeric >= limits.min && numeric <= limits.warnLowMax) ||
    (numeric >= limits.warnHighMin && numeric <= limits.max)
  ) {
    return { level: 'warning', message: ECF_WARNING_MESSAGE };
  }
  return null;
}

function clampEditableConcentration(ion, value) {
  const limits = ECF_CONCENTRATION_LIMITS[ion];
  const numeric = Math.max(Number(value) || 0, 0);
  if (!limits) return numeric;
  return Math.min(Math.max(numeric, limits.min), limits.max);
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

function buildMatchedDisplayFluxes(baseDisplayApicalFlux, baseDisplayBasolateralFlux, transepiFluxDataNoH2O, paraFlux = {}) {
  const displayApicalFlux = { ...baseDisplayApicalFlux };
  const displayBasolateralFlux = { ...baseDisplayBasolateralFlux };

  transepiFluxDataNoH2O.forEach(row => {
    const ion = row.ion;
    if (ion === 'H2O') return;
    const transcellularFlux = Number(row.transepithelial || 0) - Number(paraFlux[ion] || 0);
    if (Math.abs(transcellularFlux) < DIRECTIONAL_FLUX_GRAPH_EPSILON) return;

    displayApicalFlux[ion] = transcellularFlux;
    displayBasolateralFlux[ion] = -transcellularFlux;
  });

  return { displayApicalFlux, displayBasolateralFlux };
}

function niceConcentrationAxisMax(value) {
  const raw = Math.max(Number(value || 0) * 1.15, 0.01);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / magnitude;
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const step = steps.find(candidate => scaled <= candidate) || 10;
  return step * magnitude;
}

function formatConcentrationAxisTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const magnitude = Math.abs(numeric);
  if (magnitude >= 100) return String(Math.round(numeric));
  if (magnitude >= 10) return String(Number(numeric.toFixed(1)));
  if (magnitude >= 1) return String(Number(numeric.toFixed(2)));
  return String(Number(numeric.toFixed(4)));
}

function concentrationZoomTickLines(value) {
  const label = String(value || '');
  const match = label.match(/^(Apical|Basolateral)\s+(.+)$/);
  return match ? [match[1], match[2]] : [label];
}

function ConcentrationZoomAxisTick({ x = 0, y = 0, payload }) {
  const lines = concentrationZoomTickLines(payload?.value);
  const firstLineDy = lines.length > 1 ? 8 : 14;

  return (
    <g transform={'translate(' + x + ',' + y + ')'}>
      <text textAnchor="middle" fill="#374151" fontSize={11}>
        {lines.map((line, index) => (
          <tspan key={line + index} x={0} dy={index === 0 ? firstLineDy : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export default function App() {
  // State
  const [showAbout, setShowAbout] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [modalTransporterId, setModalTransporterId] = useState(null);
  const [transporters, setTransporters] = useState([]);
  const [result, setResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resultsView, setResultsView] = useState('graphs');
  const [zoomedConcentrationIon, setZoomedConcentrationIon] = useState(null);
  const [baseConcentrations, setBaseConcentrations] = useState(() => cloneConcentrations(INITIAL_CONCENTRATIONS));
  const [concentrationValidation, setConcentrationValidation] = useState({});
  const [tissuePreset, setTissuePreset] = useState('all');
  const [backgroundOsmoticPullSetting, setBackgroundOsmoticPullSetting] = useState('tissue');

  // Paracellular pathway state
  const [paracellularType, setParacellularType] = useState('none'); // 'none' | 'cation' | 'anion'
  const [paraCationPerm, setParaCationPerm] = useState(1.0); // default value
  const [paraAnionPerm, setParaAnionPerm] = useState(1.0);   // default value
  const [showParaInfo, setShowParaInfo] = useState(false);
  const [activeTransporterTooltip, setActiveTransporterTooltip] = useState(null);
  const tooltipHideTimerRef = useRef(null);

  // --- Automatically run simulation on page load ---
  useEffect(() => {
  calculateFluxesAndConcs(transporters);
  // eslint-disable-next-line
}, [
  transporters,
  paracellularType,
  paraCationPerm,
  paraAnionPerm,
  baseConcentrations,
  tissuePreset,
  backgroundOsmoticPullSetting
]);


  useEffect(() => {
    setTransporters(ts =>
      ts.some(t => !t.uid)
        ? ts.map(t => t.uid ? t : { ...t, uid: t.id + '-' + t.placement + '-' + Math.random().toString(36).slice(2) })
        : ts
    );
  }, []);

  useEffect(() => {
    const handleTooltipEscape = event => {
      if (event.key === 'Escape') setActiveTransporterTooltip(null);
    };
    document.addEventListener('keydown', handleTooltipEscape);
    return () => {
      document.removeEventListener('keydown', handleTooltipEscape);
      if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    };
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
    if (!CONCENTRATION_EDIT_COMPARTMENTS.includes(compartment)) return;
    const requestedNumeric = Math.max(Number(value) || 0, 0);
    const numeric = clampEditableConcentration(ion, value);
    const validation = concentrationValidationMessage(ion, requestedNumeric) || concentrationValidationMessage(ion, numeric);
    const validationKey = compartment + '-' + ion;
    setConcentrationValidation(current => {
      const next = { ...current };
      if (validation) next[validationKey] = validation;
      else delete next[validationKey];
      return next;
    });
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
    setConcentrationValidation({});
  };

  const resetAllSettings = () => {
    setTransporters([]);
    setParacellularType('none');
    setParaCationPerm(1.0);
    setParaAnionPerm(1.0);
    setBaseConcentrations(cloneConcentrations(INITIAL_CONCENTRATIONS));
    setConcentrationValidation({});
    setTissuePreset('all');
    setBackgroundOsmoticPullSetting('tissue');
    setResultsView('graphs');
    setZoomedConcentrationIon(null);
    setShowInfoModal(false);
    setModalTransporterId(null);
    setShowParaInfo(false);
    setActiveTransporterTooltip(null);
    setShowResetConfirm(false);
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

function limitFluxMagnitude(flux, maxMagnitude) {
  const magnitude = Math.max(Number(maxMagnitude) || 0, 0);
  if (magnitude <= 0) return 0;
  return Math.sign(flux) * Math.min(Math.abs(flux), magnitude);
}

function naPiNaPerPhosphateForFlux(coupledEvents, phosphateFlux) {
  const direction = Math.sign(phosphateFlux);
  if (direction === 0) return 0;

  const candidates = coupledEvents.filter(event =>
    NAPI_TRANSPORTER_IDS.includes(event.id) &&
    Math.sign(transepithelialDirectionForMembraneFlux(event.placement, event.stoich.Phosphate || 0)) === direction
  );
  const totalPhosphateCapacity = candidates.reduce(
    (sum, event) => sum + Math.abs((event.rate || 0) * (event.stoich.Phosphate || 0)),
    0
  );
  if (totalPhosphateCapacity < DIRECTIONAL_FLUX_GRAPH_EPSILON) return 0;

  return candidates.reduce((sum, event) => {
    const phosphateCapacity = Math.abs((event.rate || 0) * (event.stoich.Phosphate || 0));
    return sum + phosphateCapacity * Math.abs(event.stoich['Na+'] || 0);
  }, 0) / totalPhosphateCapacity;
}

function naPiPhosphateFluxWithNaSupport(rawPhosphateFlux, coupledEvents, supportedNaAbsorption) {
  const naPerPhosphate = naPiNaPerPhosphateForFlux(coupledEvents, rawPhosphateFlux);
  if (!naPerPhosphate) return rawPhosphateFlux;
  return limitFluxMagnitude(rawPhosphateFlux, Math.abs(supportedNaAbsorption || 0) / naPerPhosphate);
}

function activeStoichForPlacement(transporter) {
  if (transporter.id === 'OAT') {
    return { 'OA-': transporter.placement === 'apical' ? -1 : 1 };
  }
  return transporter.stoich;
}

const calculateFluxesAndConcs = (tList = transporters) => {
  // Bulk baths are fixed teaching reservoirs; local surface layers are computed below.
  const effectiveStartingIcf = deriveEffectiveStartingIcf(baseConcentrations, tList);
  const baseline = {
    ...baseConcentrations,
    icf: effectiveStartingIcf
  };
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

  const pumpSupportProfile = naKATPaseSupportProfile(tList);
  const hasNaKATPase = pumpSupportProfile.present;
  const passiveChannels = [];
  const coupledEvents = [];
  const fluxEvents = [];

  // Calculate active/coupled transport first, then passive channels respond to gradients.
  tList.forEach(t => {
    if (t.placement === 'none') return;
    const effectiveStoich = activeStoichForPlacement(t);
    if (Object.keys(effectiveStoich).includes('H2O')) return;
    if (PASSIVE_SOLUTE_CHANNELS[t.id] || SELECTED_ELECTROCHEMICAL_CHANNELS[t.id]) {
      passiveChannels.push(t);
      return;
    }
    if (t.id === SUPPORT_PUMP_ID) return;
    if (effectiveStoich['Na+'] && !hasNaKATPase) return;

    let rate = transporterFluxCapacity(t) *
      coupledTransporterRateFactor(t, effectiveStoich, hasNaKATPase, tList, baseline);
    if (Math.abs(rate) < 0.001) return;
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

  const activeMembraneFlux = {};
  Object.keys(apicalFlux).forEach(ion => {
    activeMembraneFlux[ion] = apicalFlux[ion] + basolateralFlux[ion];
  });

  const activeNaSupportPreview = pumpSupportedNaCompletion(apicalFlux, pumpSupportProfile);
  const activeNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => {
    activeNetFlux[ion] = activeMembraneFlux[ion] || 0;
  });
  activeNetFlux['Na+'] = (activeNetFlux['Na+'] || 0) - activeNaSupportPreview;
  const prePassiveICF = { ...baseline.icf };
  Object.entries(activeNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { prePassiveICF[ion] += activeCellConcentrationDelta(ion, flux); });
  prePassiveICF['H+'] = Math.max(prePassiveICF['H+'], 1e-8);

  const passiveNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => { passiveNetFlux[ion] = 0; });
  passiveChannels.forEach(t => {
    const channelIons = SELECTED_ELECTROCHEMICAL_CHANNELS[t.id] || [PASSIVE_SOLUTE_CHANNELS[t.id]];
    const soluteEvents = channelIons.map(ion => {
      const outsideConcentration = t.placement === 'apical' ? apicalECF[ion] : basolateralECF[ion];
      const delta = SELECTED_ELECTROCHEMICAL_CHANNELS[t.id]
        ? electrochemicalChannelFlux(t, ion, outsideConcentration, prePassiveICF[ion], hasNaKATPase, activeMembraneFlux[ion] || 0)
        : concentrationGradientFlux(t, outsideConcentration, prePassiveICF[ion]);
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
      passiveNetFlux[ion] += delta;
      return { ion, coeff: Math.sign(delta), flux: delta };
    });
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: 'passive',
      solutes: soluteEvents
    });
  });

  // Na+/K+-ATPase support is hidden from membrane bars; it only limits completed Na+/K+ flux and cell balance.
  const supportedNaAbsorption = pumpSupportedNaCompletion(apicalFlux, pumpSupportProfile);
  const supportedKSecretion = pumpSupportedKCompletion(apicalFlux, pumpSupportProfile);
  const hiddenPumpCellFlux = {
    'Na+': -Math.max(supportedNaAbsorption, pumpNaExtrusionForKSupport(supportedKSecretion)),
    'K+': Math.max(pumpKLoadingForNaSupport(supportedNaAbsorption), supportedKSecretion)
  };

  const completionApicalFlux = { ...apicalFlux };
  const completionBasolateralFlux = { ...basolateralFlux };
  completionBasolateralFlux['Na+'] = (completionBasolateralFlux['Na+'] || 0) - supportedNaAbsorption;
  completionBasolateralFlux['K+'] = (completionBasolateralFlux['K+'] || 0) + supportedKSecretion;

  const netFlux = {};
  Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });

  const newICF = { ...baseline.icf };
  Object.entries(activeMembraneFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { newICF[ion] += activeCellConcentrationDelta(ion, flux); });
  Object.entries(passiveNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { newICF[ion] += flux; });
  Object.entries(hiddenPumpCellFlux)
    .forEach(([ion, flux]) => { newICF[ion] += flux; });
  newICF['H+'] = Math.max(newICF['H+'], 1e-8);
  const cellImbalanceReport = buildCellImbalanceReport(baseline.icf, newICF);
  const surfaceReport = buildSurfaceConcentrations(apicalECF, basolateralECF, apicalFlux, basolateralFlux);
  const apicalSurface = surfaceReport.apicalSurface;
  const basolateralSurface = surfaceReport.basolateralSurface;

  // --- Paracellular Pathway Fluxes ---
  const paraFlux = {};
  Object.keys(baseline.apicalECF).forEach(ion => { paraFlux[ion] = 0; });

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
  const rawPhosphateTransEpiFlux = transepithelialFlux('Phosphate', NAPI_TRANSPORTER_IDS, ['PiFacilitator'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const phosphateTransEpiFlux = naPiPhosphateFluxWithNaSupport(rawPhosphateTransEpiFlux, coupledEvents, supportedNaAbsorption);
  const naTransEpiFlux = supportedNaAbsorption;
  const clTransEpiFlux = transepithelialFlux('Cl-', ['NKCC','NCC','ClCKb','AE1','Pendrin'], ['NKCC','NCC','ClCKb','AE1','Pendrin','CFTR'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const caTransEpiFlux = transepithelialFlux('Ca2+', ['TRPV56'], ['PMCA','NCX1'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);

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
    kTransEpiFlux = supportedKSecretion > 0
      ? -supportedKSecretion
      : transepithelialFlux('K+', ['NKCC','ROMK'], ['ROMK','NaKATPase'], true, completionApicalFlux, completionBasolateralFlux, tList, hasNaKATPase);
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

  const paracellularElectricalTendency = transepithelialChargeSum(transepiFluxDataNoH2O);
  if (paracellularType === 'cation') {
    ['Na+','K+'].forEach(ion => {
      const cap = apicalSurface[ion];
      const blp = basolateralSurface[ion];
      paraFlux[ion] = paraCationPerm * paracellularElectrochemicalDrive(ion, cap, blp, paracellularElectricalTendency);
    });
  }
  if (paracellularType === 'anion') {
    ['Cl-','HCO3-'].forEach(ion => {
      const cap = apicalSurface[ion];
      const blp = basolateralSurface[ion];
      paraFlux[ion] = paraAnionPerm * paracellularElectrochemicalDrive(ion, cap, blp, paracellularElectricalTendency);
    });
  }
  Object.keys(netFlux).forEach(ion => { netFlux[ion] += paraFlux[ion] || 0; });

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

  const matchedDisplayFluxes = buildMatchedDisplayFluxes(
    completionApicalFlux,
    completionBasolateralFlux,
    transepiFluxDataNoH2O,
    paraFlux
  );

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
  const effectiveBackgroundOsmoticPull = resolveBackgroundOsmoticPull(tissuePreset, backgroundOsmoticPullSetting);

  const waterReport = buildWaterReport(
    tList,
    paracellularType,
    transepiFluxDataNoH2O,
    effectiveBackgroundOsmoticPull
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
    displayApicalFlux: matchedDisplayFluxes.displayApicalFlux,
    displayBasolateralFlux: matchedDisplayFluxes.displayBasolateralFlux,
    fluxEvents,
    transepiFluxData,
    waterReport,
    chargeReport,
    coupledMismatchReport,
    cellImbalanceReport,
    acidBaseReport,
    paracellularElectricalTendency,
    gradientSupportReport: {
      present: pumpSupportProfile.present,
      strength: pumpSupportProfile.gradientStrength,
      capacity: pumpSupportProfile.naExtrusionCapacity,
      normalCapacity: pumpSupportProfile.normalCapacity,
      label: naKATPaseSupportLabel(pumpSupportProfile)
    }
  });
};


  // --- Derived Data for Display ---
  const acidBaseReport = result?.acidBaseReport;
  const settingsConcentrations = {
    ...baseConcentrations,
    icf: deriveEffectiveStartingIcf(baseConcentrations, transporters)
  };
  const tissueOption = TISSUE_OPTIONS.find(option => option.value === tissuePreset) || TISSUE_OPTIONS[0];
  const displayOrientation = displayOrientationForTissue(tissueOption);
  const allTissueOption = TISSUE_OPTIONS[0];
  const groupedTissueOptions = TISSUE_OPTION_GROUPS.map(group => ({
    group,
    options: TISSUE_OPTIONS.filter(option => option.group === group)
  })).filter(group => group.options.length > 0);
  const visibleTransporterIds = new Set(tissueOption.transporterIds);
  const orientText = text => {
    if (!text || displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return text;
    return String(text)
      .replace(/toward blood/g, displayOrientation.positiveFluxLabel)
      .replace(/toward lumen/g, displayOrientation.negativeFluxLabel)
      .replace(/absorption/g, displayOrientation.positiveProcessLabel)
      .replace(/secretion/g, displayOrientation.negativeProcessLabel)
      .replace(/Lumen/g, displayOrientation.apicalPolarityLabel)
      .replace(/lumen/g, displayOrientation.apicalShortLabel.toLowerCase())
      .replace(/Blood/g, displayOrientation.basolateralPolarityLabel)
      .replace(/blood/g, displayOrientation.basolateralShortLabel.toLowerCase());
  };
  const directionLabelForValue = value => {
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'none';
    return numeric > 0 ? displayOrientation.positiveProcessLabel : displayOrientation.negativeProcessLabel;
  };
  const towardLabelForValue = value => {
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'neutral/weak';
    return numeric > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
  };
  const sideFlowLabel = (placement, sign) => {
    if (sign === 0) return 'no strong tendency';
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) {
      if (placement === 'apical') return sign > 0 ? 'lumen to cell' : 'cell to lumen';
      return sign > 0 ? 'blood to cell' : 'cell to blood';
    }
    const side = placement === 'apical'
      ? displayOrientation.apicalShortLabel.toLowerCase()
      : displayOrientation.basolateralShortLabel.toLowerCase();
    return sign > 0 ? side + ' side to cell' : 'cell to ' + side + ' side';
  };
  const epithelialFlowLabel = sign => {
    if (sign === 0) return 'no strong tendency';
    return sign > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
  };
  const polarityStatus = value => {
    if (Math.abs(value) < CHARGE_EPSILON) return 'Minimal';
    return value > 0
      ? displayOrientation.apicalPolarityLabel + '-negative'
      : displayOrientation.apicalPolarityLabel + '-positive';
  };
  const fluxDirectionCaption = 'Positive = ' + displayOrientation.positiveFluxLabel + '; negative = ' + displayOrientation.negativeFluxLabel + '.';
  const fluxBarSeries = FLUX_BAR_SERIES.map(series => {
    if (series.key === 'apicalStep') return { ...series, name: displayOrientation.apicalMembraneLabel };
    if (series.key === 'basolateralStep') return { ...series, name: displayOrientation.basolateralMembraneLabel };
    return series;
  });
  const concentrationCompartments = CONCENTRATION_COMPARTMENTS.map(compartment => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return compartment;
    if (compartment.key === 'apicalBulk') return { ...compartment, label: displayOrientation.apicalShortLabel + ' Bulk ECF', name: displayOrientation.apicalShortLabel + ' Bulk ECF' };
    if (compartment.key === 'apicalSurface') return { ...compartment, label: displayOrientation.apicalShortLabel + ' Surface ECF', name: displayOrientation.apicalShortLabel + ' Surface ECF' };
    if (compartment.key === 'basolateralSurface') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' Surface ECF', name: displayOrientation.basolateralShortLabel + ' Surface ECF' };
    if (compartment.key === 'basolateralBulk') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' Bulk ECF', name: displayOrientation.basolateralShortLabel + ' Bulk ECF' };
    return compartment;
  });
  const settingsConcentrationCompartments = SETTINGS_CONCENTRATION_COMPARTMENTS.map(compartment => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return compartment;
    if (compartment.key === 'apicalECF') return { ...compartment, label: displayOrientation.apicalShortLabel + ' bath' };
    if (compartment.key === 'basolateralECF') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' bath' };
    return compartment;
  });

  const concentrationIons = result
    ? Object.keys(result.concentrations.icf).filter(ion => ion !== 'H2O' && !GENERAL_DISPLAY_EXCLUDED_IONS.includes(ion))
    : [];
  const concData = concentrationIons.map(ion => ({
    ionKey: ion,
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));
  const concTableData = concentrationIons.map(ion => ({
    ionKey: ion,
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));
  const openConcentrationZoomFromChart = data => {
    const ionKey = data?.payload?.ionKey || data?.activePayload?.[0]?.payload?.ionKey;
    if (ionKey) setZoomedConcentrationIon(ionKey);
  };
  const zoomedConcentrationRow = zoomedConcentrationIon
    ? concData.find(row => row.ionKey === zoomedConcentrationIon)
    : null;
  const zoomedConcentrationData = zoomedConcentrationRow
    ? concentrationCompartments.map(compartment => ({
        compartment: compartment.label,
        concentration: Number(zoomedConcentrationRow[compartment.key] ?? 0)
      }))
    : [];
  const zoomedConcentrationMax = zoomedConcentrationData.reduce((max, row) => Math.max(max, row.concentration), 0);
  const zoomedConcentrationDomainMax = niceConcentrationAxisMax(zoomedConcentrationMax);
  const ConcentrationTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    return (
      <div className="bg-white border rounded shadow-lg p-2 text-xs text-gray-700 max-w-xs">
        <div className="font-semibold text-sm mb-1">{label}</div>
        <div className="space-y-0.5">
          {payload.map(item => (
            <div key={item.dataKey} className="flex items-center justify-between gap-4">
              <span>{item.name}</span>
              <span className="font-mono">{Number(item.value ?? 0).toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

// For H⁺/K⁺-ATPase, K⁺ flux can occur with HKATPase on either membrane (no exit needed).
// Parallel/mirrored H⁺ and HCO₃⁻ TE flux logic uses pathway completion rules rather than buffered pH kinetics.
  const transepiFluxData = result?.transepiFluxData || [];
  const soluteTransepiFluxData = transepiFluxData.filter(row => row.ion !== 'H2O');
  const transepithelialByIon = Object.fromEntries(soluteTransepiFluxData.map(row => [row.ion, row.transepithelial || 0]));
  const displayApicalFlux = result?.displayApicalFlux || result?.apicalFlux || {};
  const displayBasolateralFlux = result?.displayBasolateralFlux || result?.basolateralFlux || {};
  const directionalFluxRows = result
    ? FLUX_GROUPS.flatMap(group => group.solutes.map(ion => ({
      group: group.key,
      groupLabel: group.label,
      ion,
      label: ION_LABEL[ion] || ion,
      apicalStep: displayApicalFlux[ion] || 0,
      basolateralStep: -(displayBasolateralFlux[ion] || 0),
      paracellularStep: result.paraFlux[ion] || 0,
      transepithelial: transepithelialByIon[ion] || 0
    })))
    : [];
  const directionalFluxGroups = FLUX_GROUPS.map(group => ({
    ...group,
    rows: directionalFluxRows.filter(row => row.group === group.key)
  }));
  const visibleDirectionalFluxGroups = directionalFluxGroups.filter(group =>
    group.key === 'ions' ||
    group.rows.some(row =>
      ['apicalStep', 'basolateralStep', 'paracellularStep', 'transepithelial']
        .some(key => Math.abs(Number(row[key] || 0)) > DIRECTIONAL_FLUX_GRAPH_EPSILON)
    )
  );
  const visibleIonDirectionalFluxGroups = visibleDirectionalFluxGroups.filter(group => group.key === 'ions');
  const visibleSupplementalDirectionalFluxGroups = visibleDirectionalFluxGroups.filter(group => group.key !== 'ions');

  const modalTransporter = INITIAL_TRANSPORTERS.find(t => t.id === modalTransporterId);
  const transporterTemplateById = id => INITIAL_TRANSPORTERS.find(t => t.id === id);
  const membraneTransporters = placement => transporters.filter(t => t.placement === placement);
  const transporterIsOnMembrane = (id, placement) => transporters.some(t => t.id === id && t.placement === placement);
  const effectiveBackgroundOsmoticPull = resolveBackgroundOsmoticPull(tissueOption.value, backgroundOsmoticPullSetting);
  const showTransporterTooltip = (event, tooltipId, description) => {
    if (!description) return;
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
    const margin = 8;
    const width = Math.min(256, viewportWidth - margin * 2);
    const estimatedHeight = 96;
    const left = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
    const top = rect.bottom + estimatedHeight + margin > viewportHeight
      ? Math.max(margin, rect.top - estimatedHeight - 6)
      : rect.bottom + 6;
    setActiveTransporterTooltip({ id: tooltipId, description, left, top, width });
  };
  const keepTransporterTooltipOpen = () => {
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
  };
  const hideTransporterTooltip = () => {
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    tooltipHideTimerRef.current = setTimeout(() => setActiveTransporterTooltip(null), 120);
  };

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
              const tooltipId = 'transporter-tooltip-' + placement + '-' + id;
              const descriptionId = 'transporter-description-' + placement + '-' + id;
              return (
                <span
                  key={id}
                  className="relative inline-block"
                  onMouseEnter={event => showTransporterTooltip(event, tooltipId, description)}
                  onMouseLeave={hideTransporterTooltip}
                  onFocus={event => showTransporterTooltip(event, tooltipId, description)}
                  onBlur={hideTransporterTooltip}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={alreadyAdded}
                    aria-label={'Add ' + (template?.name || id)}
                    aria-describedby={description ? descriptionId : undefined}
                    className={alreadyAdded ? 'text-gray-400 border-gray-200 bg-gray-50' : ''}
                    onClick={() => addTransporterToMembrane(id, placement)}
                  >
                    {template?.name || id}
                  </Button>
                  {description && (
                    <span id={descriptionId} className="sr-only">
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
    const placementMembraneLabel = placement === 'apical'
      ? displayOrientation.apicalMembraneLabel
      : displayOrientation.basolateralMembraneLabel;
    if (rows.length === 0) {
      return <div className="text-sm text-gray-500 border rounded p-2 bg-gray-50">No transporters added.</div>;
    }

    return (
      <div className="space-y-2">
        {rows.map(t => (
          <div key={t.uid} className="border rounded p-2 bg-white">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-sm">{t.name}</div>
              <Button
                size="sm"
                variant="outline"
                aria-label={'Remove ' + t.name + ' from ' + placementMembraneLabel}
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
  const formatSettingsConcentration = value => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '0';
    if (numeric !== 0 && Math.abs(numeric) < 0.001) return numeric.toPrecision(2);
    return String(Number(numeric.toFixed(3)));
  };
  const concentrationValidationFor = (compartment, ion) => concentrationValidation[compartment + '-' + ion];
  const fluxDirection = value => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return directionLabelForValue(value);
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'none';
    return numeric > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
  };
  const hasIntracellularImbalance = cellImbalanceReport.length > 0;
  const hasCoupledMismatch = coupledMismatchReport?.state === 'mismatch';
  const compactImbalanceDirection = direction => direction.replace(' tendency', '');
  const dominantFluxRow = soluteTransepiFluxData
    .filter(row => Math.abs(Number(row.transepithelial || 0)) >= 0.001)
    .reduce((strongest, row) => {
      if (!strongest) return row;
      return Math.abs(Number(row.transepithelial || 0)) > Math.abs(Number(strongest.transepithelial || 0))
        ? row
        : strongest;
    }, null);
  const tePotentialValue = chargeReport?.transepithelial?.value ?? 0;
  const osmoticPullValue = waterReport?.osmoticPull?.value ?? 0;
  const waterFluxValue = waterReport?.netTransepithelial?.value ?? 0;
  const acidBaseFluxValue = acidBaseReport?.transepithelial?.value ?? 0;
  const tePotentialStatus = polarityStatus(tePotentialValue);
  const osmoticPullStatus = towardLabelForValue(osmoticPullValue);
  const waterFluxStatus = towardLabelForValue(waterFluxValue);
  const acidBaseFluxStatus = Math.abs(acidBaseFluxValue) < 0.001
    ? 'Neutral/weak'
    : acidBaseFluxValue > 0
      ? 'Acid ' + displayOrientation.negativeProcessLabel
      : 'Base ' + displayOrientation.negativeProcessLabel;
  const cellBalanceStatus = hasIntracellularImbalance
    ? cellImbalanceReport.length === 1
      ? cellImbalanceReport[0].label + ' ' + compactImbalanceDirection(cellImbalanceReport[0].direction)
      : cellImbalanceReport.length + ' tendencies'
    : hasCoupledMismatch
      ? 'Coupled mismatch'
      : 'Balanced';
  const cellBalanceDetail = hasIntracellularImbalance
    ? cellImbalanceReport.length === 1
      ? 'Intracellular ' + compactImbalanceDirection(cellImbalanceReport[0].direction)
      : 'Review imbalance table below'
    : hasCoupledMismatch
      ? 'Review pathway completion'
      : 'No intracellular imbalance tendency';
  const dominantFluxStatus = dominantFluxRow
    ? (ION_LABEL[dominantFluxRow.ion] || dominantFluxRow.ion) + ' ' + directionLabelForValue(dominantFluxRow.transepithelial)
    : 'No strong net flux';
  const dominantFluxDetail = dominantFluxRow
    ? formatTableValue(dominantFluxRow.transepithelial) + ' net epithelial flux units'
    : 'Net epithelial movement is weak';
  const waterFluxDetail = waterReport
    ? 'Osmotic pull + water pathway = water movement'
    : 'No water tendency calculated';
  const snapshotIndicatorPercent = (value, maxAbs) => 50 + clamp(Number(value || 0) / maxAbs, -1, 1) * 45;
  const resultsSnapshotTiles = result ? [
    {
      key: 'balance',
      title: 'Cell Balance',
      status: cellBalanceStatus,
      detail: cellBalanceDetail,
      state: hasIntracellularImbalance || hasCoupledMismatch ? 'warning' : 'good'
    },
    {
      key: 'dominant-flux',
      title: 'Dominant Epithelial Flux',
      status: dominantFluxStatus,
      detail: dominantFluxDetail,
      state: dominantFluxRow ? 'accent' : 'neutral'
    },
    {
      key: 'tep',
      title: 'Transepithelial Potential',
      status: tePotentialStatus,
      detail: chargeReport
        ? chargeReport.transepithelial.strength + '; ' + formatChargeValue(tePotentialValue) + ' charge units'
        : 'No charge tendency calculated',
      state: Math.abs(tePotentialValue) < CHARGE_EPSILON ? 'neutral' : 'accent',
      indicator: {
        value: -tePotentialValue,
        maxAbs: SNAPSHOT_TEP_INDICATOR_MAX,
        leftLabel: displayOrientation.apicalPolarityLabel + '-negative',
        rightLabel: displayOrientation.apicalPolarityLabel + '-positive',
        markerClass: 'bg-slate-700',
        ariaLabel: 'Transepithelial potential indicator: ' + tePotentialStatus + ', ' + formatChargeValue(tePotentialValue) + ' charge units. Left indicates ' + displayOrientation.apicalPolarityLabel + '-negative; right indicates ' + displayOrientation.apicalPolarityLabel + '-positive.'
      }
    },
    {
      key: 'acid-base',
      title: 'Net Acid/Base Flux',
      status: acidBaseFluxStatus,
      detail: acidBaseReport
        ? orientText(acidBaseReport.transepithelial.direction) + '; ' + acidBaseReport.transepithelial.strength
        : 'No acid/base tendency calculated',
      state: Math.abs(acidBaseFluxValue) < 0.001 ? 'neutral' : 'accent',
      indicator: {
        value: acidBaseFluxValue,
        maxAbs: SNAPSHOT_ACID_BASE_INDICATOR_MAX,
        leftLabel: 'Base ' + displayOrientation.negativeProcessLabel,
        rightLabel: 'Acid ' + displayOrientation.negativeProcessLabel,
        markerClass: 'bg-teal-700',
        ariaLabel: 'Net acid/base flux indicator: ' + acidBaseFluxStatus + ', ' + formatChargeValue(acidBaseFluxValue) + ' acid/base units. Left indicates base ' + displayOrientation.negativeProcessLabel + '; right indicates acid ' + displayOrientation.negativeProcessLabel + '.'
      }
    },
    {
      key: 'water',
      title: 'Water Flux',
      status: waterFluxStatus,
      detail: waterFluxDetail,
      state: Math.abs(waterFluxValue) < WATER_EPSILON ? 'neutral' : 'accent',
      indicators: [
        {
          label: 'Osmotic pull',
          status: osmoticPullStatus,
          value: osmoticPullValue,
          maxAbs: SNAPSHOT_WATER_INDICATOR_MAX,
          leftLabel: displayOrientation.negativeFluxLabel,
          rightLabel: displayOrientation.positiveFluxLabel,
          markerClass: 'bg-indigo-700',
          ariaLabel: 'Osmotic pull indicator: ' + osmoticPullStatus + ', ' + formatWaterValue(osmoticPullValue) + ' osmotic pull tendency units. Left indicates ' + displayOrientation.negativeFluxLabel + '; right indicates ' + displayOrientation.positiveFluxLabel + '.'
        },
        {
          label: 'Water flux',
          status: waterFluxStatus,
          value: waterFluxValue,
          maxAbs: SNAPSHOT_WATER_INDICATOR_MAX,
          leftLabel: displayOrientation.negativeFluxLabel,
          rightLabel: displayOrientation.positiveFluxLabel,
          markerClass: 'bg-blue-600',
          ariaLabel: 'Water flux indicator: ' + waterFluxStatus + ', ' + formatWaterValue(waterFluxValue) + ' water tendency units. Left indicates ' + displayOrientation.negativeFluxLabel + '; right indicates ' + displayOrientation.positiveFluxLabel + '.'
        }
      ]
    }
  ] : [];
  const compactSnapshotTiles = resultsSnapshotTiles.filter(tile => tile.key !== 'water');
  const waterSnapshotTile = resultsSnapshotTiles.find(tile => tile.key === 'water');
  const waterDetailRows = waterReport ? [
    {
      label: 'Osmotic pull',
      status: 'combined solute-linked and background pull',
      direction: orientText(waterReport.osmoticPull.direction),
      strength: waterReport.osmoticPull.strength,
      value: waterReport.osmoticPull.value,
      note: 'Combined from net epithelial solute flux (' + formatTableValue(waterReport.osmoticPull.sourceFlux) + ' flux units) and background pull; ECF concentration settings do not directly drive water flux'
    },
    {
      label: 'Background osmotic pull',
      status: orientText(waterReport.backgroundPull.status),
      direction: orientText(waterReport.backgroundPull.direction),
      strength: waterReport.backgroundPull.strength,
      value: waterReport.backgroundPull.value,
      note: orientText('Adds a background pull toward blood for water movement when a water pathway is present. This does not change solute concentrations.')
    },
    {
      label: 'Transcellular water pathway and contribution',
      status: waterReport.transcellularPath.status,
      direction: orientText(waterReport.transcellular.direction),
      strength: waterReport.transcellular.strength,
      value: waterReport.transcellular.value,
      note: waterReport.transcellularPath.note
    },
    {
      label: 'Paracellular water pathway and contribution',
      status: waterReport.paracellularPath.status,
      direction: orientText(waterReport.paracellular.direction),
      strength: waterReport.paracellular.strength,
      value: waterReport.paracellular.value,
      note: waterReport.paracellularPath.note
    },
    {
      label: 'Net water flux',
      status: waterReport.netTransepithelial.direction === 'no water pathway' ? 'no water pathway' : 'expressed water tendency',
      direction: orientText(waterReport.netTransepithelial.direction),
      strength: waterReport.netTransepithelial.strength,
      value: waterReport.netTransepithelial.value,
      note: waterReport.teachingNote
    }
  ] : [];
  const membraneDirectionText = (placement, sign) => {
    return sideFlowLabel(placement, sign);
  };
  const epithelialDirectionText = sign => {
    return epithelialFlowLabel(sign);
  };
  const combinedElectrochemicalText = (chemicalSign, electricalSign) => {
    if (chemicalSign === 0 && electricalSign === 0) return 'little chemical or electrical tendency detected';
    if (electricalSign === 0) return 'chemical gradient shown; little electrical tendency detected';
    if (chemicalSign === 0) return 'little chemical gradient; electrical tendency dominates';
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
    const hasImplicitVm = result?.gradientSupportReport?.present;
    if (valence === 0 || !hasImplicitVm) return 0;
    return valence > 0 ? 1 : -1;
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
    const transepithelialPolarity = result?.paracellularElectricalTendency ?? chargeReport?.transepithelial?.value ?? 0;
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
              membrane: t.placement === 'apical' ? displayOrientation.apicalMembraneLabel : displayOrientation.basolateralMembraneLabel,
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
                pathway: 'Cation + Water Pore',
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
                pathway: 'Anion Pore',
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
        interpretation: 'Add ENaC, Kir, ClC, CFTR, TRPV5/6, or a paracellular pore to show context'
      }];

  const snapshotTileClass = tile => {
    const stateClass = {
      good: 'border-emerald-200 bg-emerald-50',
      warning: 'border-amber-300 bg-amber-50',
      accent: 'border-sky-200 bg-sky-50',
      neutral: 'border-gray-200 bg-gray-50'
    }[tile.state] || 'border-gray-200 bg-gray-50';
    const hasMeter = tile.indicator || tile.indicators?.length;
    const sizeClass = hasMeter ? 'min-h-[104px]' : 'min-h-[68px]';
    return 'rounded border p-2 ' + sizeClass + ' ' + stateClass;
  };
  const snapshotStatusClass = state => ({
    good: 'text-emerald-800',
    warning: 'text-amber-800',
    accent: 'text-sky-900',
    neutral: 'text-gray-800'
  }[state] || 'text-gray-800');
  const SnapshotIndicator = ({ indicator }) => {
    if (!indicator) return null;
    const markerLeft = snapshotIndicatorPercent(indicator.value, indicator.maxAbs);
    return (
      <div className="mt-2" role="img" aria-label={indicator.ariaLabel}>
        {indicator.label && (
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-gray-700">{indicator.label}</span>
            <span className="text-gray-600">{indicator.status}</span>
          </div>
        )}
        <div className="relative h-2 rounded-full bg-gray-200" aria-hidden="true">
          <div className="absolute left-1/2 top-0 h-full w-px bg-gray-400" />
          <div
            className={'absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded ' + indicator.markerClass}
            style={{ left: markerLeft + '%' }}
          />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-gray-500">
          <span>{indicator.leftLabel}</span>
          <span>Neutral</span>
          <span>{indicator.rightLabel}</span>
        </div>
      </div>
    );
  };
  const SnapshotTile = ({ tile }) => (
    <li className={snapshotTileClass(tile)}>
      <h3 className="text-xs font-semibold uppercase text-gray-600">{tile.title}</h3>
      <div className={'mt-1 text-sm font-semibold leading-snug ' + snapshotStatusClass(tile.state)}>{tile.status}</div>
      <div className="mt-1 text-xs leading-snug text-gray-600">{tile.detail}</div>
      <SnapshotIndicator indicator={tile.indicator} />
      {tile.indicators?.map(indicator => (
        <SnapshotIndicator key={indicator.label} indicator={indicator} />
      ))}
    </li>
  );
  const WaterDetailCards = ({ rows }) => (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm mb-3" aria-label="Water movement details">
      {rows.map(row => (
        <li key={row.label} className="border rounded p-3 bg-white">
          <h4 className="font-semibold">{row.label}</h4>
          <dl className="mt-1 space-y-1">
            <div>
              <dt className="sr-only">Direction</dt>
              <dd>{row.direction}</dd>
            </div>
            <div className="text-gray-600">
              <dt className="sr-only">Status</dt>
              <dd>{row.status}</dd>
            </div>
            <div className="text-gray-600">
              <dt className="sr-only">Strength</dt>
              <dd>{row.strength}</dd>
            </div>
            <div className="text-gray-500">
              <dt className="sr-only">Value</dt>
              <dd>{formatWaterValue(row.value)} tendency units</dd>
            </div>
            <div className="text-gray-500 leading-snug">
              <dt className="sr-only">Teaching note</dt>
              <dd>{row.note}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );

  const AccessibleTable = ({ caption, captionClassName = 'text-left font-semibold mb-2', columns, rows }) => (
    <table className="min-w-full table-auto text-left text-sm border">
      <caption className={captionClassName}>{caption}</caption>
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
  {activeTransporterTooltip && (
    <div
      id={activeTransporterTooltip.id}
      role="tooltip"
      className="fixed z-50 rounded border bg-white p-2 text-xs text-gray-700 shadow-lg"
      style={{
        left: activeTransporterTooltip.left,
        top: activeTransporterTooltip.top,
        width: activeTransporterTooltip.width
      }}
      onMouseEnter={keepTransporterTooltipOpen}
      onMouseLeave={hideTransporterTooltip}
    >
      {activeTransporterTooltip.description}
    </div>
  )}
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
        <li><b>Reservoirs and surfaces:</b> Bulk ECF bath concentrations are fixed by default and editable within physiological teaching ranges in Settings. ICF is model-derived from the steady-state cell condition. Local surface concentrations are calculated from transporter flux plus partial mixing, so local gradients can differ from the bulk reservoirs.</li>
        <li><b>Direction convention:</b> Flux graphs use one shared convention: positive points toward the basolateral/blood side and negative points toward the apical/lumen side.</li>
        <li><b>Placenta context:</b> Placenta uses maternal/fetal side labels; positive flux is displayed as maternal-to-fetal transfer.</li>
        <li><b>Exploration:</b> Tissue choices filter which transporters are offered, but they do not remove transporters already placed. Unusual layouts are allowed so users can observe their consequences.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Teaching Abstractions &amp; Limits</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Electrochemical context:</b> SALT uses simplified electrochemical direction rules for selected charged pathways. These rules are qualitative and are applied only when they support the teaching model. Na⁺/K⁺-ATPase establishes the pump-supported Na⁺/K⁺ gradient state and the associated implicit cell-negative context.</li>
        <li><b>Membrane potential limits:</b> SALT does not dynamically calculate membrane potential from transporter activity. Transporter fluxes do not feed back to alter membrane potential. Transepithelial potential remains a separate epithelial-scale tendency and may influence charged paracellular flux, but it is not used to calculate apical or basolateral membrane potential.</li>
        <li><b>Charge and polarity:</b> Charge outputs are teaching tendencies computed from modeled ion fluxes. They are intended to flag likely electrical consequences, not to solve a steady-state electrical circuit.</li>
        <li><b>Water:</b> H₂O is represented as solute-linked epithelial water movement tendency. The app does not calculate true cell volume or quantitative osmolality-driven water flux.</li>
        <li><b>pH:</b> H⁺ is not plotted with bulk solutes. Acid/base behavior is shown as pH tendency and net acid/base flux rather than as a buffered quantitative pH calculation.</li>
        <li><b>Flux-only cargo:</b> Amino acids, peptides, organic anions, and organic cations are shown in flux outputs only. They are excluded from concentration graphs, Settings concentration controls, and charge/polarity calculations.</li>
        <li><b>Class-level transporters:</b> AQP, SGLT, NaPi 2:1, NaPi 3:1, Pi Facilitator, NKCC, TRPV5/6, OAT, OCT, MATE, and PepT represent transporter classes. Isoform-specific regulation is simplified unless it is central to the teaching rule.</li>
        <li><b>Special teaching rules:</b> Na⁺/K⁺-ATPase establishes steady-state Na⁺ and K⁺ gradients when present. Pump density limits how much Na⁺ extrusion or K⁺ loading it can support; pump-supported flux is shown only when paired with appropriate apical Na⁺ entry or K⁺ exit pathways, and pump activity is not shown as a standalone Na⁺ or K⁺ flux bar. A fully balanced pump-supported Na⁺ absorption layout also needs a K⁺ exit or recycling pathway; otherwise K⁺ loading is reported as an intracellular accumulation tendency. A pump-supported K⁺ secretion layout also needs Na⁺ entry; otherwise Na⁺ extrusion is reported as an intracellular depletion tendency. NaPi 2:1 and NaPi 3:1 pair with Pi Facilitator on the opposite membrane for completed phosphate transport and preserve their Na⁺:Pi stoichiometry in completed epithelial flux. CFTR is represented as a regulated anion pathway with a smaller HCO₃⁻ tendency. TRPV5/6 does not include dynamic inhibition by intracellular Ca²⁺.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">General Flux Rules</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Placement:</b> Transporters are active only when placed on the apical or basolateral membrane.</li>
        <li><b>Density:</b> Low, normal, and high density change transporter abundance and therefore scale the modeled flux tendency.</li>
        <li><b>Passive membrane pathways:</b> ENaC, Kir, ClC, CFTR, and TRPV5/6 use simplified electrochemical direction rules when Na⁺/K⁺-ATPase is present and primarily follow chemical concentration tendency when it is absent. GLUT2 remains non-voltage-sensitive and follows the glucose gradient.</li>
        <li><b>Coupled transport and exchangers:</b> Na⁺-coupled cotransporters and exchangers remain governed primarily by pump-supported Na⁺ gradient logic, stoichiometric coupling, and pathway completion. Selected electrogenic coupled pathways receive only small bounded implicit-Vm support and are not allowed to reverse routine teaching layouts.</li>
        <li><b>Regulated or supported pathways:</b> CFTR is treated as a regulated anion pathway whose direction follows the simplified electrochemical rule. NBCe1, NCC, NKCC, NHE3, AE1, and pendrin remain placement- and coupling-based teaching pathways rather than voltage-driven reversal mechanisms.</li>
        <li><b>Pathway completion:</b> Completed transepithelial flux requires compatible entry and exit steps on opposite membranes. One-sided movement can still create intracellular accumulation or depletion tendencies.</li>
        <li><b>Transport balance:</b> The Results Snapshot flags coupled transporter mismatch or intracellular accumulation/depletion tendencies. A warning means the layout may not represent a balanced steady-state pathway, so review the Intracellular Imbalance Tendencies table.</li>
        <li><b>Paracellular flux:</b> Paracellular ion movement is shown separately from membrane steps and is included in net epithelial flux when a leaky pathway is enabled. Paracellular ion leaks use concentration gradients plus transepithelial electrical tendency; paracellular water movement requires the Cation + Water Pore and follows the solute-linked water rule.</li>
        <li><b>Editable concentrations:</b> Editable ECF concentrations are constrained to physiological teaching ranges so exploratory changes illustrate meaningful physiology without producing extreme nonphysiological flux behavior.</li>
        <li><b>NKCC and K⁺ recycling:</b> Kir channels can support K⁺ recycling in NKCC-heavy layouts, especially thick ascending limb-like layouts. ROMK is a Kir channel class member, but the generalized NKCC class is not hard-gated by Kir.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-6 mb-1">Transporter Actions &amp; Rules</h3>
      <ul className="list-disc ml-6 text-sm space-y-2">
        <li>
          <b>AE1:</b> anion exchanger 1<br/>
          <i>Action:</i> Cl⁻/HCO₃⁻ exchanger; moves Cl⁻ and HCO₃⁻ in opposite directions.<br/>
          <i>Rule:</i> Can pair with an opposite-membrane proton extruder to support acid secretion/base absorption or the reverse, depending on placement. Voltage-driven reversal is not added in this teaching phase.
        </li>
        <li>
          <b>AA facilitator:</b> facilitated amino acid transporter class; representative examples include LAT/SLC7 family transporters<br/>
          <i>Action:</i> Facilitated neutral amino acid movement.<br/>
          <i>Rule:</i> Can provide amino acid exit or entry in a completed amino acid pathway with Na⁺-AA cotransport on the opposite membrane.
        </li>
        <li>
          <b>AQP:</b> aquaporin class; representative members include AQP2, AQP3, and AQP4<br/>
          <i>Action:</i> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> Net transcellular H₂O flux requires AQP on both apical and basolateral membranes. When that complete pathway is present, water tendency follows the combined osmotic pull and is scaled by the combined apical/basolateral AQP density.
        </li>
        <li>
          <b>CFTR:</b> cystic fibrosis transmembrane conductance regulator<br/>
          <i>Action:</i> Regulated epithelial anion channel; moves Cl⁻ and a smaller HCO₃⁻ component according to the simplified electrochemical tendency in this teaching model.<br/>
          <i>Rule:</i> Can complete Cl⁻ secretion when paired with NKCC or another Cl⁻ loading pathway on the opposite membrane. CFTR alone is not treated as a complete secretion mechanism when intracellular anion loading is weak. Dynamic gating and detailed bicarbonate selectivity are not modeled.
        </li>
        <li>
          <b>ClC:</b> CLC family voltage-gated chloride channel class; includes ClC-Kb<br/>
          <i>Action:</i> Chloride channel; passive Cl⁻ flux follows the simplified electrochemical tendency in this teaching model.<br/>
          <i>Rule:</i> Can provide a Cl⁻ exit or entry pathway, helping complete NaCl transport driven by NCC or NKCC when intracellular Cl⁻ loading supports exit. Voltage dependence is not modeled.
        </li>
        <li>
          <b>ENaC:</b> epithelial sodium channel<br/>
          <i>Action:</i> Sodium channel; passive Na⁺ flux follows chemical tendency and the fixed implicit membrane-potential tendency when pump support is present.<br/>
          <i>Rule:</i> Can provide apical Na⁺ entry. Completed transepithelial Na⁺ absorption is limited by available Na⁺/K⁺-ATPase extrusion support.
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
          <b>Kir:</b> inward-rectifier potassium channel class<br/>
          <i>Action:</i> Potassium channel; passive K⁺ flux follows the simplified electrochemical tendency. ROMK is a member of the Kir ion channel class.<br/>
          <i>Rule:</i> Can provide K⁺ exit or entry on either membrane depending on K⁺ electrochemical tendency. With Na⁺/K⁺-ATPase present, completed apical K⁺ secretion is limited by available pump K⁺ loading support and Kir exit capacity.
        </li>
        <li>
          <b>MATE:</b> multidrug and toxin extrusion transporter class; representative members include MATE1 and MATE2-K<br/>
          <i>Action:</i> H⁺/organic cation exchange.<br/>
          <i>Rule:</i> Can pair with OCT on the opposite membrane for organic cation transport.
        </li>
        <li>
          <b>NaPi 2:1:</b> sodium-phosphate cotransporter class; representative member NaPi-IIc<br/>
          <i>Action:</i> Electroneutral Na⁺-phosphate symporter; co-transports 2 Na⁺ with 1 phosphate.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with a Pi Facilitator on the opposite membrane for completed phosphate transport. Completed epithelial flux preserves the 2:1 Na⁺:Pi stoichiometry while unmatched movement can still report intracellular imbalance.
        </li>
        <li>
          <b>NaPi 3:1:</b> sodium-phosphate cotransporter class; representative members include NaPi-IIa and NaPi-IIb<br/>
          <i>Action:</i> Electrogenic Na⁺-phosphate symporter; co-transports 3 Na⁺ with 1 phosphate.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with a Pi Facilitator on the opposite membrane for completed phosphate transport. Completed epithelial flux preserves the 3:1 Na⁺:Pi stoichiometry while unmatched movement can still report intracellular imbalance.
        </li>
        <li>
          <b>Na⁺-AA:</b> sodium-amino acid cotransporter class; representative examples include neutral amino acid transport systems such as B⁰AT/SLC6 family transporters<br/>
          <i>Action:</i> Na⁺-coupled neutral amino acid movement.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with an AA facilitator on the opposite membrane for completed amino acid transport.
        </li>
        <li>
          <b>NBCe1:</b> electrogenic sodium bicarbonate cotransporter 1<br/>
          <i>Action:</i> Electrogenic Na⁺-bicarbonate cotransporter; moves Na⁺ and HCO₃⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present. Basolateral NBCe1 can support HCO₃⁻ loading in bicarbonate secretory layouts, and it pairs with proton extruders or apical HCO₃⁻ exit pathways for transepithelial acid/base flux. Routine voltage-driven reversal is not modeled.
        </li>
        <li>
          <b>NCC:</b> sodium-chloride cotransporter<br/>
          <i>Action:</i> Na⁺-Cl⁻ symporter; co-transports Na⁺ and Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support and remains primarily governed by coordinated NaCl coupling. Cl⁻ transepithelial completion requires compatible NCC, NKCC, CFTR, or chloride channel pathways on opposite membranes; otherwise Cl⁻ imbalance can appear.
        </li>
        <li>
          <b>NCX1:</b> sodium-calcium exchanger 1<br/>
          <i>Action:</i> Na⁺-Ca²⁺ exchanger; exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and a Ca²⁺ loading context, such as TRPV5/6 on the opposite membrane. It can complete Ca²⁺ absorption with apical TRPV5/6, but routine NCX1 reversal is not modeled.
        </li>
        <li>
          <b>NHE3:</b> sodium-hydrogen exchanger 3<br/>
          <i>Action:</i> Na⁺/H⁺ exchanger; exchanges Na⁺ and H⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; activity decreases at higher pH; paired with NBCe1 for transepithelial HCO₃⁻ and H⁺ flux. The Na⁺ gradient and pH teaching rule remain primary.
        </li>
        <li>
          <b>NKCC:</b> sodium-potassium-chloride cotransporter class; representative members include NKCC1 and NKCC2<br/>
          <i>Action:</i> Na⁺-K⁺-2Cl⁻ symporter; co-transports Na⁺, K⁺, and 2 Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support and is not treated as strongly voltage-driven. Basolateral NKCC plus apical CFTR can produce Cl⁻ secretion; apical NKCC plus basolateral Cl⁻ exit can produce absorptive patterns. Kir channels, including ROMK in TAL-like layouts, can support K⁺ recycling but are not a hard gate for this generalized class.
        </li>
        <li>
          <b>Na⁺/K⁺ ATPase:</b> sodium-potassium ATPase<br/>
          <i>Biological action:</i> Active pump; extrudes 3 Na⁺ and imports 2 K⁺ per ATP.<br/>
          <i>Rule:</i> In this teaching layer, it establishes steady-state low Na⁺ and high K⁺ cell gradients when present. Density limits how much basolateral Na⁺ extrusion or K⁺ loading support it can provide, but it does not create larger-than-normal gradients. Pump-supported basolateral Na⁺ extrusion is displayed only when paired with apical Na⁺ entry, and K⁺ loading support is displayed only when paired with apical K⁺ exit. Without a K⁺ exit or recycling pathway, pump-supported Na⁺ absorption reports intracellular K⁺ accumulation; without Na⁺ entry, pump-supported K⁺ secretion reports intracellular Na⁺ depletion.
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
          <b>Pendrin:</b> Cl⁻/HCO₃⁻ exchanger<br/>
          <i>Action:</i> Cl⁻/HCO₃⁻ exchanger; moves Cl⁻ and HCO₃⁻ in opposite directions.<br/>
          <i>Rule:</i> Can pair with an opposite-membrane proton extruder for acid/base flux, and can contribute to Cl⁻/HCO₃⁻ imbalance when placed without a matching pathway. Voltage-driven reversal is not added in this teaching phase.
        </li>
        <li>
          <b>PepT:</b> peptide transporter class; representative members include PepT1 and PepT2<br/>
          <i>Action:</i> H⁺-coupled small peptide movement.<br/>
          <i>Rule:</i> Peptide-derived nutrient absorption can be completed by an AA facilitator on the opposite membrane, representing intracellular peptide hydrolysis in this teaching layer.
        </li>
        <li>
          <b>Pi Facilitator:</b> facilitated inorganic phosphate transporter class; this mechanism is not well characterized but may be XPR1<br/>
          <i>Action:</i> Facilitated inorganic phosphate movement.<br/>
          <i>Rule:</i> Can provide phosphate exit or entry in a completed phosphate pathway with NaPi 2:1 or NaPi 3:1 cotransport on the opposite membrane.
        </li>
        <li>
          <b>PMCA:</b> plasma membrane calcium ATPase<br/>
          <i>Action:</i> Ca²⁺ pump; pumps Ca²⁺ out using ATP.<br/>
          <i>Rule:</i> Can complete Ca²⁺ flux when paired with TRPV5/6 on the opposite membrane.
        </li>
        <li>
          <b>SGLT:</b> sodium-glucose cotransporter class; representative members include SGLT1 and SGLT2<br/>
          <i>Action:</i> Na⁺-glucose symporter; co-transports Na⁺ and glucose together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; for net glucose flux, SGLT and GLUT2 must be on opposite membranes. Pump-supported Na⁺ gradient logic dominates; the implicit cell-negative context provides only small bounded support and does not create routine reversal.
        </li>
        <li>
          <b>TRPV5/6:</b> epithelial calcium channel class; representative members include renal TRPV5 and intestinal TRPV6<br/>
          <i>Action:</i> Passive Ca²⁺ channel; Ca²⁺ flux follows chemical tendency and the fixed implicit membrane-potential tendency when pump support is present.<br/>
          <i>Rule:</i> Completed epithelial Ca²⁺ movement requires TRPV5/6 on one membrane and PMCA or NCX1 on the opposite membrane; apical TRPV5/6 plus basolateral extrusion produces absorption. SALT does not model dynamic channel regulation by intracellular Ca²⁺, so unmatched entry is shown as an intracellular Ca²⁺ accumulation tendency.
        </li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Paracellular Pathway Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Barrier:</b> Modeled as no paracellular solute or water flux. This is a teaching simplification; real tight junctions vary in permeability and selectivity.</li>
        <li><b>Cation + Water Pore:</b> Enables Na⁺ and K⁺ flux down their transepithelial electrochemical tendency and provides the paracellular water pathway for osmotic-pull-linked H₂O movement.</li>
        <li><b>Anion Pore:</b> Enables Cl⁻ flux, with some HCO₃⁻ permeability, down the transepithelial electrochemical tendency.</li>
        <li>Paracellular ion flux magnitude depends on the permeability setting, the concentration gradient, and the transepithelial electrical tendency. Paracellular water movement follows the combined osmotic pull when the Cation + Water Pore is present.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Water Movement Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H₂O is not treated as a transported solute concentration. The app reports qualitative water movement tendencies instead of calculating true cell volume or osmolality.</li>
        <li>ECF concentration settings and apical/cell/basolateral osmolality differences do not directly drive water flux.</li>
        <li>Osmotic pull combines net epithelial solute movement with the optional background osmotic pull toward blood. The background setting affects water movement only and does not change solute concentrations.</li>
        <li>Water tendency follows the combined osmotic pull when a water pathway is present. A complete transcellular pathway requires AQP on both apical and basolateral membranes and is scaled by the combined apical/basolateral AQP density; the Cation + Water Pore provides a paracellular water pathway.</li>
        <li>Barrier and Anion Pore do not provide paracellular water flux in this teaching model.</li>
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
        <li><b>Glucose:</b> SGLT on one membrane and GLUT2 on the opposite membrane, with Na⁺/K⁺ ATPase support present.</li>
        <li><b>Na⁺:</b> SGLT, NaPi 2:1, NaPi 3:1, ENaC, NCC, or NKCC can provide apical Na⁺ entry tendencies. Completed pump-supported Na⁺ absorption is limited by the smaller of apical Na⁺ entry capacity and Na⁺/K⁺-ATPase extrusion support capacity, and fully balanced Na⁺ absorption also needs K⁺ exit or recycling.</li>
        <li><b>K⁺:</b> H⁺/K⁺-ATPase can create modeled K⁺ transepithelial flux. Kir can provide passive K⁺ membrane flux; with Na⁺/K⁺-ATPase present, apical Kir secretion is limited by the smaller of apical K⁺ exit capacity and pump K⁺ loading support capacity. Fully balanced pump-supported K⁺ secretion also needs Na⁺ entry.</li>
        <li><b>Cl⁻:</b> NKCC, NCC, ClC, CFTR, AE1, or pendrin can provide Cl⁻ membrane movement. Completed Cl⁻ flux requires compatible movement on opposite membranes.</li>
        <li><b>Ca²⁺:</b> TRPV5/6 provides passive Ca²⁺ entry. Completed Ca²⁺ movement requires PMCA or NCX1 on the opposite membrane; otherwise intracellular Ca²⁺ imbalance is reported.</li>
        <li><b>Phosphate:</b> NaPi 2:1 or NaPi 3:1 on one membrane and Pi Facilitator on the opposite membrane, with Na⁺/K⁺-ATPase support present, produce completed phosphate transport with the selected Na⁺:Pi stoichiometry.</li>
        <li><b>Amino acids:</b> Na⁺-AA on one membrane and AA facilitator on the opposite membrane produce completed neutral amino acid transport.</li>
        <li><b>Peptides:</b> PepT on one membrane and AA facilitator on the opposite membrane produce completed peptide-derived nutrient transport in this teaching layer.</li>
        <li><b>Organic anions and cations:</b> OAT can complete organic anion pathways when present on opposite membranes. OCT and MATE on opposite membranes complete organic cation pathways.</li>
        <li><b>H⁺ and HCO₃⁻:</b> A proton extruder (NHE3, H⁺-ATPase, or H⁺/K⁺-ATPase) on one membrane and NBCe1, AE1, or pendrin on the opposite membrane. CFTR can provide an HCO₃⁻ exit tendency when paired with a compatible HCO₃⁻ entry pathway. NHE3 and NBCe1 require Na⁺/K⁺-ATPase support; AE1, pendrin, CFTR, H⁺-ATPase, and H⁺/K⁺-ATPase do not require that support in this teaching rule.</li>
        <li><b>H₂O:</b> Net transcellular water movement requires AQP on both apical and basolateral membranes and is scaled by their combined density. Paracellular H₂O movement requires the Cation + Water Pore. When a water pathway is present, H₂O follows the combined osmotic pull in arbitrary teaching units.</li>
      </ul>
      <Button size="sm" variant="outline" onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
    </div>
  </div>
)}

<div className="flex h-screen">
<div className="w-1/3 p-4 border-r overflow-auto">
  <div className="text-xl font-bold mb-4 tracking-tight text-blue-800">
    SALT: <span className="font-normal text-gray-700">Secretion &amp; Absorption Learning Tool</span>
  </div><div className="flex flex-wrap items-center gap-2 mb-4">
<Button onClick={() => setShowAbout(true)}>About</Button>
<Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
<Button variant="outline" onClick={() => setShowResetConfirm(true)}>Reset</Button>
<fieldset className="inline-flex items-center gap-2 rounded border px-2 py-1 text-sm">
  <legend className="sr-only">Results view</legend>
  <span className="font-semibold" aria-hidden="true">Results</span>
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
         <select
           value={paracellularType}
           onChange={e => setParacellularType(e.target.value)}
           className="w-full border rounded p-1"
           aria-label="Paracellular pathway"
         >
  <option value="none">Barrier</option>
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
          {renderMembraneBuilder('apical', displayOrientation.apicalLabel)}
          {renderMembraneBuilder('basolateral', displayOrientation.basolateralLabel)}
        </div>
{showParaInfo && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-lg w-[92vw] shadow-lg overflow-y-auto max-h-[85vh]">
      <h2 className="text-xl font-bold mb-2">Paracellular Pathway Settings</h2>
      <div className="mb-4 text-sm text-gray-700">
        <p className="mb-2"><b>Paracellular pathway:</b> Movement of solutes and water between cells.</p>
        <ul className="list-disc ml-6 space-y-1">
          <li><b>Barrier:</b> No passive leak</li>
          <li><b>Cation + Water Pore:</b> Permeable to Na⁺, K⁺, and water</li>
          <li><b>Anion Pore:</b> Permeable to Cl⁻, with some HCO₃⁻ permeability.</li>
        </ul>
      </div>
      {paracellularType === 'cation' && (
        <>
          <div className="mb-2">
            <label className="block mt-2 text-sm">Cation + Water Pore permeability:</label>
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
            <label className="block mt-2 text-sm">Anion Pore permeability:</label>
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
      <Button className="mt-2" onClick={() => setShowParaInfo(false)}>Close</Button>
    </div>
  </div>
)}
{showResetConfirm && (
  <div
    className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
    role="presentation"
    onClick={() => setShowResetConfirm(false)}
  >
    <div
      className="bg-white rounded-lg p-6 max-w-md w-[92vw] shadow-lg"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      aria-describedby="reset-confirm-description"
      onClick={e => e.stopPropagation()}
    >
      <h2 id="reset-confirm-title" className="text-xl font-bold mb-2">Reset all settings?</h2>
      <p id="reset-confirm-description" className="text-sm text-gray-700 mb-4">
        This clears all transporters and restores tissue, paracellular pathway, water movement, baseline concentrations, and results view defaults.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
        <Button size="sm" onClick={resetAllSettings}>Reset</Button>
      </div>
    </div>
  </div>
)}
{showSettings && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
    <div className="bg-white rounded-lg p-6 max-w-3xl w-[92vw] shadow-lg overflow-y-auto max-h-[85vh] relative" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="absolute top-3 right-3" aria-label="Close Settings window" onClick={() => setShowSettings(false)}>Close</Button>
      <h2 className="text-xl font-bold mb-4 pr-20">Model Settings</h2>
      <div className="mb-4 text-sm text-gray-700">
        <h3 className="block mb-2 font-semibold">Water Movement</h3>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label htmlFor="background-osmotic-pull" className="block mb-1">{orientText('Background osmotic pull toward blood')}</label>
            <select
              id="background-osmotic-pull"
              value={backgroundOsmoticPullSetting}
              onChange={e => setBackgroundOsmoticPullSetting(e.target.value)}
              className="border rounded p-1 w-full"
              aria-describedby="background-osmotic-pull-help background-osmotic-pull-effective"
            >
              {BACKGROUND_OSMOTIC_PULL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{orientText(option.label)}</option>
              ))}
            </select>
          </div>
          <div id="background-osmotic-pull-effective" className="text-gray-600">
            Effective: {orientText(effectiveBackgroundOsmoticPull.status)}
          </div>
        </div>
        <p id="background-osmotic-pull-help" className="text-gray-500 mt-2">
          {orientText('Adds a background pull toward blood for water movement when a water pathway is present. This does not change solute concentrations.')}
        </p>
      </div>
      <div className="mb-4 text-sm text-gray-700">
        <h3 className="block mb-2 font-semibold">Membrane Electrochemical Rules</h3>
        <div className="text-gray-500">
          Selected charged channels and selected coupled transporters use simplified qualitative direction rules only when they support the teaching model. Na⁺/K⁺-ATPase establishes the pump-supported Na⁺/K⁺ gradient state and fixed implicit cell-negative context. Dynamic membrane-potential feedback is not modeled, and TEP remains epithelial-scale and affects charged paracellular flux only.
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
          {displayOrientation.apicalShortLabel} and {displayOrientation.basolateralShortLabel} bulk ECF reservoirs are editable. ICF is determined by the modeled steady-state cell condition; Na⁺/K⁺-ATPase establishes steady-state Na⁺ and K⁺ gradients when present.
        </p>
        <p className="text-gray-500 mb-2">
          Pump density limits how much Na⁺ extrusion or K⁺ loading it can support. Pump-supported flux is shown only when paired with appropriate apical Na⁺ entry or K⁺ exit pathways, and pump activity is not shown as a standalone Na⁺ or K⁺ flux bar. Editable ECF concentrations are constrained to physiological teaching ranges.
        </p>
        <table className="min-w-full table-auto text-left border">
          <caption className="sr-only">Baseline concentration settings. {displayOrientation.apicalShortLabel} and {displayOrientation.basolateralShortLabel} ECF reservoirs are editable; cell ICF values are model-derived and not editable.</caption>
          <thead>
            <tr className="bg-gray-100">
              <th scope="col" className="px-2 py-1 border">Ion or solute</th>
              {settingsConcentrationCompartments.map(compartment => (
                <th key={compartment.key} scope="col" className="px-2 py-1 border">{compartment.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONCENTRATION_EDIT_IONS.map(ion => (
              <tr key={ion}>
                <th scope="row" className="px-2 py-1 border font-semibold">{ION_LABEL[ion] || ion}</th>
                {settingsConcentrationCompartments.map(compartment => (
                  <td key={compartment.key} className="px-2 py-1 border">
                    {compartment.editable ? (
                      <>
                        <input
                          type="number"
                          min={ECF_CONCENTRATION_LIMITS[ion]?.min ?? 0}
                          max={ECF_CONCENTRATION_LIMITS[ion]?.max}
                          step={ion === 'Ca2+' ? '0.0001' : '0.1'}
                          value={baseConcentrations[compartment.key][ion]}
                          onChange={e => updateBaseConcentration(compartment.key, ion, e.target.value)}
                          className={
                            'border rounded p-1 w-full ' +
                            (concentrationValidationFor(compartment.key, ion)?.level === 'error'
                              ? 'border-red-500'
                              : concentrationValidationFor(compartment.key, ion)?.level === 'warning'
                                ? 'border-amber-500'
                                : '')
                          }
                          aria-label={(ION_LABEL[ion] || ion) + ' ' + compartment.label + ' reservoir concentration'}
                          aria-describedby={concentrationValidationFor(compartment.key, ion) ? 'concentration-validation-' + compartment.key + '-' + ion : undefined}
                        />
                        {concentrationValidationFor(compartment.key, ion) && (
                          <div
                            id={'concentration-validation-' + compartment.key + '-' + ion}
                            className={
                              'mt-1 text-xs ' +
                              (concentrationValidationFor(compartment.key, ion).level === 'error'
                                ? 'text-red-700'
                                : 'text-amber-700')
                            }
                          >
                            {concentrationValidationFor(compartment.key, ion).message}
                          </div>
                        )}
                      </>
                    ) : (
                      <span
                        className="block font-mono text-gray-700"
                        aria-label={(ION_LABEL[ion] || ion) + ' modeled cell ICF concentration, not editable'}
                      >
                        {formatSettingsConcentration(settingsConcentrations[compartment.key][ion])}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowSettings(false)}>
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
          return <><b>Anion exchanger 1</b>: exchanges Cl⁻ and HCO₃⁻ in opposite directions; behavior remains placement- and coupling-based rather than voltage-driven.<br/></>;
        case 'AAFacilitator':
          return <><b>AA facilitator</b>: generic facilitated neutral amino acid transporter; representative examples include LAT/SLC7 family transporters.<br/></>;
        case 'PiFacilitator':
          return <><b>Pi Facilitator</b>: generic facilitated inorganic phosphate transporter. This mechanism is not well characterized but may be XPR1.<br/></>;
        case 'AQP':
          return <><b>AQP water channel class</b>: representative members include AQP2, AQP3, and AQP4; supports transcellular H₂O movement when apical and basolateral AQP form a complete pathway, scaled by their combined density.<br/></>;
        case 'CFTR':
          return <><b>CFTR regulated anion channel</b>: passive Cl⁻ and smaller HCO₃⁻ movement follow the simplified electrochemical tendency. CFTR can support secretion when intracellular anion loading is present, but it is not treated as an ATP-driven Cl⁻ pump. SALT does not model CFTR gating, cAMP regulation, or detailed bicarbonate selectivity.<br/></>;
        case 'ClCKb':
          return <><b>ClC chloride channel family</b>: passive Cl⁻ movement follows the simplified electrochemical tendency in this teaching model. Includes ClC-Kb; voltage dependence is not modeled.<br/></>;
        case 'ENaC':
          return <><b>Epithelial sodium channel</b>: passive Na⁺ movement follows chemical tendency plus the fixed implicit membrane-potential tendency when pump support is present.<br/></>;
        case 'GLUT2':
          return <><b>Glucose transporter 2</b>: passive glucose flux follows the glucose gradient.<br/></>;
        case 'TRPV56':
          return <><b>TRPV5/6 epithelial calcium channel class</b>: passive Ca²⁺ entry follows chemical tendency plus the fixed implicit membrane-potential tendency when pump support is present. SALT does not model dynamic inhibition by intracellular Ca²⁺; unmatched entry is shown as intracellular Ca²⁺ accumulation tendency.<br/></>;
        case 'HATPase':
          return <><b>Proton-ATPase (V-type)</b>: pumps one H⁺ out per ATP.<br/></>;
        case 'HKATPase':
          return <><b>Proton-potassium ATPase</b>: exchanges one H⁺ out for one K⁺ in per ATP.<br/></>;
        case 'MATE':
          return <><b>MATE transporter class</b>: representative members include MATE1 and MATE2-K; exchanges H⁺ and organic cations.<br/></>;
        case 'NaPi2':
          return <><b>NaPi 2:1 cotransporter class</b>: represents NaPi-IIc; moves 2 Na⁺ with 1 phosphate. This pathway is electroneutral in the teaching model.<br/></>;
        case 'NaPi':
          return <><b>NaPi 3:1 cotransporter class</b>: represents NaPi-IIa/IIb; moves 3 Na⁺ with 1 phosphate. This pathway is electrogenic and receives small bounded implicit electrical support when pump support is present.<br/></>;
        case 'NaAA':
          return <><b>Na⁺-AA cotransporter</b>: generic Na⁺-coupled neutral amino acid transporter.<br/></>;
        case 'NBCe1':
          return <><b>Electrogenic sodium bicarbonate cotransporter 1</b>: moves Na⁺ and HCO₃⁻ together in pump-supported bicarbonate loading layouts; routine voltage-driven reversal is not modeled.<br/></>;
        case 'NCC':
          return <><b>Sodium-chloride cotransporter</b>: moves Na⁺ and Cl⁻ together by pump-supported NaCl coupling; not treated as strongly voltage-driven.<br/></>;
        case 'NCX1':
          return <><b>Sodium-calcium exchanger</b>: exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions. In SALT, Ca²⁺ extrusion requires pump support and a Ca²⁺ loading context such as opposite-membrane TRPV5/6.<br/></>;
        case 'NHE3':
          return <><b>Sodium-hydrogen exchanger 3</b>: exchanges Na⁺ and H⁺ in opposite directions using pump-supported Na⁺ gradient and existing pH teaching logic.<br/></>;
        case 'NKCC':
          return <><b>NKCC cotransporter class</b>: representative members include NKCC1 and NKCC2; moves Na⁺, K⁺, and 2 Cl⁻ together using pump-supported coupled transport logic.<br/></>;
        case 'NaKATPase':
          return <><b>Sodium-potassium pump</b>: establishes steady-state low cell Na⁺ and high cell K⁺ when present. Density limits supported Na⁺ extrusion or K⁺ loading; supported flux appears only with matching apical Na⁺ entry or K⁺ exit pathways, not as a standalone Na⁺ or K⁺ flux bar. Unmatched K⁺ loading reports K⁺ accumulation, and unmatched Na⁺ extrusion reports Na⁺ depletion.<br/></>;
        case 'OAT':
          return <><b>OAT transporter class</b>: representative members include OAT1 and OAT3; moves organic anions.<br/></>;
        case 'OCT':
          return <><b>OCT transporter class</b>: representative members include OCT1 and OCT2; moves organic cations.<br/></>;
        case 'PMCA':
          return <><b>Plasma membrane calcium ATPase</b>: pumps one Ca²⁺ out per ATP.<br/></>;
        case 'PepT':
          return <><b>PepT transporter class</b>: representative members include PepT1 and PepT2; moves H⁺ and small peptides together.<br/></>;
        case 'Pendrin':
          return <><b>Pendrin</b>: exchanges Cl⁻ and HCO₃⁻ in opposite directions; behavior remains placement- and coupling-based rather than voltage-driven.<br/></>;
        case 'ROMK':
          return <><b>Kir potassium channel class</b>: passive K⁺ movement follows the simplified electrochemical tendency. ROMK is a member of this inward-rectifier K⁺ channel class.<br/></>;
        case 'SGLT':
          return <><b>SGLT cotransporter class</b>: representative members include SGLT1 and SGLT2; moves Na⁺ and glucose together using pump-supported Na⁺ gradient logic with small bounded implicit electrical support.<br/></>;
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
            <section className="border rounded p-3 bg-white" aria-labelledby="results-snapshot-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 id="results-snapshot-title" className="font-semibold">Results Snapshot</h2>
                <div className="text-xs text-gray-600">Interpreted model outputs</div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-2 items-start">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start" aria-label="Core Results Snapshot output tiles">
                  {compactSnapshotTiles.map(tile => <SnapshotTile key={tile.key} tile={tile} />)}
                </ul>
                {waterSnapshotTile && (
                  <ul className="grid grid-cols-1 self-start" aria-label="Water Results Snapshot output tile">
                    <SnapshotTile tile={waterSnapshotTile} />
                  </ul>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Detailed flux, concentration, and balance views appear below.
              </div>
            </section>

            {resultsView === 'graphs' ? (
              <div className="space-y-4">
                <section className="border rounded p-3 bg-white">
                  <h3 className="font-semibold">Membrane and Epithelial Fluxes</h3>
                  <div className="text-xs text-gray-600 mb-2">{fluxDirectionCaption}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3" aria-label="Shared flux graph legend">
                    {fluxBarSeries.map(series => (
                      <div key={series.key} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: series.color }}
                          aria-hidden="true"
                        />
                        <span>{series.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    {visibleIonDirectionalFluxGroups.map(group => (
                      <div key={group.key} className="pt-3">
                        <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                            <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                            <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                            {fluxBarSeries.map(series => (
                              <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                    {visibleSupplementalDirectionalFluxGroups.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {visibleSupplementalDirectionalFluxGroups.map(group => (
                          <div key={group.key} className="pt-3">
                            <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                            <ResponsiveContainer width="100%" height={150}>
                              <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                                <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                                <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                                {fluxBarSeries.map(series => (
                                  <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <div>
                  <h3 className="font-semibold">Solute Concentrations</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2" aria-label="Concentration graph legend">
                    {concentrationCompartments.map(compartment => (
                      <div key={compartment.key} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{
                            backgroundColor: compartment.color,
                            opacity: compartment.fillOpacity ?? 1
                          }}
                          aria-hidden="true"
                        />
                        <span>{compartment.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-600 mb-2">Click a solute group to open a zoomed concentration view. ICF values are model-derived from the steady-state cell condition.</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={concData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} onClick={openConcentrationZoomFromChart}>
                      <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                      <YAxis domain={[0,150]} tick={{ fontSize: 12 }} />
                      <Tooltip content={<ConcentrationTooltip />} wrapperStyle={{ pointerEvents: 'none' }} />
                      {concentrationCompartments.map(compartment => (
                        <Bar
                          key={compartment.key}
                          dataKey={compartment.key}
                          name={compartment.name}
                          fill={compartment.color}
                          fillOpacity={compartment.fillOpacity}
                          onClick={openConcentrationZoomFromChart}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  {zoomedConcentrationRow && (
                    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40" onClick={() => setZoomedConcentrationIon(null)}>
                      <section className="bg-white rounded-lg p-4 shadow-lg w-[92vw] max-w-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <h4 className="font-semibold">Concentration Zoom: {zoomedConcentrationRow.ion}</h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setZoomedConcentrationIon(null)}
                            aria-label="Close concentration zoom"
                          >
                            Close
                          </Button>
                        </div>
                        <div
                          role="img"
                          aria-label={'Zoomed concentration view for ' + zoomedConcentrationRow.ion + '.'}
                        >
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={zoomedConcentrationData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                              <XAxis dataKey="compartment" interval={0} tick={<ConcentrationZoomAxisTick />} height={52} />
                              <YAxis
                                domain={[0, zoomedConcentrationDomainMax]}
                                tick={{ fontSize: 11 }}
                                tickFormatter={formatConcentrationAxisTick}
                              />
                              <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(4) : value)} />
                              <Bar dataKey="concentration" name={zoomedConcentrationRow.ion + ' concentration'} fill="#2563eb" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6 overflow-auto">
                <AccessibleTable
                  caption={'Membrane and Epithelial Fluxes. ' + fluxDirectionCaption}
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'groupLabel', label: 'Flux group' },
                    { key: 'apicalStep', label: displayOrientation.apicalMembraneLabel, format: formatTableValue },
                    { key: 'basolateralStep', label: displayOrientation.basolateralMembraneLabel, format: formatTableValue },
                    { key: 'paracellularStep', label: 'Paracellular', format: formatTableValue },
                    { key: 'transepithelial', label: 'Net epithelial', format: formatTableValue },
                    { key: 'direction', label: 'Direction', format: (_, row) => fluxDirection(row.transepithelial) }
                  ]}
                  rows={directionalFluxRows.map(row => ({ ...row, ion: row.label, direction: fluxDirection(row.transepithelial) }))}
                />
                <AccessibleTable
                  caption="Solute Concentrations. Bulk ECF reservoirs are fixed unless changed in Settings; ICF is model-derived. Surface values are local teaching estimates based on transport and partial mixing."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'apicalBulk', label: concentrationCompartments.find(compartment => compartment.key === 'apicalBulk')?.label || 'Apical Bulk ECF', format: formatTableValue },
                    { key: 'apicalSurface', label: concentrationCompartments.find(compartment => compartment.key === 'apicalSurface')?.label || 'Apical Surface ECF', format: formatTableValue },
                    { key: 'icf', label: 'ICF', format: formatTableValue },
                    { key: 'basolateralSurface', label: concentrationCompartments.find(compartment => compartment.key === 'basolateralSurface')?.label || 'Basolateral Surface ECF', format: formatTableValue },
                    { key: 'basolateralBulk', label: concentrationCompartments.find(compartment => compartment.key === 'basolateralBulk')?.label || 'Basolateral Bulk ECF', format: formatTableValue }
                  ]}
                  rows={concTableData}
                />
              </div>
            )}

            {chargeReport && (
              <div>
                <div className="mb-3">
                  <h3 className="font-semibold mb-2">Intracellular Imbalance</h3>
                  <AccessibleTable
                    caption="Intracellular accumulation or depletion tendencies compared with the modeled starting cell condition."
                    captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
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
                  caption="Charge and polarity tendencies in arbitrary teaching units."
                  captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
                  columns={[
                    { key: 'label', label: 'Region' },
                    { key: 'direction', label: 'Tendency' },
                    { key: 'strength', label: 'Strength' },
                    { key: 'value', label: 'Value', format: value => formatChargeValue(value) + ' charge units' }
                  ]}
                  rows={[
                    { ...chargeReport.apical, label: displayOrientation.apicalMembraneLabel },
                    { ...chargeReport.basolateral, label: displayOrientation.basolateralMembraneLabel },
                    chargeReport.cell,
                    { ...chargeReport.transepithelial, direction: orientText(chargeReport.transepithelial.direction) }
                  ]}
                />
                <h3 className="font-semibold mb-2 mt-4">Electrochemical Context</h3>
                <AccessibleTable
                  caption="Selected membrane pathways use a fixed implicit membrane-potential tendency. Coupled transporter rules are gradient based and qualitative. Paracellular ion leaks use TEP qualitatively."
                  captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
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
                <h3 className="font-semibold mb-2">Acid/Base &amp; pH</h3>
                {resultsView === 'graphs' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div className="border rounded p-3">
                      <div className="font-semibold">{displayOrientation.apicalShortLabel} surface</div>
                      <div>{acidBaseReport.apicalSurface}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">Cell</div>
                      <div>{acidBaseReport.cell}</div>
                      <div className="text-gray-500">starting pH {Number(acidBaseReport.startingCellPH).toFixed(2)}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">{displayOrientation.basolateralShortLabel} surface</div>
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
                      { region: 'Net epithelium', tendency: orientText(acidBaseReport.transepithelial.direction), note: acidBaseReport.transepithelial.strength + '; ' + formatChargeValue(acidBaseReport.transepithelial.value) + ' acid/base units' },
                      { region: displayOrientation.apicalShortLabel + ' surface', tendency: acidBaseReport.apicalSurface, note: 'Based on local H+ flux tendency' },
                      { region: 'Cell', tendency: acidBaseReport.cell, note: 'Starting pH ' + Number(acidBaseReport.startingCellPH).toFixed(2) },
                      { region: displayOrientation.basolateralShortLabel + ' surface', tendency: acidBaseReport.basolateralSurface, note: 'Based on local H+ flux tendency' }
                    ]}
                  />
                )}
              </div>
            )}

            {waterReport && (
              <div>
                <h3 className="font-semibold mb-2">Water Movement</h3>
                <p className="text-xs text-gray-600 mb-2">
                  Osmotic pull plus water pathway availability produces water movement.
                </p>
                <WaterDetailCards rows={waterDetailRows} />
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
